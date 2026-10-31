import { useEffect, useState } from 'react'
import type { AccentPalette } from '../../lib/accent'

/* Questionnaire écrit de positionnement, isolé ici le 2026-10-31 pour servir DEUX parcours
   publics : l'entrée en cours collectif (TestPositionnement.tsx, depuis le 2026-09-21) et, à la
   demande du client, l'appel diagnostic des cours individuels et duo (ReserverAppel.tsx) —
   « après le renseignement des informations personnelles du prospect, le prospect fasse un quiz
   écrit pour évaluer son niveau. Ce quiz est le même que ce que l'on a déjà pour les cours
   collectifs ».

   Tout ce qui fait la mécanique du questionnaire vit ici et nulle part ailleurs : le chronomètre,
   le sens unique de progression, la question laissée vide qui part quand même. Les deux parcours
   ne diffèrent que par ce qui vient APRÈS la dernière question, et c'est l'appelant qui le décide
   (`onTermine`, `libelleFin`).

   Les corrigés ne sont jamais chargés ici : l'API renvoie les énoncés seuls et corrige à l'envoi
   (voir api/prospects/test-positionnement, inscrire-test et reserver). */

export interface QuestionPublique {
  id: string
  ordre: number
  enonce: string
  options: string[]
}

/* Une réponse telle que l'attend la correction serveur (src/lib/quiz.ts). */
export interface ReponseQuiz {
  question_id: string
  choix: number | null
}

/* Compte à rebours par question — demande client du 2026-10-19 : « mettre un chronomètre de
   compte à rebours de 10 secondes pour chaque question, visible par l'utilisateur, pour toutes
   les questions. Si l'utilisateur ne répond pas dans les 10 secondes, on passera automatiquement
   à la prochaine question. »

   Trois conséquences, voulues :
   - « Précédent » disparaît. Revenir sur une question déjà chronométrée n'a plus de sens : soit
     le temps y est épuisé, soit il faudrait le relancer, ce qui offrirait dix secondes de plus à
     volonté. Le questionnaire avance désormais dans un seul sens.
   - une question laissée sans réponse part avec `choix: null` et compte comme fausse — c'est déjà
     ce que la correction côté serveur en fait (« sans réponse » dans le bilan, src/lib/quiz.ts),
     aucun changement nécessaire de ce côté.
   - l'envoi n'attend donc plus que TOUTES les questions soient répondues : la dernière écoulée
     déclenche la suite d'elle-même. Sans cela, un candidat ayant laissé filer une seule question
     n'aurait jamais pu valider sa réservation. */
export const SECONDES_PAR_QUESTION = 10

