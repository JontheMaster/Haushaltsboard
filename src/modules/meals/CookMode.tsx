import { AlarmClock, ArrowLeft, Check, ChevronLeft, ChevronRight, Package, Pause, Play, Timer as TimerIcon, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useMedia } from '../../lib/device'
import { useNow } from '../../lib/time'
import { addTimer, clock, findTimes, remaining, removeTimer, setCookServings, setStep, stopCooking, tickTimers, toggleTimer, useCook, type Timer } from './cookStore'
import { baseName, isPantry, quantity, type Ingredient } from './ingredients'
import { MEAL_DEFAULTS } from './MealSettings'
import { useModuleConfig } from '../useModules'
import { ServingsStepper } from './RecipeDetail'
import { ring, unlockAudio } from './alarm'

/** Bildschirm bleibt an, solange gekocht wird */
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    const request = async () => {
      try {
        lock = (await nav.wakeLock?.request('screen')) ?? null
      } catch {
        // nicht unterstützt (Fully Kiosk hält den Bildschirm ohnehin an)
      }
    }
    request()
    const onVisible = () => document.visibilityState === 'visible' && request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [])
}

/** Zutaten, die im Schritt vorkommen (Wortanfang des Namens im Text) */
function ingredientsIn(text: string, list: Ingredient[]): number[] {
  const t = text.toLowerCase()
  return list
    .map((i, n) => ({ n, words: baseName(i.name).toLowerCase().split(/\s+/).filter((w) => w.length > 3) }))
    .filter(({ words }) => words.some((w) => t.includes(w.slice(0, Math.max(4, w.length - 2)))))
    .map(({ n }) => n)
}

/** Kochmodus: Vollbild, Zutaten zum Abhaken, Schritt für Schritt, Timer aus dem Text */
export function CookMode() {
  const { session } = useCook()
  if (!session) return null
  return <CookScreen key={session.recipe.id} />
}

