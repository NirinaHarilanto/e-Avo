import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

export type JalonParcoursLigne = Database['public']['Tables']['jalons_parcours']['Row']

/* Jalons de parcours d'un élève : les deux enquêtes de satisfaction demandées le 2026-10-19
   (mi-parcours et 3 h avant la fin), avec la réponse quand elle a été donnée.

   Un seul hook pour les trois espaces : c'est la RLS qui décide de ce qui revient (0130) —
   l'élève voit les siens, l'admin tous ceux de l'établissement, le professeur ceux de ses élèves.
   `studentId` à `undefined` suspend la requête. */
export function useJalonsParcours(studentId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(
    studentId && `jalons-parcours-${studentId}`,
    async () => {
      const { data, error } = await supabase
        .from('jalons_parcours')
        .select('*')
        .eq('student_id', studentId as string)
        .order('declenche_le', { ascending: false })
      if (error) throw new Error(error.message)
      return data ?? []
    },
  )

  return { jalons: valeur ?? [], loading, erreur, recharger }
}

/* Enregistre la réponse de l'élève. Écrit directement dans la table — pas d'endpoint dédié : la
   policy `jalons_parcours_eleve_update` porte déjà toutes les règles (c'est bien son jalon, et il
   n'a pas déjà répondu), exactement comme le faisait l'enquête par séance avant elle. */
export async function repondreAuJalon(
  jalonId: string,
  reponse: { noteGlobale: number; notePedagogie: number | null; commentaire: string | null },
): Promise<{ erreur: string | null }> {
  const { error } = await supabase
    .from('jalons_parcours')
    .update({
      note_globale: reponse.noteGlobale,
      note_pedagogie: reponse.notePedagogie,
      commentaire: reponse.commentaire,
      repondu_le: new Date().toISOString(),
    })
    .eq('id', jalonId)
  return { erreur: error?.message ?? null }
}
