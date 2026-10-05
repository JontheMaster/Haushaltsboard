import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Todo } from '../modules/todos/useTodos'

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

type DeviceState = {
  device: Device
  /** Handy: Todo im Bearbeiten-Fenster öffnen */
  openTodo?: (id: string) => void
  /** Handy: Todo löschen, mit „Rückgängig“ */
  removeTodo?: (todo: Todo) => void
}

const DeviceCtx = createContext<DeviceState>({ device: 'wall' })

export const DeviceProvider = DeviceCtx.Provider

/** Wand oder Handy; am Handy außerdem Bearbeiten und Löschen */
export function useDevice() {
  return useContext(DeviceCtx)
}
