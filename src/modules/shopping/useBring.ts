import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type BringItem = { name: string; specification: string }
type BringResponse = { items: BringItem[]; recent: BringItem[] }

const POLL_MS = 30_000
const UNDO_MS = 5000
const CACHE_KEY = 'hb-bring-items'

// Letzte bekannte Liste: im Speicher (Wechsel zwischen Reitern) und im Gerät (nächster Start).
// So steht die Liste sofort da und wird im Hintergrund aktualisiert.
let memory: BringItem[] | null = null

function readCache(): BringItem[] | null {
  if (memory) return memory
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as BringItem[]) : null
  } catch {
    return null
  }
}

function writeCache(items: BringItem[]) {
  memory = items
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(items))
  } catch {
    // ohne Gerätespeicher bleibt es beim Zwischenspeicher im Arbeitsspeicher
  }
}

/**
 * Bring!-Liste „Zuhause“ über die Edge Function. Sofort aus dem Zwischenspeicher, alle 30 s neu laden.
 * Abhaken zeigt den Artikel 5 s durchgestrichen mit „Rückgängig“, dann verschwindet er.
 */
export function useBring() {
  const [items, setItems] = useState<BringItem[] | null>(readCache)
  const [error, setError] = useState(false)
  const [done, setDone] = useState<Set<string>>(new Set())
  const doneRef = useRef(done)
  useEffect(() => {
    doneRef.current = done
  }, [done])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    if (items) writeCache(items)
  }, [items])

  const apply = useCallback((data: BringResponse | null, err: unknown) => {
    if (err || !data) return setError(true)
    setError(false)
    // Solange etwas im Rückgängig-Fenster steht, die Anzeige nicht umsortieren
    if (doneRef.current.size === 0) setItems(data.items)
  }, [])

  const load = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke<BringResponse>('bring', { method: 'GET' })
    apply(data, error)
  }, [apply])

  useEffect(() => {
    load()
    const t = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS)
    const onWake = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onWake)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [load])

  const send = useCallback(
    async (action: 'complete' | 'add', item: BringItem) => {
      const { error } = await supabase.functions.invoke<BringResponse>('bring', {
        method: 'POST',
        body: { action, name: item.name, specification: item.specification },
      })
      if (error) setError(true)
    },
    [],
  )

  const toggle = useCallback(
    (item: BringItem, nowDone: boolean) => {
      clearTimeout(timers.current.get(item.name))
      setDone((s) => {
        const next = new Set(s)
        if (nowDone) next.add(item.name)
        else next.delete(item.name)
        return next
      })
      send(nowDone ? 'complete' : 'add', item)

      if (nowDone) {
        timers.current.set(
          item.name,
          setTimeout(() => {
            setDone((s) => new Set([...s].filter((x) => x !== item.name)))
            setItems((list) => list?.filter((i) => i.name !== item.name) ?? null)
            load()
          }, UNDO_MS),
        )
      }
    },
    [send, load],
  )

  /** Freier Text aufs Handy-Eingabefeld: „Milch“, „Milch, 2 Liter“ oder „Milch und Eier“. Sofort sichtbar, dann aus Bring! neu. */
  const add = useCallback(async (text: string): Promise<boolean> => {
    const names = text
      .split(/\s+und\s+|\s*;\s*/i)
      .map((p) => p.split(',')[0].trim())
      .filter(Boolean)
      .map((n) => n.charAt(0).toUpperCase() + n.slice(1))
    setItems((list) => [...names.filter((n) => !list?.some((i) => i.name === n)).map((name) => ({ name, specification: '' })), ...(list ?? [])])
    const { data, error } = await supabase.functions.invoke<BringResponse>('bring', { method: 'POST', body: { action: 'addText', text } })
    apply(data, error)
    return !error
  }, [apply])

  return { items, error, done, toggle, add }
}
