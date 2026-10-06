import type { ReactNode } from 'react'

/** Symbol vor einem Text, das nie allein in einer Zeile steht: Symbol und erstes Wort brechen nicht um */
export function WithIcon({ icon, text, children }: { icon: ReactNode; text: string; children?: ReactNode }) {
  const [first, ...rest] = text.split(' ')
  return (
    <>
      <span className="whitespace-nowrap">
        {icon}
        {first}
      </span>
      {rest.length > 0 && ` ${rest.join(' ')}`}
      {children}
    </>
  )
}
