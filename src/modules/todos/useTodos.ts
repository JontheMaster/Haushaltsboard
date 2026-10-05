import { useCallback, useEffect, useRef, useState } from 'react'
import type { Tables } from '../../lib/database.types'
import { useMembers } from '../../lib/members'
import { supabase } from '../../lib/supabase'
import { berlinMidnightISO } from '../../lib/time'

export type Todo = Tables<'todos'>

const UNDO_MS = 5000

/**
 * Alle offenen Todos plus die heute erledigten (bleiben bis Mitternacht durchgestrichen sichtbar).
 * Live über Realtime; nach Verbindungsabbruch, Rückkehr in den Tab oder neuem Tag wird neu geladen.
 */
export function useTodos(today: string) {
  const { me } = useMembers()
  const [todos, setTodos] = useState<Todo[] | null>(null)
  const [error, setError] = useState(false)
  const [undoable, setUndoable] = useState<Set<string>>(new Set())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .or(`done_at.is.null,done_at.gte.${berlinMidnightISO(today)}`)
      .order('created_at')
    if (error) return setError(true)
    setError(false)
    setTodos(data)
  }, [today])

  useEffect(() => {
    load()
    // Eigener Kanal pro Hook-Instanz (Kachel und Todo-Seite können gleichzeitig laufen)
    const channel = supabase
      .channel(`todos-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, () => load())
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
        timers.current.set(
          id,
          setTimeout(() => setUndoable((s) => new Set([...s].filter((x) => x !== id))), UNDO_MS),
        )
      }

      const { error } = await supabase.from('todos').update(patch).eq('id', id)
      if (error) {
        setError(true)
        load()
      }
    },
    [me.id, load],
  )

  return { todos, error, undoable, setDone }
}
