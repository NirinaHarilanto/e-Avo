import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

export interface LigneHeures {
  profile: Profile
  heures: number
}

/* Agrège les vues déjà existantes student_hours_summary/teacher_hours_summary (créées en
   Phase Cœur pédagogique) sur l'ensemble des étudiants/professeurs de l'établissement —
   aucune nouvelle table, seulement une lecture globale là où elle n'était affichée jusqu'ici
   qu'entité par entité (dossier étudiant, carte professeur). */
export function useHeuresAdmin() {
  const [etudiants, setEtudiants] = useState<LigneHeures[]>([])
  const [professeurs, setProfesseurs] = useState<LigneHeures[]>([])
  const [loading, setLoading] = useState(true)

  const charger = useCallback(async () => {
    setLoading(true)

    const [{ data: profilsEtudiants }, { data: profilsProfs }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'etudiant').order('nom'),
      supabase.from('profiles').select('*').eq('role', 'professeur').order('nom'),
    ])

    const studentIds = (profilsEtudiants ?? []).map((p) => p.id)
    const teacherIds = (profilsProfs ?? []).map((p) => p.id)

    const [{ data: heuresEtudiants }, { data: heuresProfs }] = await Promise.all([
      studentIds.length ? supabase.from('student_hours_summary').select('*').in('student_id', studentIds) : Promise.resolve({ data: [] as { student_id: string; heures_consommees: number }[] }),
      teacherIds.length ? supabase.from('teacher_hours_summary').select('*').in('teacher_id', teacherIds) : Promise.resolve({ data: [] as { teacher_id: string; heures_enseignees: number }[] }),
    ])

    const heuresEtudiantParId = new Map((heuresEtudiants ?? []).map((h) => [h.student_id, h.heures_consommees]))
    const heuresProfParId = new Map((heuresProfs ?? []).map((h) => [h.teacher_id, h.heures_enseignees]))

    setEtudiants((profilsEtudiants ?? []).map((p) => ({ profile: p, heures: heuresEtudiantParId.get(p.id) ?? 0 })))
    setProfesseurs((profilsProfs ?? []).map((p) => ({ profile: p, heures: heuresProfParId.get(p.id) ?? 0 })))
    setLoading(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  return { etudiants, professeurs, loading, recharger: charger }
}
