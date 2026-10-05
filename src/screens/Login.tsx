import { KeyRound, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { supabase } from '../lib/supabase'

type Step = 'email' | 'code'

export function Login() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendLink(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
      },
    })
    setBusy(false)
    if (error) {
      setError(
        error.status === 429
          ? 'Zu viele Versuche. Warte eine Minute und probier es dann noch mal.'
          : 'Diese Adresse gehört nicht zum Haushalt, oder der Server ist gerade nicht erreichbar.',
      )
      return
    }
    setStep('code')
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError('Der Code passt nicht oder ist abgelaufen. Fordere einen neuen an.')
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-surface p-4">
      <div className="hb-tile w-full max-w-[420px]">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-display text-ink">Haushaltsboard</h1>
          <p className="text-body text-ink-muted">
            {step === 'email'
              ? 'Melde dich mit deiner Mailadresse an. Du bekommst einen Link und einen Code.'
              : `Wir haben dir eine Mail an ${email} geschickt. Tipp auf den Link oder gib den Code hier ein.`}
          </p>
        </div>

        {step === 'email' ? (
          <form onSubmit={sendLink} className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-label text-ink">Mailadresse</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-7 rounded-md border border-line bg-surface-sunken px-4 text-body text-ink focus-visible:focus-ring"
              />
            </label>
            <Button type="submit" variant="primary" size="lg" disabled={busy} icon={<Mail size={20} strokeWidth={1.75} />}>
              {busy ? 'Wird gesendet …' : 'Link schicken'}
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-label text-ink">Code aus der Mail</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="h-7 rounded-md border border-line bg-surface-sunken px-4 text-body-wall tracking-[0.2em] text-ink tabular-nums focus-visible:focus-ring"
              />
            </label>
            <Button type="submit" variant="primary" size="lg" disabled={busy} icon={<KeyRound size={20} strokeWidth={1.75} />}>
              {busy ? 'Wird geprüft …' : 'Anmelden'}
            </Button>
            <Button variant="ghost" onClick={() => { setStep('email'); setCode(''); setError(null) }}>
              Andere Adresse nehmen
            </Button>
          </form>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-urgent-soft px-4 py-3 text-label text-urgent">
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