export function QuizPositionnement({
  questions,
  accent,
  libelleFin,
  onTermine,
}: {
  questions: QuestionPublique[]
  accent: AccentPalette
  /* Ce que promet le bouton de la dernière question : l'étape qui suit, qui n'est pas la même
     d'un parcours à l'autre. */
  libelleFin: string
  /* Appelé UNE fois, quand la dernière question est franchie — au clic comme à l'expiration du
     chronomètre. Les réponses y sont complètes : une question jamais affichée part avec `null`,
     comme une question affichée sans réponse. */
  onTermine: (reponses: ReponseQuiz[]) => void
}) {
  /* Questionnaire parcouru une question à la fois (demande client du 2026-10-13) : 67 questions
     empilées dans une fenêtre à défilement ne laissaient voir qu'une question et demie à la fois. */
  const [indexQuestion, setIndexQuestion] = useState(0)
  const [secondesRestantes, setSecondesRestantes] = useState(SECONDES_PAR_QUESTION)
  const [choix, setChoix] = useState<Record<string, number>>({})
  /* Le chronomètre de la dernière question et un clic sur le bouton peuvent tomber ensemble :
     sans ce garde-fou, l'appelant recevrait deux fois la fin du questionnaire — donc, côté
     individuel, deux réservations. */
  const [termine, setTermine] = useState(false)

  function terminer(dernierChoix: Record<string, number>) {
    if (termine) return
    setTermine(true)
    onTermine(questions.map((q) => ({ question_id: q.id, choix: dernierChoix[q.id] ?? null })))
  }

  /* Un tic par seconde. S'arrête de lui-même à zéro : c'est l'effet suivant qui décide alors
     d'avancer ou de terminer. Un `setTimeout` relancé à chaque seconde plutôt qu'un
     `setInterval` : le minuteur est ainsi suspendu dès que le questionnaire est fini, sans
     intervalle orphelin à nettoyer. */
  useEffect(() => {
    if (termine || secondesRestantes <= 0) return
    const minuteur = window.setTimeout(() => setSecondesRestantes((s) => s - 1), 1000)
    return () => window.clearTimeout(minuteur)
  }, [termine, secondesRestantes])

  /* Temps écoulé : question suivante, ou fin du questionnaire si c'était la dernière. */
  useEffect(() => {
    if (termine || secondesRestantes > 0 || questions.length === 0) return
    if (indexQuestion < questions.length - 1) {
      setIndexQuestion((i) => i + 1)
      setSecondesRestantes(SECONDES_PAR_QUESTION)
      return
    }
    terminer(choix)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termine, secondesRestantes, indexQuestion, questions.length])

  const question = questions[indexQuestion]
  if (!question) return null

  return (
    <QuestionnaireEtape
      question={question}
      index={indexQuestion}
      total={questions.length}
      accent={accent}
      secondesRestantes={secondesRestantes}
      choisi={choix[question.id]}
      onChoisir={(indexOption) => setChoix((c) => ({ ...c, [question.id]: indexOption }))}
      onSuivant={() => {
        setIndexQuestion((i) => Math.min(questions.length - 1, i + 1))
        setSecondesRestantes(SECONDES_PAR_QUESTION)
      }}
      onTerminer={() => terminer(choix)}
      libelleFin={libelleFin}
    />
  )
}

/* Les questions de compréhension répètent leur texte de support dans CHAQUE énoncé, sous la forme
   « Texte : « … »  Question : "…" » (0124) — un énoncé peut ainsi atteindre 1 200 caractères. Les
   séparer permet de présenter le texte comme un document à lire, dans un bloc à part et défilant,
   et de ne garder en titre que la question elle-même. Un énoncé court (la majorité) n'a pas de
   marqueur et passe tel quel. */
function decouperEnonce(enonce: string): { support: string | null; question: string } {
  const marque = enonce.indexOf('Question :')
  if (marque === -1) return { support: null, question: sansGuillemets(enonce) }
  const support = sansGuillemets(enonce.slice(0, marque).replace(/^\s*Texte\s*:\s*/i, ''))
  const question = sansGuillemets(enonce.slice(marque + 'Question :'.length))
  return { support: support || null, question: question || enonce }
}

/* Les guillemets d'enrobage viennent du document source ; une fois le texte dans son propre
   bloc, ils n'apportent plus rien et alourdissent la lecture. */
function sansGuillemets(texte: string): string {
  return texte.trim().replace(/^[«"“]\s*/, '').replace(/\s*[»"”]$/, '').trim()
}

