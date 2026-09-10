import type { ReactNode } from 'react'
import { EspaceLayout, type NavGroup } from './EspaceLayout'

const PROFESSEUR_NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: 'Calendrier', href: '/professeur/calendrier', disponible: true },
      { label: 'Mes étudiants', href: '/professeur/etudiants', disponible: true },
      { label: 'Mes heures', href: '/professeur/heures', disponible: true },
      { label: 'Documents', href: '/professeur/documents', disponible: true },
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
