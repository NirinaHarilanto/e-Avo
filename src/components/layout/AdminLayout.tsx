import type { ReactNode } from 'react'
import { EspaceLayout, type NavGroup } from './EspaceLayout'

/* Les deux pôles existaient déjà dans ce tableau mais sans `titre`, donc sans jamais être
   nommés à l'écran : les douze entrées se lisaient comme une liste à plat. */
const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    titre: 'Pédagogie',
    items: [
      { label: 'Prospects', href: '/admin/prospects', disponible: true, icone: 'prospects', description: 'Suivi des candidats avant inscription' },
      { label: 'Rendez-vous', href: '/admin/rendez-vous', disponible: true, icone: 'seances', description: 'Demandes d’appel diagnostic à valider' },
      { label: 'Étudiants', href: '/admin/etudiants', disponible: true, icone: 'etudiants', description: 'Dossiers, professeurs et forfaits' },
      { label: 'Vagues', href: '/admin/vagues', disponible: true, icone: 'vagues', description: 'Groupes de cours collectifs' },
      { label: 'Professeurs', href: '/admin/professeurs', disponible: true, icone: 'professeurs', description: 'Équipe enseignante et charge' },
      { label: 'Séances & visio', href: '/admin/seances', disponible: true, icone: 'seances', description: 'Planning des cours' },
      { label: 'Heures & forfaits', href: '/admin/heures', disponible: true, icone: 'heures', description: 'Compteurs suivis et enseignés' },
    ],
  },
  {
    titre: 'Gestion',
    items: [
      { label: 'Documents', href: '/admin/documents', disponible: true, icone: 'documents', description: 'Pièces jointes et comptes rendus' },
      { label: 'Paiements', href: '/admin/paiements', disponible: true, icone: 'paiements', description: 'Encaissements et rémunérations' },
      { label: 'Facturation', href: '/admin/facturation', disponible: true, icone: 'facturation', description: 'Devis et factures' },
      { label: 'Contrats', href: '/admin/contrats', disponible: true, icone: 'contrats', description: 'Modèles et contrats signés' },
      { label: 'Tarifs', href: '/admin/tarifs', disponible: true, icone: 'tarifs', description: 'Grille affichée sur la vitrine' },
      { label: 'Paramètres', href: '/admin/parametres', disponible: true, icone: 'parametres', description: 'Réglages de l’établissement' },
      { label: 'Mon profil', href: '/admin/mon-profil', disponible: true, icone: 'parametres', description: 'Vos coordonnées et votre signature' },
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