function CookScreen() {
  const { session, timers } = useCook()
  const wide = useMedia('(min-width: 900px)')
  const [tab, setTab] = useState<'steps' | 'ingredients'>('steps')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const { pantry } = useModuleConfig('essensplan', MEAL_DEFAULTS)
  const [leaving, setLeaving] = useState(false)
  useWakeLock()

  // Timer prüfen; abgelaufene piepen alle paar Sekunden, bis man sie wegtippt
  const now = useNow(1000)
  useEffect(() => {
    if (tickTimers().length) navigator.vibrate?.([300, 150, 300])
  }, [now])
  const ringing = timers.some((t) => t.done)
  useEffect(() => {
    if (!ringing) return
    ring()
    const i = setInterval(ring, 2500)
    return () => clearInterval(i)
  }, [ringing])

  // Wischen am Handy: links = weiter, rechts = zurück
  const swipe = useRef<{ x: number; y: number } | null>(null)

  if (!session) return null
  const { recipe, servings, step } = session
  const factor = servings / (recipe.servings || 2)
  const steps = recipe.steps.length ? recipe.steps : [{ text: 'Für dieses Rezept sind keine Schritte eingetragen.' }]
  const last = step >= steps.length - 1
  const current = steps[Math.min(step, steps.length - 1)].text
  const times = findTimes(current)
  const used = ingredientsIn(current, recipe.ingredients)
  const running = timers.some((t) => !t.done)

  const go = (n: number) => setStep(Math.max(0, Math.min(steps.length - 1, n)))
  const close = () => {
    if (running && !leaving) return setLeaving(true)
    stopCooking()
  }
  const toggle = (n: number) =>
    setChecked((s) => {
      const next = new Set(s)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })

  const ingredients = (
    <ul className="hb-cook-ingredients">
      {recipe.ingredients.map((i, n) => {
        const on = checked.has(n)
        return (
          <li key={n}>
            <button type="button" role="checkbox" aria-checked={on} className={`hb-pick ${on ? 'is-on is-done' : ''} ${used.includes(n) ? 'is-used' : ''}`} onClick={() => toggle(n)}>
              <span className="hb-pick-box">{on && <Icon icon={Check} size={16} />}</span>
              <span className="min-w-0 flex-1 text-left">
                <span className="font-semibold">{quantity(i, factor)} </span>
                {i.name}
              </span>
              {/* Symbole statt Farbe: jetzt im Schritt gebraucht, meist im Vorrat */}
              {used.includes(n) && !on && (
                <span className="hb-cook-tag is-now" title="Jetzt in diesem Schritt">
                  <Icon icon={ArrowLeft} size={16} label="Jetzt dran" />
                </span>
              )}
              {isPantry(i.name, pantry) && (
                <span className="hb-cook-tag" title="Habt ihr meist im Vorrat">
                  <Icon icon={Package} size={16} label="Im Vorrat" />
                </span>
              )}
            </button>
          </li>
        )
      })}
      {!recipe.ingredients.length && <li className="text-body text-ink-muted">Keine Zutaten eingetragen.</li>}
    </ul>
  )

  const stepView = (
    <div
      className="hb-cook-step"
      onTouchStart={(e) => (swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const s = swipe.current
        swipe.current = null
        if (!s) return
        const dx = e.changedTouches[0].clientX - s.x
        const dy = e.changedTouches[0].clientY - s.y
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(step + (dx < 0 ? 1 : -1))
      }}
    >
      <div className="hb-cook-dots" aria-hidden="true">
        {steps.map((_, n) => (
          <button key={n} type="button" tabIndex={-1} className={n === step ? 'is-on' : n < step ? 'is-past' : ''} onClick={() => go(n)} />
        ))}
      </div>
      <span className="text-label text-ink-muted">
        Schritt {step + 1} von {steps.length}
      </span>
      <p key={step} className="hb-cook-text" aria-live="polite">
        {current}
      </p>
      {used.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {used.map((n) => (
            <span key={n} className="hb-tag">
              {quantity(recipe.ingredients[n], factor)} {recipe.ingredients[n].name}
            </span>
          ))}
        </div>
      )}
      {times.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {times.map((t) => (
            <button
              key={t.seconds}
              type="button"
              className="hb-btn hb-btn-lg"
              onClick={() => {
                unlockAudio()
                addTimer(`Schritt ${step + 1} · ${t.label}`, t.seconds)
              }}
            >
              <Icon icon={TimerIcon} size={22} />
              {t.label} Timer starten
            </button>
          ))}
        </div>
      )}
      <div className="mt-auto flex gap-3 pt-4">
        <button type="button" className="hb-btn hb-btn-lg flex-1 whitespace-nowrap" disabled={step === 0} onClick={() => go(step - 1)}>
          <Icon icon={ChevronLeft} size={24} />
          Zurück
        </button>
        {last ? (
          <button type="button" className="hb-btn hb-btn-lg hb-btn-primary flex-[2] whitespace-nowrap" aria-label="Fertig, guten Appetit" onClick={close}>
            <Icon icon={Check} size={24} />
            {wide ? 'Fertig, guten Appetit' : 'Fertig'}
          </button>
        ) : (
          <button type="button" className="hb-btn hb-btn-lg hb-btn-primary flex-[2] whitespace-nowrap" onClick={() => go(step + 1)}>
            Weiter
            <Icon icon={ChevronRight} size={24} />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div
      className="hb-cook"
      role="dialog"
      aria-modal="true"
      aria-label={`Kochmodus: ${recipe.title}`}
      tabIndex={-1}
      // jedes Tippen hält den Ton freigeschaltet (iPad spielt sonst nichts ab)
      onPointerDown={unlockAudio}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(step + 1)
        if (e.key === 'ArrowLeft') go(step - 1)
      }}
    >
      <header className="hb-cook-head">
        <button type="button" className="hb-icon-btn" aria-label="Kochmodus beenden" onClick={close}>
          <Icon icon={X} size={24} />
        </button>
        <h2 className="min-w-0 flex-1 truncate font-display text-title text-ink">{recipe.title}</h2>
        <ServingsStepper value={servings} onChange={setCookServings} />
      </header>

      {timers.length > 0 && <TimerBar timers={timers} />}

      {leaving && (
        <div className="hb-cook-confirm" role="alert">
          <span className="flex-1 text-body text-ink">Timer laufen noch. Trotzdem beenden?</span>
          <button type="button" className="hb-btn" onClick={() => setLeaving(false)}>
            Weiterkochen
          </button>
          <button type="button" className="hb-btn hb-btn-primary" onClick={stopCooking}>
            Beenden
          </button>
        </div>
      )}

      {wide ? (
        <div className="hb-cook-body is-wide">
          <section className="hb-cook-side">
            <h3 className="font-display text-body-wall font-semibold text-ink">Zutaten</h3>
            {ingredients}
          </section>
          {stepView}
        </div>
      ) : (
        <div className="hb-cook-body">
          <div className="hb-seg self-start" role="group" aria-label="Ansicht">
            <button type="button" aria-pressed={tab === 'steps'} className={tab === 'steps' ? 'is-on' : ''} onClick={() => setTab('steps')}>
              Schritte
            </button>
            <button type="button" aria-pressed={tab === 'ingredients'} className={tab === 'ingredients' ? 'is-on' : ''} onClick={() => setTab('ingredients')}>
              Zutaten
            </button>
          </div>
          {tab === 'steps' ? stepView : ingredients}
        </div>
      )}
    </div>
  )
}

/** Laufende Timer nebeneinander: antippen = Pause/weiter, abgelaufene klingeln bis zum Wegtippen */
function TimerBar({ timers }: { timers: Timer[] }) {
  const now = useNow(1000)
  return (
    <div className="hb-timer-bar" role="region" aria-label="Timer">
      {timers.map((t) => {
        const left = remaining(t, now.getTime())
        return (
          <div key={t.id} className={`hb-timer ${t.done ? 'is-done' : ''} ${!t.endsAt && !t.done ? 'is-paused' : ''}`}>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2"
              aria-label={t.done ? `${t.label} ist fertig, wegtippen` : `${t.label}, ${t.endsAt ? 'pausieren' : 'weiterlaufen lassen'}`}
              onClick={() => (t.done ? removeTimer(t.id) : toggleTimer(t.id))}
            >
              {/* Ring zeigt, wie viel noch übrig ist (läuft ab wie eine Uhr) */}
              <span className="hb-timer-ring">
                <svg viewBox="0 0 36 36" className="hb-timer-ring-svg" aria-hidden="true">
                  <circle cx="18" cy="18" r="15" className="hb-timer-ring-track" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    pathLength={1}
                    className="hb-timer-ring-fill"
                    style={{ strokeDashoffset: t.done ? 1 : 1 - left / Math.max(1, t.total) }}
                  />
                </svg>
                <Icon icon={t.done ? AlarmClock : t.endsAt ? Pause : Play} size={16} />
              </span>
              <span className="hb-timer-time">{t.done ? 'Fertig' : clock(left)}</span>
              <span className="min-w-0 truncate text-label">{t.label}</span>
            </button>
            {!t.done && (
              <button type="button" className="hb-timer-x" aria-label={`${t.label} löschen`} onClick={() => removeTimer(t.id)}>
                <Icon icon={X} size={16} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
