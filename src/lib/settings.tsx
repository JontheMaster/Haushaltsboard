import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Tables } from './database.types'
import { supabase } from './supabase'

type Settings = Tables<'settings'>

type SettingsState = {
  settings: Settings | null
  setVisitMode: (on: boolean) => Promise<void>
}

const Ctx = createContext<SettingsState>({ settings: null, setVisitMode: async () => {} })

/** Allgemeine Einstellungen (Besuchsmodus, Nachtzeiten), live auf allen Geräten */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    const load = () =>
      supabase
        .from('settings')
        .select('*')
        .eq('id', 1)
        .single()
        .then(({ data }) => data && setSettings(data))
    load()
    const channel = supabase
      .channel(`settings-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (p) => {
        if (p.new && 'id' in p.new) setSettings(p.new as Settings)
        else load()
      })
      .subscribe((status) => status === 'SUBSCRIBED' && load())
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const setVisitMode = useCallback(async (on: boolean) => {
    setSettings((s) => (s ? { ...s, visit_mode: on } : s))
    const { error } = await supabase.from('settings').update({ visit_mode: on }).eq('id', 1)
    if (error) setSettings((s) => (s ? { ...s, visit_mode: !on } : s))
  }, [])

  return <Ctx.Provider value={{ settings, setVisitMode }}>{children}</Ctx.Provider>
}

export function useSettings() {
  return useContext(Ctx)
}
