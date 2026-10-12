import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import type { AccentPalette } from '../../lib/accent'
import { libelleVague } from '../../lib/cohortes'
import { fuseauDuVisiteur, libelleFuseau } from '../../lib/creneaux'
import { FUSEAU_ETABLISSEMENT } from '../../lib/etablissement'

/* Entrée en cours collectif : le candidat ne réserve pas un appel diagnostic mais une place au
   test oral d'une vague, et sa réservation n'est validée qu'une fois le questionnaire écrit
   rempli (demande client du 2026-09-21). D'où les trois étapes ci-dessous, franchies dans
   l'ordre : créneau, coordonnées, quiz.

   Les corrigés ne sont jamais chargés ici : l'API renvoie les énoncés seuls et corrige à
   l'envoi (voir api/prospects/test-positionnement et inscrire-test). */

type Etape = 'creneau' | 'coordonnees' | 'quiz'

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

  const [etape, setEtape] = useState<Etape>('creneau')
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
     `sens` ne sert qu'à l'animation — la carte entre par la droite quand on avance, par la gauche
     quand on revient, ce qui rend le déplacement lisible plutôt que brutal. */
  const [indexQuestion, setIndexQuestion] = useState(0)
  const [sens, setSens] = useState<'avant' | 'arriere'>('avant')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)

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

  const toutesRepondues = questions.length > 0 && questions.every((q) => choix[q.id] !== undefined)

  function formaterCreneau(debut: string): string {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, dateStyle: 'full', timeStyle: 'short' }).format(
      new Date(debut),
    )
  }

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    if (!creneauChoisi || !toutesRepondues) return
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
            Choisissez la session de test oral qui vous arrange.
          </p>
          {/* Encadré plutôt qu'une ligne de texte gris : le candidat doit comprendre AVANT de
              choisir son créneau que réserver ne suffit pas (demande client du 2026-09-23). */}
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
            <strong style={{ color: accent.accent }}>À savoir :</strong> votre demande n’est validée qu’une fois le
            questionnaire terminé. Après avoir choisi ce créneau, vous répondrez à un court quiz écrit — sans lui, la
            place n’est pas réservée.
          </p>
          {creneaux.map((creneau) => (
            <button
              key={creneau.id}
              type="button"
              onClick={() => {
                setCreneauChoisi(creneau)
                setEtape('coordonnees')
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 12,
                border: `1px solid ${accent.accentBorder}`,
                background: 'var(--surface-alt)',
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
          ))}
          <p style={{ fontSize: 11.5, color: 'var(--muted-2)', margin: 0 }}>
            Horaires affichés dans votre fuseau : {libelleFuseau(fuseau)}.
          </p>
        </div>
      )}

      {etape !== 'creneau' && creneauChoisi && (
        <button type="button" onClick={() => setEtape('creneau')} style={rappelCreneau(accent, etape === 'quiz')}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              aria-hidden
              style={{
                flexShrink: 0,
                width: 24,
                height: 24,
                borderRadius: 999,
                display: 'grid',
                placeItems: 'center',
                background: accent.accentGrad,
                color: accent.accentInk,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              ✓
            </span>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              Session choisie — <strong style={{ color: accent.accent }}>{formaterCreneau(creneauChoisi.debut)}</strong>
            </span>
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: accent.accent, whiteSpace: 'nowrap' }}>Changer ✕</span>
        </button>
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
          <button
            type="submit"
            disabled={!consent}
            className="btn-shine"
            style={{ background: accent.accentGrad, color: accent.accentInk, opacity: consent ? 1 : 0.6, padding: '14px 24px', fontSize: 14.5 }}
          >
            Passer au questionnaire
          </button>
        </form>
      )}

      {etape === 'quiz' && questions[indexQuestion] && (
        <QuestionnaireEtape
          question={questions[indexQuestion]}
          index={indexQuestion}
          total={questions.length}
          sens={sens}
          accent={accent}
          choisi={choix[questions[indexQuestion].id]}
          onChoisir={(indexOption) => setChoix((c) => ({ ...c, [questions[indexQuestion].id]: indexOption }))}
          onPrecedent={() => {
            setSens('arriere')
            setIndexQuestion((i) => Math.max(0, i - 1))
          }}
          onSuivant={() => {
            setSens('avant')
            setIndexQuestion((i) => Math.min(questions.length - 1, i + 1))
          }}
          onEnvoyer={envoyer}
          envoi={envoi}
          toutesRepondues={toutesRepondues}
          erreur={erreur}
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
  sens,
  accent,
  choisi,
  onChoisir,
  onPrecedent,
  onSuivant,
  onEnvoyer,
  envoi,
  toutesRepondues,
  erreur,
}: {
  question: QuestionPublique
  index: number
  total: number
  sens: 'avant' | 'arriere'
  accent: AccentPalette
  choisi: number | undefined
  onChoisir: (indexOption: number) => void
  onPrecedent: () => void
  onSuivant: () => void
  onEnvoyer: (e: FormEvent) => void
  envoi: boolean
  toutesRepondues: boolean
  erreur: string | null
}) {
  const { support, question: enonce } = decouperEnonce(question.enonce)
  const repondu = choisi !== undefined
  const derniere = index === total - 1
  const avancement = Math.round(((index + (repondu ? 1 : 0)) / total) * 100)

  return (
    <form onSubmit={onEnvoyer} className="quiz-colonne" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: accent.accent }}>
            Question {index + 1} <span style={{ color: 'var(--muted-2)', fontWeight: 600 }}>sur {total}</span>
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>Une seule bonne réponse</span>
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
          l'animation d'entrée — sans elle, le contenu se remplacerait d'un coup, sans transition. */}
      {/* Seule zone qui défile quand la fenêtre est courte : l'en-tête de progression ci-dessus et
          les boutons ci-dessous restent visibles en permanence. `minHeight` garantit qu'il reste
          toujours quelque chose à lire, même sur une fenêtre très basse. */}
      <div
        key={question.id}
        className={sens === 'avant' ? 'quiz-carte-avant' : 'quiz-carte-arriere'}
        style={{ flex: 1, minHeight: 120, overflowY: 'auto', overflowX: 'hidden' }}
      >
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

      {erreur && <p style={{ fontSize: 13, color: 'var(--danger)', margin: 0, flexShrink: 0 }}>{erreur}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onPrecedent}
          disabled={index === 0 || envoi}
          style={{
            padding: '11px 16px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: index === 0 ? 'var(--muted-2)' : 'var(--ink-2)',
            fontSize: 13,
            fontFamily: 'inherit',
            cursor: index === 0 || envoi ? 'not-allowed' : 'pointer',
            opacity: index === 0 ? 0.5 : 1,
          }}
        >
          ← Précédent
        </button>
        {derniere ? (
          <button
            type="submit"
            disabled={envoi || !toutesRepondues}
            className="btn-shine"
            style={{
              flexGrow: 1,
              background: accent.accentGrad,
              color: accent.accentInk,
              opacity: envoi || !toutesRepondues ? 0.6 : 1,
              cursor: envoi || !toutesRepondues ? 'not-allowed' : 'pointer',
              padding: '13px 22px',
              fontSize: 14,
            }}
          >
            {envoi ? 'Envoi…' : 'Valider ma réservation'}
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
            {repondu ? 'Valider et continuer →' : 'Choisissez une réponse'}
          </button>
        )}
      </div>
    </form>
  )
}

