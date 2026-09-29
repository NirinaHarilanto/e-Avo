import { useEffect, useState, type ChangeEvent, type CSSProperties, type InputHTMLAttributes } from 'react'

/* Champ de date / d'heure avec bouton « Valider » (demande client du 2026-09-29 : « quand on ouvre
   un calendrier [...] rajouter un bouton valider afin que l'utilisateur puisse enregistrer les
   informations de dates »). Les calendriers du navigateur se ferment sur un simple clic de jour, sans
   rien confirmer : on ne savait pas si la date était retenue.

   La valeur choisie reste un BROUILLON tant qu'elle n'est pas validée ; « Valider » (ou Entrée) la
   transmet au formulaire, et le bouton disparaît. Si l'utilisateur passe simplement au champ
   suivant ou clique sur « Enregistrer » sans valider, le brouillon est transmis à ce moment-là :
   rien ne se perd en silence. Remplace `<input type="date | datetime-local | time">` à
   l'identique — mêmes props, `onChange` appelé avec un évènement dont `target.value` porte la
   valeur validée. */
export function ChampDate({ value, onChange, style, onBlur, onKeyDown, ...reste }: InputHTMLAttributes<HTMLInputElement>) {
  const valeur = String(value ?? '')
  const [brouillon, setBrouillon] = useState(valeur)
  useEffect(() => setBrouillon(valeur), [valeur])
  const enAttente = brouillon !== valeur

  function valider() {
    if (!enAttente) return
    onChange?.({ target: { value: brouillon }, currentTarget: { value: brouillon } } as unknown as ChangeEvent<HTMLInputElement>)
  }

  // La taille voulue par l'appelant (largeur, flex) s'applique à l'ensemble champ + bouton.
  const { width, flex, flexGrow, minWidth, maxWidth, ...styleChamp } = (style ?? {}) as CSSProperties
  const styleEnveloppe: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, width, flex, flexGrow, minWidth: minWidth ?? 0, maxWidth }

  return (
    <span style={styleEnveloppe}>
      <input
        {...reste}
        value={brouillon}
        onChange={(e) => setBrouillon(e.target.value)}
        onBlur={(e) => {
          // Quitter le champ pour cliquer « Valider » n'est pas un abandon : le bouton s'en charge.
          if (!(e.relatedTarget instanceof HTMLElement && e.relatedTarget.dataset.validerDate === 'oui')) valider()
          onBlur?.(e)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && enAttente) {
            e.preventDefault()
            valider()
          }
          onKeyDown?.(e)
        }}
        style={{ ...styleChamp, flex: 1, minWidth: 0, width: '100%' }}
      />
      {enAttente && (
        <button
          type="button"
          data-valider-date="oui"
          onClick={valider}
          className="btn-shine"
          style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, padding: '8px 14px', background: 'var(--accent-gradient)', color: '#1b1510' }}
        >
          Valider
        </button>
      )}
    </span>
  )
}
