import { CalendarDays, TrainFront, TriangleAlert, Umbrella, UtensilsCrossed } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { useMembers } from '../../lib/members'
import { berlinTime, longDate, useNow, useToday } from '../../lib/time'
import { describe, type Weather } from '../clock-weather/weather'
import { eventsOnDay } from '../calendar/rules'
import { useCalendar } from '../calendar/useCalendar'
import { useMealsByDay } from '../meals/MealLine'
import { hm as mealHm } from '../meals/mealStore'
import { useTodos } from '../todos/useTodos'
import { hm, usePlans } from '../transit/api'
import { useEnabledModules, useModuleConfig } from '../useModules'
import { DayCurve } from './DayCurve'
import { seasonOf, SkyScene, skyWeather, type Season } from './SkyScene'
import { MorningFigure } from './MorningFigure'
import { sayingOf, type SayingMode } from './sayings'

export const BRIEFING_DEFAULTS = { times: ['06:00', '07:30'] as string[], saying: 'wechsel' as SayingMode }
/** So lange bleibt das Briefing stehen, wenn niemand antippt (Entscheidung Jonathan 7.10.2026) */
export const SHOW_MINUTES = 60

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const dismissKey = (day: string, time: string) => `hb-briefing-${day}-${time}`

/**
 * Welches Briefing gerade dran ist (Uhrzeit aus den Einstellungen), oder null.
 * Pro Tag und Uhrzeit nur einmal: Antippen merkt sich das im Gerät.
 */
export function useBriefingSlot(enabled: boolean): { time: string; dismiss: () => void } | null {
  const { times } = useModuleConfig('morgen', BRIEFING_DEFAULTS)
  const today = useToday()
  const now = useNow(30_000)
  const [, force] = useState(0)
  const { hh, mm } = berlinTime(now)
  const cur = Number(hh) * 60 + Number(mm)
  // die späteste Uhrzeit, die schon begonnen hat und noch keine Stunde her ist
  const time = enabled
    ? [...times]
        .filter((t) => /^\d{2}:\d{2}$/.test(t))
        .sort()
        .reverse()
        .find((t) => cur >= toMin(t) && cur < toMin(t) + SHOW_MINUTES)
    : undefined
  let dismissed = false
  try {
    dismissed = !!time && localStorage.getItem(dismissKey(today, time)) === '1'
  } catch {
    // ohne Gerätespeicher zeigt es sich eben bis zum Ende der Stunde
  }
  if (!time || dismissed) return null
  return {
    time,
    dismiss: () => {
      try {
        localStorage.setItem(dismissKey(today, time), '1')
      } catch {
        // nur Komfort
      }
      force((x) => x + 1)
    },
  }
}

// ───────── Wetter in Worten ─────────

/** Ein Satz zum Tag: Regen ja/nein (ab wann), dazu ein Hinweis bei Kälte oder Hitze */
function weatherSentence(w: Weather, today: string, nowHour: number): { text: string; rain: boolean } {
  const rest = w.hours.filter((h) => h.time.startsWith(today) && Number(h.time.slice(11, 13)) >= nowHour && Number(h.time.slice(11, 13)) <= 23)
  const wet = rest.find((h) => h.rain >= 50)
  const maxRain = Math.max(0, ...rest.map((h) => h.rain))
  const max = w.days[0]?.max ?? w.now.temp
  let text: string
  if (wet && Number(wet.time.slice(11, 13)) <= nowHour) text = 'Gerade nass draußen, Schirm mitnehmen.'
  else if (wet) text = `Ab ${Number(wet.time.slice(11, 13))} Uhr Regen, Schirm mitnehmen.`
  else if (maxRain >= 30) text = `Vielleicht ein paar Tropfen (bis ${maxRain} %).`
  else text = 'Bleibt trocken.'
  if (max <= 3) text += ' Warm anziehen, es bleibt kalt.'
  else if (max >= 27) text += ' Heiß heute, genug trinken.'
  return { text, rain: !!wet }
}


// ───────── Screen ─────────

