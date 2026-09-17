import { useEffect, useState, type ChangeEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { MessageErreur } from '../ui/Etats'
import { boutonSecondaireStyle } from '../ui/Boutons'

type Profile = Database['public']['Tables']['profiles']['Row']

interface PanneauSignatureProps {
  profile: Profile
  onChange: () => void
}

/* Signature de contrat sous forme d'image (demande client du 2026-09-17) : déposée ici une fois,
   réutilisée automatiquement à chaque signature de contrat (ContratImprimable.tsx). Bucket Storage
   dédié `signatures` (migration 0047) plutôt que `documents` : une signature doit être visible par
   l'AUTRE partie du contrat, un besoin que les policies de `documents` ne couvrent pas. Chemin fixe
   {etablissement_id}/{profile_id}/signature.png, upsert à chaque dépôt — pas de table de
   métadonnées nécessaire pour un seul fichier par profil, pas d'orphelin à nettoyer. */
export function PanneauSignature({ profile, onChange }: PanneauSignatureProps) {
  const [urlSignee, setUrlSignee] = useState<string | null>(null)
  const [chargementApercu, setChargementApercu] = useState(true)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // URL signée, pas de cache partagé (useCacheRequete n'a pas de TTL, une URL signée en a un) :
  // un useEffect local refait la demande à chaque montage, ce qui suffit ici.
  useEffect(() => {
    let annule = false
    if (!profile.signature_path) {
      setUrlSignee(null)
      setChargementApercu(false)
      return
    }
    setChargementApercu(true)
    supabase
      .storage
      .from('signatures')
      .createSignedUrl(profile.signature_path, 300)
      .then(({ data }) => {
        if (!annule) {
          setUrlSignee(data?.signedUrl ?? null)
          setChargementApercu(false)
        }
      })
    return () => {
      annule = true
    }
  }, [profile.signature_path])

  async function televerser(fichier: File) {
    setEnCours(true)
    setErreur(null)
    const chemin = `${profile.etablissement_id}/${profile.id}/signature.png`
    const { error: erreurUpload } = await supabase.storage.from('signatures').upload(chemin, fichier, { upsert: true, contentType: 'image/png' })
    if (erreurUpload) {
      setEnCours(false)
      setErreur(erreurUpload.message)
      return
    }
    const { error: erreurUpdate } = await supabase.from('profiles').update({ signature_path: chemin }).eq('id', profile.id)
    setEnCours(false)
    if (erreurUpdate) {
      setErreur(erreurUpdate.message)
      return
    }
    onChange()
  }

  function surChangementFichier(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0]
    e.target.value = ''
    if (!fichier) return
    if (fichier.type !== 'image/png') {
      setErreur('Le fichier doit être une image au format PNG.')
      return
    }
    televerser(fichier)
  }

  return (
    <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-soft, var(--border))', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Signature</span>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
        Utilisée automatiquement quand vous signez un contrat. Sans signature déposée, le contrat affiche « Vu et approuvé par{' '}
        {profile.prenom} {profile.nom} ».
      </p>
      {!chargementApercu && urlSignee && (
        <img src={urlSignee} alt="Votre signature" style={{ maxHeight: 70, maxWidth: 260, background: '#fff', borderRadius: 8, padding: 8 }} />
      )}
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <label
        style={{
          ...boutonSecondaireStyle,
          display: 'inline-flex',
          width: 'fit-content',
          cursor: enCours ? 'default' : 'pointer',
          opacity: enCours ? 0.6 : 1,
        }}
      >
        {enCours ? 'Envoi…' : profile.signature_path ? 'Remplacer la signature' : 'Ajouter ma signature (PNG)'}
        <input type="file" accept="image/png" onChange={surChangementFichier} disabled={enCours} style={{ display: 'none' }} />
      </label>
    </div>
  )
}
