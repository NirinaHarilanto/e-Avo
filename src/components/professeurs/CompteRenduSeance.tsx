import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'

type SessionReport = Database['public']['Tables']['session_reports']['Row']

interface CompteRenduSeanceProps {
  sessionId: string
  etablissementId: string
  teacherId: string
}

/* Compte rendu de séance : renseigné par le professeur après clôture, visible dans l'onglet
   Documents (admin) et dans l'espace de chaque élève ayant participé (RLS 0033). Une ligne
   session_reports par séance (contrainte unique sur session_id) — upsert plutôt que
   insert/update séparés pour ne pas avoir à savoir si un brouillon existe déjà. */
export function CompteRenduSeance({ sessionId, etablissementId, teacherId }: CompteRenduSeanceProps) {
  const [rapport, setRapport] = useState<SessionReport | null>(null)
  const [ouvert, setOuvert] = useState(false)
  const [themes, setThemes] = useState('')
  const [resume, setResume] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('session_reports')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle()
      .then(({ data }) => {
        setRapport(data)
        setThemes(data?.themes ?? '')
        setResume(data?.resume ?? '')
        setLoading(false)
      })
  }, [sessionId])

  async function enregistrer() {
    setEnCours(true)
    setErreur(null)
    const { data, error } = await supabase
      .from('session_reports')
      .upsert(
        { etablissement_id: etablissementId, session_id: sessionId, teacher_id: teacherId, themes: themes || null, resume: resume || null },
        { onConflict: 'session_id' },
      )
      .select()
      .single()
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setRapport(data)
    setOuvert(false)
  }

  if (loading) return null

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        style={{ fontSize: 12.5, padding: '9px 16px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: rapport ? 'var(--accent-teal)' : 'var(--accent-blue)', cursor: 'pointer' }}
      >
        {rapport ? 'Modifier le compte rendu' : 'Rédiger un compte rendu'}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Thèmes abordés</label>
        <input
          value={themes}
          onChange={(e) => setThemes(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Résumé</label>
        <textarea
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          rows={3}
          style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)', resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{erreur}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setOuvert(false)} style={{ flexGrow: 1, fontSize: 12.5, padding: 9, borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
          Annuler
        </button>
        <button onClick={enregistrer} disabled={enCours} className="btn-shine" style={{ flexGrow: 1, fontSize: 12.5, padding: 9, background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours ? 0.6 : 1 }}>
          Enregistrer
        </button>
      </div>
    </div>
  )
}
