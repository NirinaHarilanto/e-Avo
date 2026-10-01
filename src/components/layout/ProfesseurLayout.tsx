import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EspaceLayout, type NavGroup } from './EspaceLayout'
import { useProfileContext } from '../../context/ProfileContext'

const PROFESSEUR_NAV_GROUPS: NavGroup[] = [
  {
    titre: 'Mon enseignement',
    items: [
      { label: 'Calendrier', href: '/professeur/calendrier', disponible: true, icone: 'seances', description: 'Vos séances à venir et passées' },
      { label: 'Mes étudiants', href: '/professeur/etudiants', disponible: true, icone: 'etudiants', description: 'Les élèves qui vous sont attribués' },
      { label: 'Cours collectifs', href: '/professeur/cours-collectifs', disponible: true, icone: 'vagues', description: 'Vos classes de niveau et leurs élèves' },
      { label: 'Mes heures', href: '/professeur/heures', disponible: true, icone: 'heures', description: 'Heures enseignées et TimeSheet' },
      { label: 'Documents', href: '/professeur/documents', disponible: true, icone: 'documents', description: 'Vos pièces et celles de vos élèves' },
      { label: 'Messages', href: '/professeur/messages', disponible: true, icone: 'communication', description: 'Écrire à l’administration, à un élève ou à un collègue' },
    ],
  },
  {
    titre: 'Administratif',
    items: [
      { label: 'Mes factures', href: '/professeur/factures', disponible: true, icone: 'facturation', description: 'Vos rémunérations facturées' },
      { label: 'Mes contrats', href: '/professeur/contrats', disponible: true, icone: 'contrats', description: 'Contrats à lire et à signer' },
      { label: 'Mon profil', href: '/professeur/mon-profil', disponible: true, icone: 'parametres', description: 'Vos coordonnées et votre signature' },
      { label: 'Guide d’utilisation', href: '/professeur/guide', disponible: true, icone: 'guide', description: 'Le fonctionnement de votre espace' },
    ],
  },
]

export function ProfesseurLayout({ children, actif }: { children: ReactNode; actif: string }) {
  const { profile } = useProfileContext()
  return (
    <EspaceLayout roleAttendu="professeur" roleLabel="Professeur" navGroups={PROFESSEUR_NAV_GROUPS} actif={actif}>
      {/* Formateur recruté dont l'intégration n'est pas encore validée (0082). */}
      {profile?.statut_integration === 'en_integration' && (
        <div style={{ marginBottom: 16, borderRadius: 12, border: '1px solid rgba(184,156,255,.4)', background: 'rgba(184,156,255,.08)', padding: '11px 15px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
          <strong style={{ color: '#b89cff' }}>Bienvenue ! Vous êtes en phase d’intégration.</strong> Première étape : lire et signer votre
          contrat dans <Link to="/professeur/contrats" style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>Mes contrats</Link>. L’équipe HOC
          vous accompagne ensuite pour les sessions d’onboarding.
        </div>
      )}
      {children}
    </EspaceLayout>
  )
}
