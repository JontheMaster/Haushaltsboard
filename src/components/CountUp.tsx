import { useEffect, useState } from 'react'

/** Zahl, die beim Erscheinen von 0 hochzählt (Wochenrückblick). Ohne Animation bei „Bewegung reduzieren“. */
export function CountUp({ value, ms = 1200, delay = 0 }: { value: number; ms?: number; delay?: number }) {
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const [shown, setShown] = useState(reduce ? value : 0)
  useEffect(() => {
    if (reduce || value === 0) return setShown(value)
    let raf = 0
    let start = 0
    const tick = (t: number) => {
      if (!start) start = t
      const p = Math.min(1, Math.max(0, (t - start - delay) / ms))
      // schnell los, sanft auslaufen
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms, delay, reduce])
  return <span className="tabular-nums">{shown}</span>
}
