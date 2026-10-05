type Props = {
  checked: boolean
  label: string
  /** Beschriftung nur für Screenreader */
  hideLabel?: boolean
  onChange: (on: boolean) => void
}

// Schalter: Knopf gleitet und rastet ein (hb-toggle)
export function Toggle({ checked, label, hideLabel, onChange }: Props) {
  const sw = (
    <button
      type="button"
      role="switch"
      className="hb-toggle"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span className="hb-toggle-knob" />
    </button>
  )
  if (hideLabel) return sw
  return (
    <label className="hb-toggle-row">
      <span>{label}</span>
      {sw}
    </label>
  )
}
