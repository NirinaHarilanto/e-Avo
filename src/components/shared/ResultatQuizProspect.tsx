import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

/* Résultat du quiz écrit d'un prospect, affiché là où l'admin décide de sa demande — précision
   client du 2026-10-31 : « l'admin verra également son résultat du quiz et son niveau provisoire
   écrit ». Repris le 2026-10-31 pour un second écran (le pop-up du pipeline, « Voir le résultat du
   quiz avec son niveau provisoire ») : capture à l'appui, un prospect encore « Appel diagnostic
   planifié » n'affichait ni score ni niveau, alors que les deux sont connus dès sa réservation.

   Le parcours individuel se termine désormais par le questionnaire (créneau → informations →
   quiz → demande enregistrée). Ce qu'il en reste est une ligne `diagnostic_calls` portant le
   niveau estimé et le bilan détaillé, écrite par api/prospects/reserver.ts — exactement comme le
   fait le parcours collectif depuis 0091.

   Provisoire, et dit comme tel : au clic sur « Marquer le diagnostic comme fait »
   (PipelineCRM.tsx, `marquerRealise`), `niveau_evalue` est RÉÉCRIT par l'évaluation que l'admin
   porte pendant l'appel — ce bloc ne doit donc plus s'afficher une fois le statut passé à
   « diagnostic_fait » : son `niveau_evalue` n'est alors plus celui du quiz. */

export interface DiagnosticAvecBilan {
  niveau_evalue: string | null
  notes: string | null
}

/* Partie purement présentationnelle, sans requête : réutilisable par un écran qui a DÉJÀ chargé
   la ligne `diagnostic_calls` en mémoire (le pipeline charge tous les diagnostics d'un coup pour
   construire ses cartes, voir useProspectsPipeline.ts) — lui refaire demander la même ligne au
   clic sur une fiche serait un aller-retour réseau superflu. */
export function BlocResultatQuiz({ diagnostic }: { diagnostic: DiagnosticAvecBilan | null }) {
  const [detailOuvert, setDetailOuvert] = useState(false)

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

/* Variante qui va chercher elle-même la ligne — pour un écran qui n'a QUE l'identifiant du
   prospect (la carte d'un rendez-vous, voir shared/PopupEvenementAdmin.tsx), sans le reste du
   dossier en mémoire. */
export function ResultatQuizProspect({ prospectId }: { prospectId: string }) {
  const [diagnostic, setDiagnostic] = useState<DiagnosticAvecBilan | null>(null)

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

  return <BlocResultatQuiz diagnostic={diagnostic} />
}
