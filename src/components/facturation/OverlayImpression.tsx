import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { telechargerPdf } from '../../lib/pdf'

export type ActionImpression = 'voir' | 'imprimer' | 'telecharger'

interface OverlayImpressionProps {
  onFermer: () => void
  children: ReactNode
  /* Nom du PDF téléchargé, sans extension (ex. le numéro de la facture). */
  nomFichier?: string
  /* Action déclenchée dès l'ouverture : les listes proposent « Imprimer » et « Télécharger »
     directement, sans passer par un premier clic sur « Voir ». */
  actionInitiale?: ActionImpression
}

/* Chrome partagé des vues imprimables (devis/facture/reçu/contrat) : overlay plein écran avec
   Imprimer (window.print(), voir la règle @media print de index.css qui n'imprime que
   .zone-imprimable) et Télécharger (PDF généré à partir de la même zone). */
export function OverlayImpression({ onFermer, children, nomFichier = 'document', actionInitiale = 'voir' }: OverlayImpressionProps) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const [telechargement, setTelechargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const actionFaite = useRef(false)

  async function telecharger() {
    if (!zoneRef.current) return
    setTelechargement(true)
    setErreur(null)
    try {
      await telechargerPdf(zoneRef.current, nomFichier)
    } catch {
      setErreur('Le PDF n’a pas pu être généré. Utilisez « Imprimer » puis « Enregistrer en PDF ».')
    }
    setTelechargement(false)
  }

  useEffect(() => {
    if (actionFaite.current || actionInitiale === 'voir') return
    actionFaite.current = true
    // Laisse le temps au document (logo, polices) de s'afficher avant d'imprimer ou de capturer.
    const minuterie = setTimeout(() => {
      if (actionInitiale === 'imprimer') window.print()
      else void telecharger()
    }, 400)
    return () => clearTimeout(minuterie)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionInitiale])

  const bouton = { fontSize: 12.5, fontWeight: 700, color: '#fff', background: 'transparent', border: '1px solid rgba(255,255,255,.3)', borderRadius: 999, padding: '8px 16px', cursor: 'pointer' }

  // Portail : l'aperçu peut s'ouvrir depuis une fenêtre modale (détail d'un paiement), dont le
  // plan d'empilement le masquerait sinon.
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 1000, overflowY: 'auto', padding: '30px 20px' }}>
      <div className="barre-actions-impression" style={{ maxWidth: 700, margin: '0 auto 14px', display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {erreur && <span style={{ fontSize: 12, color: '#ffb4b4', marginRight: 'auto' }}>{erreur}</span>}
        <button onClick={onFermer} style={bouton}>
          Fermer
        </button>
        <button onClick={telecharger} disabled={telechargement} style={{ ...bouton, opacity: telechargement ? 0.6 : 1 }}>
          {telechargement ? 'Préparation du PDF…' : 'Télécharger (PDF)'}
        </button>
        <button onClick={() => window.print()} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510' }}>
          Imprimer
        </button>
      </div>
      <div ref={zoneRef} className="zone-imprimable" style={{ maxWidth: 700, margin: '0 auto', background: '#fff', color: '#111', padding: 40, borderRadius: 8 }}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
