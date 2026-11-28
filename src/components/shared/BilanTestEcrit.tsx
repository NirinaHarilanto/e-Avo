import { useState } from 'react'

/* Résultat du test de positionnement ÉCRIT d'un candidat collectif : le score, le niveau estimé,
   et le bilan détaillé replié.

   Vivait dans PipelineCRM.tsx, d'où il servait la fiche d'un prospect. Sorti ici le 2026-11-28
   sur demande du client, capture à l'appui : « il faudrait afficher également dans le pop-up les
   détails des résultats du quiz du prospect en cours collectifs, en mode plier/déplier, par
   défaut plié » — le pop-up en question étant la fiche d'un candidat de Cours collectifs
   (`FicheCandidatCollectifModale`), qui n'affichait jusque-là que le niveau, sans le score ni le
   bilan. Les deux écrans montrent désormais le même bloc plutôt que deux variantes qui
   finiraient par diverger.

   REPLIÉ PAR DÉFAUT, et c'est volontaire au-delà de la demande : le bilan fait une cinquantaine
   de lignes (une par question), il noierait une fiche qui tient en un écran. */

/** Les seules colonnes lues de `test_positionnement_inscriptions` : les deux écrans appelants
 *  passent la ligne entière, qui en porte bien davantage. */
export interface TestEcrit {
  score: number
  total: number
  niveau_estime: string | null
  bilan: string | null
}

export function BilanTestEcrit({ test }: { test: TestEcrit }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        borderRadius: 14,
        border: '1px solid var(--border)',
        background: 'var(--hoc-pastille, rgba(169,140,255,.08))',
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: 'var(--accent-blue)',
            flexGrow: 1,
          }}
        >
          Test de positionnement écrit
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
          {test.score}/{test.total}
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)' }}>
          {test.niveau_estime ?? 'Non évalué'}
        </span>
      </div>
      {test.bilan && (
        <>
          <button
            type="button"
            onClick={() => setOuvert((v) => !v)}
            style={{
              alignSelf: 'flex-start',
              background: 'transparent',
              border: 'none',
              padding: 0,
              fontSize: 11.5,
              fontWeight: 700,
              color: 'var(--accent-blue)',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontFamily: 'inherit',
            }}
          >
            {ouvert ? 'Masquer le bilan' : 'Voir le bilan détaillé'}
          </button>
          {ouvert && (
            /* Hauteur bornée et défilement propre : dans une fiche déjà longue, un bilan de
               cinquante lignes déplié repousserait les boutons d'action hors de l'écran. */
            <pre
              style={{
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--ink-2)',
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                margin: 0,
                maxHeight: 260,
                overflowY: 'auto',
              }}
            >
              {test.bilan}
            </pre>
          )}
        </>
      )}
    </div>
  )
}
