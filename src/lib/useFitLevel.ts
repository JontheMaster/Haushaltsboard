import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Wählt die erste Fassung, die ganz in `ref` passt (nicht zu hoch, kein Wort zu breit).
 * Bei neuer Größe oder neuem Inhalt beginnt es wieder bei der ausführlichsten.
 */
export function useFitLevel(ref: RefObject<HTMLElement | null>, count: number, key: string): number {
  const [level, setLevel] = useState(0)
  const [size, setSize] = useState('')
  useLayoutEffect(() => setLevel(0), [key, size])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize(`${el.clientWidth}x${el.clientHeight}`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || level >= count - 1) return
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) setLevel((l) => l + 1)
  })
  return Math.min(level, count - 1)
}
