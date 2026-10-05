import { createContext, useContext, useSyncExternalStore } from 'react'

export type Device = 'wall' | 'phone'

// Unter 700 px Breite: Handy-Ansicht (CLAUDE.md)
const PHONE_QUERY = '(max-width: 699px)'

export function useIsPhone(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(PHONE_QUERY)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(PHONE_QUERY).matches,
  )
}

const DeviceCtx = createContext<{ device: Device; openTodo?: (id: string) => void }>({ device: 'wall' })

export const DeviceProvider = DeviceCtx.Provider

/** Wand oder Handy; am Handy außerdem: Todo zum Bearbeiten öffnen */
export function useDevice() {
  return useContext(DeviceCtx)
}
