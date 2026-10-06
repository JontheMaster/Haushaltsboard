// Zeitplan: Stundenleiste, Termine als Blöcke nach Dauer, Ganztägiges oben, Linie für „jetzt“.
// Alle Positionen in Prozent der Höhe – so füllt der Plan jede Kachel- oder Spaltenhöhe aus.
import { useState } from 'react'
import { addDays, berlinMidnightISO, berlinTime, useNow, useToday } from '../../lib/time'
import { EventTitle } from './shorten'
import type { CalendarEvent } from './useCalendar'

export type HourRange = { from: number; to: number }

const DEFAULT_RANGE: HourRange = { from: 8, to: 21 }

/** Minuten seit Mitternacht (Berlin), begrenzt auf den Tag */
function minutesOn(iso: string, day: string): number {
  if (iso < berlinMidnightISO(day)) return 0
  if (iso >= berlinMidnightISO(addDays(day, 1))) return 24 * 60
  const { hh, mm } = berlinTime(new Date(iso))
  return Number(hh) * 60 + Number(mm)
}

/** Stundenbereich, der alle Termine der Tage umfasst (mindestens 8–21 Uhr) */
export function hourRange(days: { day: string; events: CalendarEvent[] }[]): HourRange {
  let { from, to } = DEFAULT_RANGE
  for (const { day, events } of days) {
    for (const e of events) {
      if (e.allDay) continue
      from = Math.min(from, Math.floor(minutesOn(e.start, day) / 60))
      to = Math.max(to, Math.ceil(minutesOn(e.end, day) / 60))
    }
  }
  return { from: Math.max(0, from), to: Math.min(24, Math.max(to, from + 1)) }
}

type Placed = { e: CalendarEvent; start: number; end: number; lane: number; lanes: number }

/** Überschneidende Termine nebeneinander: Gruppen bilden, in jeder Gruppe Spuren verteilen */
function layout(events: CalendarEvent[], day: string): Placed[] {
  const items = events
    .filter((e) => !e.allDay)
    .map((e) => ({ e, start: minutesOn(e.start, day), end: Math.max(minutesOn(e.end, day), minutesOn(e.start, day) + 15) }))
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const out: Placed[] = []
  let group: Placed[] = []
  let groupEnd = -1
  let laneEnds: number[] = []
  const close = () => {
    const lanes = Math.max(1, laneEnds.length)
    for (const p of group) p.lanes = lanes
    out.push(...group)
    group = []
    laneEnds = []
  }
  for (const it of items) {
    if (it.start >= groupEnd && group.length) close()
    let lane = laneEnds.findIndex((end) => end <= it.start)
    if (lane === -1) lane = laneEnds.push(it.end) - 1
    else laneEnds[lane] = it.end
    group.push({ ...it, lane, lanes: 1 })
    groupEnd = Math.max(groupEnd, it.end)
  }
  if (group.length) close()
  return out
}

const tone = (e: CalendarEvent) =>
  e.color === 'blue' ? 'hb-person-a' : e.color === 'berry' ? 'hb-person-b' : e.color ? `hb-cal-${e.color}` : 'hb-person-open'

const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

const ALLDAY_SLOT_PX = 30

/** Stundenbeschriftung links (eigene Spalte, passt zu DayTimeline mit gleichem Bereich und gleichen Slots) */
export function TimeLabels({ range, allDaySlots = 0, hourPx }: { range: HourRange; allDaySlots?: number; hourPx?: number }) {
  const span = range.to - range.from
  return (
    <div className={`flex flex-col gap-1 ${hourPx ? '' : 'min-h-0 flex-1'}`} aria-hidden="true">
      {allDaySlots > 0 && <div style={{ height: `${allDaySlots * ALLDAY_SLOT_PX - 4}px` }} />}
      <div
        className={`hb-tl-labels ${hourPx ? '' : 'min-h-0 flex-1'}`}
        style={hourPx ? { height: `${span * hourPx}px` } : undefined}
      >
        {Array.from({ length: span + 1 }, (_, i) => (
          <span key={i} style={{ top: `${(i / span) * 100}%` }}>
            {String(range.from + i).padStart(2, '0')}:00
          </span>
        ))}
      </div>
    </div>
  )
}

