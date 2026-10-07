/**
 * Spruch, dessen Wörter nacheinander auftauchen (als würde er gerade gesprochen).
 * Für Screenreader steht der ganze Satz am Stück da.
 */
export function RevealText({ text, start = 0, step = 70 }: { text: string; start?: number; step?: number }) {
  const words = text.split(' ')
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((w, i) => (
          <span key={i} className="hb-reveal-word" style={{ animationDelay: `${start + i * step}ms` }}>
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        ))}
      </span>
    </>
  )
}