function QuestionnaireEtape({
  question,
  index,
  total,
  accent,
  secondesRestantes,
  choisi,
  onChoisir,
  onSuivant,
  onTerminer,
  libelleFin,
}: {
  question: QuestionPublique
  index: number
  total: number
  accent: AccentPalette
  secondesRestantes: number
  choisi: number | undefined
  onChoisir: (indexOption: number) => void
  onSuivant: () => void
  /* La dernière question ne vaut plus envoi : elle conduit à l'étape suivante du parcours — le
     choix de la session en collectif (2026-10-29), la validation de la demande en individuel
     (2026-10-31). L'envoi et ses erreurs vivent donc chez l'appelant. */
  onTerminer: () => void
  libelleFin: string
}) {
  const { support, question: enonce } = decouperEnonce(question.enonce)
  const repondu = choisi !== undefined
  const derniere = index === total - 1
  const avancement = Math.round(((index + (repondu ? 1 : 0)) / total) * 100)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onTerminer()
      }}
      className="quiz-colonne"
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: accent.accent }}>
            Question {index + 1} <span style={{ color: 'var(--muted-2)', fontWeight: 600 }}>sur {total}</span>
          </span>
          <Chronometre secondesRestantes={secondesRestantes} accent={accent} />
        </div>
        <div style={{ height: 5, borderRadius: 999, background: 'var(--surface-alt)', overflow: 'hidden' }}>
          <div
            style={{
              width: `${avancement}%`,
              height: '100%',
              borderRadius: 999,
              background: accent.accentGrad,
              transition: 'width .45s cubic-bezier(.22,1,.36,1)',
            }}
          />
        </div>
      </div>

      {/* `key` sur la question : React remonte le bloc à chaque changement, ce qui rejoue
          l'animation d'entrée — sans elle, le contenu se remplacerait d'un coup, sans transition.
          Toujours `quiz-carte-avant` depuis le chronomètre (2026-10-19) : le questionnaire
          n'avance plus que dans un seul sens, l'entrée par la gauche n'a plus de cas d'usage. */}
      {/* Seule zone qui défile quand la fenêtre est courte : l'en-tête de progression ci-dessus et
          les boutons ci-dessous restent visibles en permanence. `minHeight` garantit qu'il reste
          toujours quelque chose à lire, même sur une fenêtre très basse. */}
      <div key={question.id} className="quiz-carte-avant" style={{ flex: 1, minHeight: 120, overflowY: 'auto', overflowX: 'hidden' }}>
        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {support && (
            /* Plafond exprimé en hauteur de FENÊTRE, pas en pourcentage : un `%` se réfère au
               bloc parent, qui n'a ici aucune hauteur définie — il était donc purement ignoré, et
               le texte continuait de reléguer les propositions sous le pli sur une fenêtre de
               620 px. Au-delà, le texte défile dans son propre bloc ; sur un grand écran il
               s'affiche en entier. */
            <div
              style={{
                maxHeight: 'clamp(70px, 13vh, 150px)',
                overflowY: 'auto',
                padding: '10px 12px',
                borderRadius: 11,
                border: `1px solid ${accent.accentBorder}`,
                background: 'var(--surface-alt)',
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--ink-2)',
              }}
            >
              {support}
            </div>
          )}
          <legend style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', padding: 0, lineHeight: 1.5 }}>{enonce}</legend>
          {question.options.map((option, indexOption) => {
            const coche = choisi === indexOption
            return (
              /* Pastille dessinée plutôt que le radio natif : dans la fenêtre claire de la
                 vitrine, celui du navigateur s'affiche en gros rond noir plein sur TOUTES les
                 propositions (y compris non choisies), ce qui brouille la lecture — signalé par
                 le client le 2026-10-13. Le radio reste présent, simplement masqué : le clavier,
                 les lecteurs d'écran et le groupage par `name` continuent de fonctionner, et
                 `.quiz-option` redessine un contour au focus clavier. */
              <label
                key={option}
                className="quiz-option"
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: `1px solid ${coche ? accent.accent : 'var(--border)'}`,
                  background: coche ? accent.accentSoft : 'transparent',
                  boxShadow: coche ? `0 8px 20px -14px ${accent.accentGlow}` : 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: coche ? 700 : 400,
                  color: coche ? 'var(--ink)' : 'var(--ink-2)',
                  transition: 'border-color .18s, background .18s, box-shadow .18s',
                  // Une proposition longue se coupe plutôt que d'élargir la fenêtre.
                  overflowWrap: 'anywhere',
                }}
              >
                <input
                  type="radio"
                  name={question.id}
                  checked={coche}
                  onChange={() => onChoisir(indexOption)}
                  style={{ position: 'absolute', opacity: 0, width: 1, height: 1, margin: 0, pointerEvents: 'none' }}
                />
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    width: 17,
                    height: 17,
                    borderRadius: 999,
                    border: `2px solid ${coche ? accent.accent : 'var(--border)'}`,
                    background: coche ? 'transparent' : 'var(--surface, #fff)',
                    display: 'grid',
                    placeItems: 'center',
                    transition: 'border-color .18s',
                  }}
                >
                  {coche && <span style={{ width: 9, height: 9, borderRadius: 999, background: accent.accent }} />}
                </span>
                {option}
              </label>
            )
          })}
        </fieldset>
      </div>

      {/* Plus de bouton « Précédent » : avec dix secondes par question, revenir en arrière
          reviendrait à s'offrir dix secondes de plus autant de fois qu'on le veut. Le seul bouton
          restant fait gagner du temps, il ne le rend pas — il passe à la suite sans attendre la
          fin du compte à rebours. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {derniere ? (
          <button
            type="submit"
            className="btn-shine"
            style={{
              flexGrow: 1,
              background: accent.accentGrad,
              color: accent.accentInk,
              padding: '13px 22px',
              fontSize: 14,
            }}
          >
            {libelleFin}
          </button>
        ) : (
          <button
            type="button"
            onClick={onSuivant}
            disabled={!repondu}
            className="btn-shine"
            style={{
              flexGrow: 1,
              background: accent.accentGrad,
              color: accent.accentInk,
              opacity: repondu ? 1 : 0.55,
              cursor: repondu ? 'pointer' : 'not-allowed',
              padding: '13px 22px',
              fontSize: 14,
            }}
          >
            {repondu ? 'Question suivante' : 'Choisissez une réponse'}
          </button>
        )}
      </div>
    </form>
  )
}

/* Compte à rebours de la question en cours. Un anneau qui se vide plutôt qu'un simple nombre :
   le temps restant doit se percevoir d'un coup d'œil sans quitter l'énoncé des yeux, et dix
   secondes passent trop vite pour qu'on relise un chiffre à chaque seconde. L'anneau passe au
   rouge sur les trois dernières, où le candidat doit décider immédiatement.

   `aria-live="off"` : un lecteur d'écran qui annoncerait chaque seconde couvrirait l'énoncé de la
   question. Le temps imparti se lit sur l'infobulle, une fois. */
function Chronometre({ secondesRestantes, accent }: { secondesRestantes: number; accent: AccentPalette }) {
  const part = Math.max(0, Math.min(1, secondesRestantes / SECONDES_PAR_QUESTION))
  const urgent = secondesRestantes <= 3
  const couleur = urgent ? 'var(--danger)' : accent.accent
  const taille = 34
  const rayon = (taille - 4) / 2
  const circonference = 2 * Math.PI * rayon

  return (
    <span
      aria-live="off"
      title={`${SECONDES_PAR_QUESTION} secondes par question`}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: taille, height: taille }}
    >
      <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} aria-hidden style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={taille / 2} cy={taille / 2} r={rayon} fill="none" stroke="var(--surface-alt)" strokeWidth={3} />
        <circle
          cx={taille / 2}
          cy={taille / 2}
          r={rayon}
          fill="none"
          stroke={couleur}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circonference}
          strokeDashoffset={circonference * (1 - part)}
          /* `linear` et non une courbe d'accélération : un compte à rebours doit se vider à
             vitesse constante, sinon il paraît ralentir puis s'emballer. */
          style={{ transition: 'stroke-dashoffset 1s linear, stroke .3s' }}
        />
      </svg>
      <span style={{ position: 'absolute', fontSize: 12, fontWeight: 800, color: couleur, fontVariantNumeric: 'tabular-nums' }}>
        {Math.max(0, secondesRestantes)}
      </span>
    </span>
  )
}

