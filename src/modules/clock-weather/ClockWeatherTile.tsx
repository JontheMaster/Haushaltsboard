import { Clock } from 'lucide-react'
import { Tile } from '../../components/Tile'
import type { TileProps } from '../types'
import { ClockWeather } from './ClockWeather'
import { useWeather } from './weather'

// Als Kachel im Raster (z. B. am Handy). An der Wand steht Uhr und Wetter als Kopfzeile.
export function ClockWeatherTile({ delay }: TileProps) {
  const weather = useWeather()
  return (
    <Tile title="Uhr und Wetter" icon={Clock} delay={delay}>
      <ClockWeather weather={weather} />
    </Tile>
  )
}
