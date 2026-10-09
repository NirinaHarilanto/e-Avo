import { useState, type ChangeEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { TamponEtablissement } from '../shared/TamponEtablissement'
import { MessageErreur } from '../ui/Etats'
import { boutonSecondaireStyle } from '../ui/Boutons'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

interface PanneauTamponProps {
  etablissement: Etablissement
  onChange: () => void
}

/* Tampon de l'établissement sous forme d'image (demande client du 2026-10-09), sur le modèle de
   « Ma signature » (PanneauSignature.tsx) : bucket Storage dédié `tampons` (migration 0104),
   chemin fixe {etablissement_id}/tampon.png, upsert à chaque dépôt — UN tampon partagé par tout
   l'établissement, pas un par profil, d'où une colonne sur `etablissements` plutôt que sur
   `profiles`, et l'écriture réservée aux admins par policy (RLS) plutôt qu'au déposant. */
export function PanneauTampon({ etablissement, onChange }: PanneauTamponProps) {
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function televerser(fichier: File) {
    setEnCours(true)
    setErreur(null)
    const chemin = `${etablissement.id}/tampon.png`
    const { error: erreurUpload } = await supabase.storage.from('tampons').upload(chemin, fichier, { upsert: true, contentType: 'image/png' })
    if (erreurUpload) {
      setEnCours(false)
      setErreur(erreurUpload.message)
      return
    }
    const { error: erreurUpdate } = await supabase.from('etablissements').update({ tampon_path: chemin }).eq('id', etablissement.id)
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
        Appliqué automatiquement sur chaque facture, reçu, devis et contrat généré — idéalement un fichier PNG au fond transparent.
      </p>
      {etablissement.tampon_path && (
        <div style={{ padding: 8, background: '#fff', borderRadius: 8, width: 'fit-content' }}>
          <TamponEtablissement etablissement={etablissement} taille={110} />
        </div>
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
        {enCours ? 'Envoi…' : etablissement.tampon_path ? 'Remplacer le tampon' : 'Ajouter le tampon (PNG)'}
        <input type="file" accept="image/png" onChange={surChangementFichier} disabled={enCours} style={{ display: 'none' }} />
      </label>
    </div>
  )
}
