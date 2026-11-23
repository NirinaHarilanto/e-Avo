import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
/* Après index.css : l'habillage de la vitrine redéfinit quelques règles communes (champs de
   formulaire, surfaces) à spécificité égale, et doit donc passer en dernier. */
import './vitrine-hx.css'
import App from './App.tsx'
import { installerSynchroFetch } from './lib/synchro'
import { installerCaptureErreurs } from './lib/journalErreurs'
import { tenterRechargementApresMiseEnLigne } from './lib/rechargementVersion'
import { enregistrerAgentDeService } from './lib/installationApp'
import { FrontiereErreur } from './components/ui/FrontiereErreur'

installerSynchroFetch()

/* Au DÉMARRAGE, et non au montage de la bannière d'installation : un navigateur n'évalue
   l'installabilité qu'une fois l'agent de service en place, et n'annonce `beforeinstallprompt`
   qu'ensuite. L'enregistrer depuis l'espace personnel seul arrivait trop tard — mesuré, l'agent
   n'était jamais enregistré sur l'écran de connexion, donc l'offre ne venait jamais.

   Cet agent ne met rien en cache et n'a aucun effet visible (voir public/sw.js) : l'enregistrer
   partout ne change rien pour personne. La restriction demandée par le client porte sur le
   BOUTON, qui reste, lui, réservé au téléphone et à l'espace personnel. */
enregistrerAgentDeService()
/* Capture des erreurs qui échappent à React (promesses rejetées, erreurs de script) — la
   FrontiereErreur ci-dessous ne voit, elle, que celles levées pendant un rendu. */
installerCaptureErreurs()

/* Échec de préchargement d'un écran chargé à la demande : Vite le signale par cet événement
   AVANT que l'import ne rejette et que React ne démonte l'arbre. Reprendre ici fait gagner
   l'affichage de l'écran d'erreur — la FrontiereErreur garde le même réflexe en second rideau,
   pour les navigateurs ou les chemins qui n'émettent pas cet événement. */
window.addEventListener('vite:preloadError', () => {
  tenterRechargementApresMiseEnLigne()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FrontiereErreur>
      <App />
    </FrontiereErreur>
  </StrictMode>,
)
