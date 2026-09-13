import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type SessionReport = Database['public']['Tables']['session_reports']['Row']
type Session = Database['public']['Tables']['sessions']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export interface CompteRenduComplet {
  rapport: SessionReport
  session: Session | null
  professeur: Profile | null
  participants: Profile[]
}

/* Comptes rendus de cours — RLS (0033) filtre déjà selon qui regarde (admin de
   l'établissement, professeur auteur, ou étudiant ayant participé à la séance) : une seule
   requête `select *` suffit, pas besoin de la scoper explicitement ici. */
export function useSessionReports() {
  const [comptesRendus, setComptesRendus] = useState<CompteRenduComplet[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setLoading(true)
    setErreur(null)

    const { data: rapports, error } = await supabase.from('session_reports').select('*').order('created_at', { ascending: false })
    if (error) {
      setErreur(error.message)
      setLoading(false)
      return
    }

    const sessionIds = [...new Set((rapports ?? []).map((r) => r.session_id))]
    const [{ data: sessions }, { data: enrollments }] = await Promise.all([
      sessionIds.length ? supabase.from('sessions').select('*').in('id', sessionIds) : Promise.resolve({ data: [] as Session[] }),
      sessionIds.length
        ? supabase.from('session_enrollments').select('session_id, student_id').in('session_id', sessionIds)
        : Promise.resolve({ data: [] as { session_id: string; student_id: string }[] }),
    ])
    const sessionParId = new Map((sessions ?? []).map((s) => [s.id, s]))

    const profileIds = [
      ...new Set([...(rapports ?? []).map((r) => r.teacher_id), ...(enrollments ?? []).map((e) => e.student_id)]),
    ]
    const { data: profils } = profileIds.length
      ? await supabase.from('profiles').select('*').in('id', profileIds)
      : { data: [] as Profile[] }
    const profilParId = new Map((profils ?? []).map((p) => [p.id, p]))

    setComptesRendus(
      (rapports ?? []).map((rapport) => ({
        rapport,
        session: sessionParId.get(rapport.session_id) ?? null,
        professeur: profilParId.get(rapport.teacher_id) ?? null,
        participants: (enrollments ?? [])
          .filter((e) => e.session_id === rapport.session_id)
          .map((e) => profilParId.get(e.student_id))
          .filter((p): p is Profile => !!p),
      })),
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  return { comptesRendus, loading, erreur, recharger: charger }
}
