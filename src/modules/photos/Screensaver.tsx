import { useEffect, useMemo, useRef, useState } from 'react'
import { useSettings } from '../../lib/settings'
import { addDays, berlinTime, longDate, useNow, useToday } from '../../lib/time'
import { eventsOnDay } from '../calendar/rules'
import { shortenTitle } from '../calendar/shorten'
import { useCalendar } from '../calendar/useCalendar'
import { SaverMusic } from '../spotify/NowPlaying'
import { useEnabledModules, useModuleConfig } from '../useModules'
import { listPhotos, signedUrls } from './photoStore'

export const SCREENSAVER_DEFAULTS = { idle_minutes: 5, interval_seconds: 60 }

type Slide = { id: string; path: string; url: string; portrait: boolean }

// Signierte Links gelten 1 Stunde (photoStore). Nach 50 Minuten holen wir neue, bevor Fotos nicht mehr laden.
const RESIGN_MS = 50 * 60 * 1000

/** Foto komplett laden; true = hat geklappt */
function preload(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = url
  })
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Fotos bildschirmfüllend, weiche Überblendung, darüber klein Uhr, Datum und nächster Termin.
 * Antippen beendet ihn – dieses Antippen erreicht das Board darunter nie (kein versehentliches Abhaken).
 */
export function Screensaver({ onClose }: { onClose: () => void }) {
  const { settings } = useSettings()
  const visit = settings?.visit_mode ?? false
  const { interval_seconds } = useModuleConfig('bildschirmschoner', SCREENSAVER_DEFAULTS)
  const [slides, setSlides] = useState<Slide[] | null>(null)
  // index = gezeigtes Foto; null, solange noch keins fertig geladen ist (dann nur Uhr auf Schwarz)
  const [index, setIndex] = useState<number | null>(null)
  const [prev, setPrev] = useState<number | null>(null)
  const signedAt = useRef(0)
  const enabled = useEnabledModules()

  // Fotos laden: nur aktive, im Besuchsmodus nur freigegebene, zufällige Reihenfolge
  useEffect(() => {
    let cancelled = false
    listPhotos()
      .then(async (all) => {
        const chosen = shuffle(all.filter((p) => p.active && (!visit || p.show_in_visit)))
        const urls = await signedUrls(chosen.map((p) => p.path))
        if (cancelled) return
        signedAt.current = Date.now()
        setSlides(
          chosen
            .filter((p) => urls.has(p.path))
            .map((p) => ({ id: p.id, path: p.path, url: urls.get(p.path)!, portrait: (p.height ?? 0) > (p.width ?? 0) })),
        )
      })
      .catch(() => !cancelled && setSlides([]))
    return () => {
      cancelled = true
    }
  }, [visit])

  // Neue Links holen, wenn die alten bald ablaufen (Bildschirmschoner läuft oft stundenlang)
  async function freshSlides(list: Slide[]): Promise<Slide[]> {
    if (Date.now() - signedAt.current < RESIGN_MS) return list
    const urls = await signedUrls(list.map((s) => s.path))
    if (!urls.size) return list
    signedAt.current = Date.now()
    const next = list.map((s) => ({ ...s, url: urls.get(s.path) ?? s.url }))
    setSlides(next)
    return next
  }

  // Erst zeigen, wenn das Foto wirklich geladen ist; was nicht lädt, wird übersprungen (nie ein kaputtes Bild)
  async function showNext(from: number | null, list: Slide[], isAlive: () => boolean) {
    const fresh = await freshSlides(list)
    for (let step = 1; step <= fresh.length; step++) {
      const i = ((from ?? -1) + step) % fresh.length
      if (await preload(fresh[i].url)) {
        if (!isAlive()) return
        setPrev(from)
        setIndex(i)
        return
      }
      if (!isAlive()) return
    }
  }

  // Erstes Foto
  useEffect(() => {
    if (!slides?.length || index !== null) return
    let alive = true
    showNext(null, slides, () => alive)
    return () => {
      alive = false
    }
    // nur beim Laden der Liste starten
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides === null])

  // Weiterblättern nach interval_seconds
  useEffect(() => {
    if (!slides || slides.length < 2 || index === null) return
    let alive = true
    const t = setTimeout(() => showNext(index, slides, () => alive), interval_seconds * 1000)
    return () => {
      alive = false
      clearTimeout(t)
    }
    // slides ändert sich auch beim Erneuern der Links, das soll den Takt nicht neu starten
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, interval_seconds, slides?.length])

  return (
    <div
      className="hb-saver"
      role="button"
      tabIndex={0}
      aria-label="Bildschirmschoner, antippen zum Beenden"
      onClick={onClose}
      onKeyDown={onClose}
    >
      {slides?.map((s, i) => {
        // nur aktuelles und vorheriges Foto im DOM, für die Überblendung
        if (i !== index && i !== prev) return null
        // falls ein Foto doch nicht anzeigt: ausblenden statt Symbol für kaputtes Bild
        const hide = (e: React.SyntheticEvent<HTMLImageElement>) => (e.currentTarget.style.visibility = 'hidden')
        return (
          <div key={s.id} className={`hb-saver-slide ${i === index ? 'is-on' : ''}`}>
            {s.portrait && <img className="hb-saver-blur" src={s.url} alt="" aria-hidden="true" onError={hide} />}
            <img className={s.portrait ? 'hb-saver-contain' : 'hb-saver-cover'} src={s.url} alt="" onError={hide} />
          </div>
        )
      })}

      {slides && slides.length === 0 && (
        <p className="hb-saver-empty">
          {visit ? 'Noch keine Fotos für den Besuchsmodus freigegeben.' : 'Noch keine Fotos. Am Handy unter „Fotos“ hinzufügen.'}
        </p>
      )}

      <SaverInfo />
      {enabled?.has('spotify') && <SaverMusic />}
    </div>
  )
}

/** Uhr, Datum und nächster Termin unten links */
function SaverInfo() {
  const now = useNow(1000)
  const today = useToday()
  const { events } = useCalendar()
  const { hh, mm } = berlinTime(now)

  const next = useMemo(() => {
    if (!events) return null
    const iso = now.toISOString()
    for (const [day, prefix] of [
      [today, ''],
      [addDays(today, 1), 'Morgen '],
    ] as const) {
      const e = eventsOnDay(events, day).find((x) => !x.allDay && x.start > iso)
      if (e) {
        const t = berlinTime(new Date(e.start))
        return `${prefix}${t.hh}:${t.mm} · ${shortenTitle(e.title).text}`
      }
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, today, hh, mm])

  return (
    <div className="hb-saver-info">
      <div className="hb-saver-clock">
        {hh}:{mm}
      </div>
      <div className="hb-saver-date">{longDate(now)}</div>
      {next && <div className="hb-saver-next">{next}</div>}
    </div>
  )
}

/** Nachtmodus: nur eine gedimmte Uhr. Antippen weckt das Board kurz. */
export function NightScreen({ onWake }: { onWake: () => void }) {
  const now = useNow(1000)
  const { hh, mm } = berlinTime(now)
  return (
    <div className="hb-night" role="button" tabIndex={0} aria-label="Nachtmodus, antippen zum Aufwecken" onClick={onWake} onKeyDown={onWake}>
      <div className="hb-night-clock">
        {hh}
        <span className="hb-clock-colon">:</span>
        {mm}
      </div>
      <div className="hb-night-date">{longDate(now)}</div>
    </div>
  )
}
