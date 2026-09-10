import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ProfileProvider } from './context/ProfileContext'
import { SelecteurEtablissement } from './components/etablissements/SelecteurEtablissement'
import { LandingEtablissement } from './components/landing/LandingEtablissement'
import { Connexion } from './components/auth/Connexion'
import { PipelineCRM } from './components/pipeline/PipelineCRM'
import { EtudiantsAdmin } from './components/etudiants/EtudiantsAdmin'
import { ProfesseursAdmin } from './components/professeurs/ProfesseursAdmin'
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
import { DocumentsEtudiant } from './components/etudiants/DocumentsEtudiant'
import { EtablissementsPlateforme } from './components/plateforme/EtablissementsPlateforme'
import { EtablissementDetailPlateforme } from './components/plateforme/EtablissementDetailPlateforme'
import { EspacePersonnel } from './components/shared/EspacePersonnel'

export default function App() {
  return (
    <ProfileProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<SelecteurEtablissement />} />
          <Route path="/e/:slug" element={<LandingEtablissement />} />
          <Route path="/connexion" element={<Connexion />} />
          <Route path="/admin/prospects" element={<PipelineCRM />} />
          <Route path="/admin/etudiants" element={<EtudiantsAdmin />} />
          <Route path="/admin/etudiants/:id" element={<EtudiantsAdmin />} />
          <Route path="/admin/professeurs" element={<ProfesseursAdmin />} />
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
          <Route path="/mon-espace" element={<EspacePersonnel />} />
          <Route path="/mon-espace/documents" element={<DocumentsEtudiant />} />
          <Route path="/plateforme/etablissements" element={<EtablissementsPlateforme />} />
          <Route path="/plateforme/etablissements/:id" element={<EtablissementDetailPlateforme />} />
        </Routes>
      </BrowserRouter>
    </ProfileProvider>
  )
}
