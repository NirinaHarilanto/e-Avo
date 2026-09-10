import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { AccentPalette } from '../../lib/accent'
import type { TypeProgrammeProspect } from '../../types/database.types'

const PROGRAMMES_CHOIX: { valeur: TypeProgrammeProspect; label: string }[] = [
  { valeur: 'individuel', label: 'Individuel' },
  { valeur: 'duo', label: 'Duo' },
  { valeur: 'collectif', label: 'Collectif' },
]

interface FormulaireProspectProps {
  etablissementId: string
  etablissementNom: string
  accent: AccentPalette
  // Programme présélectionné (carte cliquée sur la landing) ; l'utilisateur reste libre de le
  // changer via le sélecteur ci-dessous — individuel/duo mènent à un appel diagnostic,
  // collectif à un test de positionnement (même formulaire, seul le libellé change).
  typeInitial?: TypeProgrammeProspect
  // Renseigné par l'admin depuis /admin/parametres. Quand présent, la soumission du formulaire
  // enregistre le prospect, ouvre ce lien dans un nouvel onglet, ET affiche une question de
  // confirmation sur la page (voir ModaleConfirmationCalendly) — sans lien configuré, on
  // retombe sur le message "on vous recontacte".
  calendlyUrl?: string | null
}

const champStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '12px 14px',
  fontSize: 14,
  color: 'var(--ink)',
  background: 'rgba(0,0,0,.22)',
  width: '100%',
  fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }

