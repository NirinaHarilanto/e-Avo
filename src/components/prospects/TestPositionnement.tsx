import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import type { AccentPalette } from '../../lib/accent'
import { libelleVague } from '../../lib/cohortes'
import { fuseauDuVisiteur, libelleFuseau } from '../../lib/creneaux'
import { FUSEAU_ETABLISSEMENT } from '../../lib/etablissement'
import { QuizPositionnement, SECONDES_PAR_QUESTION, type QuestionPublique, type ReponseQuiz } from './QuizPositionnement'

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
  /* Réponses rendues par le questionnaire une fois celui-ci terminé (QuizPositionnement.tsx) :
     il porte lui-même l'avancement et le chronomètre, on n'en garde ici que le résultat, qui
     part avec l'inscription à l'étape suivante. */
  const [reponses, setReponses] = useState<ReponseQuiz[]>([])
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
        reponses,
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

      {etape === 'quiz' && (
        <QuizPositionnement
          questions={questions}
          accent={accent}
          libelleFin="Choisir ma session de test oral"
          onTermine={(resultat) => {
            setReponses(resultat)
            setEtape('creneau')
          }}
        />
      )}
    </div>
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
