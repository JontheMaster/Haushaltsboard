import type { PersonKey } from '../lib/members'

export function PersonChip({ person, name }: { person: PersonKey; name: string }) {
  return (
    <span className={`hb-person hb-person-${person}`}>
      <span className="hb-avatar" aria-hidden="true">
        {name.charAt(0)}
      </span>
      <span>{name}</span>
    </span>
  )
}
