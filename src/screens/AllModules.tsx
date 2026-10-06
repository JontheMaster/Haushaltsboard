import { ChevronRight, LogOut } from 'lucide-react'
import { Button } from '../components/Button'
import { useMembers } from '../lib/members'
import { supabase } from '../lib/supabase'
import { useState } from 'react'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { Toggle } from '../components/Toggle'
import { MODULES } from '../modules/registry'
import { setModuleEnabled, useEnabledModules } from '../modules/useModules'

/**
 * Alle Funktionen: jedes Modul mit An/Aus-Schalter; Antippen öffnet seine Einstellungen.
 * Neue Module erscheinen hier von selbst (Eintrag in registry.ts).
 */
export function AllModules({ onBack, open }: { onBack: () => void; open: (id: string) => void }) {
  const enabled = useEnabledModules()
  const { me } = useMembers()
  // Sofort umschalten, die Datenbank meldet den Stand dann live zurück
  const [pending, setPending] = useState<Map<string, boolean>>(new Map())
  const isOn = (id: string) => pending.get(id) ?? enabled?.has(id) ?? false

  async function toggle(id: string, on: boolean) {
    setPending((p) => new Map(p).set(id, on))
    await setModuleEnabled(id, on)
    setPending((p) => {
      const next = new Map(p)
      next.delete(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Alle Funktionen" onBack={onBack} />
      <p className="text-body text-ink-muted">
        Ausgeschaltetes verschwindet auf dem Board und am Handy, für euch beide. Antippen öffnet die Einstellungen.
      </p>
      {/* erst zeigen, wenn der Stand bekannt ist – sonst gleiten alle Schalter sichtbar von Aus nach An */}
      {enabled && (
        <section className="hb-tile hb-tile-static hb-list-tile">
          {MODULES.map((m) => {
            const on = m.toggle === false || isOn(m.id)
            const body = (
              <>
                <span className={`hb-tile-icon ${on ? '' : 'is-off'}`}>
                  <Icon icon={m.icon} size={20} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col text-left">
                  <span className={`text-body font-semibold ${on ? 'text-ink' : 'text-ink-muted'}`}>{m.title}</span>
                  <span className="text-label text-ink-muted">{m.description}</span>
                </span>
              </>
            )
            return (
              <div key={m.id} className="hb-module-row">
                {m.Settings ? (
                  <button
                    type="button"
                    className="hb-module-open"
                    onClick={() => open(m.id)}
                    aria-label={`${m.title}: Einstellungen`}
                  >
                    {body}
                    <Icon icon={ChevronRight} size={20} className="shrink-0 text-ink-muted" />
                  </button>
                ) : (
                  <div className="hb-module-open">{body}</div>
                )}
                {m.toggle !== false && (
                  <Toggle
                    hideLabel
                    label={`${m.title} ${on ? 'ausschalten' : 'einschalten'}`}
                    checked={on}
                    onChange={(v) => toggle(m.id, v)}
                  />
                )}
              </div>
            )
          })}
        </section>
      )}
      <Button variant="ghost" icon={<Icon icon={LogOut} size={18} />} onClick={() => supabase.auth.signOut()}>
        Abmelden ({me.name})
      </Button>
    </div>
  )
}
