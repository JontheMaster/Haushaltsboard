import { TrainFront } from 'lucide-react'
import { Tile } from '../../components/Tile'
import type { TileProps } from '../types'
import { DeparturesBoard } from './DeparturesBoard'

/** Handy-Kachel: Abfahrten ab zuhause, immer (an der Wand nur morgens über dem Einkauf) */
export function DeparturesBoardTile({ delay }: TileProps) {
  return (
    <Tile title="Abfahrten ab zuhause" icon={TrainFront} delay={delay}>
      <DeparturesBoard compact />
    </Tile>
  )
}
