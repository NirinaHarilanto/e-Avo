import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { AccentPalette } from '../../lib/accent'
import type { TypeProgrammeProspect } from '../../types/database.types'

const DISPONIBILITES = ['Matin', 'Pause déjeuner', 'Après 18 h', 'Week-end']

const PROGRAMMES_CHOIX: { valeur: TypeProgrammeProspect; label: string }[] = [
  { valeur: 'individuel', label: 'Individuel' },
  { valeur: 'duo', label: 'Duo' },
  { valeur: 'collectif', label: 'Collectif' },
]

interface FormulaireProspectProps {
  etablissementId: string
  accent: AccentPalette
  // Programme présélectionné (carte cliquée sur la landing) ; l'utilisateur reste libre de le
  // changer via le sélecteur ci-dessous — individuel/duo mènent à un appel diagnostic,
  // collectif à un test de positionnement (même formulaire, seul le libellé change).
  typeInitial?: TypeProgrammeProspect
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

export function FormulaireProspect({ etablissementId, accent, typeInitial = 'individuel' }: FormulaireProspectProps) {
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [langueVisee, setLangueVisee] = useState('')
  const [objectif, setObjectif] = useState('')
  const [disponibilites, setDisponibilites] = useState<string[]>([])
  const [typeProgramme, setTypeProgramme] = useState<TypeProgrammeProspect>(typeInitial)
  const [accepte, setAccepte] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoye, setEnvoye] = useState(false)

  // Suit le programme mis en avant par la carte cliquée sur la landing, sans écraser une
  // saisie déjà en cours si l'utilisateur revient choisir une autre carte.
  useEffect(() => {
    setTypeProgramme(typeInitial)
  }, [typeInitial])

  const estPositionnement = typeProgramme === 'collectif'
  const libelleRdv = estPositionnement ? 'test de positionnement' : 'appel diagnostic'

  function basculerDisponibilite(valeur: string) {
    setDisponibilites((courant) =>
      courant.includes(valeur) ? courant.filter((v) => v !== valeur) : [...courant, valeur],
    )
  }

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    if (!accepte) {
      setErreur('Merci de confirmer votre accord pour être recontacté(e).')
      return
    }
    setEnvoi(true)
    setErreur(null)
    const { error } = await supabase.from('prospects').insert({
      etablissement_id: etablissementId,
      prenom,
      nom,
      email,
      telephone: telephone || null,
      langue_visee: langueVisee || null,
      objectif: objectif || null,
      disponibilites: disponibilites.length ? disponibilites.join(', ') : null,
      type_programme: typeProgramme,
    })
    setEnvoi(false)
    if (error) {
      setErreur("Votre demande n'a pas pu être envoyée. Réessayez dans un instant.")
      return
    }
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
        <h3 style={{ fontSize: 20, color: 'var(--ink)' }}>Demande envoyée</h3>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', maxWidth: 320 }}>
          Merci {prenom}, nous vous recontactons sous 48 h pour caler votre {libelleRdv}.
        </p>
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <label style={labelStyle}>Vos disponibilités pour l'appel</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {DISPONIBILITES.map((valeur) => {
            const active = disponibilites.includes(valeur)
            return (
              <button
                type="button"
                key={valeur}
                onClick={() => basculerDisponibilite(valeur)}
                style={{
                  fontSize: 12.5,
                  fontWeight: active ? 800 : 600,
                  color: active ? accent.accentInk : 'var(--ink-2)',
                  background: active ? accent.accentGrad : 'rgba(0,0,0,.22)',
                  border: active ? 'none' : '1px solid var(--border)',
                  borderRadius: 999,
                  padding: '9px 15px',
                  cursor: 'pointer',
                  boxShadow: active ? `0 4px 14px ${accent.accentGlow}` : 'none',
                }}
              >
                {valeur}
              </button>
            )
          })}
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
