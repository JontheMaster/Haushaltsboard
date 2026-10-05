import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Tables } from './database.types'
import { supabase } from './supabase'

export type Member = Tables<'members'>
/** Kürzel für die CSS-Klassen hb-person-a / hb-person-b / hb-person-open */
export type PersonKey = 'a' | 'b' | 'open'

type MembersState = {
  me: Member
  members: Member[]
  /** Die beiden Personen (ohne Tablet), Jonathan zuerst */
  people: Member[]
  byId: Map<string, Member>
  personKey: (id: string | null | undefined) => PersonKey
}

const Ctx = createContext<MembersState | null>(null)

export function useMembers(): MembersState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMembers außerhalb von MembersProvider')
  return v
}

type LoadState = { status: 'loading' } | { status: 'not-member' } | { status: 'ready'; value: MembersState }

export function useLoadMembers(userId: string): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    supabase
      .from('members')
      .select('*')
      .then(({ data }) => {
        const members = data ?? []
        const me = members.find((m) => m.id === userId)
        if (!me) return setState({ status: 'not-member' })

        const people = members.filter((m) => !m.is_board).sort((a, b) => a.color.localeCompare(b.color))
        const byId = new Map(members.map((m) => [m.id, m]))
        const personKey = (id: string | null | undefined): PersonKey => {
          const c = id ? byId.get(id)?.color : undefined
          return c === 'person-a' ? 'a' : c === 'person-b' ? 'b' : 'open'
        }
        setState({ status: 'ready', value: { me, members, people, byId, personKey } })
      })
  }, [userId])

  return state
}

export function MembersProvider({ value, children }: { value: MembersState; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
