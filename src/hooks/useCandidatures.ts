import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

export type Candidature = Database['public']['Tables']['candidatures_formateurs']['Row']

/* Candidatures formateurs (0082), avec pour chaque candidat entré en intégration l'état de son
   contrat : la case « Signature du contrat » de la checklist se constate sur le contrat
   lui-même, pas par une coche manuelle. */
export function useCandidatures() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('candidatures-formateurs', async () => {
    let { data: brut, error } = await supabase
      .from('candidatures_formateurs')
      .select('*')
      .is('supprime_le', null)
      .order('created_at', { ascending: false })
    /* `42703` = la colonne n'existe pas encore. Les migrations de ce projet sont appliquées à la
       main par le client : entre le déploiement du code et son passage dans l'éditeur SQL, il y a
       toujours une fenêtre où `supprime_le` manque. On rejoue alors sans le filtre plutôt que de
       laisser l'écran de recrutement vide — le filtre sur les professeurs supprimés ci-dessous,
       lui, fonctionne sans aucune migration. */
    if (error?.code === '42703') {
      const repli = await supabase.from('candidatures_formateurs').select('*').order('created_at', { ascending: false })
      brut = repli.data
      error = repli.error
    }
    if (error) throw new Error(error.message)

    /* Un formateur supprimé de HOC ne doit plus figurer dans le recrutement — demande client du
       2026-10-31, capture à l'appui : « si un professeur a été supprimé, il ne doit plus
       s'afficher. Définitivement. »

       Supprimer un professeur chez HOC pose `profiles.status = 'suspended'` et ne retire pas la
       ligne (sa candidature la référence, et la clé étrangère de 0082 n'a pas d'`on delete`).
       Tous les autres écrans écartent déjà `suspended` — useEtudiants, useAdmins, useContrats…
       Celui-ci était le seul à ne pas le faire, d'où un formateur supprimé encore compté parmi
       les « Formateurs intégrés ». Le filtre se fait ici, sur le profil lié, et pas sur la
       candidature elle-même : c'est bien la personne qui a été supprimée, pas sa candidature. */
    const tousProfIds = (brut ?? []).map((c) => c.professeur_id).filter((id): id is string => !!id)
    const { data: profilsActifs } = tousProfIds.length
      ? await supabase.from('profiles').select('id').in('id', tousProfIds).neq('status', 'suspended')
      : { data: [] as { id: string }[] }
    const actifs = new Set((profilsActifs ?? []).map((p) => p.id))
    const data = (brut ?? []).filter((c) => !c.professeur_id || actifs.has(c.professeur_id))

    const profIds = data.map((c) => c.professeur_id).filter((id): id is string => !!id)
    const { data: contrats } = profIds.length
      ? await supabase.from('contracts').select('destinataire_profile_id, statut').in('destinataire_profile_id', profIds)
      : { data: [] as { destinataire_profile_id: string; statut: string }[] }
    const signes = new Set((contrats ?? []).filter((c) => c.statut === 'signe').map((c) => c.destinataire_profile_id))
    const envoyes = new Set((contrats ?? []).map((c) => c.destinataire_profile_id))
    return {
      candidatures: data,
      contratSigne: (profId: string | null) => !!profId && signes.has(profId),
      contratEnvoye: (profId: string | null) => !!profId && envoyes.has(profId),
    }
  })
  return {
    candidatures: valeur?.candidatures ?? [],
    contratSigne: valeur?.contratSigne ?? (() => false),
    contratEnvoye: valeur?.contratEnvoye ?? (() => false),
    loading,
    erreur,
    recharger,
  }
}
