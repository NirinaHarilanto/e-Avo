import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

export type Temoignage = Database['public']['Tables']['temoignages']['Row']

/* Témoignages PUBLIÉS, pour la page publique (0128). Lisible sans être connecté : la policy
   `temoignages_public_select` ne laisse passer que `statut = 'publie'`, un avis en attente ou
   refusé n'est donc jamais exposé — ce n'est pas ce `eq` qui protège, c'est la RLS ; il est là
   pour que la requête soit explicite sur ce qu'elle demande.

   L'ordre est celui que l'admin arrête dans « Gestion des avis » (`ordre`), puis le plus récent
   d'abord à égalité : c'est l'ordre d'origine de la page, qui plaçait en tête les témoignages
   ayant une photo. */
export function useTemoignagesPublies() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('temoignages-publies', async () => {
    const { data, error } = await supabase
      .from('temoignages')
      .select('*')
      .eq('statut', 'publie')
      .order('ordre', { ascending: true })
      .order('soumis_le', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  })

  return { temoignages: valeur ?? [], loading, erreur, recharger }
}

/* Tous les témoignages de l'établissement, quel que soit leur statut — réservé à l'espace admin
   (la RLS ne rend les non publiés qu'à un administrateur, ou à leur auteur pour le sien). Les
   avis en attente d'abord : c'est ce que l'admin vient traiter. */
export function useTousLesTemoignages() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('temoignages-tous', async () => {
    const { data, error } = await supabase
      .from('temoignages')
      .select('*')
      .order('soumis_le', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  })

  return { temoignages: valeur ?? [], loading, erreur, recharger }
}

/* L'avis de l'élève connecté, s'il en a déjà déposé un : sa policy `temoignages_auteur_select`
   le lui rend quel que soit son statut, c'est ainsi qu'il voit « en attente », « publié » ou le
   motif d'un refus. Le plus récent fait foi. */
export function useMonTemoignage(profileId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(profileId && `mon-temoignage-${profileId}`, async () => {
    const { data, error } = await supabase
      .from('temoignages')
      .select('*')
      .eq('auteur_profile_id', profileId as string)
      .order('soumis_le', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data
  })

  return { temoignage: valeur ?? null, loading, erreur, recharger }
}

/* URL d'affichage d'une photo de témoignage, quelle que soit sa provenance (voir la contrainte
   `temoignages_une_seule_photo`, 0128) : un fichier livré avec le site pour les témoignages
   historiques, le bucket public `photos-profil` pour la photo d'un élève. Le bucket est public
   précisément pour ce cas : la page est servie à un visiteur anonyme, qui n'a aucun jeton pour
   demander une URL signée. */
export function urlPhotoTemoignage(temoignage: Pick<Temoignage, 'photo_fichier' | 'photo_path'>, dossierAssets: string): string | null {
  if (temoignage.photo_fichier) return `${dossierAssets}/temoignages/${temoignage.photo_fichier}`
  if (temoignage.photo_path) return supabase.storage.from('photos-profil').getPublicUrl(temoignage.photo_path).data.publicUrl
  return null
}
