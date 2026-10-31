import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { LigneInfo } from '../ui/Champ'
import { categorieDepuisNiveauEstime, COULEUR_NIVEAU_CLASSE } from '../../lib/classesCollectif'

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

  /* Score extrait de la première ligne du bilan rédigé par `redigerBilan` (lib/quiz.ts) : « Test
     de positionnement écrit : 13/50 — niveau estimé Beginner. » Par motif et non recalculé : les
     réponses elles-mêmes ne quittent jamais le serveur. */
  const premiereLigne = diagnostic?.notes?.split('\n')[0]?.trim() ?? null
  const score = premiereLigne?.match(/:\s*(\d+\s*\/\s*\d+)/)?.[1]?.replace(/\s+/g, '') ?? null
  const niveau = diagnostic?.niveau_evalue ?? null
  /* Repli sur l'accent ordinaire quand le niveau n'est pas reconnu : un dossier ancien peut
     porter une valeur saisie en texte libre, avant la liste déroulante et avant l'échelle unique
     (0153). Mieux vaut une pastille neutre qu'un niveau sans mise en valeur. */
  const categorie = categorieDepuisNiveauEstime(niveau)
  const couleurNiveau = categorie ? COULEUR_NIVEAU_CLASSE[categorie] : 'var(--accent-blue)'
  if (!diagnostic || (!score && !niveau)) return null

  return (
    /* Repris le 2026-10-31 — demande client, capture à l'appui : « les informations [...] ne
       sont pas très visibles, il faut bien organiser visuellement les infos » avec le plan
       exact qu'il a dicté (un titre, le résultat sur sa ligne, le niveau sur la sienne). Le
       résumé compact d'une seule phrase avec une pastille « Niveau provisoire » accolée est
       remplacé par un petit encadré à deux lignes nommées — même mécanique d'intitulé-puis-valeur
       que partout ailleurs dans l'application (`LigneInfo`, voir ui/Champ.tsx), pour que ce bloc
       se lise comme le reste d'une fiche plutôt que comme une note à part. */
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '11px 13px',
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--surface-alt)',
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: 3,
        }}
      >
        Test de niveau (quiz écrit)
      </span>
      {/* Intitulés volontairement en retrait, valeurs en avant — demande client du 2026-10-31 :
          « mets les intitulés [...] différents des valeurs ». L'étiquette garde donc le gris
          discret de `LigneInfo`, et c'est la valeur qui porte le gras et la couleur. L'ancienne
          version faisait l'inverse pour le niveau (intitulé en accent, valeur en gris), ce qui
          mettait en avant le mot « Niveau » plutôt que le niveau lui-même. */}
      {score && <LigneInfo collee label="Résultat" valeur={<strong style={{ color: 'var(--ink)' }}>{score}</strong>} />}
      {niveau && (
        <LigneInfo
          collee
          label="Niveau estimé provisoire"
          valeur={
            /* Pastille au CODE COULEUR DES NIVEAUX déjà en place (Beginner, Intermediate,
               Advanced — demande client du 2026-10-30, `COULEUR_NIVEAU_CLASSE`), dessinée comme
               celle des classes dans Cours collectifs : même teinte, même fond à 16 %, même
               liseré à 42 %. Réutilisée plutôt qu'une couleur inventée pour ce seul bloc — un
               niveau porte la même couleur partout dans l'application, et c'est ce qui le rend
               reconnaissable d'un coup d'œil. */
            <span
              style={{
                display: 'inline-block',
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 0.2,
                color: couleurNiveau,
                background: `color-mix(in srgb, ${couleurNiveau} 16%, transparent)`,
                border: `1px solid color-mix(in srgb, ${couleurNiveau} 42%, transparent)`,
                borderRadius: 999,
                padding: '2px 10px',
              }}
            >
              {niveau}
            </span>
          }
        />
      )}
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
              marginTop: 4,
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
