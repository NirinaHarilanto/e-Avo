import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

/* Tampon de l'établissement, affiché sur facture/reçu, devis et contrat (demande client du
   2026-10-09) — déposé une fois dans Profil HOC (PanneauTampon.tsx), réutilisé automatiquement
   ici. Rien ne s'affiche tant qu'aucun admin n'en a déposé un : `etablissement.tampon_path` est
   alors `null`, comme pour une signature non déposée (ContratImprimable.tsx), sauf qu'ici il
   n'y a pas de repli textuel — un tampon n'a pas d'équivalent « Vu et approuvé par… ».

   URL signée, pas de cache partagé (useCacheRequete n'a pas de TTL, une URL signée en a un) :
   même raisonnement que PanneauSignature.tsx et SignatureAffichee (ContratImprimable.tsx), un
   useEffect local refait la demande à chaque montage. */
export function TamponEtablissement({ etablissement, taille = 120 }: { etablissement: Etablissement | null; taille?: number }) {
  const [urlSignee, setUrlSignee] = useState<string | null>(null)

  useEffect(() => {
    setUrlSignee(null)
    if (!etablissement?.tampon_path) return
    let annule = false
    supabase
      .storage
      .from('tampons')
      .createSignedUrl(etablissement.tampon_path, 300)
      .then(({ data }) => {
        if (!annule) setUrlSignee(data?.signedUrl ?? null)
      })
    return () => {
      annule = true
    }
  }, [etablissement?.tampon_path])

  if (!urlSignee) return null

  return (
    <img
      src={urlSignee}
      alt={`Tampon de ${etablissement?.nom ?? "l'établissement"}`}
      style={{ maxWidth: taille, maxHeight: taille, objectFit: 'contain' }}
    />
  )
}
