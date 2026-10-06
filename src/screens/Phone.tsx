import { CalendarRange, House, LayoutGrid, ListChecks, Plus, Settings2, ShoppingCart, Sparkles, TrainFront, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { CookMode } from '../modules/meals/CookMode'
import { WeekRecap } from '../modules/recap/WeekRecap'
import { WifiButton } from '../modules/wlan/Wifi'
import { MealsTab } from '../modules/meals/MealsTab'
import { Sheet } from '../components/Sheet'
import { DeparturesBoard } from '../modules/transit/DeparturesBoard'
import { useCallback, useState } from 'react'
import { Icon } from '../components/Icon'
import { Toast } from '../components/Toast'
import { VisitToggle } from '../components/VisitToggle'
import { DeviceProvider } from '../lib/device'
import { supabase } from '../lib/supabase'
import { shortDate, useNow } from '../lib/time'
import { describe, type Weather } from '../modules/clock-weather/weather'
import { MODULE_BY_ID, MODULES } from '../modules/registry'
import { SpotifyPage, takeSpotifyResult } from '../modules/spotify/SpotifyPage'
import { ShoppingTile } from '../modules/shopping/ShoppingTile'
import { deleteTodo, restoreTodo } from '../modules/todos/todoActions'
import { TodoSheet } from '../modules/todos/TodoSheet'
import { TodosDetail } from '../modules/todos/TodosDetail'
import { WeekView } from '../modules/week/WeekView'
import { CHORE_PREFIX, isChoreId, type Todo } from '../modules/todos/useTodos'
import { PutzplanPage } from '../modules/chores/Putzplan'
import { Button } from '../components/Button'
import { AllModules } from './AllModules'
import { PhoneLayoutEditor } from './PhoneLayoutEditor'
import { useEnabledModules, useLayout } from '../modules/useModules'

type Tab = 'start' | 'woche' | 'todos' | 'einkauf' | 'essen'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'start', label: 'Start', icon: House },
  { id: 'woche', label: 'Woche', icon: CalendarRange },
  { id: 'todos', label: 'Todos', icon: ListChecks },
  { id: 'einkauf', label: 'Einkauf', icon: ShoppingCart },
  { id: 'essen', label: 'Essen', icon: UtensilsCrossed },
]
// Reiter, die zu einem abschaltbaren Modul gehören
const TAB_MODULE: Partial<Record<Tab, string>> = { todos: 'todos', einkauf: 'einkauf', essen: 'essensplan' }

function savedTab(): Tab {
  try {
    const t = localStorage.getItem('hb-tab')
    return t === 'woche' || t === 'todos' || t === 'einkauf' || t === 'essen' ? t : 'start'
  } catch {
    return 'start'
  }
}

