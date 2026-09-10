import type { ReactNode } from 'react'
import { EspaceLayout, type NavGroup } from './EspaceLayout'

const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: 'Prospects', href: '/admin/prospects', disponible: true },
      { label: 'Étudiants', href: '/admin/etudiants', disponible: true },
      { label: 'Professeurs', href: '/admin/professeurs', disponible: true },
      { label: 'Séances & visio', href: '/admin/seances', disponible: true },
      { label: 'Heures & forfaits', href: '/admin/heures', disponible: true },
    ],
  },
  {
    items: [
      { label: 'Documents', href: '/admin/documents', disponible: true },
      { label: 'Paiements', href: '/admin/paiements', disponible: true },
      { label: 'Facturation', href: '/admin/facturation', disponible: true },
      { label: 'Contrats', href: '/admin/contrats', disponible: true },
      { label: 'Paramètres', href: '/admin/parametres', disponible: true },
    ],
  },
]

export function AdminLayout({ children, actif }: { children: ReactNode; actif: string }) {
  return (
    <EspaceLayout roleAttendu="admin_etablissement" roleLabel="Administrateur" navGroups={ADMIN_NAV_GROUPS} actif={actif}>
      {children}
    </EspaceLayout>
  )
}
