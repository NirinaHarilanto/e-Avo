import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import type { AccentPalette } from '../../lib/accent'
import { libelleVague } from '../../lib/cohortes'
import { fuseauDuVisiteur, libelleFuseau } from '../../lib/creneaux'
import { FUSEAU_ETABLISSEMENT } from '../../lib/etablissement'

/* Entrée en cours collectif : le candidat ne réserve pas un appel diagnostic mais une place au
   test oral d'une vague, et sa réservation n'est validée qu'une fois le questionnaire écrit
   rempli (demande client du 2026-09-21).

   ORDRE DES ÉTAPES INVERSÉ LE 2026-10-29, à la demande du client : coordonnées, questionnaire,
   puis session de test oral. Le parcours allait jusque-là du créneau au quiz, et la page
   publique annonçait désormais l'inverse — le niveau écrit se situe d'abord, la session se
   choisit ensuite.

   Deux conséquences, voulues :
   — la place n'est retenue qu'au tout dernier geste, donc le risque qu'un créneau se remplisse
     pendant les onze minutes de questionnaire disparaît : le candidat ne choisit que parmi les
     sessions encore ouvertes au moment où il valide ;
   — le garde-fou « aucune session ouverte » reste en tête de composant, avant toute saisie :
     personne ne répond à soixante-sept questions pour découvrir ensuite qu'il n'y a pas de
     session.

   Les corrigés ne sont jamais chargés ici : l'API renvoie les énoncés seuls et corrige à
   l'envoi (voir api/prospects/test-positionnement et inscrire-test). */

type Etape = 'coordonnees' | 'quiz' | 'creneau'

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
     déclenche l'envoi d'elle-même. Sans cela, un candidat ayant laissé filer une seule question
     n'aurait jamais pu valider sa réservation. */
const SECONDES_PAR_QUESTION = 10

interface QuestionPublique {
  id: string
  ordre: number
  enonce: string
  options: string[]
}

interface CreneauTest {
  id: string
  debut: string
  dureeMinutes: number
  vague: string
  langue: string | null
  placesRestantes: number | null
}

interface Confirmation {
  score: number
  total: number
  niveau: string
  quand: string
  vague: string
}