/** Handy-Ansicht (unter 700 px): eintragen, planen, abhaken */
export function Phone({ weather }: { weather: Weather | null }) {
  const [savedOrChosen, setTab] = useState<Tab>(savedTab)
  const [sheet, setSheet] = useState<{ todo?: Todo } | null>(null)
  // Eigene Seiten über den Reitern: Alle Funktionen (Kopfzeile), deren Einstellungen,
  // Putzplan auch direkt (Todo-Seite oder Antippen einer Putzaufgabe)
  const [page, setPage] = useState<null | { kind: 'all' } | { kind: 'layout' } | { kind: 'module'; id: string } | { kind: 'spotify'; notice?: string | null } | { kind: 'putzplan'; ruleId?: string }>(
    // Rückkehr von der Spotify-Anmeldung: gleich die Spotify-Seite mit Rückmeldung zeigen
    () => {
      const notice = takeSpotifyResult()
      return notice ? { kind: 'spotify', notice } : null
    },
  )
  const [toast, setToast] = useState<{ id: number; message: string; action?: { label: string; run: () => void } } | null>(null)
  const showToast = useCallback((message: string) => setToast({ id: Date.now(), message }), [])
  const hideToast = useCallback(() => setToast(null), [])

  // Ausgeschaltete Module verlieren ihren Reiter
  const enabled = useEnabledModules()
  const tabs = TABS.filter((t) => {
    const mod = TAB_MODULE[t.id]
    // Essensplan ist neu: Reiter erst, wenn die Module geladen sind und es an ist
    return !mod || (mod === 'essensplan' ? enabled?.has(mod) === true : enabled?.has(mod) !== false)
  })
  const tab: Tab = tabs.some((t) => t.id === savedOrChosen) ? savedOrChosen : 'start'
  const go = (t: Tab) => {
    setPage(null)
    setTab(t)
    window.scrollTo({ top: 0 })
    try {
      localStorage.setItem('hb-tab', t)
    } catch {
      // nur Komfort
    }
  }

  const removeTodo = useCallback(async (todo: Todo) => {
    if (!(await deleteTodo(todo.id))) return setToast({ id: Date.now(), message: 'Löschen hat nicht geklappt.' })
    setToast({
      id: Date.now(),
      message: `„${todo.title}“ gelöscht`,
      action: {
        label: 'Rückgängig',
        run: async () => {
          setToast(null)
          if (!(await restoreTodo(todo))) setToast({ id: Date.now(), message: 'Wiederherstellen hat nicht geklappt.' })
        },
      },
    })
  }, [])

  const openTodo = useCallback(async (id: string) => {
    if (isChoreId(id)) {
      // Putzaufgabe: deren Regel im Putzplan bearbeiten
      const { data } = await supabase.from('chore_tasks').select('rule_id').eq('id', id.slice(CHORE_PREFIX.length)).maybeSingle()
      setPage({ kind: 'putzplan', ruleId: data?.rule_id })
      window.scrollTo({ top: 0 })
      return
    }
    const { data } = await supabase.from('todos').select('*').eq('id', id).maybeSingle()
    if (data) setSheet({ todo: data })
  }, [])

  return (
    <DeviceProvider value={{ device: 'phone', openTodo, removeTodo }}>
      <div className="min-h-dvh bg-surface pb-[calc(88px+env(safe-area-inset-bottom))]">
        <PhoneHeader weather={weather} onMore={() => setPage({ kind: 'all' })} />

        <main className="flex flex-col gap-4 px-4">
          {page?.kind === 'all' ? (
            <AllModules onBack={() => setPage(null)} open={(id) => setPage({ kind: 'module', id })} />
          ) : page?.kind === 'module' ? (
            <ModuleSettings id={page.id} onBack={() => setPage({ kind: 'all' })} />
          ) : page?.kind === 'spotify' ? (
            <SpotifyPage onBack={() => setPage({ kind: 'all' })} notice={page.notice} />
          ) : page?.kind === 'layout' ? (
            <PhoneLayoutEditor onBack={() => setPage(null)} showToast={showToast} />
          ) : page?.kind === 'putzplan' ? (
            <PutzplanPage onBack={() => setPage(null)} openRuleId={page.ruleId} />
          ) : (
            <>
          {tab === 'start' && (
            <StartTab
              onEdit={() => {
                setPage({ kind: 'layout' })
                window.scrollTo({ top: 0 })
              }}
            />
          )}
          {tab === 'woche' && <WeekView variant="phone" />}
          {tab === 'todos' && (
            <>
              {enabled?.has('putzplan') && (
                <Button icon={<Icon icon={Sparkles} size={20} />} onClick={() => setPage({ kind: 'putzplan' })}>
                  Putzplan bearbeiten
                </Button>
              )}
              <TodosDetail />
            </>
          )}
          {tab === 'einkauf' && <ShoppingTile size="m" delay={0} />}
          {tab === 'essen' && <MealsTab showToast={showToast} />}
            </>
          )}
        </main>

        {tab !== 'einkauf' && tab !== 'essen' && !page && enabled?.has('todos') !== false && (
          <button type="button" className="hb-fab" aria-label="Todo hinzufügen" onClick={() => setSheet({})}>
            <Icon icon={Plus} size={28} />
          </button>
        )}

        <nav className="hb-tabbar" aria-label="Bereiche">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`hb-tab ${tab === t.id ? 'is-active' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => go(t.id)}
            >
              <Icon icon={t.icon} size={24} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        {sheet && <TodoSheet todo={sheet.todo} onClose={() => setSheet(null)} onSaved={showToast} />}
        {toast && <Toast key={toast.id} message={toast.message} action={toast.action} onDone={hideToast} />}
        <CookMode />
        <WeekRecap />
      </div>
    </DeviceProvider>
  )
}

function PhoneHeader({ weather, onMore }: { weather: Weather | null; onMore: () => void }) {
  const now = useNow(60_000)
  const w = weather && describe(weather.now.code, weather.now.isDay)
  const enabled = useEnabledModules()
  const [board, setBoard] = useState(false)

  return (
    <header className="flex items-center gap-3 px-4 pt-[calc(var(--space-5)+env(safe-area-inset-top))] pb-4">
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="font-display text-title text-ink">{shortDate(now)}</h1>
        {weather && w && (
          <span className="flex items-center gap-1 text-label text-ink-muted">
            <Icon icon={w.icon} size={18} label={w.label} className="text-accent" />
            {weather.now.temp}° · bis {weather.days[0]?.max}°
          </span>
        )}
      </div>
      <VisitToggle short />
      <button type="button" className="hb-icon-btn" aria-label="Alle Funktionen und Einstellungen" onClick={onMore}>
        <Icon icon={Settings2} size={22} />
      </button>
      {enabled?.has('abfahrten') && (
        <button type="button" className="hb-icon-btn" aria-label="Abfahrten ab zuhause" onClick={() => setBoard(true)}>
          <Icon icon={TrainFront} size={20} />
        </button>
      )}
      {board && (
        <Sheet title="Abfahrten ab zuhause" onClose={() => setBoard(false)}>
          <DeparturesBoard />
        </Sheet>
      )}
    </header>
  )
}

function StartTab({ onEdit }: { onEdit: () => void }) {
  const enabled = useEnabledModules()
  const layout = useLayout('phone')
  return (
    <>
      {/* Besuch da: WLAN-Code als Zeile oben (in der Kopfzeile ist am Handy kein Platz mehr) */}
      <WifiButton variant="phone" />
      {MODULES.filter((m) => m.Header && enabled?.has(m.id)).map((m) => {
        const Header = m.Header!
        return <Header key={m.id} variant="phone" />
      })}
      {layout
        .filter((t) => enabled?.has(t.module))
        .map((t, i) => {
          const mod = MODULE_BY_ID.get(t.module)!
          return mod.Tile && <mod.Tile key={t.module} size={t.size} delay={i * 40} />
        })}
      <Button variant="ghost" icon={<Icon icon={LayoutGrid} size={18} />} onClick={onEdit}>
        Startseite anpassen
      </Button>
    </>
  )
}

/** Einstellungen eines Moduls aus „Alle Funktionen“ */
function ModuleSettings({ id, onBack }: { id: string; onBack: () => void }) {
  const Settings = MODULE_BY_ID.get(id)?.Settings
  return Settings ? <Settings onBack={onBack} /> : null
}
