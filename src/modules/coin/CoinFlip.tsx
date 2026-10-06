import { Coins, RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { useMembers } from '../../lib/members'
import { useEnabledModules } from '../useModules'

// So lange fliegt die Münze (muss zur Animation hb-coin-flip in meals.css passen)
const FLIP_MS = 1800

/** Echter Zufall vom Gerät statt Math.random */
function fairCoin(): 0 | 1 {
  const a = new Uint8Array(1)
  crypto.getRandomValues(a)
  return (a[0] & 1) as 0 | 1
}

/**
 * Streit-Schlichter: Münze mit J (Jonathan, Blau) und L (Leviona, Beere).
 * Knopf an der Wand in der Kopfzeile, am Handy unten auf Start.
 */
export function CoinButton({ variant }: { variant: 'wall' | 'phone' }) {
  const enabled = useEnabledModules()
  const [open, setOpen] = useState(false)
  if (!enabled?.has('muenzwurf')) return null
  return (
    <>
      {variant === 'wall' ? (
        <button type="button" className="hb-choice" aria-label="Münze werfen: wer ist dran?" title="Münze werfen" onClick={() => setOpen(true)}>
          <Icon icon={Coins} size={20} />
        </button>
      ) : (
        <button type="button" className="hb-btn hb-btn-ghost" onClick={() => setOpen(true)}>
          <Icon icon={Coins} size={18} />
          Münze werfen
        </button>
      )}
      {open && <CoinDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function CoinDialog({ onClose }: { onClose: () => void }) {
  const { people } = useMembers()
  const [a, b] = people
  // Wurf-Nummer startet die Animation neu; result = welche Seite oben landet
  const [toss, setToss] = useState(() => ({ n: 1, result: fairCoin() }))
  const [landed, setLanded] = useState(false)

  useEffect(() => {
    navigator.vibrate?.(30)
    const t = setTimeout(() => {
      setLanded(true)
      navigator.vibrate?.([40, 60, 40])
    }, FLIP_MS)
    return () => clearTimeout(t)
  }, [toss.n])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!a || !b) return null
  const winner = toss.result === 0 ? a : b

  return (
    <div className="hb-coin-overlay" role="dialog" aria-modal="true" aria-label="Münzwurf">
      <div className="hb-sheet-backdrop absolute inset-0" onClick={onClose} />
      <div className="hb-coin-box">
        <button type="button" className="hb-icon-btn absolute right-3 top-3" aria-label="Schließen" onClick={onClose}>
          <Icon icon={X} size={22} />
        </button>
        <h2 className="font-display text-title text-ink">Wer ist dran?</h2>

        <div className="hb-coin-stage">
          <div key={toss.n} className={`hb-coin ${toss.result === 0 ? 'lands-a' : 'lands-b'}`}>
            <span className="hb-coin-face hb-coin-a" aria-hidden="true">
              {a.name.charAt(0)}
            </span>
            <span className="hb-coin-face hb-coin-b" aria-hidden="true">
              {b.name.charAt(0)}
            </span>
          </div>
          <span key={`s${toss.n}`} className="hb-coin-shadow" aria-hidden="true" />
        </div>

        <p className={`hb-coin-result ${landed ? 'is-shown' : ''}`} aria-live="polite">
          {landed ? (
            <>
              <span className={toss.result === 0 ? 'text-person-a' : 'text-person-b'}>{winner.name}</span> ist dran!
            </>
          ) : (
            'Die Münze fliegt …'
          )}
        </p>

        <Button
          disabled={!landed}
          icon={<Icon icon={RotateCcw} size={20} />}
          onClick={() => {
            setLanded(false)
            setToss((t) => ({ n: t.n + 1, result: fairCoin() }))
          }}
        >
          Noch mal werfen
        </Button>
      </div>
    </div>
  )
}
