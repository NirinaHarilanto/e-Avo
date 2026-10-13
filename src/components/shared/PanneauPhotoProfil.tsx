import { useState, type ChangeEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { MessageErreur } from '../ui/Etats'
import { boutonSecondaireStyle, boutonNeutreStyle } from '../ui/Boutons'

type Profile = Database['public']['Tables']['profiles']['Row']

const TYPES_ACCEPTES = ['image/jpeg', 'image/png', 'image/webp']
const TAILLE_MAX_OCTETS = 2 * 1024 * 1024

/* URL publique de la photo d'un profil. Le bucket `photos-profil` est public (0128), contrairement
   à `signatures` ou `tampons` : la photo accompagne le témoignage sur la vitrine, lue par un
   visiteur anonyme qui n'a aucun jeton pour demander une URL signée. Pas d'appel réseau ici, c'est
   une simple construction d'URL. */
function urlPhotoProfil(photoPath: string | null | undefined): string | null {
  if (!photoPath) return null
  return supabase.storage.from('photos-profil').getPublicUrl(photoPath).data.publicUrl
}

interface PanneauPhotoProfilProps {
  profile: Profile
  onChange: () => void
}

/* Photo de profil — demande client du 2026-10-13 : « créer la possibilité d'insérer la photo
   étudiant dans la section informations personnelles de son espace personnel ». Elle sert à
   illustrer son avis une fois publié dans les témoignages, mais appartient au profil : l'élève la
   dépose et la retire quand il veut, indépendamment de tout avis.

   Même mécanique que PanneauSignature.tsx : chemin fixe par profil, remplacé à chaque dépôt (pas
   de table de métadonnées, pas d'orphelin à nettoyer). L'extension suit le type déposé — une photo
   peut arriver en JPEG, PNG ou WebP — et l'ancienne est retirée quand elle change, sinon deux
   fichiers resteraient côte à côte pour un seul profil. */
export function PanneauPhotoProfil({ profile, onChange }: PanneauPhotoProfilProps) {
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const url = urlPhotoProfil(profile.photo_path)

  async function televerser(fichier: File) {
    setEnCours(true)
    setErreur(null)
    const extension = fichier.type === 'image/png' ? 'png' : fichier.type === 'image/webp' ? 'webp' : 'jpg'
    const chemin = `${profile.id}/photo.${extension}`
    const { error: erreurUpload } = await supabase.storage
      .from('photos-profil')
      .upload(chemin, fichier, { upsert: true, contentType: fichier.type })
    if (erreurUpload) {
      setEnCours(false)
      setErreur(erreurUpload.message)
      return
    }
    // L'ancienne photo n'est retirée qu'une fois la nouvelle en place, et seulement si elle portait
    // une autre extension : en cas d'échec ci-dessus, le profil garde une photo valide.
    if (profile.photo_path && profile.photo_path !== chemin) {
      await supabase.storage.from('photos-profil').remove([profile.photo_path])
    }
    const { error: erreurUpdate } = await supabase.from('profiles').update({ photo_path: chemin }).eq('id', profile.id)
    setEnCours(false)
    if (erreurUpdate) {
      setErreur(erreurUpdate.message)
      return
    }
    onChange()
  }

  async function retirer() {
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('profiles').update({ photo_path: null }).eq('id', profile.id)
    if (!error && profile.photo_path) await supabase.storage.from('photos-profil').remove([profile.photo_path])
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  function surChangementFichier(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0]
    e.target.value = ''
    if (!fichier) return
    /* Vérifié ici ET par le bucket (0128) : la contrainte serveur est la vraie barrière, ce
       contrôle n'est là que pour dire tout de suite ce qui ne va pas plutôt que de renvoyer un
       message d'erreur technique après un envoi inutile. */
    if (!TYPES_ACCEPTES.includes(fichier.type)) {
      setErreur('La photo doit être une image JPEG, PNG ou WebP.')
      return
    }
    if (fichier.size > TAILLE_MAX_OCTETS) {
      setErreur('La photo ne doit pas dépasser 2 Mo.')
      return
    }
    televerser(fichier)
  }

  return (
    <div
      style={{
        marginTop: 18,
        paddingTop: 18,
        borderTop: '1px solid var(--border-soft, var(--border))',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Photo de profil</span>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
        Elle accompagnera votre avis s’il est publié dans les témoignages du site. Facultative :
        sans photo, vos initiales s’affichent à la place. JPEG, PNG ou WebP, 2 Mo maximum.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div
          aria-hidden={!url}
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            overflow: 'hidden',
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--surface-2, rgba(255,255,255,.06))',
            border: '1px solid var(--border-soft, var(--border))',
            color: 'var(--muted)',
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          {url ? (
            <img src={url} alt="Votre photo de profil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            `${(profile.prenom ?? '?').charAt(0)}${(profile.nom ?? '').charAt(0)}`.toUpperCase()
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label
            style={{
              ...boutonSecondaireStyle,
              display: 'inline-flex',
              width: 'fit-content',
              cursor: enCours ? 'default' : 'pointer',
              opacity: enCours ? 0.6 : 1,
            }}
          >
            {enCours ? 'Envoi…' : url ? 'Remplacer la photo' : 'Ajouter ma photo'}
            <input
              type="file"
              accept={TYPES_ACCEPTES.join(',')}
              onChange={surChangementFichier}
              disabled={enCours}
              style={{ display: 'none' }}
            />
          </label>
          {url && (
            <button type="button" style={boutonNeutreStyle} onClick={retirer} disabled={enCours}>
              Retirer
            </button>
          )}
        </div>
      </div>
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
    </div>
  )
}