type DayProps = {
  day: string
  /** Termine dieses Tages (schon gefiltert, z. B. mit eventsOnDay) */
  events: CalendarEvent[]
  range: HourRange
  /** Platz für so viele Ganztags-Chips reservieren, damit Spalten nebeneinander bündig sind */
  allDaySlots?: number
  /** feste Höhe pro Stunde (Handy); ohne Angabe füllt der Plan die verfügbare Höhe */
  hourPx?: number
}

/** Ein Tag als Zeitplan */
export function DayTimeline({ day, events, range, allDaySlots, hourPx }: DayProps) {
  const today = useToday()
  const now = useNow(60_000)
  const span = (range.to - range.from) * 60
  const pct = (min: number) => ((min - range.from * 60) / span) * 100
  const allDay = events.filter((e) => e.allDay)
  const placed = layout(events, day)
  const nowMin = day === today ? minutesOn(now.toISOString(), day) : null

  return (
    <div className={`flex flex-col gap-1 ${hourPx ? '' : 'min-h-0 flex-1'}`}>
      {(allDaySlots ?? allDay.length) > 0 && (
        <div className="flex flex-col gap-1" style={{ height: `${(allDaySlots ?? allDay.length) * ALLDAY_SLOT_PX - 4}px` }}>
          {allDay.map((e) => (
            <div key={e.id} className={`hb-tl-allday ${tone(e)}`}>
              <EventTitle title={e.title} size={14} />
            </div>
          ))}
        </div>
      )}
      <div
        className={`hb-tl-day ${hourPx ? '' : 'min-h-0 flex-1'}`}
        style={hourPx ? { height: `${(range.to - range.from) * hourPx}px` } : undefined}
      >
        {Array.from({ length: range.to - range.from + 1 }, (_, i) => (
          <div key={i} className="hb-tl-hour" style={{ top: `${(i / (range.to - range.from)) * 100}%` }} />
        ))}
        {placed.map((p) => {
          const top = Math.max(0, pct(p.start))
          const bottom = Math.min(100, pct(p.end))
          const past = p.e.end <= now.toISOString()
          const short = p.end - p.start < 45
          return (
            <div
              key={p.e.id}
              className={`hb-tl-event ${tone(p.e)} ${past ? 'is-past' : ''} ${short ? 'is-short' : ''}`}
              style={{
                top: `${top}%`,
                height: `${Math.max(bottom - top, 2)}%`,
                left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
                width: `calc(${100 / p.lanes}% - 4px)`,
              }}
              title={`${hhmm(p.start)}–${hhmm(p.end)} ${p.e.title}`}
            >
              <span className="hb-tl-title">
                <EventTitle title={p.e.title} size={15} />
              </span>
              {!short && (
                <span className="hb-tl-time">
                  {hhmm(p.start)}–{hhmm(p.end)}
                </span>
              )}
            </div>
          )
        })}
        {nowMin !== null && nowMin >= range.from * 60 && nowMin <= range.to * 60 && (
          <div className="hb-tl-now" style={{ top: `${pct(nowMin)}%` }} aria-label="Jetzt" />
        )}
      </div>
    </div>
  )
}

/** Gemerkte Wahl Liste/Zeitplan pro Gerät (nur Komfort) */
export function useCalendarMode(key: string): ['list' | 'plan', (m: 'list' | 'plan') => void] {
  const storageKey = `hb-cal-mode-${key}`
  const [mode, setMode] = useState<'list' | 'plan'>(() => {
    try {
      return localStorage.getItem(storageKey) === 'plan' ? 'plan' : 'list'
    } catch {
      return 'list'
    }
  })
  const set = (m: 'list' | 'plan') => {
    setMode(m)
    try {
      localStorage.setItem(storageKey, m)
    } catch {
      // nur Komfort
    }
  }
  return [mode, set]
}

/** Umschalter „Liste | Zeitplan“ */
export function ModeSwitch({ mode, onChange }: { mode: 'list' | 'plan'; onChange: (m: 'list' | 'plan') => void }) {
  return (
    <div className="hb-seg" role="group" aria-label="Darstellung">
      <button type="button" aria-pressed={mode === 'list'} className={mode === 'list' ? 'is-on' : ''} onClick={() => onChange('list')}>
        Liste
      </button>
      <button type="button" aria-pressed={mode === 'plan'} className={mode === 'plan' ? 'is-on' : ''} onClick={() => onChange('plan')}>
        Zeitplan
      </button>
    </div>
  )
}
