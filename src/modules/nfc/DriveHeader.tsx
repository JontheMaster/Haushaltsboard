import { House } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useMembers } from '../../lib/members'
import { supabase } from '../../lib/supabase'
import { useNow } from '../../lib/time'

/** So lange bleibt die Karte nach der Ankunft stehen („Zuhause“) */
const SHOW_ARRIVED_MIN = 3

type Drive = { id: string; member: string; started_at: string; progress: number; eta: string; delay_s: number; checked_at: string; arrived_at: string | null }

const hhmm = (iso: string) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

/** Laufende Heimwege (und gerade angekommene), live */
function useDrives(): Drive[] {
  const [drives, setDrives] = useState<Drive[]>([])
  const load = useCallback(async () => {
    const since = new Date(Date.now() - 3 * 3600_000).toISOString()
    const { data } = await supabase
      .from('drives')
      .select('id, member, started_at, progress, eta, delay_s, checked_at, arrived_at')
      .is('cancelled_at', null)
      .gt('started_at', since)
      .order('started_at')
    setDrives((data ?? []) as Drive[])
  }, [])
  useEffect(() => {
    load()
    const ch = supabase
      .channel(`drives-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drives' }, load)
      .subscribe()
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      supabase.removeChannel(ch)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])
  return drives
}

/**
 * Anteil der Strecke jetzt: der Server schätzt alle 2 Minuten (progress zum Zeitpunkt checked_at),
 * dazwischen rückt das Auto gleichmäßig weiter bis zur Ankunft.
 */
function shareNow(d: Drive, now: number): number {
  if (d.arrived_at) return 1
  const checked = Date.parse(d.checked_at)
  const eta = Date.parse(d.eta)
  const f = eta > checked ? Math.min(1, Math.max(0, (now - checked) / (eta - checked))) : 1
  return Math.min(1, d.progress + (1 - d.progress) * f)
}

/** Auto von der Seite: Karosserie in Personenfarbe, Räder drehen sich während der Fahrt */
function Car() {
  return (
    <svg className="hb-drive-car" viewBox="0 0 64 32" aria-hidden="true">
      <path className="hb-drive-car-body" d="M6 22c0-4 2-6 6-7l8-7c2-2 4-3 7-3h12c3 0 5 1 7 3l6 7c5 1 8 3 8 7v2c0 1-1 2-2 2H8c-1 0-2-1-2-2z" />
      <path className="hb-drive-car-glass" d="M22 15l5-5c1-1 2-1 3-1h4v6zM38 15V9h2c1 0 2 0 3 1l5 5z" />
      <g className="hb-drive-wheel" style={{ transformOrigin: '18px 26px' }}>
        <circle cx="18" cy="26" r="5" />
        <path d="M18 22v8M14 26h8" />
      </g>
      <g className="hb-drive-wheel" style={{ transformOrigin: '48px 26px' }}>
        <circle cx="48" cy="26" r="5" />
        <path d="M48 22v8M44 26h8" />
      </g>
    </svg>
  )
}

/**
 * Heimweg mit dem Auto (NFC-Baustein „Heimweg“): oben an Wand und Handy eine Karte mit Straße, auf der das Auto
 * Richtung Haus fährt, dazu „noch 14 Min · ca. 18:42“ und Stau. Bei Ankunft steht das Auto am Haus.
 * Antippen beendet die Fahrt (z. B. wenn man doch nicht heimfährt).
 */
export function DriveHeader(_: { variant: 'wall' | 'phone' }) {
  const drives = useDrives()
  const now = useNow(1000).getTime()
  const { byId, personKey } = useMembers()
  const visible = drives.filter((d) => !d.arrived_at || now - Date.parse(d.arrived_at) < SHOW_ARRIVED_MIN * 60_000)
  if (!visible.length) return null

  async function stop(d: Drive) {
    if (d.arrived_at) return
    if (!confirm('Heimweg beenden?')) return
    await supabase.from('drives').update({ cancelled_at: new Date().toISOString() }).eq('id', d.id)
  }

  return (
    <>
      {visible.map((d) => {
        const name = byId.get(d.member)?.name ?? ''
        const share = shareNow(d, now)
        const arrived = !!d.arrived_at || share >= 1
        const leftMin = Math.max(0, Math.ceil((Date.parse(d.eta) - now) / 60_000))
        const jam = Math.round(d.delay_s / 60)
        return (
          <button
            key={d.id}
            type="button"
            data-kind="meal"
            className={`hb-meal-card hb-drive-card hb-slot-item hb-person-${personKey(d.member)} ${arrived ? 'is-arrived' : ''}`}
            aria-label={arrived ? `${name} ist zuhause` : `${name} auf dem Heimweg, noch ${leftMin} Minuten, Ankunft ca. ${hhmm(d.eta)}`}
            onClick={() => stop(d)}
          >
            <span className="hb-drive-top">
              <span className="hb-drive-who">{arrived ? `${name} ist zuhause` : `${name} kommt heim`}</span>
              {!arrived && (
                <span className="hb-drive-left">
                  <b>{leftMin <= 1 ? 'gleich' : `${leftMin} Min`}</b>
                  <span>ca. {hhmm(d.eta)}</span>
                </span>
              )}
            </span>
            <span className="hb-drive-road" style={{ ['--share' as string]: share }}>
              <span className="hb-drive-done" />
              <span className="hb-drive-lane" />
              <span className="hb-drive-pos">
                <Car />
              </span>
              <span className="hb-drive-home">
                <Icon icon={House} size={18} />
              </span>
            </span>
            {!arrived && jam >= 3 && <span className="hb-drive-jam">{jam} Min Stau auf dem Weg</span>}
          </button>
        )
      })}
    </>
  )
}
