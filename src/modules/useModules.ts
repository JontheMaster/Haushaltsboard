import { useEffect, useState } from 'react'
import { useMembers } from '../lib/members'
import { supabase } from '../lib/supabase'
import { DEFAULT_PHONE_LAYOUT, DEFAULT_WALL_LAYOUT, MODULE_BY_ID } from './registry'
import type { LayoutTile } from './types'

/** Welche Module eingeschaltet sind (Tabelle modules), live */
export function useEnabledModules(): Set<string> | null {
  const [enabled, setEnabled] = useState<Set<string> | null>(null)

  useEffect(() => {
    const load = () =>
      supabase
        .from('modules')
        .select('id, enabled')
        .then(({ data }) => data && setEnabled(new Set(data.filter((m) => m.enabled).map((m) => m.id))))
    load()
    const channel = supabase
      .channel('modules')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'modules' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return enabled
}

/** Layout: an der Wand gemeinsam („wand“), am Handy pro Person. Fehlt es, gilt das Standard-Layout. */
export function useLayout(view: 'wall' | 'phone'): LayoutTile[] {
  const { me } = useMembers()
  const [tiles, setTiles] = useState<LayoutTile[]>(view === 'wall' ? DEFAULT_WALL_LAYOUT : DEFAULT_PHONE_LAYOUT)

  useEffect(() => {
    const query = supabase.from('layouts').select('tiles')
    const filtered = view === 'wall' ? query.eq('device', 'wand') : query.eq('member', me.id)
    filtered.maybeSingle().then(({ data }) => {
      const saved = data?.tiles as LayoutTile[] | undefined
      if (Array.isArray(saved) && saved.length) setTiles(saved.filter((t) => MODULE_BY_ID.has(t.module)))
    })
  }, [me.id, view])

  return tiles
}
