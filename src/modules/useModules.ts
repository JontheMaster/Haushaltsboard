import { useEffect, useState } from 'react'
import { useMembers } from '../lib/members'
import { supabase } from '../lib/supabase'
import { DEFAULT_PHONE_LAYOUT, DEFAULT_WALL_LAYOUT, MODULE_BY_ID } from './registry'
import type { LayoutTile } from './types'

// Letzter bekannter Stand: neue Ansichten starten damit statt mit „alles aus“ (sonst springen Schalter sichtbar um)
let lastEnabled: Set<string> | null = null

/** Welche Module eingeschaltet sind (Tabelle modules), live */
export function useEnabledModules(): Set<string> | null {
  const [enabled, setEnabledState] = useState<Set<string> | null>(lastEnabled)
  const setEnabled = (s: Set<string>) => {
    lastEnabled = s
    setEnabledState(s)
  }

  useEffect(() => {
    const load = () =>
      supabase
        .from('modules')
        .select('id, enabled')
        .then(({ data }) => data && setEnabled(new Set(data.filter((m) => m.enabled).map((m) => m.id))))
    load()
    const channel = supabase
      .channel(`modules-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'modules' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return enabled
}

/** Einstellungen eines Moduls (modules.config), mit Standardwerten; live auf allen Geräten */
export function useModuleConfig<T extends object>(id: string, defaults: T): T {
  const [config, setConfig] = useState<T>(defaults)
  useEffect(() => {
    const load = () =>
      supabase
        .from('modules')
        .select('config')
        .eq('id', id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.config && typeof data.config === 'object') setConfig((c) => ({ ...c, ...(data.config as Partial<T>) }))
        })
    load()
    const channel = supabase
      .channel(`module-${id}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'modules', filter: `id=eq.${id}` }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id])
  return config
}

/** Modul an- oder ausschalten (wirkt live auf allen Geräten) */
export async function setModuleEnabled(id: string, enabled: boolean): Promise<boolean> {
  const { error } = await supabase.from('modules').upsert({ id, enabled })
  return !error
}

/** Einzelne Einstellung eines Moduls ändern (andere Werte in config bleiben erhalten) */
export async function setModuleConfig(id: string, patch: Record<string, unknown>): Promise<boolean> {
  const { data } = await supabase.from('modules').select('config').eq('id', id).maybeSingle()
  const config = { ...((data?.config as Record<string, unknown>) ?? {}), ...patch }
  const { error } = await supabase.from('modules').upsert({ id, config: config as never })
  return !error
}

// Letztes geladenes Layout pro Ansicht: nach dem Bearbeiten springt die Startseite nicht kurz aufs Standard-Layout
const lastLayout = new Map<string, LayoutTile[]>()

/**
 * Layout: an der Wand gemeinsam („wand“, fest), am Handy pro Person (Startseite anpassen), live.
 * Fehlt es, gilt das Standard-Layout. Am Handy heißt eine leere Liste „alles ausgeblendet“.
 */
export function useLayout(view: 'wall' | 'phone'): LayoutTile[] {
  const { me } = useMembers()
  const key = view === 'wall' ? 'wand' : me.id
  const [tiles, setTiles] = useState<LayoutTile[]>(lastLayout.get(key) ?? (view === 'wall' ? DEFAULT_WALL_LAYOUT : DEFAULT_PHONE_LAYOUT))

  useEffect(() => {
    const load = () => {
      const query = supabase.from('layouts').select('tiles')
      const filtered = view === 'wall' ? query.eq('device', 'wand') : query.eq('member', me.id)
      filtered.maybeSingle().then(({ data }) => {
        const saved = data?.tiles as LayoutTile[] | undefined
        const next =
          Array.isArray(saved) && (saved.length || view === 'phone')
            ? saved.filter((t) => MODULE_BY_ID.has(t.module))
            : view === 'wall'
              ? DEFAULT_WALL_LAYOUT
              : DEFAULT_PHONE_LAYOUT
        lastLayout.set(key, next)
        setTiles(next)
      })
    }
    load()
    if (view === 'wall') return
    const channel = supabase
      .channel(`layout-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'layouts', filter: `member=eq.${me.id}` }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [key, view, me.id])

  return tiles
}

// Speichern läuft nacheinander: zwei schnelle Änderungen würden sonst beide eine neue Zeile anlegen wollen
let saving: Promise<unknown> = Promise.resolve()

/** Handy-Startseite einer Person speichern (null = zurück zum Standard) */
export function savePhoneLayout(memberId: string, tiles: LayoutTile[] | null): Promise<boolean> {
  if (tiles === null) lastLayout.delete(memberId)
  else lastLayout.set(memberId, tiles)
  const run = saving.then(() => writePhoneLayout(memberId, tiles))
  saving = run.catch(() => false)
  return run
}

async function writePhoneLayout(memberId: string, tiles: LayoutTile[] | null): Promise<boolean> {
  if (tiles === null) {
    const { error } = await supabase.from('layouts').delete().eq('member', memberId)
    return !error
  }
  // Eindeutigkeit über einen Teilindex (member not null): upsert geht da nicht, also nachsehen und dann ändern oder anlegen
  const { data } = await supabase.from('layouts').select('id').eq('member', memberId).maybeSingle()
  if (data) return !(await supabase.from('layouts').update({ tiles }).eq('id', data.id)).error
  const { error } = await supabase.from('layouts').insert({ member: memberId, tiles })
  // Inzwischen von einem anderen Gerät angelegt: dann eben ändern
  if (error?.code === '23505') return !(await supabase.from('layouts').update({ tiles }).eq('member', memberId)).error
  return !error
}
