import {
  Bath,
  Bed,
  Bell,
  Car,
  Coffee,
  DoorOpen,
  Dumbbell,
  Flower2,
  Home,
  KeyRound,
  Milk,
  Nfc,
  Package,
  PartyPopper,
  Shirt,
  ShoppingCart,
  Sparkles,
  Trash2,
  Utensils,
  WashingMachine,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// NFC-Tags: Daten, Bausteine und kleine Helfer für die Einstellungsseite (Edge Function `nfc`)

export const NFC_URL = 'https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/nfc'
export const APP_URL = 'https://jonthemaster.github.io/Haushaltsboard/'

export type NfcType = 'log' | 'chore_done' | 'todo_done' | 'todo_create' | 'bring_add' | 'visit_toggle' | 'notify'
export type NfcCategory = 'haushalt' | 'persoenlich' | 'vorrat' | 'wartung' | 'spass'

export type NfcAction = {
  id: string
  slug: string
  label: string
  icon: string
  type: NfcType
  params: Record<string, unknown>
  enabled: boolean
  category: NfcCategory
  points: number
  private: boolean
  owner: string | null
}
export type NfcEvent = { id: string; action: string; action_id: string | null; member: string | null; at: string; ok: boolean; message: string; private: boolean }
export type MemberToken = { id: string; label: string; created_at: string; last_used_at: string | null; revoked: boolean }

/** Bausteine, aus denen man einen Tag zusammensetzt (die Edge Function kennt genau diese) */
export const TYPES: { value: NfcType; label: string; hint: string }[] = [
  { value: 'log', label: 'Nur zählen', hint: 'Der Tipp wird nur protokolliert.' },
  { value: 'chore_done', label: 'Putzaufgabe abhaken', hint: 'Hakt die heutige oder nächste offene Aufgabe einer Putzregel ab.' },
  { value: 'todo_done', label: 'Todo abhaken', hint: 'Hakt ein offenes Todo von heute mit genau diesem Titel ab.' },
  { value: 'todo_create', label: 'Todo anlegen', hint: 'Legt ein Todo an, auf Wunsch mit Erinnerung nach ein paar Stunden.' },
  { value: 'bring_add', label: 'Auf die Einkaufsliste', hint: 'Setzt einen Artikel auf die Bring!-Liste.' },
  { value: 'visit_toggle', label: 'Besuchsmodus umschalten', hint: 'Schaltet den Besuchsmodus an oder aus.' },
  { value: 'notify', label: 'Mitteilung schicken', hint: 'Schickt eine Mitteilung aufs Handy der anderen Person (oder an beide).' },
]
export const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label])) as Record<NfcType, string>

export const CATEGORIES: { value: NfcCategory; label: string }[] = [
  { value: 'haushalt', label: 'Haushalt' },
  { value: 'vorrat', label: 'Vorrat' },
  { value: 'wartung', label: 'Wartung' },
  { value: 'persoenlich', label: 'Persönlich' },
  { value: 'spass', label: 'Spaß' },
]

/** Symbole zur Auswahl (feste Liste, damit nicht alle Lucide-Icons mitgeladen werden) */
export const ICONS: Record<string, LucideIcon> = {
  Nfc,
  WashingMachine,
  Trash2,
  Sparkles,
  Bath,
  Utensils,
  Milk,
  Coffee,
  ShoppingCart,
  Package,
  Shirt,
  Flower2,
  Bed,
  Dumbbell,
  DoorOpen,
  KeyRound,
  Home,
  Car,
  Bell,
  PartyPopper,
}
export const iconOf = (name: string): LucideIcon => ICONS[name] ?? Nfc

