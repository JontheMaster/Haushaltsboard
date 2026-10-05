import type { ReactNode } from 'react'

type Option<T> = { value: T; label: ReactNode; className?: string }

type Props<T> = {
  label: string
  options: Option<T>[]
  isSelected: (v: T) => boolean
  onSelect: (v: T) => void
}

// Auswahl als Reihe von Pillen (eine aktiv), z. B. Wann und Wer im Todo-Formular
export function Choice<T>({ label, options, isSelected, onSelect }: Props<T>) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-label text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => {
          const on = isSelected(o.value)
          return (
            <button
              key={i}
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(o.value)}
              className={`hb-choice ${on ? 'is-on' : ''} ${o.className ?? ''}`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
