import type { ReactNode } from 'react'
import { EspaceLayout, type NavGroup } from './EspaceLayout'

const ETUDIANT_NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: 'Mon dossier', href: '/mon-espace', disponible: true },
      { label: 'Mes documents', href: '/mon-espace/documents', disponible: true },
    ],
  },
]

/* Referme la boucle d'harmonisation des 3 espaces (voir plan Phase 2) : l'espace étudiant
   utilise désormais le même EspaceLayout que l'admin et le professeur. */
export function EtudiantLayout({ children, actif }: { children: ReactNode; actif: string }) {
  return (
    <EspaceLayout roleAttendu="etudiant" roleLabel="Étudiant" navGroups={ETUDIANT_NAV_GROUPS} actif={actif}>
      {children}
    </EspaceLayout>
  )
}
