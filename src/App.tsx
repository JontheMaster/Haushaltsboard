import type { Session } from '@supabase/supabase-js'
import { LogOut } from 'lucide-react'
import { Button } from './components/Button'
import { Icon } from './components/Icon'
import { MembersProvider, useLoadMembers } from './lib/members'
import { supabase } from './lib/supabase'
import { useSession } from './lib/useSession'
import { Board } from './screens/Board'
import { Login } from './screens/Login'

export default function App() {
  const session = useSession()

  if (session === undefined) return null
  if (session === null) return <Login />
  return <SignedIn session={session} />
}

function SignedIn({ session }: { session: Session }) {
  const members = useLoadMembers(session.user.id)

  if (members.status === 'loading') return null
  if (members.status === 'not-member') return <NotMember email={session.user.email} />

  return (
    <MembersProvider value={members.value}>
      <Board />
    </MembersProvider>
  )
}

function NotMember({ email }: { email?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface p-4">
      <div className="hb-tile w-full max-w-[420px]">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-title text-ink">Konto noch nicht freigeschaltet</h1>
          <p className="text-body text-ink-muted">
            {email} ist angemeldet, steht aber noch nicht in der Mitgliederliste. Jonathan trägt dich ein.
          </p>
        </div>
        <Button icon={<Icon icon={LogOut} size={20} />} onClick={() => supabase.auth.signOut()}>
          Abmelden
        </Button>
      </div>
    </main>
  )
}
