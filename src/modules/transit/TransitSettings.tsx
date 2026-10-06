import { Minus, Plus, Save, Search, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { Sheet } from '../../components/Sheet'
import { Toggle } from '../../components/Toggle'
import { useMembers } from '../../lib/members'
import { supabase } from '../../lib/supabase'
import { addDays, useToday, weekdayShort } from '../../lib/time'
import { setModuleConfig } from '../useModules'
import { searchAddress, useTransitConfig, type Stop, type Unknown } from './api'

export type Place = {
  id: string
  member_id: string | null
  name: string
  address: string
  lat: number
  lon: number
  keywords: string[]
  weekdays: number[]
  buffer_min: number
  transit: boolean
}
type Prefs = { member_id: string; show_on_wall: boolean; push_leave: boolean; push_leave_min: number; push_delay: boolean; ignore: string[] }
type Shift = { id: string; member_id: string; name: string; start_time: string; place_id: string }

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const input = 'h-7 w-full rounded-md border border-line bg-surface-sunken px-4 text-body text-ink placeholder:text-ink-muted focus-visible:focus-ring'

/** Eigene Ziele, Einstellungen und Schichten laden (für die Seite und den „Wohin?“-Dialog) */
function useTransitData(memberId: string) {
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [days, setDays] = useState<Map<string, string>>(new Map())
  const today = useToday()

  const load = useCallback(async () => {
    const [p, pr, sh, d] = await Promise.all([
      supabase.from('transit_places').select('*').or(`member_id.eq.${memberId},member_id.is.null`).order('name'),
      supabase.from('transit_prefs').select('*').eq('member_id', memberId).maybeSingle(),
      supabase.from('transit_shifts').select('*').eq('member_id', memberId).order('start_time'),
      supabase.from('transit_shift_days').select('day, shift_id').eq('member_id', memberId).gte('day', today),
    ])
    setPlaces((p.data ?? []) as Place[])
    setPrefs(
      (pr.data as Prefs) ?? { member_id: memberId, show_on_wall: true, push_leave: false, push_leave_min: 10, push_delay: false, ignore: [] },
    )
    setShifts((sh.data ?? []) as Shift[])
    setDays(new Map((d.data ?? []).map((x) => [x.day, x.shift_id])))
  }, [memberId, today])

  useEffect(() => {
    load()
  }, [load])

  const savePrefs = async (patch: Partial<Prefs>) => {
    const next = { ...prefs!, ...patch }
    setPrefs(next)
    await supabase.from('transit_prefs').upsert(next)
  }
  return { places, prefs, shifts, days, load, savePrefs, setDays }
}

/** Alle Funktionen → Abfahrten: alles, was die Abfahrten brauchen, am Handy einstellen */
export function TransitSettings({ onBack }: { onBack: () => void }) {
  const { me } = useMembers()
  const config = useTransitConfig()
  const { places, prefs, shifts, days, load, savePrefs, setDays } = useTransitData(me.id)
  const [editPlace, setEditPlace] = useState<Partial<Place> | null>(null)
  const [editShift, setEditShift] = useState<Partial<Shift> | null>(null)
  const today = useToday()

  const saveStops = (stops: Stop[]) => setModuleConfig('abfahrten', { stops })
  const setDay = async (day: string, shiftId: string) => {
    setDays((m) => {
      const next = new Map(m)
      if (shiftId) next.set(day, shiftId)
      else next.delete(day)
      return next
    })
    if (shiftId) await supabase.from('transit_shift_days').upsert({ member_id: me.id, day, shift_id: shiftId })
    else await supabase.from('transit_shift_days').delete().eq('member_id', me.id).eq('day', day)
  }

  if (!places || !prefs) return <PageHeader title="Abfahrten" onBack={onBack} />

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Abfahrten" onBack={onBack} />
      <p className="text-body text-ink-muted">
        Die App schaut in deinen Kalender (oder deine Schichten), erkennt das Ziel und rechnet, wann du los musst – mit Puffer, damit du
        pünktlich bist. Abfahrten gelten immer ab zuhause.
      </p>

      <Section title="Haltestellen zuhause" hint="Fußweg von der Haustür bis zur Haltestelle">
        {config.stops.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <span className="flex-1 text-body text-ink">{s.name}</span>
            <Stepper
              value={s.walk}
              unit="Min"
              min={1}
              max={40}
              onChange={(walk) => saveStops(config.stops.map((x, j) => (j === i ? { ...x, walk } : x)))}
            />
          </div>
        ))}
      </Section>

      <Section title="Meine Ziele" hint="Erkannt an Stichwörtern im Termin, z. B. „U18“ → Halle">
        {places.map((p) => (
          <button key={p.id} type="button" className="hb-list-row" onClick={() => setEditPlace(p)}>
            <span className="flex min-w-0 flex-1 flex-col text-left">
              <span className="text-body font-semibold text-ink">
                {p.name}
                {!p.transit && <span className="font-normal text-ink-muted"> · ohne Öffis</span>}
              </span>
              <span className="text-label text-ink-muted">{p.address}</span>
              <span className="text-label text-ink-muted">
                {[
                  p.keywords.length ? `Stichwörter: ${p.keywords.join(', ')}` : '',
                  p.weekdays.length ? p.weekdays.map((d) => WEEKDAYS[d - 1]).join(', ') : '',
                  `${p.buffer_min} Min vorher da`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
          </button>
        ))}
        <Button icon={<Icon icon={Plus} size={20} />} onClick={() => setEditPlace({ member_id: me.id, keywords: [], weekdays: [], buffer_min: 10, transit: true })}>
          Ziel hinzufügen
        </Button>
      </Section>

      <Section title="Schichten" hint="Für Wege, die nicht im Kalender stehen: Schicht anlegen, dann pro Tag auswählen">
        {shifts.map((s) => (
          <button key={s.id} type="button" className="hb-list-row" onClick={() => setEditShift(s)}>
            <span className="flex-1 text-left text-body text-ink">
              {s.name} · {s.start_time.slice(0, 5)} · {places.find((p) => p.id === s.place_id)?.name ?? '?'}
            </span>
          </button>
        ))}
        <Button icon={<Icon icon={Plus} size={20} />} disabled={!places.length} onClick={() => setEditShift({ member_id: me.id, start_time: '08:00' })}>
          Schicht anlegen
        </Button>
        {shifts.length > 0 && (
          <div className="flex flex-col gap-1 pt-2">
            <span className="text-label text-ink">Nächste 14 Tage</span>
            {Array.from({ length: 14 }, (_, i) => addDays(today, i)).map((day) => (
              <label key={day} className="flex items-center gap-3">
                <span className="w-[72px] text-body text-ink">
                  {i18nDay(day, today)}
                </span>
                <select className={`${input} h-6`} value={days.get(day) ?? ''} onChange={(e) => setDay(day, e.target.value)}>
                  <option value="">frei</option>
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.start_time.slice(0, 5)})
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
      </Section>

      <Section title="An der Wand">
        <Toggle label="Meine Abfahrten an der Wand zeigen" checked={prefs.show_on_wall} onChange={(v) => savePrefs({ show_on_wall: v })} />
        <div className="flex items-center gap-2">
          <span className="flex-1 text-body text-ink">So lange vor dem Losgehen</span>
          <Stepper value={config.wall_minutes} unit="Min" min={10} max={90} step={5} onChange={(v) => setModuleConfig('abfahrten', { wall_minutes: v })} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-body text-ink">Abfahrtstafel als Kachel, morgens von – bis</span>
          <div className="flex items-center gap-2">
            <input type="time" aria-label="Kachel ab" className={`${input} min-w-0 flex-1 px-3`} value={config.morning_from} onChange={(e) => e.target.value && setModuleConfig('abfahrten', { morning_from: e.target.value })} />
            <span className="text-ink-muted">–</span>
            <input type="time" aria-label="Kachel bis" className={`${input} min-w-0 flex-1 px-3`} value={config.morning_to} onChange={(e) => e.target.value && setModuleConfig('abfahrten', { morning_to: e.target.value })} />
          </div>
        </div>
      </Section>

      <Section title="Mitteilungen aufs Handy" hint="Dafür muss unter Erinnerungen dieses Handy angemeldet sein">
        <Toggle label="Erinnern, wenn ich los muss" checked={prefs.push_leave} onChange={(v) => savePrefs({ push_leave: v })} />
        {prefs.push_leave && (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-body text-ink">So viele Minuten vorher</span>
            <Stepper value={prefs.push_leave_min} unit="Min" min={0} max={45} step={5} onChange={(v) => savePrefs({ push_leave_min: v })} />
          </div>
        )}
        <Toggle label="Bei Verspätung melden" checked={prefs.push_delay} onChange={(v) => savePrefs({ push_delay: v })} />
      </Section>

      {prefs.ignore.length > 0 && (
        <Section title="Kein Weg nötig bei">
          {prefs.ignore.map((t) => (
            <div key={t} className="flex items-center gap-2">
              <span className="flex-1 text-body text-ink">{t}</span>
              <button type="button" className="hb-icon-btn" aria-label={`${t} wieder berücksichtigen`} onClick={() => savePrefs({ ignore: prefs.ignore.filter((x) => x !== t) })}>
                <Icon icon={X} size={18} />
              </button>
            </div>
          ))}
        </Section>
      )}

      {editPlace && (
        <PlaceSheet
          place={editPlace}
          onClose={() => setEditPlace(null)}
          onSaved={() => {
            setEditPlace(null)
            load()
          }}
        />
      )}
      {editShift && (
        <ShiftSheet
          shift={editShift}
          places={places}
          onClose={() => setEditShift(null)}
          onSaved={() => {
            setEditShift(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function i18nDay(day: string, today: string): string {
  if (day === today) return 'Heute'
  if (day === addDays(today, 1)) return 'Morgen'
  return `${weekdayShort(day)} ${Number(day.slice(8))}.`
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="hb-tile hb-tile-static gap-3 p-4">
      <div className="flex flex-col">
        <h3 className="font-display text-[18px] font-semibold text-ink">{title}</h3>
        {hint && <span className="text-label text-ink-muted">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

/** Zahl mit Minus und Plus (große Tippflächen) */
function Stepper({ value, unit, min, max, step = 1, onChange }: { value: number; unit: string; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <span className="hb-stepper">
      <button type="button" aria-label="Weniger" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        <Icon icon={Minus} size={18} />
      </button>
      <span className="hb-stepper-value">
        {value} {unit}
      </span>
      <button type="button" aria-label="Mehr" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        <Icon icon={Plus} size={18} />
      </button>
    </span>
  )
}

/** Ziel anlegen oder bearbeiten: Name, Adresse (Suche), Stichwörter, Wochentage, Puffer */
export function PlaceSheet({ place, onClose, onSaved }: { place: Partial<Place>; onClose: () => void; onSaved: (p: Place) => void }) {
  const [name, setName] = useState(place.name ?? '')
  const [address, setAddress] = useState(place.address ?? '')
  const [coord, setCoord] = useState<{ lat: number; lon: number } | null>(place.lat ? { lat: place.lat, lon: place.lon! } : null)
  const [results, setResults] = useState<{ lat: number; lon: number; label: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [keywords, setKeywords] = useState((place.keywords ?? []).join(', '))
  const [weekdays, setWeekdays] = useState<number[]>(place.weekdays ?? [])
  const [buffer, setBuffer] = useState(place.buffer_min ?? 10)
  const [transit, setTransit] = useState(place.transit ?? true)
  const [error, setError] = useState<string | null>(null)

  async function search() {
    if (address.trim().length < 4) return
    setSearching(true)
    setResults(await searchAddress(address))
    setSearching(false)
  }

  async function save() {
    if (!name.trim()) return setError('Gib dem Ziel einen Namen.')
    if (!coord) return setError('Such die Adresse und wähl einen Vorschlag aus.')
    const row = {
      ...(place.id ? { id: place.id } : {}),
      member_id: place.member_id ?? null,
      name: name.trim(),
      address: address.trim(),
      lat: coord.lat,
      lon: coord.lon,
      keywords: keywords
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean),
      weekdays,
      buffer_min: buffer,
      transit,
    }
    const { data, error } = await supabase.from('transit_places').upsert(row).select().single()
    if (error) return setError('Speichern hat nicht geklappt. Probier es noch mal.')
    onSaved(data as Place)
  }

  async function remove() {
    if (!place.id) return
    await supabase.from('transit_places').delete().eq('id', place.id)
    onSaved(place as Place)
  }

  return (
    <Sheet title={place.id ? 'Ziel bearbeiten' : 'Neues Ziel'} onClose={onClose}>
      <label className="flex flex-col gap-2">
        <span className="text-label text-ink">Name</span>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Halle Mittwoch" />
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-label text-ink">Adresse</span>
        <div className="flex gap-2">
          <input
            className={input}
            value={address}
            onChange={(e) => {
              setAddress(e.target.value)
              setCoord(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Straße Hausnummer, Ort"
            enterKeyHint="search"
          />
          <button type="button" className="hb-icon-btn" aria-label="Adresse suchen" onClick={search} disabled={searching}>
            <Icon icon={Search} size={20} />
          </button>
        </div>
        {coord && <span className="text-label text-success">Adresse gefunden</span>}
        {!coord && results.length > 0 && (
          <div className="flex flex-col gap-1">
            {results.map((r) => (
              <button
                key={`${r.lat}${r.lon}`}
                type="button"
                className="hb-list-row text-left text-body text-ink"
                onClick={() => {
                  setAddress(r.label)
                  setCoord({ lat: r.lat, lon: r.lon })
                  setResults([])
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
        {!coord && !searching && results.length === 0 && address.length >= 4 && (
          <span className="text-label text-ink-muted">Tipp auf die Lupe, dann einen Vorschlag wählen.</span>
        )}
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-label text-ink">Stichwörter im Termin (mit Komma)</span>
        <input className={input} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="z. B. u18, training" />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label text-ink">Nur an diesen Tagen (sonst immer)</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d, i) => {
            const on = weekdays.includes(i + 1)
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                className={`hb-choice ${on ? 'is-on' : ''}`}
                onClick={() => setWeekdays((w) => (on ? w.filter((x) => x !== i + 1) : [...w, i + 1].sort()))}
              >
                {d}
              </button>
            )
          })}
        </div>
      </fieldset>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-body text-ink">So früh da sein</span>
        <Stepper value={buffer} unit="Min vorher" min={0} max={45} step={5} onChange={setBuffer} />
      </div>
      <Toggle label="Mit Öffis (sonst keine Abfahrten)" checked={transit} onChange={setTransit} />
      {error && (
        <p role="alert" className="rounded-md bg-urgent-soft px-4 py-3 text-label text-urgent">
          {error}
        </p>
      )}
      <Button variant="primary" size="lg" icon={<Icon icon={Save} size={22} />} onClick={save}>
        Ziel speichern
      </Button>
      {place.id && (
        <Button variant="ghost" className="hb-btn-danger" icon={<Icon icon={Trash2} size={18} />} onClick={remove}>
          Ziel löschen
        </Button>
      )}
    </Sheet>
  )
}

function ShiftSheet({ shift, places, onClose, onSaved }: { shift: Partial<Shift>; places: Place[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(shift.name ?? '')
  const [time, setTime] = useState((shift.start_time ?? '08:00').slice(0, 5))
  const [placeId, setPlaceId] = useState(shift.place_id ?? places[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) return setError('Gib der Schicht einen Namen, z. B. Frühdienst.')
    const { error } = await supabase
      .from('transit_shifts')
      .upsert({ ...(shift.id ? { id: shift.id } : {}), member_id: shift.member_id!, name: name.trim(), start_time: time, place_id: placeId })
    if (error) return setError('Speichern hat nicht geklappt. Probier es noch mal.')
    onSaved()
  }
  async function remove() {
    if (shift.id) await supabase.from('transit_shifts').delete().eq('id', shift.id)
    onSaved()
  }

  return (
    <Sheet title={shift.id ? 'Schicht bearbeiten' : 'Neue Schicht'} onClose={onClose}>
      <label className="flex flex-col gap-2">
        <span className="text-label text-ink">Name</span>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Frühdienst" />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-label text-ink">Beginnt um</span>
        <input type="time" className={input} value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-label text-ink">Wo</span>
        <select className={input} value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="rounded-md bg-urgent-soft px-4 py-3 text-label text-urgent">
          {error}
        </p>
      )}
      <Button variant="primary" size="lg" icon={<Icon icon={Save} size={22} />} onClick={save}>
        Schicht speichern
      </Button>
      {shift.id && (
        <Button variant="ghost" className="hb-btn-danger" icon={<Icon icon={Trash2} size={18} />} onClick={remove}>
          Schicht löschen
        </Button>
      )}
    </Sheet>
  )
}

/** „Wohin geht's?“ für einen Termin, dessen Ziel die App nicht erkennt */
export function AssignSheet({ item, onClose }: { item: Unknown; onClose: () => void }) {
  const { me } = useMembers()
  const { places, prefs, savePrefs } = useTransitData(me.id)
  const [newPlace, setNewPlace] = useState(false)
  const keyword = item.title.trim().toLowerCase()

  async function pick(p: Place) {
    await supabase.from('transit_places').update({ keywords: [...new Set([...p.keywords, keyword])] }).eq('id', p.id)
    onClose()
  }

  if (newPlace) {
    return (
      <PlaceSheet
        place={{ member_id: me.id, name: item.title, address: item.location ?? '', keywords: [keyword], weekdays: [], buffer_min: 10, transit: true }}
        onClose={onClose}
        onSaved={onClose}
      />
    )
  }
  return (
    <Sheet title="Wohin geht's?" onClose={onClose}>
      <p className="text-body text-ink-muted">
        „{item.title}“{item.location ? ` (${item.location})` : ''} konnte ich keinem Ziel zuordnen. Ab jetzt merke ich mir deine Wahl.
      </p>
      {places?.map((p) => (
        <button key={p.id} type="button" className="hb-list-row text-left text-body text-ink" onClick={() => pick(p)}>
          {p.name}
        </button>
      ))}
      <Button icon={<Icon icon={Plus} size={20} />} onClick={() => setNewPlace(true)}>
        Neues Ziel anlegen
      </Button>
      <Button
        variant="ghost"
        onClick={async () => {
          if (prefs) await savePrefs({ ignore: [...new Set([...prefs.ignore, keyword])] })
          onClose()
        }}
      >
        Kein Weg nötig
      </Button>
    </Sheet>
  )
}
