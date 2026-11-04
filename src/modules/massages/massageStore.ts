import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from '../../lib/supabase'

// Massagen-Konto (Wunsch Jonathan 4.11.2026): jede Buchung ist +1 (Wette gewonnen) oder -1 (eingelöst),
// der Stand pro Person ist die Summe. Ein gemeinsamer Stand pro Gerät, live per Realtime. Nur am Handy, das Tablet sieht nichts (RLS).

export type MassageEntry = { id: string; member: string; delta: number; note: string | null; created_by: string | null; source: string; created_at: string }

type State = { entries: MassageEntry[]; loaded: boolean }
let state: State = { entries: [], loaded: false }
const listeners = new Set<() => void>()
let started = false

function set(next: State) {
  state = next
  listeners.forEach((l) => l())
}

function load() {
  supabase
    .from('massage_log')
    .select('id, member, delta, note, created_by, source, created_at')
    .order('created_at', { ascending: false })
    .limit(1000)
    .then(({ data }) => set({ entries: (data ?? []) as MassageEntry[], loaded: true }))
}

function start() {
  if (started) return
  started = true
  load()
  supabase.channel('massage-log').on('postgres_changes', { event: '*', schema: 'public', table: 'massage_log' }, load).subscribe()
}

export function useMassages(): State & { balance: (member: string) => number } {
  useEffect(start, [])
  const s = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
  const balance = (member: string) =>
    Math.max(
      0,
      s.entries.filter((e) => e.member === member).reduce((sum, e) => sum + e.delta, 0),
    )
  return { ...s, balance }
}

/** +1: Wette gewonnen; gibt die neue Buchung zurück (für Rückgängig) */
export async function addMassage(member: string, by: string, note: string): Promise<MassageEntry | null> {
  const { data, error } = await supabase
    .from('massage_log')
    .insert({ member, delta: 1, note: note.trim().slice(0, 120) || null, created_by: by })
    .select('id, member, delta, note, created_by, source, created_at')
    .single()
  if (error) return null
  set({ ...state, entries: [data as MassageEntry, ...state.entries.filter((e) => e.id !== data.id)] })
  return data as MassageEntry
}

/** -1: eine Massage eingelöst */
export async function redeemMassage(member: string, by: string): Promise<MassageEntry | null> {
  const { data, error } = await supabase
    .from('massage_log')
    .insert({ member, delta: -1, created_by: by })
    .select('id, member, delta, note, created_by, source, created_at')
    .single()
  if (error) return null
  set({ ...state, entries: [data as MassageEntry, ...state.entries.filter((e) => e.id !== data.id)] })
  return data as MassageEntry
}

/** Buchung zurücknehmen (Rückgängig) */
export async function undoMassage(id: string): Promise<boolean> {
  set({ ...state, entries: state.entries.filter((e) => e.id !== id) })
  const { error } = await supabase.from('massage_log').delete().eq('id', id)
  if (error) load()
  return !error
}
