import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ProfileProvider } from './context/ProfileContext'
import { LandingEtablissement } from './components/landing/LandingEtablissement'
import { Confidentialite } from './components/legal/Confidentialite'
import { ConditionsUtilisation } from './components/legal/ConditionsUtilisation'
import { Connexion } from './components/auth/Connexion'
import { ReinitialiserMotDePasse } from './components/auth/ReinitialiserMotDePasse'

/* Les espaces admin/professeur/étudiant/plateforme sont chargés à la demande (`lazy`) plutôt
   qu'au démarrage — demande client du 2026-09-16 : « le chargement de la page Hero est très
   lent, il faut 1 à 2 secondes maximum ». Avant ce découpage, visiter la page publique
   téléchargeait AUSSI tout le tableau de bord admin, le calendrier professeur, l'espace élève et
   l'administration plateforme — plus de 30 écrans qu'un visiteur anonyme ne verra jamais —, dans
   un seul bundle JS. Le fichier HTML étant le même pour toute l'application, un connecté qui
   navigue vers son espace télécharge simplement ce dont IL a besoin au moment d'y entrer, plutôt
   que tout le monde téléchargeant tout, tout le temps. Restent chargées d'entrée (la page
   publique elle-même) : la landing, la connexion, la réinitialisation de mot de passe et les
   pages légales — assez légères pour ne pas justifier ce découpage, et nécessaires dès le
   premier écran d'un visiteur. */
const PipelineCRM = lazy(() => import('./components/pipeline/PipelineCRM').then((m) => ({ default: m.PipelineCRM })))
const RendezVousAdmin = lazy(() => import('./components/admin/RendezVousAdmin').then((m) => ({ default: m.RendezVousAdmin })))
const EtudiantsAdmin = lazy(() => import('./components/etudiants/EtudiantsAdmin').then((m) => ({ default: m.EtudiantsAdmin })))
const CohortesAdmin = lazy(() => import('./components/admin/CohortesAdmin').then((m) => ({ default: m.CohortesAdmin })))
const ProfesseursAdmin = lazy(() => import('./components/professeurs/ProfesseursAdmin').then((m) => ({ default: m.ProfesseursAdmin })))
const ProfesseurDetailAdmin = lazy(() => import('./components/professeurs/ProfesseurDetailAdmin').then((m) => ({ default: m.ProfesseurDetailAdmin })))
const SeancesAdmin = lazy(() => import('./components/admin/SeancesAdmin').then((m) => ({ default: m.SeancesAdmin })))
const HeuresAdmin = lazy(() => import('./components/admin/HeuresAdmin').then((m) => ({ default: m.HeuresAdmin })))
const DocumentsAdmin = lazy(() => import('./components/admin/DocumentsAdmin').then((m) => ({ default: m.DocumentsAdmin })))
const PaiementsAdmin = lazy(() => import('./components/admin/PaiementsAdmin').then((m) => ({ default: m.PaiementsAdmin })))
const FacturationAdmin = lazy(() => import('./components/admin/FacturationAdmin').then((m) => ({ default: m.FacturationAdmin })))
const ContratsAdmin = lazy(() => import('./components/admin/ContratsAdmin').then((m) => ({ default: m.ContratsAdmin })))
const ParametresAdmin = lazy(() => import('./components/admin/ParametresAdmin').then((m) => ({ default: m.ParametresAdmin })))
const TarifsAdmin = lazy(() => import('./components/admin/TarifsAdmin').then((m) => ({ default: m.TarifsAdmin })))
const CalendrierProfesseur = lazy(() => import('./components/professeurs/CalendrierProfesseur').then((m) => ({ default: m.CalendrierProfesseur })))
const EtudiantsProfesseur = lazy(() => import('./components/professeurs/EtudiantsProfesseur').then((m) => ({ default: m.EtudiantsProfesseur })))
const CoursCollectifsProfesseur = lazy(() => import('./components/professeurs/CoursCollectifsProfesseur').then((m) => ({ default: m.CoursCollectifsProfesseur })))
const HeuresProfesseur = lazy(() => import('./components/professeurs/HeuresProfesseur').then((m) => ({ default: m.HeuresProfesseur })))
const DocumentsProfesseur = lazy(() => import('./components/professeurs/DocumentsProfesseur').then((m) => ({ default: m.DocumentsProfesseur })))
const FacturesProfesseur = lazy(() => import('./components/professeurs/FacturesProfesseur').then((m) => ({ default: m.FacturesProfesseur })))
const ContratsProfesseur = lazy(() => import('./components/professeurs/ContratsProfesseur').then((m) => ({ default: m.ContratsProfesseur })))
const AgendaEtudiant = lazy(() => import('./components/etudiants/AgendaEtudiant').then((m) => ({ default: m.AgendaEtudiant })))
const DocumentsEtudiant = lazy(() => import('./components/etudiants/DocumentsEtudiant').then((m) => ({ default: m.DocumentsEtudiant })))
const PaiementsEtudiant = lazy(() => import('./components/etudiants/PaiementsEtudiant').then((m) => ({ default: m.PaiementsEtudiant })))
const ContratsEtudiant = lazy(() => import('./components/etudiants/ContratsEtudiant').then((m) => ({ default: m.ContratsEtudiant })))
const EtablissementsPlateforme = lazy(() => import('./components/plateforme/EtablissementsPlateforme').then((m) => ({ default: m.EtablissementsPlateforme })))
const EtablissementDetailPlateforme = lazy(() => import('./components/plateforme/EtablissementDetailPlateforme').then((m) => ({ default: m.EtablissementDetailPlateforme })))
const EspacePersonnel = lazy(() => import('./components/shared/EspacePersonnel').then((m) => ({ default: m.EspacePersonnel })))
const MonProfil = lazy(() => import('./components/shared/MonProfil').then((m) => ({ default: m.MonProfil })))

