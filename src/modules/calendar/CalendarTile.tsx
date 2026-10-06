import { CalendarDays } from 'lucide-react'
import { EventPill } from '../../components/EventPill'
import { ScrollList } from '../../components/ScrollList'
import { Tile } from '../../components/Tile'
import { useDevice } from '../../lib/device'
import type { PersonKey } from '../../lib/members'
import { addDays, berlinMidnightISO, berlinTime, useNow, useToday } from '../../lib/time'
import { eventsOnDay } from './rules'
import { DayTimeline, hourRange, ModeSwitch, TimeLabels, useCalendarMode } from './Timeline'
import type { TileProps } from '../types'
import { useCalendar, type CalendarEvent } from './useCalendar'

const personOf = (e: CalendarEvent): PersonKey => (e.person === 'person-a' ? 'a' : e.person === 'person-b' ? 'b' : 'open')

function timeLabel(e: CalendarEvent, day: string): string {
  if (e.allDay) return 'Ganztags'
  const start = new Date(e.start)
  if (e.start < berlinMidnightISO(day)) {
    // hat vor heute begonnen
    const { hh, mm } = berlinTime(new Date(e.end))
    return `bis ${hh}:${mm}`
  }
  const { hh, mm } = berlinTime(start)
  return `${hh}:${mm}`
}

export function CalendarTile({ size, delay }: TileProps) {
  const today = useToday()
  const tomorrow = addDays(today, 1)
  const now = useNow(60_000).toISOString()
  const { device } = useDevice()
  const phone = device === 'phone'
  // Große Kachel an der Wand: Heute und Morgen nebeneinander
  const wide = !phone && size === 'l'
  const { events, failed, error } = useCalendar()
  const [mode, setMode] = useCalendarMode(phone ? 'phone' : 'wall')

  const todays = events ? eventsOnDay(events, today) : []
  const tomorrows = events ? eventsOnDay(events, tomorrow) : []
  // Nächster Termin = der erste mit Uhrzeit, der noch nicht vorbei ist
  const nextId = todays.find((e) => !e.allDay && e.end > now)?.id
  // Die Farbe zeigt den Kalender; als Text reicht die Person (Farbe steht nie allein)
  const meta = (e: CalendarEvent) => e.who ?? e.label ?? ''

  return (
    <Tile title="Termine heute" icon={CalendarDays} delay={delay} action={<ModeSwitch mode={mode} onChange={setMode} />}>
      {(error || failed.length > 0) && (
        <p role="status" className="mb-2 rounded-md bg-urgent-soft px-3 py-2 text-label text-urgent">
          {error
            ? 'Kalender gerade nicht erreichbar. Die Termine laden gleich neu.'
            : `${failed.length === 1 ? 'Ein Kalender' : `${failed.length} Kalender`} gerade nicht erreichbar.`}
        </p>
      )}

      {events === null ? (
        !error && <p className="text-body text-ink-muted">Termine laden …</p>
      ) : mode === 'plan' ? (
        <Plan
          days={wide ? [today, tomorrow] : [today]}
          events={events}
          hourPx={phone ? 40 : undefined}
        />
      ) : (
        // An der Wand füllen die Listen die Kachel; was nicht ganz passt, wird zu „+N weitere“
        <div className={wide ? 'grid min-h-0 flex-1 grid-cols-2 gap-5' : `flex flex-col gap-2 ${phone ? '' : 'min-h-0 flex-1'}`}>
          <div className={`flex min-w-0 flex-col gap-2 ${phone ? '' : 'min-h-0 flex-1'}`}>
            {wide && <h3 className="text-label text-ink-muted">Heute</h3>}
            {todays.length === 0 ? (
              <p className={phone ? 'text-body text-ink-muted' : 'text-body-wall text-ink-muted'}>Heute keine Termine.</p>
            ) : (
              <ScrollList fit={!phone} className={`flex flex-col gap-2 ${phone ? '' : 'min-h-0 flex-1'}`}>
              {todays.map((e, i) => (
                <EventPill
                  key={e.id}
                  person={personOf(e)}
                  color={e.color}
                  time={timeLabel(e, today)}
                  title={e.title}
                  meta={meta(e)}
                  next={e.id === nextId}
                  past={!e.allDay && e.end <= now}
                  delay={i * 40}
                />
              ))}
              </ScrollList>
            )}
          </div>

          {/* Vorschau auf morgen nur an der Wand, am Handy bleibt die Startseite kurz */}
          {!phone && (wide || tomorrows.length > 0) && (
            <div className={`flex min-h-0 min-w-0 flex-1 flex-col gap-2 ${wide ? '' : 'mt-4'}`}>
              <h3 className="text-label text-ink-muted">Morgen</h3>
              {tomorrows.length === 0 ? (
                <p className="text-body text-ink-muted">Morgen keine Termine.</p>
              ) : (
                <ScrollList fit className="flex min-h-0 flex-1 flex-col gap-2">
                {tomorrows.map((e) => (
                  <EventPill
                    key={e.id}
                    person={personOf(e)}
                    color={e.color}
                    time={timeLabel(e, tomorrow)}
                    title={e.title}
                    meta={meta(e)}
                    compact={!wide}
                  />
                ))}
                </ScrollList>
              )}
            </div>
          )}
        </div>
      )}
    </Tile>
  )
}

/** Zeitplan für einen oder zwei Tage, gemeinsame Stundenleiste links */
function Plan({ days, events, hourPx }: { days: string[]; events: CalendarEvent[]; hourPx?: number }) {
  const perDay = days.map((day) => ({ day, events: eventsOnDay(events, day) }))
  const range = hourRange(perDay)
  const slots = Math.max(...perDay.map((d) => d.events.filter((e) => e.allDay).length))
  const two = days.length > 1
  return (
    <div className={`flex flex-col gap-2 ${hourPx ? '' : 'min-h-0 flex-1'}`}>
      {two && (
        <div className="grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <span />
          <h3 className="text-label text-ink-muted">Heute</h3>
          <h3 className="text-label text-ink-muted">Morgen</h3>
        </div>
      )}
      <div
        className={`grid gap-3 ${two ? 'grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)]' : 'grid-cols-[44px_minmax(0,1fr)]'} ${hourPx ? '' : 'min-h-0 flex-1'}`}
      >
        <TimeLabels range={range} allDaySlots={slots} hourPx={hourPx} />
        {perDay.map((d) => (
          <DayTimeline key={d.day} day={d.day} events={d.events} range={range} allDaySlots={slots} hourPx={hourPx} />
        ))}
      </div>
    </div>
  )
}
