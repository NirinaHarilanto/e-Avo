import type { ReactNode } from 'react'
import { Icone } from './Icones'
import { champStyle } from './Champ'

/* Rangée de filtres/recherche au-dessus d'une liste. */
export function BarreOutils({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>{children}</div>
  )
}

interface ChampRechercheProps {
  valeur: string
  onChange: (valeur: string) => void
  placeholder?: string
  etiquette?: string
}

/* Champ de recherche avec icône. Les trois listes filtrables (EtudiantsAdmin,
   EtudiantsProfesseur, DocumentsAdmin) posaient chacune leur `<input>` nu, sans repère visuel
   indiquant qu'il s'agissait d'une recherche. */
export function ChampRecherche({ valeur, onChange, placeholder = 'Rechercher…', etiquette }: ChampRechercheProps) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 0, flexGrow: 1 }}>
      <span style={{ position: 'absolute', left: 12, display: 'inline-flex', color: 'var(--muted-2)', pointerEvents: 'none' }}>
        <Icone nom="recherche" taille={15} />
      </span>
      <input
        type="search"
        aria-label={etiquette ?? placeholder}
        placeholder={placeholder}
        value={valeur}
        onChange={(evenement) => onChange(evenement.target.value)}
        style={{ ...champStyle, paddingLeft: 35 }}
      />
    </div>
  )
}
