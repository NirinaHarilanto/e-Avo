import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { Champ, champStyle } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { boutonNeutreStyle, boutonSecondaireStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

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
        style={{ ...(rapport ? boutonNeutreStyle : boutonSecondaireStyle), color: rapport ? 'var(--accent-teal)' : 'var(--accent-blue)', fontSize: 12.5, padding: '9px 16px' }}
      >
        <Icone nom={rapport ? 'valide' : 'plus'} taille={14} />
        {rapport ? 'Modifier le compte rendu' : 'Rédiger un compte rendu'}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted-2)', lineHeight: 1.5 }}>
        Ce compte rendu est visible par l’élève concerné et par l’administration de l’établissement.
      </p>
      <Champ label="Thèmes abordés" aide="Quelques mots-clés suffisent, séparés par des virgules.">
        <input value={themes} onChange={(e) => setThemes(e.target.value)} style={champStyle} />
      </Champ>
      <Champ label="Résumé" aide="Ce qui a été travaillé et ce qu’il reste à revoir.">
        <textarea
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          rows={3}
          style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </Champ>
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setOuvert(false)} style={{ ...boutonNeutreStyle, flexGrow: 1, fontSize: 12.5, padding: 9 }}>
          Annuler
        </button>
        <button onClick={enregistrer} disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, flexGrow: 1, fontSize: 12.5, padding: 9, opacity: enCours ? 0.6 : 1 }}>
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