/** Slug aus dem Namen: „Wäsche gestartet“ → „waesche-gestartet“ */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/** Kurze Beschreibung, was ein Tag tut („Todo anlegen: Wäsche aufhängen, in 2 Std, andere Person“) */
export function describe(a: Pick<NfcAction, 'type' | 'params'>, ruleTitle?: (id: string) => string | undefined): string {
  const p = a.params ?? {}
  const s = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '')
  switch (a.type) {
    case 'chore_done':
      return `Putzaufgabe abhaken: ${ruleTitle?.(s('rule_id')) ?? 'Regel fehlt'}`
    case 'todo_done':
      return `Todo abhaken: ${s('match') || '–'}`
    case 'todo_create': {
      const who = p.assignee === 'other' ? 'andere Person' : p.assignee === 'open' ? 'offen' : 'ich'
      const h = Number(p.in_hours) || 0
      return `Todo anlegen: ${s('title') || '–'}${h ? `, in ${h} Std` : ''}, ${who}${p.urgent ? ', dringend' : ''}`
    }
    case 'bring_add':
      return `Einkaufsliste: ${s('item') || '–'}${s('spec') ? ` (${s('spec')})` : ''}`
    case 'notify':
      return `Mitteilung${p.to === 'both' ? ' an beide' : ''}: ${s('text') || '–'}`
    default:
      return TYPE_LABEL[a.type]
  }
}

// ───────── Daten ─────────

/** Alle Tags (private nur die eigenen, regelt RLS), live */
export function useNfcActions() {
  const [actions, setActions] = useState<NfcAction[] | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('nfc_actions').select('*').order('label')
    setActions((data ?? []) as NfcAction[])
  }, [])
  useEffect(() => {
    load()
    const ch = supabase
      .channel(`nfc-actions-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nfc_actions' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])
  return { actions, reload: load }
}

/** Letzte Tipps (private nur die eigenen), live */
export function useNfcEvents(limit = 20) {
  const [events, setEvents] = useState<NfcEvent[] | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('nfc_events').select('*').order('at', { ascending: false }).limit(limit)
    setEvents((data ?? []) as NfcEvent[])
  }, [limit])
  useEffect(() => {
    load()
    const ch = supabase
      .channel(`nfc-events-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nfc_events' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])
  return events
}

/** Eigene Kurzbefehl-Tokens (nur Name und Daten, der Token selbst ist nirgends gespeichert) */
export function useMyTokens() {
  const [tokens, setTokens] = useState<MemberToken[] | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('member_tokens').select('id, label, created_at, last_used_at, revoked').eq('revoked', false).order('created_at')
    setTokens((data ?? []) as MemberToken[])
  }, [])
  useEffect(() => {
    load()
  }, [load])
  return { tokens, reload: load }
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Neuen Token erzeugen: im Browser zufällig, gespeichert wird nur der Hash. Gibt den Token einmalig zurück. */
export async function createToken(memberId: string, label: string): Promise<string | null> {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const token = `nfc_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
  const { error } = await supabase.from('member_tokens').insert({ member: memberId, label, token_hash: await sha256(token) })
  return error ? null : token
}

export async function revokeToken(id: string): Promise<boolean> {
  const { error } = await supabase.from('member_tokens').update({ revoked: true }).eq('id', id)
  return !error
}

/** Tag mit der eigenen Anmeldung auslösen (Knopf „Jetzt auslösen“ und Sticker mit Link ?tap=…) */
export async function runAction(slug: string): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; message: string }>('nfc', { body: { action: slug } })
  if (data?.message) return data
  // Fehlerantworten (404, 401 …) tragen die Meldung im Body
  const ctx = (error as { context?: Response } | null)?.context
  if (ctx) {
    try {
      const body = (await ctx.json()) as { message?: string }
      if (body.message) return { ok: false, message: body.message }
    } catch {
      // kein JSON
    }
  }
  return { ok: false, message: 'Board gerade nicht erreichbar.' }
}

/**
 * Sticker mit Link (…/Haushaltsboard/?tap=<slug>): beim Öffnen der App die Aktion mit der angemeldeten Sitzung auslösen
 * und das Ergebnis als Hinweis zeigen. Der Parameter verschwindet danach aus der Adresse (Neuladen löst nicht noch mal aus).
 */
export function useTapFromUrl(showToast: (message: string) => void) {
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const slug = params.get('tap')
    if (!slug) return
    params.delete('tap')
    const rest = params.toString()
    history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`)
    runAction(slug).then((r) => showToast(r.message))
  }, [showToast])
}
