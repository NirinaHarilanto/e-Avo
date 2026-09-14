import type { ReactNode } from 'react'
import { EspaceLayout, type NavGroup } from './EspaceLayout'

const ETUDIANT_NAV_GROUPS: NavGroup[] = [
  {
    titre: 'Mon parcours',
    items: [
      { label: 'Mon dossier', href: '/mon-espace', disponible: true, icone: 'dossier', description: 'Professeur, programme et heures' },
      { label: 'Mes documents', href: '/mon-espace/documents', disponible: true, icone: 'documents', description: 'Vos pièces et vos comptes rendus de cours' },
    ],
  },
  {
    titre: 'Administratif',
    items: [
      { label: 'Mes paiements', href: '/mon-espace/paiements', disponible: true, icone: 'paiements', description: 'Vos factures et reçus' },
      { label: 'Mes contrats', href: '/mon-espace/contrats', disponible: true, icone: 'contrats', description: 'Contrats à lire et à signer' },
    ],
  },
]

/* Referme la boucle d'harmonisation des 3 espaces (voir plan Phase 2) : l'espace étudiant
   utilise le même EspaceLayout que l'admin et le professeur. */
export function EtudiantLayout({ children, actif }: { children: ReactNode; actif: string }) {
  return (
    <EspaceLayout roleAttendu="etudiant" roleLabel="Étudiant" navGroups={ETUDIANT_NAV_GROUPS} actif={actif}>
      {children}
    </EspaceLayout>
  )
}
