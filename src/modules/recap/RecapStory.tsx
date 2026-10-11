import {
  CalendarCheck,
  CalendarDays,
  Cake,
  Car,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Crown,
  Image,
  ListChecks,
  Moon,
  RotateCcw,
  Sparkles,
  Sun,
  Sunrise,
  Thermometer,
  TrendingDown,
  TrendingUp,
  UtensilsCrossed,
  WashingMachine,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CountUp } from '../../components/CountUp'
import { Icon } from '../../components/Icon'
import { useMembers } from '../../lib/members'
import { addDays, dayLabel, weekdayShort } from '../../lib/time'
import { eventsOnDay } from '../calendar/rules'
import { kindOf, shortenTitle } from '../calendar/shorten'
import { useCalendar, type CalendarEvent } from '../calendar/useCalendar'
import { isMealEvent, useMeals } from '../meals/mealStore'
import { RecipeImage } from '../meals/RecipeLibrary'
import { useRecipes } from '../meals/recipeStore'
import { closeRecap, type Recap } from './recapStore'
import { RecapContent } from './WeekRecap'

/** So lange steht eine Karte, bevor die nächste kommt (antippen = sofort weiter, Finger halten = Pause) */
const SLIDE_MS = 7000

const DAY_NAMES: Record<string, string> = { Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag', Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag' }
const dayName = (day: string) => DAY_NAMES[weekdayShort(day)] ?? day

/** „29. Sep. – 5. Okt.“ */
export function weekRange(from: string, to: string): string {
  const fmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${fmt.format(new Date(`${from}T12:00:00Z`))} – ${fmt.format(new Date(`${to}T12:00:00Z`))}`
}

type PersonKey = 'a' | 'b' | 'open'
type Weather = { warm: { day: string; t: number } | null; rainDays: number; sunHours: number }

/** Wetter der Woche (Open-Meteo, Nürnberg): wärmster Tag, Regentage (ab 1 mm), Sonnenstunden; nur bis heute */
function useWeekWeather(week: string, today: string): Weather | null {
  const [w, setW] = useState<Weather | null>(null)
  useEffect(() => {
    const end = addDays(week, 6) < today ? addDays(week, 6) : today
    let alive = true
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=49.45&longitude=11.08&timezone=Europe%2FBerlin&daily=temperature_2m_max,precipitation_sum,sunshine_duration&start_date=${week}&end_date=${end}`,
    )
      .then((r) => r.json())
      .then((d: { daily?: { time: string[]; temperature_2m_max: number[]; precipitation_sum: number[]; sunshine_duration: number[] } }) => {
        if (!alive || !d.daily) return
        const { time, temperature_2m_max: tmax, precipitation_sum: rain, sunshine_duration: sun } = d.daily
        let warm: Weather['warm'] = null
        time.forEach((day, i) => {
          if (tmax[i] != null && (!warm || tmax[i] > warm.t)) warm = { day, t: Math.round(tmax[i]) }
        })
        setW({ warm, rainDays: rain.filter((x) => (x ?? 0) >= 1).length, sunHours: Math.round(sun.reduce((s, x) => s + (x ?? 0), 0) / 3600) })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [week, today])
  return w
}

/** Termine einer Woche (nur für diese und nächste Woche geladen), ohne Essen, jeder Termin einmal */
function eventsInWeek(events: CalendarEvent[] | null, week: string): CalendarEvent[] | null {
  if (!events) return null
  const seen = new Map<string, CalendarEvent>()
  for (let i = 0; i < 7; i++) for (const e of eventsOnDay(events, addDays(week, i))) if (!isMealEvent(e) && !seen.has(e.id)) seen.set(e.id, e)
  return [...seen.values()].sort((a, b) => a.start.localeCompare(b.start))
}

// ───────── Story ─────────

type Slide = { id: string; tone: string; render: () => ReactNode }

/**
 * Wochenrückblick als Story (Entscheidung Jonathan 11.10.2026, wie Spotify Wrapped): Vollbild-Karten nacheinander,
 * laufen von selbst weiter (7 s), antippen rechts = weiter, links = zurück, wischen am Handy, Finger halten = Pause.
 * Karten ohne Inhalt fallen weg. Am Ende die Übersicht mit allen Listen.
 */
