import { useEffect, useState } from 'react'
import { useMembers } from '../lib/members'
import { supabase } from '../lib/supabase'
import { DEFAULT_WALL_LAYOUT, MODULE_BY_ID } from './registry'
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

/** Layout dieses Geräts: Tablet = „wand“, sonst pro Person. Fehlt es, gilt das Standard-Layout. */
export function useLayout(): LayoutTile[] {
  const { me } = useMembers()
  const [tiles, setTiles] = useState<LayoutTile[]>(DEFAULT_WALL_LAYOUT)

  useEffect(() => {
    const query = supabase.from('layouts').select('tiles')
    const filtered = me.is_board ? query.eq('device', 'wand') : query.eq('member', me.id)
    filtered.maybeSingle().then(({ data }) => {
      const saved = data?.tiles as LayoutTile[] | undefined
      if (Array.isArray(saved) && saved.length) setTiles(saved.filter((t) => MODULE_BY_ID.has(t.module)))
    })
  }, [me.id, me.is_board])

  return tiles
}
