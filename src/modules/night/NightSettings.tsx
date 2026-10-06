import { useEffect, useState } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { useSettings } from '../../lib/settings'
import { supabase } from '../../lib/supabase'

/** Nachtmodus: von wann bis wann das Wand-Tablet nur eine gedimmte Uhr zeigt */
export function NightSettings({ onBack }: { onBack: () => void }) {
  const { settings } = useSettings()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!settings) return
    setFrom(settings.night_from.slice(0, 5))
    setTo(settings.night_to.slice(0, 5))
  }, [settings])

  async function save(field: 'night_from' | 'night_to', value: string) {
    if (!/^\d{2}:\d{2}$/.test(value)) return
    const { error } = await supabase.from('settings').update(field === 'night_from' ? { night_from: value } : { night_to: value }).eq('id', 1)
    setError(!!error)
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Nachtmodus" onBack={onBack} />
      <p className="text-body text-ink-muted">
        In dieser Zeit zeigt das Wand-Tablet nur eine gedimmte Uhr. Antippen weckt es für 2 Minuten. Handys sind davon nicht betroffen.
      </p>
      {error && (
        <p role="status" className="rounded-md bg-urgent-soft px-3 py-2 text-label text-urgent">
          Speichern hat nicht geklappt. Prüf die Verbindung.
        </p>
      )}
      <section className="hb-tile hb-tile-static gap-3 p-4">
        <label className="flex items-center gap-3">
          <span className="flex-1 text-body text-ink">Beginnt um</span>
          <input
            type="time"
            className="h-7 w-[128px] rounded-md border border-line bg-surface-sunken px-3 text-body text-ink focus-visible:focus-ring"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              save('night_from', e.target.value)
            }}
          />
        </label>
        <label className="flex items-center gap-3">
          <span className="flex-1 text-body text-ink">Endet um</span>
          <input
            type="time"
            className="h-7 w-[128px] rounded-md border border-line bg-surface-sunken px-3 text-body text-ink focus-visible:focus-ring"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              save('night_to', e.target.value)
            }}
          />
        </label>
      </section>
    </div>
  )
}
