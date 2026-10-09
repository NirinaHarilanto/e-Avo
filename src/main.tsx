import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
/* Après index.css : l'habillage de la vitrine redéfinit quelques règles communes (champs de
   formulaire, surfaces) à spécificité égale, et doit donc passer en dernier. */
import './vitrine-hx.css'
import App from './App.tsx'
import { installerSynchroFetch } from './lib/synchro'

installerSynchroFetch()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