export function TestPositionnement({
  etablissementSlug,
  etablissementNom,
  accent,
  onPrefererContact,
  onConfirme,
  onEtapeChange,
}: {
  etablissementSlug: string
  etablissementNom: string
  accent: AccentPalette
  onPrefererContact?: () => void
  onConfirme?: () => void
  /* Permet à la page d'alléger ce qui l'entoure pendant le questionnaire (PageCours.tsx y masque
     son encadré « À savoir », devenu redondant une fois le quiz commencé) — chaque pixel rendu
     sert à faire tenir une question entière sans défilement. */
  onEtapeChange?: (etape: Etape) => void
}) {
  const [creneaux, setCreneaux] = useState<CreneauTest[]>([])
  const [questions, setQuestions] = useState<QuestionPublique[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreurChargement, setErreurChargement] = useState<string | null>(null)

  const [etape, setEtape] = useState<Etape>('coordonnees')
  const [creneauChoisi, setCreneauChoisi] = useState<CreneauTest | null>(null)
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [objectif, setObjectif] = useState('')
  const [consent, setConsent] = useState(false)
  const [choix, setChoix] = useState<Record<string, number>>({})
  /* Questionnaire parcouru une question à la fois (demande client du 2026-10-13) : 67 questions
     empilées dans une fenêtre à défilement ne laissaient voir qu'une question et demie à la fois.
     Il n'avance plus que dans un seul sens depuis l'ajout du chronomètre (2026-10-19) — voir
     SECONDES_PAR_QUESTION. */
  const [indexQuestion, setIndexQuestion] = useState(0)
  const [secondesRestantes, setSecondesRestantes] = useState(SECONDES_PAR_QUESTION)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  /* L'envoi final peut être déclenché par le chronomètre de la dernière question comme par le
     bouton : sans ce garde-fou, l'effet du compte à rebours et un clic simultané pourraient
     expédier deux inscriptions. */
  const envoiLance = useRef(false)

  const fuseau = useMemo(() => fuseauDuVisiteur(FUSEAU_ETABLISSEMENT), [])

  useEffect(() => {
    let annule = false
    fetch(`/api/prospects/test-positionnement?etablissement=${encodeURIComponent(etablissementSlug)}`)
      .then((r) => r.json())
      .then((reponse: { creneaux?: CreneauTest[]; questions?: QuestionPublique[]; error?: string }) => {
        if (annule) return
        if (reponse.error) setErreurChargement(reponse.error)
        else {
          setCreneaux(reponse.creneaux ?? [])
          setQuestions(reponse.questions ?? [])
        }
        setChargement(false)
      })
      .catch(() => {
        if (annule) return
        setErreurChargement('Les créneaux sont momentanément indisponibles.')
        setChargement(false)
      })
    return () => {
      annule = true
    }
  }, [etablissementSlug])

  useEffect(() => {
    onEtapeChange?.(etape)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etape])

  function formaterCreneau(debut: string): string {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, dateStyle: 'full', timeStyle: 'short' }).format(
      new Date(debut),
    )
  }

  /* Un tic par seconde pendant le questionnaire. S'arrête de lui-même à zéro : c'est l'effet
     suivant qui décide alors d'avancer ou d'envoyer. Un `setTimeout` relancé à chaque seconde
     plutôt qu'un `setInterval` : le minuteur est ainsi suspendu dès que l'envoi commence ou que
     la confirmation s'affiche, sans intervalle orphelin à nettoyer. */
  useEffect(() => {
    if (etape !== 'quiz' || envoi || confirmation || secondesRestantes <= 0) return
    const minuteur = window.setTimeout(() => setSecondesRestantes((s) => s - 1), 1000)
    return () => window.clearTimeout(minuteur)
  }, [etape, envoi, confirmation, secondesRestantes])

  /* Temps écoulé : on passe à la question suivante, ou on avance vers le choix de la session si
     c'était la dernière. Une question laissée sans réponse part avec `choix: null` et compte
     comme fausse. */
  useEffect(() => {
    if (etape !== 'quiz' || secondesRestantes > 0 || questions.length === 0) return
    if (indexQuestion < questions.length - 1) {
      setIndexQuestion((i) => i + 1)
      setSecondesRestantes(SECONDES_PAR_QUESTION)
      return
    }
    setEtape('creneau')
  }, [etape, secondesRestantes, indexQuestion, questions.length])

  async function envoyer(e?: FormEvent) {
    e?.preventDefault()
    /* Plus de condition sur les réponses manquantes : avec le chronomètre, une question peut
       légitimement rester vide, et l'exiger pleine empêcherait définitivement la validation. */
    if (!creneauChoisi || envoiLance.current) return
    envoiLance.current = true
    setEnvoi(true)
    setErreur(null)

    const reponse = await fetch('/api/prospects/inscrire-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        etablissementSlug,
        creneauId: creneauChoisi.id,
        nom,
        prenom,
        email,
        telephone,
        objectif,
        reponses: questions.map((q) => ({ question_id: q.id, choix: choix[q.id] ?? null })),
      }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Envoi impossible. Réessayez dans un instant.' }))

    setEnvoi(false)
    if (reponse.error) {
      // Rouvert : l'envoi a échoué (réseau, créneau complet entre-temps), le candidat doit
      // pouvoir réessayer depuis le bouton — ce garde-fou ne vise que le double envoi simultané.
      envoiLance.current = false
      setErreur(reponse.error)
      return
    }
    setConfirmation(reponse as Confirmation)
    onConfirme?.()
  }

  if (confirmation) {
    return (
      <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center' }}>
        <span
          aria-hidden
          style={{
            width: 46,
            height: 46,
            borderRadius: 999,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: accent.accentGrad,
            color: accent.accentInk,
            fontSize: 22,
          }}
        >
          ✓
        </span>
        <h3 style={{ fontSize: 20, margin: 0, color: 'var(--ink)' }}>Votre place est réservée</h3>
        <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--muted)', maxWidth: 460, margin: 0 }}>
          Vous avez obtenu <strong style={{ color: accent.accent }}>{confirmation.score}/{confirmation.total}</strong> au
          questionnaire écrit, soit un niveau estimé <strong style={{ color: accent.accent }}>{confirmation.niveau}</strong>.
          Ce résultat est indicatif : il sera confirmé lors du test oral du{' '}
          <strong>{confirmation.quand}</strong> ({libelleVague(confirmation.vague)}).
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0, maxWidth: 440 }}>
          {etablissementNom} vous envoie le lien de visioconférence à l’adresse {email} avant la séance.
        </p>
      </div>
    )
  }

  if (chargement) return <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>Chargement des créneaux…</p>
  if (erreurChargement) return <p style={{ fontSize: 13.5, color: 'var(--danger)' }}>{erreurChargement}</p>

  if (creneaux.length === 0) {
    return (
      <div style={{ padding: 18, borderRadius: 12, background: 'var(--surface-alt)', fontSize: 13.5, color: 'var(--muted)' }}>
        Aucune session de test n’est ouverte pour le moment.{' '}
        {onPrefererContact && (
          <button type="button" onClick={onPrefererContact} style={lienBouton(accent)}>
            Laissez-nous vos coordonnées
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className={etape === 'quiz' ? 'quiz-colonne' : undefined}
      style={{ display: 'flex', flexDirection: 'column', gap: etape === 'quiz' ? 11 : 16 }}
    >
      {/* Le rappel des trois étapes disparaît pendant le questionnaire : il ne dit plus rien que
          le compteur « Question N sur 67 » ne dise mieux, et chaque pixel repris sert à faire
          tenir une question entière dans la fenêtre sans défilement (demande client du
          2026-10-13, « le questionnaire n'est pas très visible »). */}
      {etape !== 'quiz' && <Progression etape={etape} accent={accent} />}

      {etape === 'creneau' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
            Dernière étape : choisissez la session de test oral qui vous arrange, puis validez.
          </p>
          {creneaux.map((creneau) => {
            const choisiCeCreneau = creneauChoisi?.id === creneau.id
            return (
              <button
                key={creneau.id}
                type="button"
                aria-pressed={choisiCeCreneau}
                onClick={() => setCreneauChoisi(creneau)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: 12,
                  /* Le créneau retenu se distingue à l'œil : il n'est plus validé par le clic
                     lui-même, c'est le bouton d'envoi ci-dessous qui engage. */
                  border: `1px solid ${choisiCeCreneau ? accent.accent : accent.accentBorder}`,
                  background: choisiCeCreneau ? accent.accentSoft : 'var(--surface-alt)',
                  boxShadow: choisiCeCreneau ? `0 10px 24px -14px ${accent.accentGlow}` : 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{formaterCreneau(creneau.debut)}</span>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {creneau.dureeMinutes} min · {libelleVague(creneau.vague)}
                  {creneau.placesRestantes !== null && ` · ${creneau.placesRestantes} place(s) restante(s)`}
                </span>
              </button>
            )
          })}
          <p style={{ fontSize: 11.5, color: 'var(--muted-2)', margin: 0 }}>
            Horaires affichés dans votre fuseau : {libelleFuseau(fuseau)}.
          </p>
          {erreur && <p style={{ fontSize: 13, color: 'var(--danger)', margin: 0 }}>{erreur}</p>}
          <button
            type="button"
            disabled={!creneauChoisi || envoi}
            onClick={() => void envoyer()}
            className="btn-shine"
            style={{
              background: accent.accentGrad,
              color: accent.accentInk,
              opacity: creneauChoisi && !envoi ? 1 : 0.6,
              cursor: creneauChoisi && !envoi ? 'pointer' : 'not-allowed',
              padding: '14px 24px',
              fontSize: 14.5,
            }}
          >
            {envoi ? 'Envoi…' : creneauChoisi ? 'Valider ma réservation' : 'Choisissez une session'}
          </button>
        </div>
      )}

      {etape === 'coordonnees' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setEtape('quiz')
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <Champ label="Prénom" obligatoire valeur={prenom} onChange={setPrenom} />
            <Champ label="Nom" obligatoire valeur={nom} onChange={setNom} />
            <Champ label="E-mail" obligatoire type="email" valeur={email} onChange={setEmail} placeholder="vous@exemple.fr" />
            <Champ label="Téléphone" valeur={telephone} onChange={setTelephone} placeholder="+261 ..." />
            <Champ label="Votre objectif" valeur={objectif} onChange={setObjectif} placeholder="Entretien, expatriation…" />
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color: 'var(--muted)' }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required style={{ marginTop: 2 }} />
            J’accepte d’être recontacté(e) au sujet de ma demande.
          </label>
          {/* Encadré plutôt qu'une ligne de texte gris : le candidat doit comprendre AVANT de
              commencer que le questionnaire ne suffit pas à retenir sa place (demande client du
              2026-09-23, transposée à l'ordre inversé du 2026-10-29). Dernier rappel aussi avant
              que le premier compte à rebours ne démarre : il se lance dès le clic ci-dessous. */}
          <p
            style={{
              margin: 0,
              padding: '11px 13px',
              borderRadius: 12,
              border: `1px solid ${accent.accentBorder}`,
              background: 'var(--surface-alt)',
              fontSize: 12.5,
              lineHeight: 1.6,
              color: 'var(--ink-2)',
            }}
          >
            <strong style={{ color: accent.accent }}>À savoir :</strong> votre place n’est réservée qu’à la toute fin.
            Vous répondez d’abord au questionnaire écrit, puis vous choisissez votre session de test oral — sans ce
            dernier choix, rien n’est retenu. Chaque question est{' '}
            <strong>chronométrée à {SECONDES_PAR_QUESTION} secondes</strong> : passé ce délai, la suivante s’affiche
            d’elle-même, sans retour en arrière. Installez-vous avant de commencer.
          </p>
          <button
            type="submit"
            disabled={!consent}
            className="btn-shine"
            style={{ background: accent.accentGrad, color: accent.accentInk, opacity: consent ? 1 : 0.6, padding: '14px 24px', fontSize: 14.5 }}
          >
            Commencer le questionnaire
          </button>
        </form>
      )}

      {etape === 'quiz' && questions[indexQuestion] && (
        <QuestionnaireEtape
          question={questions[indexQuestion]}
          index={indexQuestion}
          total={questions.length}
          accent={accent}
          secondesRestantes={secondesRestantes}
          choisi={choix[questions[indexQuestion].id]}
          onChoisir={(indexOption) => setChoix((c) => ({ ...c, [questions[indexQuestion].id]: indexOption }))}
          onSuivant={() => {
            setIndexQuestion((i) => Math.min(questions.length - 1, i + 1))
            setSecondesRestantes(SECONDES_PAR_QUESTION)
          }}
          onTerminer={() => setEtape('creneau')}
        />
      )}
    </div>
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
}: {
  question: QuestionPublique
  index: number
  total: number
  accent: AccentPalette
  secondesRestantes: number
  choisi: number | undefined
  onChoisir: (indexOption: number) => void
  onSuivant: () => void
  /* La dernière question ne vaut plus envoi : elle conduit au choix de la session, qui est
     désormais la dernière étape (2026-10-29). L'envoi et ses erreurs vivent donc là-bas. */
  onTerminer: () => void
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
            Choisir ma session de test oral
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

function Progression({ etape, accent }: { etape: Etape; accent: AccentPalette }) {
  /* Même ordre que le parcours réel depuis le 2026-10-29 : coordonnées, questionnaire, session. */
  const etapes: { cle: Etape; libelle: string }[] = [
    { cle: 'coordonnees', libelle: 'Coordonnées' },
    { cle: 'quiz', libelle: 'Questionnaire' },
    { cle: 'creneau', libelle: 'Session' },
  ]
  const indexActif = etapes.findIndex((e) => e.cle === etape)

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {etapes.map((e, index) => (
        <span
          key={e.cle}
          style={{
            flex: 1,
            fontSize: 11,
            fontWeight: 700,
            textAlign: 'center',
            padding: '6px 4px',
            borderRadius: 999,
            color: index <= indexActif ? accent.accentInk : 'var(--muted-2)',
            background: index <= indexActif ? accent.accentGrad : 'var(--surface-alt)',
          }}
        >
          {e.libelle}
        </span>
      ))}
    </div>
  )
}

const champStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '12px 14px',
  fontSize: 14,
  color: 'var(--ink)',
  background: 'var(--surface-alt)',
  width: '100%',
  fontFamily: 'inherit',
}

const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }

function lienBouton(accent: AccentPalette): CSSProperties {
  return {
    background: 'transparent',
    border: 'none',
    padding: 0,
    fontSize: 12.5,
    fontWeight: 700,
    color: accent.accent,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textDecoration: 'underline',
  }
}

function Champ({
  label,
  valeur,
  onChange,
  type = 'text',
  obligatoire,
  placeholder,
}: {
  label: string
  valeur: string
  onChange: (v: string) => void
  type?: string
  obligatoire?: boolean
  placeholder?: string
}) {
  /* Le champ est DANS son `<label>` : les deux étaient frères dans un `<div>`, sans `htmlFor`
     ni `id`, donc rien ne les reliait — un lecteur d'écran annonçait un champ sans nom, et
     cliquer l'intitulé ne donnait pas le focus. L'imbrication suffit à les lier, sans avoir à
     inventer des identifiants uniques. */
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelStyle}>
        {label} {obligatoire && <span style={{ color: 'var(--danger)' }}>*</span>}
      </span>
      <input
        type={type}
        required={obligatoire}
        value={valeur}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={champStyle}
      />
    </label>
  )
}
