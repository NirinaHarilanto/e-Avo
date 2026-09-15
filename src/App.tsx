import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ProfileProvider } from './context/ProfileContext'
import { LandingEtablissement } from './components/landing/LandingEtablissement'
import { Confidentialite } from './components/legal/Confidentialite'
import { ConditionsUtilisation } from './components/legal/ConditionsUtilisation'
import { Connexion } from './components/auth/Connexion'
import { ReinitialiserMotDePasse } from './components/auth/ReinitialiserMotDePasse'
import { PipelineCRM } from './components/pipeline/PipelineCRM'
import { RendezVousAdmin } from './components/admin/RendezVousAdmin'
import { EtudiantsAdmin } from './components/etudiants/EtudiantsAdmin'
import { CohortesAdmin } from './components/admin/CohortesAdmin'
import { ProfesseursAdmin } from './components/professeurs/ProfesseursAdmin'
import { ProfesseurDetailAdmin } from './components/professeurs/ProfesseurDetailAdmin'
import { SeancesAdmin } from './components/admin/SeancesAdmin'
import { HeuresAdmin } from './components/admin/HeuresAdmin'
import { DocumentsAdmin } from './components/admin/DocumentsAdmin'
import { PaiementsAdmin } from './components/admin/PaiementsAdmin'
import { FacturationAdmin } from './components/admin/FacturationAdmin'
import { ContratsAdmin } from './components/admin/ContratsAdmin'
import { ParametresAdmin } from './components/admin/ParametresAdmin'
import { TarifsAdmin } from './components/admin/TarifsAdmin'
import { CalendrierProfesseur } from './components/professeurs/CalendrierProfesseur'
import { EtudiantsProfesseur } from './components/professeurs/EtudiantsProfesseur'
import { HeuresProfesseur } from './components/professeurs/HeuresProfesseur'
import { DocumentsProfesseur } from './components/professeurs/DocumentsProfesseur'
import { FacturesProfesseur } from './components/professeurs/FacturesProfesseur'
import { ContratsProfesseur } from './components/professeurs/ContratsProfesseur'
import { AgendaEtudiant } from './components/etudiants/AgendaEtudiant'
import { DocumentsEtudiant } from './components/etudiants/DocumentsEtudiant'
import { PaiementsEtudiant } from './components/etudiants/PaiementsEtudiant'
import { ContratsEtudiant } from './components/etudiants/ContratsEtudiant'
import { EtablissementsPlateforme } from './components/plateforme/EtablissementsPlateforme'
import { EtablissementDetailPlateforme } from './components/plateforme/EtablissementDetailPlateforme'
import { EspacePersonnel } from './components/shared/EspacePersonnel'

export default function App() {
  return (
    <ProfileProvider>
      <BrowserRouter>
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
          <Route path="/professeur/calendrier" element={<CalendrierProfesseur />} />
          <Route path="/professeur/etudiants" element={<EtudiantsProfesseur />} />
          <Route path="/professeur/etudiants/:id" element={<EtudiantsProfesseur />} />
          <Route path="/professeur/heures" element={<HeuresProfesseur />} />
          <Route path="/professeur/documents" element={<DocumentsProfesseur />} />
          <Route path="/professeur/factures" element={<FacturesProfesseur />} />
          <Route path="/professeur/contrats" element={<ContratsProfesseur />} />
          <Route path="/mon-espace" element={<EspacePersonnel />} />
          <Route path="/mon-espace/agenda" element={<AgendaEtudiant />} />
          <Route path="/mon-espace/documents" element={<DocumentsEtudiant />} />
          <Route path="/mon-espace/paiements" element={<PaiementsEtudiant />} />
          <Route path="/mon-espace/contrats" element={<ContratsEtudiant />} />
          <Route path="/plateforme/etablissements" element={<EtablissementsPlateforme />} />
          <Route path="/plateforme/etablissements/:id" element={<EtablissementDetailPlateforme />} />
        </Routes>
      </BrowserRouter>
    </ProfileProvider>
  )
}
