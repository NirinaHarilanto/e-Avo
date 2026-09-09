import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ProfileProvider } from './context/ProfileContext'
import { SelecteurEtablissement } from './components/etablissements/SelecteurEtablissement'

export default function App() {
  return (
    <ProfileProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<SelecteurEtablissement />} />
        </Routes>
      </BrowserRouter>
    </ProfileProvider>
  )
}
