import { useCallback, useEffect, useRef, useState } from 'react'
import type { Tables } from '../../lib/database.types'
import { useMembers } from '../../lib/members'
import { supabase } from '../../lib/supabase'
import { berlinMidnightISO } from '../../lib/time'

type ChoreTask = Tables<'chore_tasks'>

/**
 * Ein Eintrag in den Todo-Listen. Putzplan-Aufgaben laufen mit (id „chore:…“, Feld `chore`),
 * damit Heute, Woche und Todo-Seite sie ohne Sonderwege zeigen, abhaken und verschieben können.
 */
export type Todo = Tables<'todos'> & {
  chore?: {
    ruleId: string
    /** Montag der Woche, zu der die Aufgabe gehört */
    weekStart: string
    /** Originalzeile, für „Rückgängig“ nach dem Löschen */
    raw: ChoreTask
  }
}

export const CHORE_PREFIX = 'chore:'
export const isChoreId = (id: string) => id.startsWith(CHORE_PREFIX)

const UNDO_MS = 5000
// So lange bleibt ein abgehaktes Todo an seinem Platz (Haken sichtbar), dann gleitet es nach unten
const SETTLE_MS = 650

// Letzte Liste im Speicher: beim Wechsel zwischen Start und Todos steht sie sofort da
let memory: { day: string; todos: Todo[] } | null = null

function fromChore(t: ChoreTask & { chore_rules: { title: string } | null }): Todo {
  const { chore_rules, ...raw } = t
  return {
    id: CHORE_PREFIX + t.id,
    title: chore_rules?.title ?? 'Putzplan',
    due_date: t.due_date,
    // ohne Tag = „irgendwann in dieser Woche“ (nur Putzplan-Aufgaben mit „Woche“)
    this_week: !t.due_date,
    assignee: t.assignee,
    moved_since: null,
    done_at: t.done_at,
    done_by: t.done_by,
    created_at: t.occurs_on,
    chore: { ruleId: t.rule_id, weekStart: t.week_start, raw },
  }
}

/** Nur die Felder, die es bei Putzplan-Aufgaben gibt */
function chorePatch(patch: Partial<Todo>): Partial<ChoreTask> {
  const out: Partial<ChoreTask> = {}
  if ('due_date' in patch) out.due_date = patch.due_date ?? null
  if ('assignee' in patch) out.assignee = patch.assignee ?? null
  if ('done_at' in patch) out.done_at = patch.done_at ?? null
  if ('done_by' in patch) out.done_by = patch.done_by ?? null
  return out
}

/** Änderung an die richtige Tabelle schicken */
export async function saveItem(id: string, patch: Partial<Todo>): Promise<boolean> {
  if (isChoreId(id)) {
    const p = chorePatch(patch)
    if (!Object.keys(p).length) return true
    const { error } = await supabase.from('chore_tasks').update(p).eq('id', id.slice(CHORE_PREFIX.length))
    return !error
  }
  const { chore: _ignored, ...todoPatch } = patch
  void _ignored
  const { error } = await supabase.from('todos').update(todoPatch).eq('id', id)
  return !error
}

/**
 * Alle offenen Todos und Putzplan-Aufgaben plus die heute erledigten (bleiben bis Mitternacht durchgestrichen).
 * Live über Realtime; nach Verbindungsabbruch, Rückkehr in den Tab oder neuem Tag wird neu geladen.
 */
export function useTodos(today: string) {
  const { me } = useMembers()
  const [todos, setTodos] = useState<Todo[] | null>(() => (memory?.day === today ? memory.todos : null))
  const [error, setError] = useState(false)
  const [undoable, setUndoable] = useState<Set<string>>(new Set())
  const [settling, setSettling] = useState<Set<string>>(new Set())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const load = useCallback(async () => {
    const doneFilter = `done_at.is.null,done_at.gte.${berlinMidnightISO(today)}`
    const [todoRes, choreRes] = await Promise.all([
      supabase.from('todos').select('*').or(doneFilter).order('created_at'),
      supabase.from('chore_tasks').select('*, chore_rules(title)').or(doneFilter).order('occurs_on'),
    ])
    if (todoRes.error || choreRes.error) return setError(true)
    setError(false)
    const list = [...todoRes.data, ...choreRes.data.map(fromChore)]
    setTodos(list)
    memory = { day: today, todos: list }
  }, [today])

  useEffect(() => {
    load()
    // Eigener Kanal pro Hook-Instanz (Kachel und Todo-Seite können gleichzeitig laufen)
    const channel = supabase
      .channel(`todos-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chore_tasks' }, () => load())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setError(true)
      })
    const onWake = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('online', load)
    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('online', load)
    }
  }, [load])

  const setDone = useCallback(
    async (id: string, done: boolean) => {
      const patch = done ? { done_at: new Date().toISOString(), done_by: me.id } : { done_at: null, done_by: null }
      setTodos((list) => list?.map((t) => (t.id === id ? { ...t, ...patch } : t)) ?? null)

      clearTimeout(timers.current.get(id))
      setUndoable((s) => {
        const next = new Set(s)
        if (done) next.add(id)
        else next.delete(id)
        return next
      })
      if (done) {
        setSettling((s) => new Set(s).add(id))
        setTimeout(() => setSettling((s) => new Set([...s].filter((x) => x !== id))), SETTLE_MS)
        timers.current.set(
          id,
          setTimeout(() => setUndoable((s) => new Set([...s].filter((x) => x !== id))), UNDO_MS),
        )
      }

      if (!(await saveItem(id, patch))) {
        setError(true)
        load()
      }
    },
    [me.id, load],
  )

  /** Felder sofort ändern (Ziehen, Person wechseln), danach speichern; bei Fehler neu laden */
  const patchTodo = useCallback(
    async (id: string, patch: Partial<Todo>) => {
      setTodos(
        (list) =>
          list?.map((t) => {
            if (t.id !== id) return t
            const next = { ...t, ...patch }
            // Putzplan: ohne Tag heißt immer „irgendwann in dieser Woche“
            if (t.chore) next.this_week = !next.due_date
            return next
          }) ?? null,
      )
      if (!(await saveItem(id, patch))) {
        setError(true)
        load()
      }
    },
    [load],
  )

  /** Sortierschlüssel: erledigt (und schon eingereiht) = 1, sonst 0 */
  const doneRank = useCallback((t: Todo) => Number(!!t.done_at && !settling.has(t.id)), [settling])

  return { todos, error, undoable, setDone, doneRank, patchTodo }
}

/** Fällig an diesem Tag; Überfälliges (Todos, die der Nachtjob noch nicht verschoben hat) zählt zu heute. Putzplan rutscht nie. */
export function dueOn(t: Todo, day: string, today: string): boolean {
  if (!t.due_date) return false
  if (t.due_date === day) return true
  return day === today && !t.chore && t.due_date < today
}

/** Ohne Tag und in der aktuellen Woche relevant (Putzplan-Aufgaben späterer Wochen erst dann zeigen) */
export function unplannedNow(t: Todo, monday: string): boolean {
  if (t.due_date) return false
  return !t.chore || t.chore.weekStart <= monday
}
