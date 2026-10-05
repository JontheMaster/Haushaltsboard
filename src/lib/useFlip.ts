import { useLayoutEffect, useRef } from 'react'

/**
 * Zeilen gleiten an ihre neue Position, statt zu springen (FLIP: First, Last, Invert, Play).
 * Alle Elemente mit data-flip-id im Container werden nach jedem Rendern verglichen.
 * Der Container braucht position: relative, damit offsetTop sich auf ihn bezieht
 * (offsetTop ignoriert laufende Transformationen, Scrollen stört nicht).
 */
export function useFlip<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const prev = useRef(new Map<string, number>())

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const next = new Map<string, number>()

    root.querySelectorAll<HTMLElement>('[data-flip-id]').forEach((el) => {
      const id = el.dataset.flipId!
      const top = offsetWithin(el, root)
      next.set(id, top)
      const before = prev.current.get(id)
      if (before === undefined || calm || Math.abs(before - top) < 1) return
      el.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }], {
        duration: 420, // dur-slow
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', // ease-out
      })
    })
    prev.current = next
  })

  return ref
}

function offsetWithin(el: HTMLElement, root: HTMLElement): number {
  let top = 0
  let node: HTMLElement | null = el
  while (node && node !== root) {
    top += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  return top
}
