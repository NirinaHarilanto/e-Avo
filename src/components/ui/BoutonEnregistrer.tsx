import type { CSSProperties } from 'react'
import { boutonNeutreStyle } from './Boutons'
import { Icone } from './Icones'

/* Bouton « Enregistrer » à trois états — demande client du 2026-10-10 : repos, enregistrement en
   cours, puis « Enregistré » en vert dès que le clic a réussi. Reste vert tant que rien n'a
   changé depuis (voir useBoutonEnregistrer, qui calcule `enregistre`) ; dès la moindre
   modification, l'appelant recalcule `enregistre` à `false` et ce bouton retombe seul sur son
   libellé de repos, sans action supplémentaire. */
export function BoutonEnregistrer({
  enCours,
  enregistre,
  onClick,
  disabled,
  libelleRepos = 'Enregistrer',
  libelleEnCours = 'Enregistrement…',
  libelleEnregistre = 'Enregistré',
  style,
}: {
  enCours: boolean
  enregistre: boolean
  onClick: () => void
  disabled?: boolean
  libelleRepos?: string
  libelleEnCours?: string
  libelleEnregistre?: string
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || enCours}
      style={{
        ...boutonNeutreStyle,
        ...(enregistre && !enCours
          ? { color: 'var(--accent-teal)', borderColor: 'rgba(111,227,192,.4)', background: 'rgba(111,227,192,.08)' }
          : null),
        opacity: disabled && !enCours ? 0.55 : 1,
        ...style,
      }}
    >
      {enCours ? (
        libelleEnCours
      ) : enregistre ? (
        <>
          <Icone nom="valide" taille={13} />
          {libelleEnregistre}
        </>
      ) : (
        libelleRepos
      )}
    </button>
  )
}
