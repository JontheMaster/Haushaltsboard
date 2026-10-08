import { Quote } from 'lucide-react'
import { PlayInView } from '../../components/PlayInView'
import { Tile } from '../../components/Tile'
import { useToday } from '../../lib/time'
import type { TileProps } from '../types'
import { useModuleConfig } from '../useModules'
import { BRIEFING_DEFAULTS } from './MorningBriefing'
import { RevealText } from './RevealText'
import { sayingOf } from './sayings'

/** Handy-Kachel: Spruch des Tages (derselbe wie im Morgen-Briefing an der Wand) */
export function SayingTile({ delay }: TileProps) {
  const today = useToday()
  const { saying } = useModuleConfig('morgen', BRIEFING_DEFAULTS)
  // ist der Spruch im Briefing aus, zeigt die Kachel trotzdem einen (sonst wäre sie leer)
  const quote = sayingOf(today, saying === 'aus' ? 'wechsel' : saying)
  return (
    <Tile title="Spruch des Tages" icon={Quote} delay={delay}>
      {quote && (
        <PlayInView>
          <figure className="hb-saying">
            <blockquote>
              <RevealText text={quote.text} start={200} step={55} />
            </blockquote>
            <figcaption>{quote.from}</figcaption>
          </figure>
        </PlayInView>
      )}
    </Tile>
  )
}
