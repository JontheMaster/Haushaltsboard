import { CalendarDays, ShoppingCart } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

type Status = { state: 'loading' } | { state: 'ok'; text: string } | { state: 'error'; text: string }

// Übergangsweise bis Schritt 4: zeigt, ob Bring! und die Kalender ankommen
export function ConnectionCheck() {
  const [bring, setBring] = useState<Status>({ state: 'loading' })
  const [calendar, setCalendar] = useState<Status>({ state: 'loading' })

  useEffect(() => {
    supabase.functions.invoke('bring', { method: 'GET' }).then(({ data, error }) => {
      if (error) return setBring({ state: 'error', text: 'Bring! gerade nicht erreichbar.' })
      const names = (data.items as { name: string }[]).map((i) => i.name)
      setBring({ state: 'ok', text: names.length ? `${names.length} auf der Liste: ${names.join(', ')}` : 'Die Liste ist leer.' })
    })
    supabase.functions.invoke('calendar', { method: 'GET' }).then(({ data, error }) => {
      if (error) return setCalendar({ state: 'error', text: 'Kalender gerade nicht erreichbar.' })
      const failed = (data.errors as string[]).length
      setCalendar({
        state: failed ? 'error' : 'ok',
        text: `${data.events.length} Termine in den nächsten 8 Tagen` + (failed ? `, ${failed} Kalender nicht geladen: ${data.errors.join(', ')}` : ''),
      })
    })
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <Row icon={<ShoppingCart size={20} strokeWidth={1.75} />} label="Einkauf" status={bring} />
      <Row icon={<CalendarDays size={20} strokeWidth={1.75} />} label="Kalender" status={calendar} />
    </div>
  )
}

function Row({ icon, label, status }: { icon: ReactNode; label: string; status: Status }) {
  return (
    <div className="flex items-start gap-3">
      <span className="hb-tile-icon">{icon}</span>
      <div className="flex min-w-0 flex-col">
        <span className="text-label text-ink">{label}</span>
        <span className={`text-body ${status.state === 'error' ? 'text-urgent' : 'text-ink-muted'}`}>
          {status.state === 'loading' ? 'Wird geladen …' : status.text}
        </span>
      </div>
    </div>
  )
}