function Progression({ etape, accent }: { etape: Etape; accent: AccentPalette }) {
  const etapes: { cle: Etape; libelle: string }[] = [
    { cle: 'creneau', libelle: 'Session' },
    { cle: 'coordonnees', libelle: 'Coordonnées' },
    { cle: 'quiz', libelle: 'Questionnaire' },
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

/* Même traitement que le rappel de créneau de ReserverAppel.tsx (demande client du 2026-10-09,
   « plus attractive et joviale ») : fond teinté de l'accent, liseré gauche, légère lueur. */
function rappelCreneau(accent: AccentPalette, compact = false): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    // Ne se comprime jamais : c'est la zone des propositions qui absorbe le manque de place.
    flexShrink: 0,
    /* Resserré pendant le questionnaire : le créneau est déjà choisi, ce rappel n'est plus là que
       pour permettre d'en changer — la hauteur rendue sert à afficher la question entière. */
    padding: compact ? '8px 12px 8px 10px' : '12px 14px 12px 12px',
    borderRadius: 12,
    border: `1px solid ${accent.accentBorder}`,
    borderLeft: `4px solid ${accent.accent}`,
    background: accent.accentSoft,
    boxShadow: `0 10px 24px -14px ${accent.accentGlow}`,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={labelStyle}>
        {label} {obligatoire && <span style={{ color: 'var(--danger)' }}>*</span>}
      </label>
      <input
        type={type}
        required={obligatoire}
        value={valeur}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={champStyle}
      />
    </div>
  )
}
