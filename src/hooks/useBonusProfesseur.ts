import { supabase } from '../lib/supabaseClient'
import { useCacheRequete } from './useCacheRequete'

/* Les bonus du professeur CONNECTÉ, pour son propre écran « Mes heures » (0162, demande client
   du 2026-11-18 : « est-ce que tu as rajouté le bloc Bonus du côté espace professeurs, en mode
   lecture uniquement ? »). La RLS (`bonus_professeur_professeur_select`, migration 0162) borne
   déjà la lecture à `teacher_id = auth.uid()` — ce hook ne fait que l'appeler, sans filtre côté
   client : impossible pour un professeur de lire ceux d'un collègue, même en modifiant la
   requête depuis le navigateur. */
export function useBonusProfesseur(teacherId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(teacherId && `bonus-professeur-${teacherId}`, async () => {
    const { data, error } = await supabase
      .from('bonus_professeur')
      .select('*')
      .eq('teacher_id', teacherId as string)
      .order('accorde_le', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  })
  return { bonus: valeur ?? [], loading, erreur, recharger }
}
