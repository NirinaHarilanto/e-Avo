import type { ReactNode } from 'react'

export type StatutSignatureContrat = 'signe' | 'en_attente' | 'aucun'

const STYLES: Record<StatutSignatureContrat, { label: string; color: string; bg: string; border: string }> = {
  signe: { label: 'Contrat signé', color: 'var(--accent-teal)', bg: 'rgba(111,227,192,.14)', border: 'rgba(111,227,192,.3)' },
  en_attente: { label: 'Contrat en attente', color: 'var(--accent-gold, #e9cf94)', bg: 'rgba(233,207,148,.12)', border: 'rgba(233,207,148,.32)' },
  aucun: { label: 'Aucun contrat', color: 'var(--danger)', bg: 'rgba(255,138,112,.10)', border: 'rgba(255,138,112,.28)' },
}

/* Un seul glyphe par statut, pour la liste Étudiants (voir `glyphe` ci-dessous) — demande client
   du 2026-10-11, capture à l'appui : « trop d'informations [...] il faut que le nom et les
   badges tiennent sur une ligne ». Le texte complet reste lisible au survol (`title`), et
   toujours affiché en toutes lettres dans la fiche de l'élève (badgesSupplementaires,
   EtudiantsAdmin.tsx) : rien n'est perdu, seulement déplacé là où il y a la place de le lire.
   « Aucun contrat » : croix ✕ (lue à tort comme un bouton de suppression) → triangle d'alerte
   le 2026-10-11 → point d'exclamation le 2026-10-19 (demande client, capture à l'appui : la
   carte étudiant portait alors DEUX triangles d'alerte quasi identiques côte à côte — celui-ci
   et celui de `TagAucunCoursPlanifie` — l'exclamation distingue clairement les deux d'un coup
   d'œil). Caractère Unicode « ! » ordinaire, pas « ⚠ » : seul ce dernier a une présentation
   emoji par défaut dans la plupart des polices système, qui ignore `color` — « ! » comme ✓ et ⏳
   juste en dessous n'a pas ce problème. */
const GLYPHES: Record<StatutSignatureContrat, ReactNode> = {
  signe: '✓',
  en_attente: '⏳',
  aucun: '!',
}

/* Petit indicateur de signature de contrat, affiché dans les listes Professeurs et Étudiants
   de l'espace admin — pour repérer d'un coup d'œil qui n'a pas encore signé avant le début des
   cours, sans avoir à ouvrir chaque fiche. `compact` réduit encore la taille pour tenir dans
   une ligne de liste dense ; `glyphe` va plus loin et réduit le texte à un seul symbole. */
export function BadgeStatutContrat({ statut, compact, glyphe }: { statut: StatutSignatureContrat; compact?: boolean; glyphe?: boolean }) {
  const style = STYLES[statut]
  return (
    <span
      title={glyphe ? style.label : undefined}
      style={{
        display: glyphe ? 'inline-flex' : 'inline-block',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: glyphe ? 11 : compact ? 10 : 11,
        fontWeight: 800,
        lineHeight: 1,
        color: style.color,
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 999,
        padding: glyphe ? '2px 7px' : compact ? '2px 8px' : '4px 10px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {glyphe ? GLYPHES[statut] : style.label}
    </span>
  )
}
