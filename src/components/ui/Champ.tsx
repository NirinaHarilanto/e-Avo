import type { CSSProperties, ReactNode } from 'react'

/* Source unique du style de champ de formulaire. Il existait jusqu'ici quatre copies locales
   (`CohortesAdmin`, `TarifsAdmin`, `ParametresAdmin`, `InformationsPersonnelles`,
   `FormulaireInvitation`) dont les valeurs avaient divergé — radius 8 ou 10, paddings et
   tailles de police différents — ce qui se voyait dès que deux formulaires étaient affichés
   côte à côte. */
export const champStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '10px 13px',
  fontSize: 13.5,
  color: 'var(--ink)',
  background: 'rgba(0,0,0,.24)',
}

/* Variante dense, pour les tableaux de saisie ou chaque ligne compte (editeur de lignes de
   devis et de facture) : le style standard y rendrait le tableau deux fois plus haut. */
export const champStyleCompact: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 7,
  padding: '7px 9px',
  fontSize: 12.5,
  color: 'var(--ink)',
  background: 'rgba(0,0,0,.24)',
}

/* `--muted` (couleur d'origine, jusqu'au 2026-09-30) se fondait dans les autres informations
   d'un popup ou d'une checklist dense (retour client explicite : « il faut rendre les intitulés
   plus visibles pour qu'ils ne se mélangent pas avec les autres informations ») — la majuscule,
   le gras et l'espacement des lettres ne suffisaient pas à compenser une couleur aussi proche de
   celle du texte environnant. `--ink`, la couleur la plus lumineuse du thème (réservée jusqu'ici
   aux titres), rétablit une vraie hiérarchie : l'intitulé se voit avant le contenu qu'il annonce,
   pas l'inverse. */
export const etiquetteStyle: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 800,
  color: 'var(--ink)',
  textTransform: 'uppercase',
  letterSpacing: 0.6,
}

interface ChampProps {
  label: string
  aide?: ReactNode
  obligatoire?: boolean
  children: ReactNode
  style?: CSSProperties
}

/* Champ étiqueté avec texte d'aide optionnel sous le contrôle. L'aide est le principal levier
   d'ergonomie sur les formulaires métier de l'app (montants, échéances, taux horaire), où le
   seul libellé ne suffit pas à savoir quoi saisir. */
export function Champ({ label, aide, obligatoire, children, style }: ChampProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, ...style }}>
      <span style={etiquetteStyle}>
        {label}
        {obligatoire && <span style={{ color: 'var(--accent-orange)' }}> *</span>}
      </span>
      {children}
      {aide && <span style={{ fontSize: 11.5, color: 'var(--muted-2)', lineHeight: 1.45 }}>{aide}</span>}
    </label>
  )
}

/* Ligne « libellé / valeur » des panneaux de consultation. Était dupliquée à l'identique dans
   DossierEtudiantVue et InformationsPersonnelles. */
export function LigneInfo({ label, valeur, accent }: { label: string; valeur: ReactNode; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, padding: '5px 0' }}>
      <span
        style={{
          fontSize: 12,
          color: accent ? 'var(--accent-blue)' : 'var(--muted)',
          fontWeight: accent ? 700 : 400,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--ink-2)', textAlign: 'right', minWidth: 0, wordBreak: 'break-word' }}>
        {valeur ?? '—'}
      </span>
    </div>
  )
}
