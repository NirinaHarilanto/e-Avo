import { Link } from 'react-router-dom'
import { Logo } from './Logo'

interface ChoixEspaceProps {
  onChoisirEtudiant: () => void
}

/* Un compte garde un rôle unique, sauf l'administrateur plateforme (platform_admins, 0022) qui
   peut accéder aux 3 espaces d'un établissement — voir la redéfinition de
   is_admin_etablissement() en 0023. Cette fenêtre de choix n'est donc affichée qu'à lui, juste
   après connexion (EspacePersonnel), plutôt que d'imposer un espace par défaut. */
export function ChoixEspace({ onChoisirEtudiant }: ChoixEspaceProps) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 720, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, textAlign: 'center' }}>
        <Logo />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 className="brand-font" style={{ fontSize: 26, color: 'var(--ink)', margin: 0 }}>
            Quel espace souhaitez-vous ouvrir ?
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: 0 }}>
            Administrateur plateforme — vous avez accès aux trois espaces de votre établissement.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, width: '100%' }}>
          <button
            type="button"
            onClick={onChoisirEtudiant}
            className="card card-lift"
            style={{ padding: '24px 18px', display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer', color: 'inherit', font: 'inherit', textAlign: 'left' }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Espace élève</span>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Dossier, documents, compteur d'heures.</span>
          </button>
          <Link
            to="/professeur/calendrier"
            className="card card-lift"
            style={{ padding: '24px 18px', display: 'flex', flexDirection: 'column', gap: 8, textDecoration: 'none', color: 'inherit' }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Espace professeur</span>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Calendrier, étudiants, heures d'enseignement.</span>
          </Link>
          <Link
            to="/admin/prospects"
            className="card card-lift"
            style={{ padding: '24px 18px', display: 'flex', flexDirection: 'column', gap: 8, textDecoration: 'none', color: 'inherit' }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Espace admin</span>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Prospects, paiements, facturation, contrats.</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
