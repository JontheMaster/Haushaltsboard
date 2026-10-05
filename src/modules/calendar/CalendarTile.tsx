import { CalendarDays } from 'lucide-react'
import { Badge } from '../../components/Badge'
import { EventPill } from '../../components/EventPill'
import { Tile } from '../../components/Tile'
import { useDevice } from '../../lib/device'
import type { PersonKey } from '../../lib/members'
import { addDays, berlinMidnightISO, berlinTime, useNow, useToday } from '../../lib/time'
import { eventsOnDay } from './rules'
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

  const todays = events ? eventsOnDay(events, today) : []
  const tomorrows = events ? eventsOnDay(events, tomorrow) : []
  // Nächster Termin = der erste mit Uhrzeit, der noch nicht vorbei ist
  const nextId = todays.find((e) => !e.allDay && e.end > now)?.id
  const meta = (e: CalendarEvent) => [e.who, e.label !== e.who ? e.label : null].filter(Boolean).join(' · ')

  return (
    <Tile
      title="Termine heute"
      icon={CalendarDays}
      delay={delay}
      action={todays.length > 0 && <Badge>{todays.length}</Badge>}
    >
      {(error || failed.length > 0) && (
        <p role="status" className="mb-2 rounded-md bg-urgent-soft px-3 py-2 text-label text-urgent">
          {error
            ? 'Kalender gerade nicht erreichbar. Die Termine laden gleich neu.'
            : `${failed.length === 1 ? 'Ein Kalender' : `${failed.length} Kalender`} gerade nicht erreichbar.`}
        </p>
      )}

      {events === null ? (
        !error && <p className="text-body text-ink-muted">Termine laden …</p>
      ) : (
        <div className={wide ? 'grid grid-cols-2 gap-5' : 'flex flex-col gap-2'}>
          <div className="flex min-w-0 flex-col gap-2">
            {wide && <h3 className="text-label text-ink-muted">Heute</h3>}
            {todays.length === 0 ? (
              <p className={phone ? 'text-body text-ink-muted' : 'text-body-wall text-ink-muted'}>Heute keine Termine.</p>
            ) : (
              todays.map((e, i) => (
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
              ))
            )}
          </div>

          {/* Vorschau auf morgen nur an der Wand, am Handy bleibt die Startseite kurz */}
          {!phone && (wide || tomorrows.length > 0) && (
            <div className={`flex min-w-0 flex-col gap-2 ${wide ? '' : 'mt-4'}`}>
              <h3 className="text-label text-ink-muted">Morgen</h3>
              {tomorrows.length === 0 ? (
                <p className="text-body text-ink-muted">Morgen keine Termine.</p>
              ) : (
                tomorrows.map((e) => (
                  <EventPill
                    key={e.id}
                    person={personOf(e)}
                    color={e.color}
                    time={timeLabel(e, tomorrow)}
                    title={e.title}
                    meta={meta(e)}
                    compact={!wide}
                  />
                ))
              )}
            </div>
          )}
        </div>
      )}
    </Tile>
  )
}
