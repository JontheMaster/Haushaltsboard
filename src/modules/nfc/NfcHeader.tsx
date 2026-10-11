import { DriveHeader } from './DriveHeader'
import { TimerHeader } from './TimerHeader'

/** Karten oben aus NFC-Tags: laufende Timer (Waschmaschine) und Heimwege mit dem Auto */
export function NfcHeader({ variant }: { variant: 'wall' | 'phone' }) {
  return (
    <>
      <DriveHeader variant={variant} />
      <TimerHeader variant={variant} />
    </>
  )
}
