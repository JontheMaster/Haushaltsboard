import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Todo } from '../modules/todos/useTodos'

export type Device = 'wall' | 'phone'

// Unter 700 px Breite: Handy-Ansicht (CLAUDE.md)
const PHONE_QUERY = '(max-width: 699px)'

export function useIsPhone(): boolean {
  return useMedia(PHONE_QUERY)
}

/** Live-Abfrage einer Media Query, z. B. '(max-width: 1023px)' */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
  )
}

type DeviceState = {
  device: Device
  /** Handy: Todo im Bearbeiten-Fenster öffnen */
  openTodo?: (id: string) => void
  /** Handy: Todo löschen, mit „Rückgängig“ */
  removeTodo?: (todo: Todo) => void
  /** Handy: neues Todo anlegen (Fenster öffnen), z. B. aus den Schnellaktionen */
  newTodo?: () => void
  /** Handy: zu einem Reiter springen, z. B. „einkauf“ */
  goTab?: (tab: string) => void
  /** Handy: kurze Bestätigung unten */
  showToast?: (message: string) => void
}

const DeviceCtx = createContext<DeviceState>({ device: 'wall' })

export const DeviceProvider = DeviceCtx.Provider

/** Wand oder Handy; am Handy außerdem Bearbeiten und Löschen */
export function useDevice() {
  return useContext(DeviceCtx)
}
