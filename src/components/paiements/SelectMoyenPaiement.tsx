import { useState } from 'react'
import { champStyle } from '../ui/Champ'

export const MOYENS_PAIEMENT = ['Espèces', 'Virement', 'Chèque', 'Mobile money'] as const

const VALEUR_AUTRES = 'Autres'

/* Liste déroulante du moyen de paiement — demande client du 2026-10-11 : remplace la saisie
   libre (« Virement, carte… », « Espèces, Mvola… ») par ces cinq choix, avec une zone libre
   OBLIGATOIRE quand « Autres » est sélectionné. Partagée par les trois formulaires qui
   enregistrent un règlement — CreerPaiementEtudiant.tsx, DetailPaiementModale.tsx,
   FraisInscriptionCollectifModale.tsx — pour que le choix soit identique partout.

   La valeur stockée en base (`moyen_paiement`, toujours un texte libre) reste un simple texte :
   un choix fixe stocke son libellé tel quel, « Autres » stocke le texte saisi — sans préfixe
   « Autres : » qui polluerait l'historique. C'est aussi ce qui permet de réafficher correctement
   un paiement déjà enregistré avant ce composant (ex. « Mvola », « Orange Money ») : une valeur
   qui ne correspond à aucun des quatre choix fixes retombe automatiquement sur « Autres », avec
   son texte d'origine repris dans la zone libre plutôt que perdu. */
export function SelectMoyenPaiement({
  valeur,
  onChange,
}: {
  valeur: string
  /* `valide` à `false` uniquement quand « Autres » est choisi sans texte — c'est le seul cas que
     l'appelant doit bloquer, le moyen de paiement restant par ailleurs facultatif comme avant. */
  onChange: (valeur: string, valide: boolean) => void
}) {
  const choixFixe = (MOYENS_PAIEMENT as readonly string[]).includes(valeur)
  const [choix, setChoix] = useState(() => (valeur === '' ? '' : choixFixe ? valeur : VALEUR_AUTRES))
  const [texteLibre, setTexteLibre] = useState(() => (choixFixe || valeur === '' ? '' : valeur))

  function changerChoix(nouveauChoix: string) {
    setChoix(nouveauChoix)
    if (nouveauChoix === VALEUR_AUTRES) {
      onChange(texteLibre, texteLibre.trim() !== '')
    } else {
      onChange(nouveauChoix, true)
    }
  }

  function changerTexteLibre(texte: string) {
    setTexteLibre(texte)
    onChange(texte, texte.trim() !== '')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <select value={choix} onChange={(e) => changerChoix(e.target.value)} style={champStyle}>
        <option value="">Sélectionner…</option>
        {MOYENS_PAIEMENT.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
        <option value={VALEUR_AUTRES}>Autres</option>
      </select>
      {choix === VALEUR_AUTRES && (
        <input
          value={texteLibre}
          onChange={(e) => changerTexteLibre(e.target.value)}
          placeholder="Précisez le moyen de paiement"
          required
          style={champStyle}
        />
      )}
    </div>
  )
}
