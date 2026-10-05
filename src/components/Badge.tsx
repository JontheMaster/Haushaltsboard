import type { ReactNode } from 'react'

type Tone = 'accent' | 'today' | 'success' | 'urgent' | 'warning' | 'a' | 'b'

export function Badge({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`hb-badge ${tone ? `hb-badge-${tone}` : ''}`}>{children}</span>
}
