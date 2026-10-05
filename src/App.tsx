import type { Session } from '@supabase/supabase-js'
import { LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from './components/Button'
import type { Tables } from './lib/database.types'
import { supabase } from './lib/supabase'
import { useSession } from './lib/useSession'
import { Login } from './screens/Login'

type Member = Tables<'members'>

export default function App() {
  const session = useSession()

  if (session === undefined) return null
  if (session === null) return <Login />
  return <SignedIn session={session} />
}

// Platzhalter bis Schritt 4: zeigt, dass Login und Zugriffsschutz funktionieren
function SignedIn({ session }: { session: Session }) {
  const [member, setMember] = useState<Member | null | undefined>(undefined)

  useEffect(() => {
    supabase
      .from('members')
      .select('id, name, color, is_board')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setMember(data))
  }, [session.user.id])

  if (member === undefined) return null

  return (
    <main className="grid min-h-dvh place-items-center bg-surface p-4">
      <div className="hb-tile w-full max-w-[420px]">
        {member ? (
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-display text-ink">Hallo {member.name}</h1>
            <p className="text-body text-ink-muted">Du bist angemeldet. Das Board kommt in Schritt 4.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-title text-ink">Konto noch nicht freigeschaltet</h1>
            <p className="text-body text-ink-muted">
              {session.user.email} ist angemeldet, steht aber noch nicht in der Mitgliederliste. Jonathan trägt dich ein.
            </p>
          </div>
        )}
        <Button icon={<LogOut size={20} strokeWidth={1.75} />} onClick={() => supabase.auth.signOut()}>
          Abmelden
        </Button>
      </div>
    </main>
  )
}
