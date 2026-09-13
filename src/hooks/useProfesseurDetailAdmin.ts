import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type TeacherAssignment = Database['public']['Tables']['teacher_assignments']['Row']
type Package = Database['public']['Tables']['packages']['Row']

export interface EleveDuProfesseur {
  eleve: Profile
  affectation: TeacherAssignment
  /* Heures enseignées PAR CE professeur À CET élève — dérivé de sessions ⋈
     session_enrollments (statut terminée, présence), PAS de hour_ledger : les écritures
     credit_professeur n'y portent aucun student_id (voir 0011_hour_ledger.sql), elles ne
     permettent donc de connaître que le total toutes classes confondues. */
  heuresEnseignees: number
  packages: Package[]
}

export interface ProfesseurDetail {
  professeur: Profile
  eleves: EleveDuProfesseur[]
  heuresTotalEnseignees: number
}

export function useProfesseurDetailAdmin(teacherId: string | undefined) {
  const [detail, setDetail] = useState<ProfesseurDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    if (!teacherId) return
    setLoading(true)
    setErreur(null)

    const { data: professeur, error: professeurError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', teacherId)
      .single()
    if (professeurError || !professeur) {
      setErreur(professeurError?.message ?? 'Professeur introuvable.')
      setLoading(false)
      return
    }

    const { data: affectations } = await supabase
      .from('teacher_assignments')
      .select('*')
      .eq('teacher_id', teacherId)
      .is('date_fin', null)
      .order('date_debut', { ascending: false })

    const studentIds = [...new Set((affectations ?? []).map((a) => a.student_id))]

    const [{ data: eleveProfiles }, { data: packages }, { data: sessionsTerminees }] = await Promise.all([
      studentIds.length > 0 ? supabase.from('profiles').select('*').in('id', studentIds) : Promise.resolve({ data: [] as Profile[] }),
      studentIds.length > 0 ? supabase.from('packages').select('*').in('student_id', studentIds) : Promise.resolve({ data: [] as Package[] }),
      supabase.from('sessions').select('id, duree_minutes').eq('teacher_id', teacherId).eq('statut', 'terminee'),
    ])

    const eleveParId = new Map((eleveProfiles ?? []).map((e) => [e.id, e]))
    const packagesParEleve = new Map<string, Package[]>()
    for (const pkg of packages ?? []) {
      packagesParEleve.set(pkg.student_id, [...(packagesParEleve.get(pkg.student_id) ?? []), pkg])
    }

    const sessionIds = (sessionsTerminees ?? []).map((s) => s.id)
    const dureeParSession = new Map((sessionsTerminees ?? []).map((s) => [s.id, s.duree_minutes]))
    const heuresParEleve = new Map<string, number>()
    if (sessionIds.length > 0) {
      const { data: enrollments } = await supabase
        .from('session_enrollments')
        .select('session_id, student_id, present')
        .in('session_id', sessionIds)
        .eq('present', true)
      for (const enrollment of enrollments ?? []) {
        const duree = dureeParSession.get(enrollment.session_id) ?? 0
        heuresParEleve.set(enrollment.student_id, (heuresParEleve.get(enrollment.student_id) ?? 0) + duree / 60)
      }
    }

    const eleves: EleveDuProfesseur[] = (affectations ?? [])
      .map((affectation) => {
        const eleve = eleveParId.get(affectation.student_id)
        return eleve
          ? {
              eleve,
              affectation,
              heuresEnseignees: heuresParEleve.get(affectation.student_id) ?? 0,
              packages: packagesParEleve.get(affectation.student_id) ?? [],
            }
          : null
      })
      .filter((v): v is EleveDuProfesseur => v !== null)

    setDetail({
      professeur,
      eleves,
      heuresTotalEnseignees: [...heuresParEleve.values()].reduce((total, h) => total + h, 0),
    })
    setLoading(false)
  }, [teacherId])

  useEffect(() => {
    charger()
  }, [charger])

  return { detail, loading, erreur, recharger: charger }
}
