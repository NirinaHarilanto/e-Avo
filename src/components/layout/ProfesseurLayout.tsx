import type { ReactNode } from 'react'
import { EspaceLayout, type NavGroup } from './EspaceLayout'

const PROFESSEUR_NAV_GROUPS: NavGroup[] = [
  {
    titre: 'Mon enseignement',
    items: [
      { label: 'Calendrier', href: '/professeur/calendrier', disponible: true, icone: 'seances', description: 'Vos séances à venir et passées' },
      { label: 'Mes étudiants', href: '/professeur/etudiants', disponible: true, icone: 'etudiants', description: 'Les élèves qui vous sont attribués' },
      { label: 'Mes heures', href: '/professeur/heures', disponible: true, icone: 'heures', description: 'Heures enseignées par élève' },
      { label: 'Documents', href: '/professeur/documents', disponible: true, icone: 'documents', description: 'Vos pièces et celles de vos élèves' },
    ],
  },
  {
    titre: 'Administratif',
    items: [
      { label: 'Mes factures', href: '/professeur/factures', disponible: true, icone: 'facturation', description: 'Vos rémunérations facturées' },
      { label: 'Mes contrats', href: '/professeur/contrats', disponible: true, icone: 'contrats', description: 'Contrats à lire et à signer' },
      { label: 'Mon profil', href: '/professeur/mon-profil', disponible: true, icone: 'parametres', description: 'Vos coordonnées et votre signature' },
    ],
  },
]

export function ProfesseurLayout({ children, actif }: { children: ReactNode; actif: string }) {
  return (
    <EspaceLayout roleAttendu="professeur" roleLabel="Professeur" navGroups={PROFESSEUR_NAV_GROUPS} actif={actif}>
      {children}
    </EspaceLayout>
  )
}
