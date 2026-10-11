import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
/* Après index.css : l'habillage de la vitrine redéfinit quelques règles communes (champs de
   formulaire, surfaces) à spécificité égale, et doit donc passer en dernier. */
import './vitrine-hx.css'
import App from './App.tsx'
import { installerSynchroFetch } from './lib/synchro'
import { installerCaptureErreurs } from './lib/journalErreurs'
import { FrontiereErreur } from './components/ui/FrontiereErreur'

installerSynchroFetch()
/* Capture des erreurs qui échappent à React (promesses rejetées, erreurs de script) — la
   FrontiereErreur ci-dessous ne voit, elle, que celles levées pendant un rendu. */
installerCaptureErreurs()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FrontiereErreur>
      <App />
    </FrontiereErreur>
  </StrictMode>,
)
