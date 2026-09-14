import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type NiveauEvaluation = Database['public']['Tables']['niveau_evaluations']['Row']

export function useNiveauxEtudiant(studentId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(studentId && `niveaux-etudiant-${studentId}`, async () => {
    const { data, error } = await supabase
      .from('niveau_evaluations')
      .select('*')
      .eq('student_id', studentId as string)
      .order('date_evaluation', { ascending: true })
    if (error) throw new Error(error.message)
    return data ?? []
  })

  return { evaluations: valeur ?? ([] as NiveauEvaluation[]), loading, erreur, recharger }
}