export function RecapStory({ recap, week, thisWeek, today, onWeek }: { recap: Recap; week: string; thisWeek: string; today: string; onWeek: (w: string) => void }) {
  const { people, personKey } = useMembers()
  const { events } = useCalendar()
  const meals = useMeals()
  const { recipes } = useRecipes()
  const weather = useWeekWeather(week, today)
  const isThisWeek = week === thisWeek

  const done = recap.todos.done + recap.chores.done
  const diff = done - recap.prev_done

  // Personen und „an der Wand“ (Tablet-Konto oder ohne Namen) zusammenfassen
  const duel = people.map((p) => ({ id: p.id, name: p.name, key: personKey(p.id) as PersonKey, n: recap.by[p.id] ?? 0, kinds: recap.by_kind?.[p.id] ?? { todos: 0, chores: 0 } }))
  const wall = Object.entries(recap.by)
    .filter(([id]) => !people.some((p) => p.id === id))
    .reduce((s, [, n]) => s + n, 0)
  const top = Math.max(0, ...duel.map((d) => d.n))
  const winners = duel.filter((d) => d.n === top && top > 0)

  // Auszeichnungen
  const best = (pick: (d: (typeof duel)[number]) => number) => {
    const m = Math.max(0, ...duel.map(pick))
    if (!m) return null
    const who = duel.filter((d) => pick(d) === m)
    return { who, n: m }
  }
  const awards: { icon: LucideIcon; title: string; who: typeof duel; text: string }[] = []
  const chores = best((d) => d.kinds.chores)
  if (chores) awards.push({ icon: Sparkles, title: 'Putz-Profi', who: chores.who, text: `${chores.n} ${chores.n === 1 ? 'Putzaufgabe' : 'Putzaufgaben'}` })
  const todos = best((d) => d.kinds.todos)
  if (todos) awards.push({ icon: ListChecks, title: 'Todo-Held', who: todos.who, text: `${todos.n} ${todos.n === 1 ? 'Todo' : 'Todos'}` })
  const asPerson = (id?: string) => duel.filter((d) => d.id === id)
  if (recap.earliest && asPerson(recap.earliest.member).length)
    awards.push({ icon: Sunrise, title: 'Frühaufsteher', who: asPerson(recap.earliest.member), text: `schon um ${recap.earliest.time} Uhr was abgehakt` })
  if (recap.latest && asPerson(recap.latest.member).length && (recap.latest.time >= '21:00' || recap.latest.time < '04:00'))
    awards.push({ icon: Moon, title: 'Nachteule', who: asPerson(recap.latest.member), text: `noch um ${recap.latest.time} Uhr was erledigt` })

  // Gekocht
  const cooked = recap.meals
  const recipeOf = (id: string | null) => recipes?.find((r) => r.id === id) ?? null
  const counts = new Map<string, number>()
  cooked.forEach((m) => m.recipe_id && counts.set(m.recipe_id, (counts.get(m.recipe_id) ?? 0) + 1))
  const fav = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  const favRecipe = fav && fav[1] > 1 ? recipeOf(fav[0]) : null

  // Woche in Zahlen
  const weekEvents = isThisWeek ? eventsInWeek(events, week) : null
  const washes = (recap.timers ?? []).reduce((s, t) => s + t.n, 0)
  const numbers: { icon: LucideIcon; value: number; unit?: string; label: string }[] = []
  if (weekEvents?.length) numbers.push({ icon: CalendarDays, value: weekEvents.length, label: weekEvents.length === 1 ? 'Termin' : 'Termine' })
  if (washes) numbers.push({ icon: WashingMachine, value: washes, label: washes === 1 ? 'Wäsche-Runde' : 'Wäsche-Runden' })
  if (recap.drives?.n) numbers.push({ icon: Car, value: recap.drives.n, label: `${recap.drives.n === 1 ? 'Heimweg' : 'Heimwege'} · ${recap.drives.km} km` })
  if (recap.photos) numbers.push({ icon: Image, value: recap.photos, label: recap.photos === 1 ? 'neues Foto' : 'neue Fotos' })
  if (weather?.warm) numbers.push({ icon: Thermometer, value: weather.warm.t, unit: '°', label: `am ${dayName(weather.warm.day)}, wärmster Tag` })
  if (weather) numbers.push({ icon: Sun, value: weather.sunHours, unit: ' Std', label: 'Sonne' })
  if (weather) numbers.push({ icon: CloudRain, value: weather.rainDays, label: weather.rainDays === 1 ? 'Regentag' : 'Regentage' })

  // Ausblick: nächste Woche (nur wenn man die laufende Woche ansieht)
  const next = addDays(thisWeek, 7)
  const nextEvents = isThisWeek ? (eventsInWeek(events, next) ?? []) : []
  const birthdays = nextEvents.filter((e) => kindOf(e.title)?.label === 'Geburtstag')
  // Höhepunkte: höchstens ein Termin pro Tag, ohne Arbeit/Büro und ohne Kalender, die bei Besuch versteckt sind (Fokus, Arbeit)
  const seenDays = new Set<string>()
  const highlights = nextEvents
    .filter((e) => !birthdays.includes(e) && !e.hideInVisit && kindOf(e.title)?.label !== 'Arbeit' && !/homeoffice/i.test(e.title))
    .filter((e) => {
      const d = e.start.slice(0, 10)
      if (seenDays.has(d)) return false
      seenDays.add(d)
      return true
    })
    .slice(0, 4)
  const nextMeals = isThisWeek ? (meals ?? []).filter((m) => m.day >= next && m.day <= addDays(next, 6)) : []

  const slides: Slide[] = [
    {
      id: 'intro',
      tone: 'accent',
      render: () => (
        <div className="hb-story-center">
          <p className="hb-story-kicker hb-story-in">Eure Woche</p>
          <p className="hb-story-sub hb-story-in" style={{ ['--i' as string]: 1 }}>
            {weekRange(week, addDays(week, 6))}
          </p>
          <span className="hb-story-huge hb-story-in" style={{ ['--i' as string]: 2 }}>
            <CountUp value={done} delay={500} ms={1600} />
          </span>
          <p className="hb-story-title hb-story-in" style={{ ['--i' as string]: 3 }}>
            {done === 1 ? 'Sache erledigt' : 'Sachen erledigt'}
          </p>
          {recap.prev_done > 0 || done > 0 ? (
            <p className={`hb-story-trend hb-story-in ${diff >= 0 ? 'is-up' : 'is-down'}`} style={{ ['--i' as string]: 5 }}>
              <Icon icon={diff >= 0 ? TrendingUp : TrendingDown} size={20} />
              {diff === 0 ? 'so viel wie letzte Woche' : `${Math.abs(diff)} ${diff > 0 ? 'mehr' : 'weniger'} als letzte Woche`}
            </p>
          ) : null}
        </div>
      ),
    },
  ]

  if (top > 0)
    slides.push({
      id: 'duel',
      tone: winners.length === 1 ? `person-${winners[0].key}` : 'accent',
      render: () => (
        <div className="hb-story-center">
          <p className="hb-story-kicker hb-story-in">Das Duell</p>
          <div className="hb-story-duel">
            {duel.map((d, i) => {
              const win = winners.length === 1 && winners[0].id === d.id
              return (
                <div key={d.id} className={`hb-story-fighter hb-person-${d.key} ${win ? 'is-winner' : ''}`} style={{ ['--i' as string]: i + 1 }}>
                  <span className="hb-story-crown" aria-hidden={!win}>
                    {win && <Icon icon={Crown} size={40} label="Gewinner" />}
                  </span>
                  <span className="hb-story-pillar">
                    <span className="hb-story-pillar-fill" style={{ ['--h' as string]: `${Math.max(8, (d.n / top) * 100)}%` }} />
                  </span>
                  <span className="hb-story-score">
                    <CountUp value={d.n} delay={600} />
                  </span>
                  <span className="hb-story-avatar">{d.name.charAt(0)}</span>
                  <span className="hb-story-name">{d.name}</span>
                </div>
              )
            })}
          </div>
          <p className="hb-story-sub hb-story-in" style={{ ['--i' as string]: 6 }}>
            {winners.length === 1 ? `${winners[0].name} holt die Krone` : 'Unentschieden, ihr teilt euch die Krone'}
            {wall > 0 ? ` · ${wall} an der Wand abgehakt` : ''}
          </p>
        </div>
      ),
    })

  if (awards.length || recap.best_day)
    slides.push({
      id: 'awards',
      tone: 'success',
      render: () => (
        <div className="hb-story-stack">
          <p className="hb-story-kicker hb-story-in">Auszeichnungen</p>
          <ul className="hb-story-awards">
            {awards.map((a, i) => (
              <li key={a.title} className={`hb-story-award hb-story-pop hb-person-${a.who.length === 1 ? a.who[0].key : 'open'}`} style={{ ['--i' as string]: i + 1 }}>
                <span className="hb-story-award-icon">
                  <Icon icon={a.icon} size={26} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="hb-story-award-title">{a.title}</span>
                  <span className="hb-story-award-text">
                    <b>{a.who.map((w) => w.name).join(' & ')}</b> · {a.text}
                  </span>
                </span>
              </li>
            ))}
            {recap.best_day && (
              <li className="hb-story-award hb-story-pop hb-person-open" style={{ ['--i' as string]: awards.length + 1 }}>
                <span className="hb-story-award-icon">
                  <Icon icon={CalendarCheck} size={26} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="hb-story-award-title">Fleißigster Tag</span>
                  <span className="hb-story-award-text">
                    <b>{dayName(recap.best_day.day)}</b> · {recap.best_day.n} erledigt
                  </span>
                </span>
              </li>
            )}
          </ul>
        </div>
      ),
    })

  if (cooked.length)
    slides.push({
      id: 'meals',
      tone: 'accent',
      render: () => (
        <div className="hb-story-stack">
          <p className="hb-story-kicker hb-story-in">Gekocht</p>
          <p className="hb-story-title hb-story-in" style={{ ['--i' as string]: 1 }}>
            <span className="hb-story-num">
              <CountUp value={cooked.length} delay={300} />
            </span>{' '}
            Essen diese Woche
          </p>
          <div className="hb-story-collage">
            {cooked.slice(0, 6).map((m, i) => {
              const r = recipeOf(m.recipe_id)
              return (
                <figure key={i} className="hb-story-dish hb-story-pop" style={{ ['--i' as string]: i + 2 }}>
                  {r ? (
                    <RecipeImage recipe={r} large className="hb-story-dish-img" />
                  ) : (
                    <span className="hb-recipe-img hb-story-dish-img">
                      <Icon icon={UtensilsCrossed} size={32} />
                    </span>
                  )}
                  <figcaption>
                    <span>{dayLabel(m.day)}</span>
                    {m.title}
                  </figcaption>
                </figure>
              )
            })}
          </div>
          {favRecipe && (
            <p className="hb-story-sub hb-story-in" style={{ ['--i' as string]: 9 }}>
              Lieblingsessen: <b>{favRecipe.title}</b> ({fav![1]}×)
            </p>
          )}
        </div>
      ),
    })

  if (numbers.length >= 2)
    slides.push({
      id: 'numbers',
      tone: 'person-a',
      render: () => (
        <div className="hb-story-stack">
          <p className="hb-story-kicker hb-story-in">Die Woche in Zahlen</p>
          <ul className="hb-story-numbers">
            {numbers.map((n, i) => (
              <li key={n.label} className="hb-story-number hb-story-pop" style={{ ['--i' as string]: i + 1 }}>
                <Icon icon={n.icon} size={22} />
                <span className="hb-story-num">
                  <CountUp value={n.value} delay={300 + i * 120} />
                  {n.unit}
                </span>
                <span className="hb-story-number-label">{n.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ),
    })

  if (isThisWeek && (nextEvents.length || nextMeals.length))
    slides.push({
      id: 'next',
      tone: 'person-b',
      render: () => (
        <div className="hb-story-stack">
          <p className="hb-story-kicker hb-story-in">Nächste Woche</p>
          <p className="hb-story-title hb-story-in" style={{ ['--i' as string]: 1 }}>
            {nextEvents.length ? `${nextEvents.length} ${nextEvents.length === 1 ? 'Termin' : 'Termine'}` : 'Noch keine Termine'}
            {nextMeals.length ? ` · ${nextMeals.length} Essen geplant` : ''}
          </p>
          <ul className="hb-story-list">
            {birthdays.map((e, i) => (
              <li key={e.id} className="hb-story-row is-birthday hb-story-in" style={{ ['--i' as string]: i + 2 }}>
                <Icon icon={Cake} size={20} />
                <span className="hb-story-row-day">{dayLabel(e.start.slice(0, 10))}</span>
                <span className="min-w-0 truncate">{e.title}</span>
              </li>
            ))}
            {highlights.map((e, i) => (
              <li key={e.id} className={`hb-story-row hb-story-in ${e.person ? `hb-${e.person}` : ''}`} style={{ ['--i' as string]: birthdays.length + i + 2 }}>
                <Icon icon={kindOf(e.title)?.icon ?? CalendarDays} size={20} />
                <span className="hb-story-row-day">{dayLabel(e.start.slice(0, 10))}</span>
                <span className="min-w-0 truncate">{shortenTitle(e.title).text}</span>
              </li>
            ))}
            {nextMeals.slice(0, 4).map((m, i) => (
              <li key={m.id} className="hb-story-row is-meal hb-story-in" style={{ ['--i' as string]: birthdays.length + highlights.length + i + 2 }}>
                <Icon icon={UtensilsCrossed} size={20} />
                <span className="hb-story-row-day">{dayLabel(m.day)}</span>
                <span className="min-w-0 truncate">{m.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ),
    })

  slides.push({
    id: 'overview',
    tone: 'plain',
    render: () => (
      <div className="hb-story-overview">
        <RecapContent recap={recap} />
      </div>
    ),
  })

  return <StoryPlayer key={week} slides={slides} week={week} thisWeek={thisWeek} onWeek={onWeek} />
}

/** Abspielen: Fortschritt oben, antippen/wischen, Pause beim Halten, Woche wechseln, schließen */
function StoryPlayer({ slides, week, thisWeek, onWeek }: { slides: Slide[]; week: string; thisWeek: string; onWeek: (w: string) => void }) {
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const last = slides.length - 1
  const i = Math.min(idx, last)
  const slide = slides[i]
  const isOverview = slide.id === 'overview'
  const down = useRef<{ x: number; y: number; t: number; hold: ReturnType<typeof setTimeout> } | null>(null)

  const go = (n: number) => setIdx((v) => Math.max(0, Math.min(last, Math.min(v, last) + n)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const tones = useMemo(() => slides.map((s) => s.tone), [slides])

  return (
    <div className={`hb-story is-${tones[i]}`}>
      <div className="hb-story-top">
        <div className="hb-story-progress" aria-hidden="true">
          {slides.map((s, n) => (
            <span key={s.id} className="hb-story-seg">
              <span
                className={`hb-story-seg-fill ${n < i ? 'is-done' : n === i && !isOverview ? 'is-active' : n === i ? 'is-done' : ''}`}
                style={n === i ? { animationDuration: `${SLIDE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' } : undefined}
                onAnimationEnd={n === i ? () => go(1) : undefined}
              />
            </span>
          ))}
        </div>
        <div className="hb-story-bar">
          <button type="button" className="hb-icon-btn" aria-label="Woche davor" onClick={() => onWeek(addDays(week, -7))}>
            <Icon icon={ChevronLeft} size={22} />
          </button>
          <span className="hb-story-week">{week === thisWeek ? 'Diese Woche' : weekRange(week, addDays(week, 6))}</span>
          <button type="button" className="hb-icon-btn" aria-label="Woche danach" disabled={week >= thisWeek} onClick={() => onWeek(addDays(week, 7))}>
            <Icon icon={ChevronRight} size={22} />
          </button>
          <span className="flex-1" />
          {isOverview && (
            <button type="button" className="hb-icon-btn" aria-label="Von vorn" onClick={() => setIdx(0)}>
              <Icon icon={RotateCcw} size={20} />
            </button>
          )}
          <button type="button" className="hb-icon-btn" aria-label="Schließen" onClick={closeRecap}>
            <Icon icon={X} size={22} />
          </button>
        </div>
      </div>

      <div
        key={slide.id}
        className={`hb-story-slide ${isOverview ? 'is-overview' : ''}`}
        onPointerDown={(e) => {
          if (isOverview) return
          const hold = setTimeout(() => setPaused(true), 220)
          down.current = { x: e.clientX, y: e.clientY, t: Date.now(), hold }
        }}
        onPointerUp={(e) => {
          const d = down.current
          down.current = null
          if (!d) return
          clearTimeout(d.hold)
          setPaused(false)
          const dx = e.clientX - d.x
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - d.y)) return go(dx < 0 ? 1 : -1)
          if (Date.now() - d.t > 300) return
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          go(e.clientX - rect.left < rect.width * 0.3 ? -1 : 1)
        }}
        onPointerCancel={() => {
          if (down.current) clearTimeout(down.current.hold)
          down.current = null
          setPaused(false)
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {slide.render()}
        {isOverview && (
          <div className="hb-story-again">
            <button type="button" className="hb-btn hb-btn-secondary" onClick={() => setIdx(0)}>
              <Icon icon={RotateCcw} size={18} />
              Nochmal ansehen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
