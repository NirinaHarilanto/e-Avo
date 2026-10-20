import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

export type PrestationExterne = Database['public']['Tables']['prestations_externes']['Row']

/* Prestations corporate et chat & chill d'un professeur (0131, demande client du 2026-10-19).

   Un seul hook pour les deux espaces : c'est la RLS qui décide de ce qui remonte — l'admin voit
   celles de tout l'établissement, le professeur uniquement les siennes. L'écran professeur passe
   donc son propre identifiant et obtient exactement la même liste que celle que l'admin voit sur
   sa fiche.

   Les plus récentes d'abord : une prestation à venir ou tout juste donnée est ce qu'on vient
   consulter ; l'historique se déroule en dessous. */
export function usePrestationsExternes(teacherId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(
    teacherId && `prestations-externes-${teacherId}`,
    async () => {
      const { data, error } = await supabase
        .from('prestations_externes')
        .select('*')
        .eq('teacher_id', teacherId as string)
        .order('debut', { ascending: false })
      if (error) throw new Error(error.message)
      return data ?? []
    },
  )

  return { prestations: valeur ?? [], loading, erreur, recharger }
}

/* Toutes les prestations de l'établissement, pour l'agenda de l'administration (Séances & visio)
   — demande client du 2026-10-20 : « pourquoi les deux agendas ne sont pas synchronisés ». Un
   cours corporate visible dans l'agenda du professeur n'apparaissait nulle part côté admin,
   faute d'être chargé ici.

   La RLS (`prestations_externes_admin_all`, 0131) borne déjà le résultat à l'établissement de
   l'admin : rien à filtrer de plus côté client. Clé de cache distincte de celle par professeur
   ci-dessus, les deux listes n'ayant ni la même portée ni les mêmes écrans. */
export function usePrestationsExternesEtablissement() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('prestations-externes-etablissement', async () => {
    const { data, error } = await supabase.from('prestations_externes').select('*').order('debut', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  })

  return { prestations: valeur ?? [], loading, erreur, recharger }
}
