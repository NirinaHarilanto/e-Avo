import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

/* Résultat du quiz écrit d'un prospect, affiché là où l'admin décide de sa demande — précision
   client du 2026-10-31 : « l'admin verra également son résultat du quiz et son niveau provisoire
   écrit ».
   Le parcours individuel se termine désormais par le questionnaire (créneau → informations →
   quiz → demande enregistrée). Ce qu'il en reste est une ligne `diagnostic_calls` portant le
   niveau estimé et le bilan détaillé, écrite par api/prospects/reserver.ts — exactement comme le
   fait le parcours collectif depuis 0091.

   Provisoire, et dit comme tel : le niveau définitif est celui que l'admin arrête APRÈS l'appel,
   en corrigeant cette même ligne. C'est la règle de `niveauDefinitif` (lib/niveauEtudiant.ts), et
   l'étiquette « provisoire » est là pour qu'on ne la confonde pas. */
export function ResultatQuizProspect({ prospectId }: { prospectId: string }) {
  const [diagnostic, setDiagnostic] = useState<{ niveau_evalue: string | null; notes: string | null } | null>(null)
  const [detailOuvert, setDetailOuvert] = useState(false)

  useEffect(() => {
    let annule = false
    supabase
      .from('diagnostic_calls')
      .select('niveau_evalue, notes')
      .eq('prospect_id', prospectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!annule) setDiagnostic(data ?? null)
      })
    return () => {
      annule = true
    }
  }, [prospectId])

  /* Le score est la première ligne du bilan rédigé par `redigerBilan` (lib/quiz.ts) : « Test de
     positionnement écrit : 12/20 — niveau estimé B1. » On la relit telle quelle plutôt que de
     recalculer un score à partir des réponses, qui ne quittent jamais le serveur. */
  const resume = diagnostic?.notes?.split('\n')[0]?.trim() ?? null
  if (!diagnostic || (!resume && !diagnostic.niveau_evalue)) return null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '9px 11px',
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--voile, rgba(255,255,255,.06))',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--ink-2)' }}>
        {resume ?? `Test de positionnement écrit — niveau estimé ${diagnostic.niveau_evalue}.`}
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: 'var(--muted)',
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '2px 8px',
          }}
        >
          Niveau provisoire
        </span>
      </span>
      {diagnostic.notes && diagnostic.notes.includes('\n') && (
        <>
          <button
            type="button"
            onClick={() => setDetailOuvert((v) => !v)}
            style={{
              alignSelf: 'flex-start',
              background: 'transparent',
              border: 'none',
              padding: 0,
              fontSize: 11.5,
              fontWeight: 700,
              color: 'var(--accent-blue)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {detailOuvert ? 'Masquer le détail' : 'Voir le détail des réponses'}
          </button>
          {detailOuvert && (
            <pre
              style={{
                margin: 0,
                maxHeight: 220,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                fontSize: 11.5,
                lineHeight: 1.6,
                color: 'var(--muted)',
              }}
            >
              {diagnostic.notes}
            </pre>
          )}
        </>
      )}
    </div>
  )
}
