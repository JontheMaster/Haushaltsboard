import { useEffect, useMemo, useState } from 'react'
import { useSettings } from '../../lib/settings'
import { addDays, berlinTime, longDate, useNow, useToday } from '../../lib/time'
import { eventsOnDay } from '../calendar/rules'
import { shortenTitle } from '../calendar/shorten'
import { useCalendar } from '../calendar/useCalendar'
import { useModuleConfig } from '../useModules'
import { listPhotos, signedUrls } from './photoStore'

export const SCREENSAVER_DEFAULTS = { idle_minutes: 5, interval_seconds: 60 }

type Slide = { id: string; url: string; portrait: boolean }

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
  const [index, setIndex] = useState(0)

  // Fotos laden: nur aktive, im Besuchsmodus nur freigegebene, zufällige Reihenfolge
  useEffect(() => {
    let cancelled = false
    listPhotos()
      .then(async (all) => {
        const chosen = shuffle(all.filter((p) => p.active && (!visit || p.show_in_visit)))
        const urls = await signedUrls(chosen.map((p) => p.path))
        if (cancelled) return
        setSlides(
          chosen
            .filter((p) => urls.has(p.path))
            .map((p) => ({ id: p.id, url: urls.get(p.path)!, portrait: (p.height ?? 0) > (p.width ?? 0) })),
        )
      })
      .catch(() => !cancelled && setSlides([]))
    return () => {
      cancelled = true
    }
  }, [visit])

  // Weiterblättern und das nächste Foto vorladen
  useEffect(() => {
    if (!slides || slides.length < 2) return
    const next = slides[(index + 1) % slides.length]
    new Image().src = next.url
    const t = setTimeout(() => setIndex((i) => (i + 1) % slides.length), interval_seconds * 1000)
    return () => clearTimeout(t)
  }, [slides, index, interval_seconds])

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
        const prev = (index - 1 + slides.length) % slides.length
        if (i !== index && i !== prev) return null
        return (
          <div key={s.id} className={`hb-saver-slide ${i === index ? 'is-on' : ''}`}>
            {s.portrait && <img className="hb-saver-blur" src={s.url} alt="" aria-hidden="true" />}
            <img className={s.portrait ? 'hb-saver-contain' : 'hb-saver-cover'} src={s.url} alt="" />
          </div>
        )
      })}

      {slides && slides.length === 0 && (
        <p className="hb-saver-empty">
          {visit ? 'Noch keine Fotos für den Besuchsmodus freigegeben.' : 'Noch keine Fotos. Am Handy unter „Fotos“ hinzufügen.'}
        </p>
      )}

      <SaverInfo />
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
