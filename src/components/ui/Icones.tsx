import type { ReactNode, SVGProps } from 'react'

/* Jeu d'icônes tracées à la main plutôt qu'une librairie : le projet n'a aucune dépendance UI
   et on ne veut pas en introduire une pour 20 pictogrammes. Toutes sur une grille 24, en
   contour `currentColor`, pour qu'une icône prenne la couleur de son conteneur (pilule de nav
   active, état vide, bouton) sans style supplémentaire. */

export type NomIcone =
  | 'prospects'
  | 'etudiants'
  | 'vagues'
  | 'professeurs'
  | 'seances'
  | 'heures'
  | 'documents'
  | 'paiements'
  | 'facturation'
  | 'contrats'
  | 'tarifs'
  | 'parametres'
  | 'dossier'
  | 'etablissements'
  | 'menu'
  | 'fermer'
  | 'chevron'
  | 'info'
  | 'recherche'
  | 'plus'
  | 'vide'
  | 'alerte'
  | 'valide'
  | 'oeil'
  | 'oeil_barre'
  | 'supprimer'
  | 'pause'
  | 'lecture'
  | 'etoile'

const CHEMINS: Record<NomIcone, ReactNode> = {
  prospects: <path d="M3 4h18l-7 8.2V19l-4 2v-8.8z" />,
  etudiants: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 20c0-3.4 2.8-5.4 6.2-5.4s6.2 2 6.2 5.4" />
      <path d="M16.4 5.2a3.2 3.2 0 0 1 0 6" />
      <path d="M18 14.9c2 .7 3.2 2.5 3.2 5.1" />
    </>
  ),
  vagues: (
    <>
      <path d="M12 3 3 7.6l9 4.6 9-4.6z" />
      <path d="M3 12.4 12 17l9-4.6" />
      <path d="M3 16.9 12 21.5l9-4.6" />
    </>
  ),
  professeurs: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M12 16v4" />
      <path d="M8.5 20h7" />
      <path d="M7.5 11.5 10 9l2 2 4.5-4.5" />
    </>
  ),
  seances: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <path d="m11 13.8 3.4 2-3.4 2z" />
    </>
  ),
  heures: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.8V12l3.4 2" />
    </>
  ),
  documents: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  paiements: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.4" />
      <path d="M2.5 10h19" />
      <path d="M6 14.6h3.5" />
    </>
  ),
  facturation: (
    <>
      <path d="M6 3h12v18l-3-1.8-3 1.8-3-1.8L6 21z" />
      <path d="M9.5 8h5M9.5 12h5" />
    </>
  ),
  contrats: (
    <>
      <path d="M12 20.5h9" />
      <path d="M16.6 3.6a2.05 2.05 0 0 1 2.9 2.9L8.4 17.6l-3.9 1 1-3.9z" />
    </>
  ),
  tarifs: (
    <>
      <path d="M20.6 12.6 12.9 20.3a1.9 1.9 0 0 1-2.7 0l-6.5-6.5a1.9 1.9 0 0 1-.5-1.6l.9-6.3 6.3-.9c.6-.1 1.2.1 1.6.5l6.6 6.6a1.9 1.9 0 0 1 0 2.5z" />
      <circle cx="8.2" cy="8.2" r="1.4" />
    </>
  ),
  parametres: (
    <>
      <path d="M4 7h6M14 7h6M4 17h10M18 17h2" />
      <circle cx="12" cy="7" r="2.2" />
      <circle cx="16" cy="17" r="2.2" />
    </>
  ),
  dossier: (
    <>
      <path d="M3 7.5A2 2 0 0 1 5 5.5h3.8l2 2.2H19a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M3 11h18" />
    </>
  ),
  etablissements: (
    <>
      <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21" />
      <path d="M14 10h4.5A1.5 1.5 0 0 1 20 11.5V21" />
      <path d="M2.5 21h19" />
      <path d="M7.5 8h3M7.5 12h3M7.5 16h3" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  fermer: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  chevron: <path d="m9.5 6 6 6-6 6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11.2v5" />
      <path d="M12 7.8h.01" />
    </>
  ),
  recherche: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20.5 20.5-4.4-4.4" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  vide: (
    <>
      <path d="M3 13.5h5l1.6 3h4.8l1.6-3h5" />
      <path d="M5.4 5h13.2l2.4 8.5V19a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 19v-5.5z" />
    </>
  ),
  alerte: (
    <>
      <path d="M10.3 4.3 2.5 18a1.7 1.7 0 0 0 1.5 2.5h16a1.7 1.7 0 0 0 1.5-2.5L13.7 4.3a1.7 1.7 0 0 0-3 0z" />
      <path d="M12 9.5v4M12 17h.01" />
    </>
  ),
  valide: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  oeil: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  oeil_barre: (
    <>
      <path d="M3 3l18 18" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M6.5 6.7C4 8.3 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.4-1.1M17.9 17.9C20.2 16.2 22 12 22 12s-3.6-7-10-7c-.6 0-1.2.05-1.8.15" />
    </>
  ),
  supprimer: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V7" />
      <path d="M6 7l1 13a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  lecture: <path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" />,
  etoile: <path d="M12 2.5l2.9 6.4 6.9.7-5.2 4.8 1.5 6.9L12 17.8l-6.1 3.5 1.5-6.9L2.2 9.6l6.9-.7z" fill="currentColor" stroke="none" />,
}

interface IconeProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  nom: NomIcone
  taille?: number
}

export function Icone({ nom, taille = 18, ...props }: IconeProps) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      style={{ flexShrink: 0 }}
      {...props}
    >
      {CHEMINS[nom]}
    </svg>
  )
}
