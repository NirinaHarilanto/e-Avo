import { useProfileContext } from '../../context/ProfileContext'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { DossierEtudiantVue } from './DossierEtudiantVue'
import { EtudiantLayout } from '../layout/EtudiantLayout'

export function MonEspaceEtudiant() {
  const { profile } = useProfileContext()
  const { dossier, loading, erreur } = useDossierEtudiant(profile?.id)

  return (
    <EtudiantLayout actif="Mon dossier">
      {loading && <p style={{ color: 'var(--muted)' }}>Chargement de votre espace…</p>}
      {erreur && <p style={{ color: 'var(--danger)' }}>{erreur}</p>}
      {dossier && <DossierEtudiantVue dossier={dossier} />}
    </EtudiantLayout>
  )
}