/** Morgen-Briefing an der Wand: groß das Wetter, dazu wenig, aber das Wichtige. Antippen schließt es. */
export function MorningBriefing({ weather, onClose }: { weather: Weather | null; onClose: () => void }) {
  const now = useNow(1000)
  const today = useToday()
  const { hh, mm } = berlinTime(now)
  const { saying } = useModuleConfig('morgen', BRIEFING_DEFAULTS)
  const enabled = useEnabledModules()
  const { events } = useCalendar()
  const { todos } = useTodos(today)
  const meals = useMealsByDay()(today)
  const plans = usePlans(enabled?.has('abfahrten') ?? false)
  const { byId } = useMembers()

  // Schließen erst beim Loslassen: sonst landet der Tipp auf dem Board darunter
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    if (!closing) return
    const t = setTimeout(onClose, 220)
    return () => clearTimeout(t)
  }, [closing, onClose])

  const nowIso = now.toISOString()
  // laut im Raum: nie Kalender zeigen, die im Besuchsmodus verschwinden
  const dayEvents = eventsOnDay(events ?? [], today)
    .filter((e) => !e.hideInVisit && (e.allDay || e.end > nowIso))
    .slice(0, 4)
  const urgent = (todos ?? []).filter((t) => !t.done_at && t.moved_since)
  const trips = (plans?.plans ?? [])
    .filter((p) => p.trip && p.trip.leaveAt > nowIso && p.trip.leaveAt.slice(0, 10) === nowIso.slice(0, 10))
    .sort((a, b) => a.trip!.leaveAt.localeCompare(b.trip!.leaveAt))
    .slice(0, 2)
  const quote = sayingOf(today, saying)

  // Bildschirm war aus (Tablet schlief) und geht wieder an: Auftritt noch einmal abspielen
  const [run, setRun] = useState(0)
  useEffect(() => {
    const wake = () => document.visibilityState === 'visible' && setRun((r) => r + 1)
    document.addEventListener('visibilitychange', wake)
    return () => document.removeEventListener('visibilitychange', wake)
  }, [])
  // Vorschau anderer Wetterlagen: ?morgen=regen | schnee | wolken | nebel | sonne
  const preview = { sonne: 0, hitze: 0, wolken: 3, nebel: 45, regen: 63, schnee: 73 }[new URLSearchParams(location.search).get('morgen') ?? ''] as number | undefined
  const code = preview ?? weather?.now.code ?? 0
  // Vorschau: &jahreszeit=fruehling|sommer|herbst|winter, &figur=f|m
  const params = new URLSearchParams(location.search)
  const season: Season =
    ({ fruehling: 'spring', sommer: 'summer', herbst: 'autumn', winter: 'winter' } as const)[params.get('jahreszeit') ?? ''] ?? seasonOf(today)
  // Figur wechselt jeden Tag zwischen Frau und Mann
  const dayNo = Math.floor(Date.parse(`${today}T12:00:00Z`) / 86_400_000)
  const figure = params.get('figur') === 'm' || params.get('figur') === 'f' ? (params.get('figur') as 'f' | 'm') : dayNo % 2 ? 'm' : 'f'
  const w = weather && describe(code, weather.now.isDay)
  const sentence = weather ? weatherSentence(weather, today, Number(hh)) : null
  // rechte Seite: Blöcke gleiten nacheinander herein
  let step = 0
  const enter = () => ({ '--i': step++ }) as CSSProperties

  return (
    <div
      key={run}
      className={`hb-brief ${closing ? 'is-closing' : ''}`}
      role="dialog"
      aria-label="Guten Morgen. Antippen schließt die Übersicht."
      onPointerUp={() => setClosing(true)}
    >
      {/* Sonnenaufgang über die ganze Seite: Sonne steigt hinter den Hügeln auf, Ringe atmen leise */}
      {/* Szene: zuerst nach dem Wetter, dann nach der Jahreszeit */}
      <SkyScene weather={skyWeather(code)} season={season} />
      {/* auch ohne Wetterdaten da (dann ohne Schirm, Mütze oder Hut) */}
      <MorningFigure
        variant={figure}
        rain={(sentence?.rain ?? false) || (preview !== undefined && preview >= 51 && preview <= 67)}
        cold={(weather?.days[0]?.max ?? 20) <= 8 || preview === 73}
        hot={(weather?.days[0]?.max ?? 0) >= 25 || new URLSearchParams(location.search).get('morgen') === 'hitze'}
      />
      <header className="hb-brief-head">
        <div className="flex flex-col">
          <h1 className="hb-brief-hello">
            Guten <span>Morgen</span>
          </h1>
          <span className="hb-brief-date">{longDate(now)}</span>
        </div>
        <div className="hb-brief-clock" aria-label={`${hh}:${mm} Uhr`}>
          {hh}
          <span className="hb-clock-colon">:</span>
          {mm}
        </div>
      </header>

      <main className="hb-brief-main">
        <section className="hb-brief-weather" aria-label="Wetter heute">
          {weather && w ? (
            <>
              <div className="hb-brief-now">
                <Icon icon={w.icon} size={120} label={w.label} className="hb-brief-wicon" />
                <div className="flex min-w-0 flex-col">
                  <span className="hb-brief-temp">{weather.now.temp}°</span>
                  <span className="hb-brief-range">
                    {w.label} · <b>{weather.days[0]?.max}°</b> am Tag · <b>{weather.days[0]?.min}°</b> in der Nacht
                  </span>
                </div>
              </div>
              {sentence && (
                <p className={`hb-brief-sentence ${sentence.rain ? 'is-rain' : ''}`}>
                  <Icon icon={sentence.rain ? Umbrella : w.icon} size={28} />
                  {sentence.text}
                </p>
              )}
              <DayCurve weather={weather} today={today} nowHour={Number(hh) + Number(mm) / 60} />
            </>
          ) : (
            <p className="text-body-wall text-ink-muted">Wetter lädt …</p>
          )}
        </section>

        <section className="hb-brief-side">
          {urgent.length > 0 && (
            <div className="hb-brief-card is-urgent" style={enter()}>
              <span className="hb-brief-badge">
                <Icon icon={TriangleAlert} size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <h2>Dringend</h2>
                <ul>
                  {urgent.slice(0, 3).map((t) => (
                    <li key={t.id}>{t.title}</li>
                  ))}
                  {urgent.length > 3 && <li className="is-more">und {urgent.length - 3} weitere</li>}
                </ul>
              </div>
            </div>
          )}

          <div className="hb-brief-card" style={enter()}>
            <span className="hb-brief-badge">
              <Icon icon={CalendarDays} size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h2>Heute</h2>
              {dayEvents.length ? (
                <ul>
                  {dayEvents.map((e) => (
                    <li key={e.id} className="hb-brief-event" style={{ '--dot': dotColor(e.color) } as CSSProperties}>
                      <span className="hb-brief-time">{e.allDay ? 'Ganztags' : berlinHm(e.start)}</span>
                      <span className="min-w-0 truncate">{e.title}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hb-brief-empty">Keine Termine. Ein freier Tag.</p>
              )}
            </div>
          </div>

          {meals.length > 0 && (
            <div className="hb-brief-card is-meal" style={enter()}>
              <span className="hb-brief-badge">
                <Icon icon={UtensilsCrossed} size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <h2>Essen</h2>
                <ul>
                  {meals.map((m) => (
                    <li key={m.id} className="hb-brief-event">
                      {mealHm(m.start_time) && <span className="hb-brief-time">{mealHm(m.start_time)}</span>}
                      <span className="min-w-0 truncate">{m.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {trips.length > 0 && (
            <div className="hb-brief-card" style={enter()}>
              <span className="hb-brief-badge">
                <Icon icon={TrainFront} size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <h2>Los geht&apos;s</h2>
                <ul>
                  {trips.map((p) => (
                    <li key={p.memberId + p.target.key} className="hb-brief-event">
                      <span className="hb-brief-time">{hm(p.trip!.leaveAt)}</span>
                      <span className="min-w-0 truncate">
                        {byId.get(p.memberId)?.name} · {p.target.title}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      </main>

      {quote && (
        <footer className="hb-brief-quote">
          <span className="hb-brief-quote-mark" aria-hidden="true">
            „
          </span>
          <p>{quote.text}</p>
          <span className="hb-brief-quote-from">{quote.from}</span>
        </footer>
      )}
    </div>
  )
}

/** Kalenderfarbe als Punkt (blue/berry sind die Personenfarben) */
function dotColor(color: string | undefined): string {
  if (color === 'blue') return 'var(--person-a)'
  if (color === 'berry') return 'var(--person-b)'
  return color ? `var(--cal-${color})` : 'var(--ink-muted)'
}

function berlinHm(iso: string): string {
  const { hh, mm } = berlinTime(new Date(iso))
  return `${hh}:${mm}`
}
