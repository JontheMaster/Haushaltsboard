import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './lib/push'
import { listenForRecapLinks } from './modules/recap/recapStore'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Für Erinnerungen per Push (nur Anzeige von Mitteilungen, kein Offline-Cache)
registerServiceWorker()

// Antippen der Sonntags-Mitteilung öffnet den Wochenrückblick
listenForRecapLinks()
