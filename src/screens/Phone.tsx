import { CalendarRange, House, Images, ListChecks, Sparkles, LogOut, Plus, ShoppingCart, type LucideIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Icon } from '../components/Icon'
import { Toast } from '../components/Toast'
import { VisitToggle } from '../components/VisitToggle'
import { DeviceProvider } from '../lib/device'
import { useMembers } from '../lib/members'
import { supabase } from '../lib/supabase'
import { shortDate, useNow } from '../lib/time'
import { describe, type Weather } from '../modules/clock-weather/weather'
import { MODULE_BY_ID } from '../modules/registry'
import { ShoppingTile } from '../modules/shopping/ShoppingTile'
import { deleteTodo, restoreTodo } from '../modules/todos/todoActions'
import { TodoSheet } from '../modules/todos/TodoSheet'
import { TodosDetail } from '../modules/todos/TodosDetail'
import { PhotoLibrary } from '../modules/photos/PhotoLibrary'
import { WeekView } from '../modules/week/WeekView'
import { CHORE_PREFIX, isChoreId, type Todo } from '../modules/todos/useTodos'
import { PutzplanPage } from '../modules/chores/Putzplan'
import { Button } from '../components/Button'
import { useEnabledModules, useLayout } from '../modules/useModules'

type Tab = 'start' | 'woche' | 'todos' | 'einkauf'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'start', label: 'Start', icon: House },
  { id: 'woche', label: 'Woche', icon: CalendarRange },
  { id: 'todos', label: 'Todos', icon: ListChecks },
  { id: 'einkauf', label: 'Einkauf', icon: ShoppingCart },
]

function savedTab(): Tab {
  try {
    const t = localStorage.getItem('hb-tab')
    return t === 'woche' || t === 'todos' || t === 'einkauf' ? t : 'start'
  } catch {
    return 'start'
  }
}

/** Handy-Ansicht (unter 700 px): eintragen, planen, abhaken */
export function Phone({ weather }: { weather: Weather | null }) {
  const [tab, setTab] = useState<Tab>(savedTab)
  const [sheet, setSheet] = useState<{ todo?: Todo } | null>(null)
  // Fotobibliothek als eigene Seite (über den Fotos-Knopf in der Kopfzeile)
  // Eigene Seiten über den Reitern: Fotos (Kopfzeile) und Putzplan (Todo-Seite oder Antippen einer Putzaufgabe)
  const [page, setPage] = useState<null | { kind: 'photos' } | { kind: 'putzplan'; ruleId?: string }>(null)
  const [toast, setToast] = useState<{ id: number; message: string; action?: { label: string; run: () => void } } | null>(null)
  const showToast = useCallback((message: string) => setToast({ id: Date.now(), message }), [])
  const hideToast = useCallback(() => setToast(null), [])

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
        <PhoneHeader weather={weather} onPhotos={() => setPage({ kind: 'photos' })} />

        <main className="flex flex-col gap-4 px-4">
          {page?.kind === 'photos' ? (
            <PhotoLibrary onBack={() => setPage(null)} />
          ) : page?.kind === 'putzplan' ? (
            <PutzplanPage onBack={() => setPage(null)} openRuleId={page.ruleId} />
          ) : (
            <>
          {tab === 'start' && <StartTab />}
          {tab === 'woche' && <WeekView variant="phone" />}
          {tab === 'todos' && (
            <>
              <Button icon={<Icon icon={Sparkles} size={20} />} onClick={() => setPage({ kind: 'putzplan' })}>
                Putzplan bearbeiten
              </Button>
              <TodosDetail />
            </>
          )}
          {tab === 'einkauf' && <ShoppingTile size="m" delay={0} />}
            </>
          )}
        </main>

        {tab !== 'einkauf' && !page && (
          <button type="button" className="hb-fab" aria-label="Todo hinzufügen" onClick={() => setSheet({})}>
            <Icon icon={Plus} size={28} />
          </button>
        )}

        <nav className="hb-tabbar" aria-label="Bereiche">
          {TABS.map((t) => (
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
      </div>
    </DeviceProvider>
  )
}

function PhoneHeader({ weather, onPhotos }: { weather: Weather | null; onPhotos: () => void }) {
  const now = useNow(60_000)
  const { me } = useMembers()
  const w = weather && describe(weather.now.code, weather.now.isDay)

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
      <button type="button" className="hb-icon-btn" aria-label="Fotos für den Bildschirmschoner" onClick={onPhotos}>
        <Icon icon={Images} size={20} />
      </button>
      <button
        type="button"
        className="hb-icon-btn"
        aria-label={`Abmelden (${me.name})`}
        onClick={() => supabase.auth.signOut()}
      >
        <Icon icon={LogOut} size={20} />
      </button>
    </header>
  )
}

function StartTab() {
  const enabled = useEnabledModules()
  const layout = useLayout('phone')
  return (
    <>
      {layout
        .filter((t) => enabled?.has(t.module))
        .map((t, i) => {
          const mod = MODULE_BY_ID.get(t.module)!
          return <mod.Tile key={t.module} size={t.size} delay={i * 40} />
        })}
    </>
  )
}