/* Repère bref pendant le téléchargement d'un espace — chaque écran affiche déjà lui-même
   « Chargement… » le temps de connaître la session (voir EspaceLayout.tsx) ; celui-ci ne couvre
   que l'instant, plus bref, du téléchargement du code de l'écran demandé. */
function ChargementEspace() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
      Chargement…
    </div>
  )
}

export default function App() {
  return (
    <ProfileProvider>
      <BrowserRouter>
        <Suspense fallback={<ChargementEspace />}>
          <Routes>
            <Route path="/" element={<LandingEtablissement />} />
            <Route path="/e/:slug" element={<LandingEtablissement />} />
            <Route path="/connexion" element={<Connexion />} />
            <Route path="/auth/reinitialiser" element={<ReinitialiserMotDePasse />} />
            <Route path="/confidentialite" element={<Confidentialite />} />
            <Route path="/conditions-utilisation" element={<ConditionsUtilisation />} />
            <Route path="/admin/prospects" element={<PipelineCRM />} />
            <Route path="/admin/rendez-vous" element={<RendezVousAdmin />} />
            <Route path="/admin/etudiants" element={<EtudiantsAdmin />} />
            <Route path="/admin/etudiants/:id" element={<EtudiantsAdmin />} />
            <Route path="/admin/vagues" element={<CohortesAdmin />} />
            <Route path="/admin/professeurs" element={<ProfesseursAdmin />} />
            <Route path="/admin/professeurs/:id" element={<ProfesseurDetailAdmin />} />
            <Route path="/admin/seances" element={<SeancesAdmin />} />
            <Route path="/admin/heures" element={<HeuresAdmin />} />
            <Route path="/admin/documents" element={<DocumentsAdmin />} />
            <Route path="/admin/paiements" element={<PaiementsAdmin />} />
            <Route path="/admin/facturation" element={<FacturationAdmin />} />
            <Route path="/admin/contrats" element={<ContratsAdmin />} />
            <Route path="/admin/parametres" element={<ParametresAdmin />} />
            <Route path="/admin/tarifs" element={<TarifsAdmin />} />
            <Route path="/admin/mon-profil" element={<MonProfil />} />
            <Route path="/professeur/calendrier" element={<CalendrierProfesseur />} />
            <Route path="/professeur/etudiants" element={<EtudiantsProfesseur />} />
            <Route path="/professeur/etudiants/:id" element={<EtudiantsProfesseur />} />
            <Route path="/professeur/cours-collectifs" element={<CoursCollectifsProfesseur />} />
            <Route path="/professeur/heures" element={<HeuresProfesseur />} />
            <Route path="/professeur/documents" element={<DocumentsProfesseur />} />
            <Route path="/professeur/factures" element={<FacturesProfesseur />} />
            <Route path="/professeur/contrats" element={<ContratsProfesseur />} />
            <Route path="/professeur/mon-profil" element={<MonProfil />} />
            <Route path="/mon-espace" element={<EspacePersonnel />} />
            <Route path="/mon-espace/agenda" element={<AgendaEtudiant />} />
            <Route path="/mon-espace/documents" element={<DocumentsEtudiant />} />
            <Route path="/mon-espace/paiements" element={<PaiementsEtudiant />} />
            <Route path="/mon-espace/contrats" element={<ContratsEtudiant />} />
            <Route path="/mon-espace/profil" element={<MonProfil />} />
            <Route path="/plateforme/etablissements" element={<EtablissementsPlateforme />} />
            <Route path="/plateforme/etablissements/:id" element={<EtablissementDetailPlateforme />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ProfileProvider>
  )
}
