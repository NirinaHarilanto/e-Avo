import { useState } from 'react'
import { Icone } from '../ui/Icones'

/* Rafraîchissement manuel de la page, demandé à côté de la cloche de notification dans les trois
   espaces (2026-10-09) : « l'équivalent de Ctrl+Maj+R ». Un rechargement complet du navigateur est
   la seule action qui reproduit vraiment ce raccourci — contrairement à un simple `recharger()` de
   hook, il repart aussi du dernier bundle déployé, utile juste après une mise en production. Le
   cache applicatif (useCacheRequete.ts) et l'abonnement temps réel repartent alors à zéro comme au
   premier chargement de la page.
   Depuis le 2026-10-16, il vit dans l'en-tête de page (EnTetePage.tsx) et non plus dans une barre
   supérieure, et suit le gabarit des maquettes : carré arrondi de 44 px, bordé et rempli, comme la
   cloche de notifications voisine. */
export function BoutonRafraichir() {
  const [enCours, setEnCours] = useState(false)

  return (
    <button
      type="button"
      onClick={() => {
        setEnCours(true)
        window.location.reload()
      }}
      disabled={enCours}
      aria-label="Actualiser la page"
      title="Actualiser la page"
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--accent-blue)',
        cursor: enCours ? 'default' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: enCours ? 0.6 : 1,
      }}
    >
      <Icone nom="rafraichir" taille={18} style={enCours ? { animation: 'tourner 0.7s linear infinite' } : undefined} />
    </button>
  )
}
