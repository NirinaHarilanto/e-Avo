import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import type { AccentPalette } from '../../lib/accent'
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
}: {
  etablissementSlug: string
  etablissementNom: string
  accent: AccentPalette
  onPrefererContact?: () => void
  onConfirme?: () => void
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
          <strong>{confirmation.quand}</strong> (vague {confirmation.vague}).
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Progression etape={etape} accent={accent} />

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
                {creneau.dureeMinutes} min · vague {creneau.vague}
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
        <button type="button" onClick={() => setEtape('creneau')} style={rappelCreneau(accent)}>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            Session choisie : <strong style={{ color: accent.accent }}>{formaterCreneau(creneauChoisi.debut)}</strong>
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

      {etape === 'quiz' && (
        <form onSubmit={envoyer} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
            {questions.length} questions, une seule bonne réponse à chaque fois. Répondez sans aide extérieure : ce test
            sert à vous placer dans le bon groupe, pas à vous juger. Votre réservation ne sera validée qu’une fois les{' '}
            {questions.length} questions répondues et le questionnaire envoyé.
          </p>

          {questions.map((question, index) => (
            <fieldset key={question.id} style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <legend style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', padding: 0, marginBottom: 4 }}>
                {index + 1}. {question.enonce}
              </legend>
              {question.options.map((option, indexOption) => {
                const coche = choix[question.id] === indexOption
                return (
                  <label
                    key={option}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 9,
                      padding: '9px 12px',
                      borderRadius: 10,
                      border: `1px solid ${coche ? accent.accentBorder : 'var(--border)'}`,
                      background: coche ? 'var(--surface-alt)' : 'transparent',
                      cursor: 'pointer',
                      fontSize: 13,
                      color: 'var(--ink-2)',
                      // Une proposition longue se coupe plutôt que d'élargir la fenêtre.
                      overflowWrap: 'anywhere',
                    }}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      checked={coche}
                      onChange={() => setChoix((c) => ({ ...c, [question.id]: indexOption }))}
                      style={{ marginTop: 2 }}
                    />
                    {option}
                  </label>
                )
              })}
            </fieldset>
          ))}

          {erreur && <p style={{ fontSize: 13, color: 'var(--danger)', margin: 0 }}>{erreur}</p>}

          <button
            type="submit"
            disabled={envoi || !toutesRepondues}
            className="btn-shine"
            style={{
              background: accent.accentGrad,
              color: accent.accentInk,
              opacity: envoi || !toutesRepondues ? 0.6 : 1,
              cursor: envoi || !toutesRepondues ? 'not-allowed' : 'pointer',
              padding: '14px 24px',
              fontSize: 14.5,
            }}
          >
            {envoi ? 'Envoi…' : toutesRepondues ? 'Valider ma réservation' : `Répondez aux ${questions.length} questions`}
          </button>
        </form>
      )}
    </div>
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

function rappelCreneau(accent: AccentPalette): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '12px 14px',
    borderRadius: 10,
    border: `1px solid ${accent.accentBorder}`,
    background: 'var(--surface-alt)',
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
