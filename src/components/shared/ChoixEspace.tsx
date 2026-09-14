import { Link } from 'react-router-dom'
import { Logo } from './Logo'
import { Icone, type NomIcone } from '../ui/Icones'

interface ChoixEspaceProps {
  onChoisirEtudiant: () => void
}

const CONTENU_CARTE: { icone: NomIcone; titre: string; description: string }[] = [
  { icone: 'dossier', titre: 'Espace élève', description: 'Dossier pédagogique, documents, compteur d’heures, contrats.' },
  { icone: 'seances', titre: 'Espace professeur', description: 'Calendrier, élèves suivis, heures enseignées, comptes rendus.' },
  { icone: 'parametres', titre: 'Espace admin', description: 'Prospects, étudiants, séances, paiements, facturation, contrats.' },
]

/* Un compte garde un rôle unique, sauf l'administrateur plateforme (platform_admins, 0022) qui
   peut accéder aux 3 espaces d'un établissement — voir la redéfinition de
   is_admin_etablissement() en 0023. Cette fenêtre de choix n'est donc affichée qu'à lui, juste
   après connexion (EspacePersonnel), plutôt que d'imposer un espace par défaut. */
export function ChoixEspace({ onChoisirEtudiant }: ChoixEspaceProps) {
  const [eleve, professeur, admin] = CONTENU_CARTE

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 760, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, textAlign: 'center' }}>
        <Logo />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 className="brand-font" style={{ fontSize: 26, color: 'var(--ink)', margin: 0 }}>
            Quel espace souhaitez-vous ouvrir ?
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
            Vous êtes administrateur plateforme : vous avez accès aux trois espaces de votre établissement. Vous pourrez
            en changer à tout moment en vous déconnectant, ou en modifiant l’adresse de la page.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, width: '100%' }}>
          <button type="button" onClick={onChoisirEtudiant} className="card card-lift" style={carteStyle}>
            <CorpsCarte {...eleve} />
          </button>
          <Link to="/professeur/calendrier" className="card card-lift" style={{ ...carteStyle, textDecoration: 'none' }}>
            <CorpsCarte {...professeur} />
          </Link>
          <Link to="/admin/prospects" className="card card-lift" style={{ ...carteStyle, textDecoration: 'none' }}>
            <CorpsCarte {...admin} />
          </Link>
        </div>
      </div>
    </div>
  )
}

const carteStyle: React.CSSProperties = {
  padding: '22px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  cursor: 'pointer',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'left',
}

function CorpsCarte({ icone, titre, description }: { icone: NomIcone; titre: string; description: string }) {
  return (
    <>
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(94,179,255,.10)',
          border: '1px solid rgba(94,179,255,.22)',
          color: 'var(--accent-blue)',
        }}
      >
        <Icone nom={icone} taille={20} />
      </span>
      <span className="brand-font" style={{ fontSize: 16, color: 'var(--ink)' }}>
        {titre}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>{description}</span>
    </>
  )
}