export function FormulaireProspect({ etablissementId, etablissementNom, accent, typeInitial = 'individuel', calendlyUrl }: FormulaireProspectProps) {
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [langueVisee, setLangueVisee] = useState('')
  const [objectif, setObjectif] = useState('')
  const [typeProgramme, setTypeProgramme] = useState<TypeProgrammeProspect>(typeInitial)
  const [accepte, setAccepte] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoye, setEnvoye] = useState(false)
  const [prospectIdEnAttente, setProspectIdEnAttente] = useState<string | null>(null)
  const [confirmationEnCours, setConfirmationEnCours] = useState(false)

  // Suit le programme mis en avant par la carte cliquée sur la landing, sans écraser une
  // saisie déjà en cours si l'utilisateur revient choisir une autre carte.
  useEffect(() => {
    setTypeProgramme(typeInitial)
  }, [typeInitial])

  const estPositionnement = typeProgramme === 'collectif'
  const libelleRdv = estPositionnement ? 'test de positionnement' : 'appel diagnostic'

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    if (!accepte) {
      setErreur('Merci de confirmer votre accord pour être recontacté(e).')
      return
    }
    setEnvoi(true)
    setErreur(null)
    const { data, error } = await supabase
      .from('prospects')
      .insert({
        etablissement_id: etablissementId,
        prenom,
        nom,
        email,
        telephone: telephone || null,
        langue_visee: langueVisee || null,
        objectif: objectif || null,
        type_programme: typeProgramme,
      })
      .select('id')
      .single()
    setEnvoi(false)
    if (error || !data) {
      setErreur("Votre demande n'a pas pu être envoyée. Réessayez dans un instant.")
      return
    }
    // Le prospect est d'abord enregistré côté e-Avo. S'il y a un Calendly configuré, on
    // l'ouvre dans un nouvel onglet et on demande confirmation sur cette page (le visiteur
    // reste dessus, rien ne le fait quitter la landing) — sans Calendly, on retombe sur le
    // message "on vous recontacte" ci-dessous.
    if (calendlyUrl) {
      window.open(calendlyUrl, '_blank', 'noopener,noreferrer')
      setProspectIdEnAttente(data.id)
      return
    }
    setEnvoye(true)
  }

  async function confirmerReservation(aReserve: boolean) {
    if (!aReserve) {
      window.location.reload()
      return
    }
    if (!prospectIdEnAttente) return
    setConfirmationEnCours(true)
    await fetch('/api/prospects/confirmer-reservation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospectId: prospectIdEnAttente }),
    }).catch(() => null)
    setConfirmationEnCours(false)
    setProspectIdEnAttente(null)
    setEnvoye(true)
  }

  if (envoye) {
    return (
      <div
        className="card"
        style={{ padding: 30, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', textAlign: 'center' }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            background: accent.accentGrad,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="m5 12.5 4.5 4.5L19 7" stroke={accent.accentInk} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h3 style={{ fontSize: 20, color: 'var(--ink)' }}>{calendlyUrl ? 'Merci !' : 'Demande envoyée'}</h3>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', maxWidth: 320 }}>
          {calendlyUrl
            ? `Merci ${prenom}, votre ${libelleRdv} est bien noté. À très vite chez ${etablissementNom}.`
            : `Merci ${prenom}, nous vous recontactons sous 48 h pour caler votre ${libelleRdv}.`}
        </p>
      </div>
    )
  }

  if (prospectIdEnAttente) {
    return (
      <div
        className="card"
        style={{ padding: 30, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center' }}
      >
        <h3 style={{ fontSize: 19, color: 'var(--ink)', margin: 0 }}>
          Avez-vous pu réserver un créneau avec {etablissementNom} ?
        </h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 340, margin: 0 }}>
          Une fenêtre Calendly s'est ouverte dans un nouvel onglet. Une fois votre créneau choisi,
          revenez ici pour le confirmer.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={() => confirmerReservation(true)}
            disabled={confirmationEnCours}
            className="btn-shine"
            style={{ padding: '11px 24px', background: accent.accentGrad, color: accent.accentInk, boxShadow: `0 4px 14px ${accent.accentGlow}`, opacity: confirmationEnCours ? 0.7 : 1 }}
          >
            Oui
          </button>
          <button
            type="button"
            onClick={() => confirmerReservation(false)}
            disabled={confirmationEnCours}
            style={{ padding: '11px 24px', borderRadius: 999, background: 'transparent', border: '1px solid var(--border)', color: 'var(--ink-2)', cursor: 'pointer', opacity: confirmationEnCours ? 0.7 : 1 }}
          >
            Non
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={envoyer} className="card" style={{ padding: 30, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ fontSize: 21, color: 'var(--accent-gold, #e9cf94)', marginBottom: 2 }}>
        Réserver mon {libelleRdv}
      </h3>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 4px' }}>
        {estPositionnement
          ? 'Cours collectifs : ce test situe votre niveau pour vous placer dans le bon groupe.'
          : "Cours individuels ou en duo : cet appel cadre votre objectif et votre rythme."}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <label style={labelStyle}>Programme souhaité</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PROGRAMMES_CHOIX.map(({ valeur, label }) => {
            const actif = typeProgramme === valeur
            return (
              <button
                type="button"
                key={valeur}
                onClick={() => setTypeProgramme(valeur)}
                style={{
                  fontSize: 12.5,
                  fontWeight: actif ? 800 : 600,
                  color: actif ? accent.accentInk : 'var(--ink-2)',
                  background: actif ? accent.accentGrad : 'rgba(0,0,0,.22)',
                  border: actif ? 'none' : '1px solid var(--border)',
                  borderRadius: 999,
                  padding: '9px 15px',
                  cursor: 'pointer',
                  boxShadow: actif ? `0 4px 14px ${accent.accentGlow}` : 'none',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={labelStyle}>Prénom</label>
          <input style={champStyle} required value={prenom} onChange={(e) => setPrenom(e.target.value)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={labelStyle}>Nom</label>
          <input style={champStyle} required value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={labelStyle}>E-mail</label>
          <input type="email" style={champStyle} required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.fr" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={labelStyle}>Téléphone</label>
          <input style={champStyle} value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="06 __ __ __ __" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={labelStyle}>Langue visée</label>
          <input style={champStyle} value={langueVisee} onChange={(e) => setLangueVisee(e.target.value)} placeholder="Anglais, espagnol…" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={labelStyle}>Votre objectif</label>
          <input style={champStyle} value={objectif} onChange={(e) => setObjectif(e.target.value)} placeholder="Entretien, expatriation…" />
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 11, fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)', cursor: 'pointer' }}>
        <input type="checkbox" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} style={{ marginTop: 2 }} />
        J'accepte d'être recontacté(e) au sujet de ma demande.
      </label>

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{erreur}</p>}

      <button
        type="submit"
        disabled={envoi}
        className="btn-shine"
        style={{
          width: '100%',
          fontSize: 15,
          padding: 16,
          letterSpacing: '.6px',
          textTransform: 'uppercase',
          background: accent.accentGrad,
          color: accent.accentInk,
          boxShadow: `0 6px 24px ${accent.accentGlow}`,
          opacity: envoi ? 0.7 : 1,
        }}
      >
        {envoi ? 'Envoi…' : 'Réserver mon créneau'}
      </button>
    </form>
  )
}
