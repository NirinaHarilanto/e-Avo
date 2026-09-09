import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ProfileProvider } from './context/ProfileContext'
import { SelecteurEtablissement } from './components/etablissements/SelecteurEtablissement'
import { LandingEtablissement } from './components/landing/LandingEtablissement'
import { Connexion } from './components/auth/Connexion'
import { PipelineCRM } from './components/pipeline/PipelineCRM'
import { EtudiantsAdmin } from './components/etudiants/EtudiantsAdmin'
import { EspaceEnConstruction } from './components/shared/EspaceEnConstruction'

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
          <Route path="/mon-espace" element={<EspaceEnConstruction />} />
        </Routes>
      </BrowserRouter>
    </ProfileProvider>
  )
}
