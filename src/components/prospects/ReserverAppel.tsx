import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import type { AccentPalette } from '../../lib/accent'
import { fuseauDuVisiteur, grouperParJour, libelleFuseau } from '../../lib/creneaux'
import { FUSEAU_ETABLISSEMENT } from '../../lib/etablissement'
import type { TypeProgrammeProspect } from '../../types/database.types'

/* Prise de rendez-vous directement sur le site, en remplacement du renvoi vers Calendly : le
   visiteur ne quitte plus la page, et ses réponses arrivent en base au lieu de rester chez un
   prestataire externe.

   Deux étapes plutôt qu'un formulaire unique : demander ses coordonnées avant même de savoir s'il
   reste un créneau qui lui convient faisait abandonner pour rien. L'agenda est donc montré en
   premier, les coordonnées ne sont demandées qu'une fois l'horaire choisi.

   `sansCadre` sert quand le composant vit dans la fenêtre de réservation : celle-ci porte déjà la
   carte, le titre et le choix du type de cours, qu'il ne faut pas afficher deux fois. */

const JOURS_PAR_PAGE = 4

interface ReponseCreneaux {
  creneaux: string[]
  dureeMinutes: number
  fuseau: string
}

/* Fuseaux proposés dans la liste : les pays francophones et anglophones les plus probables pour
   des cours d'anglais. Le fuseau réellement sélectionné au chargement n'est pas celui de
   l'établissement mais celui du visiteur, détecté depuis son navigateur (voir `fuseauxProposes`
   plus bas) — un prospect en France lit d'emblée les créneaux à son heure, sans rien régler. */
const FUSEAUX_PROSPECT: { valeur: string; libelle: string }[] = [
  { valeur: 'Indian/Antananarivo', libelle: 'Madagascar — Antananarivo' },
  { valeur: 'Indian/Mauritius', libelle: 'Maurice — Port-Louis' },
  { valeur: 'Indian/Reunion', libelle: 'La Réunion' },
  { valeur: 'Europe/Paris', libelle: 'France, Belgique, Suisse — Paris' },
  { valeur: 'Europe/London', libelle: 'Royaume-Uni — Londres' },
  { valeur: 'Africa/Casablanca', libelle: 'Maroc — Casablanca' },
  { valeur: 'Africa/Tunis', libelle: 'Tunisie — Tunis' },
  { valeur: 'Africa/Algiers', libelle: 'Algérie — Alger' },
  { valeur: 'Africa/Abidjan', libelle: 'Côte d’Ivoire, Sénégal — Abidjan' },
  { valeur: 'Africa/Nairobi', libelle: 'Afrique de l’Est — Nairobi' },
  { valeur: 'America/Toronto', libelle: 'Canada — Toronto, Montréal' },
  { valeur: 'America/New_York', libelle: 'États-Unis (Est) — New York' },
  { valeur: 'Asia/Dubai', libelle: 'Émirats arabes unis — Dubaï' },
]

/* Le fuseau détecté est ajouté en tête de liste s'il n'y figure pas déjà : le prospect voit
   donc toujours sa propre ville, où qu'il soit, tout en gardant la possibilité de basculer sur
   un autre fuseau (il réserve pour quelqu'un d'autre, il est en déplacement…). */
function fuseauxProposes(fuseauDetecte: string): { valeur: string; libelle: string }[] {
  if (FUSEAUX_PROSPECT.some((f) => f.valeur === fuseauDetecte)) return FUSEAUX_PROSPECT
  return [{ valeur: fuseauDetecte, libelle: `Votre fuseau — ${libelleFuseau(fuseauDetecte)}` }, ...FUSEAUX_PROSPECT]
}

/* Décalage horaire courant lisible ("UTC+3"), pour aider le prospect à repérer son fuseau dans la
   liste sans avoir à connaître le nom IANA. */
function decalageLisible(fuseau: string): string {
  try {
    const partie = new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value
    return partie ?? ''
  } catch {
    return ''
  }
}

export function ReserverAppel({
  etablissementSlug,
  etablissementNom,
  accent,
  typeInitial = 'individuel',
  onPrefererContact,
  onConfirme,
  sansCadre = false,
}: {
  etablissementSlug: string
  etablissementNom: string
  accent: AccentPalette
  typeInitial?: TypeProgrammeProspect
  onPrefererContact?: () => void
  /* Signale au parent (ModaleReservation) que la demande vient d'être enregistrée, pour qu'il
     masque le choix de type de cours — le modifier après coup n'aurait plus aucun effet. */
  onConfirme?: () => void
  sansCadre?: boolean
}) {
  const [donnees, setDonnees] = useState<ReponseCreneaux | null>(null)
  const [chargement, setChargement] = useState(true)
  const [erreurChargement, setErreurChargement] = useState<string | null>(null)
  const [creneauChoisi, setCreneauChoisi] = useState<string | null>(null)
  const [pageJours, setPageJours] = useState(0)
  const [fuseauAffichage, setFuseauAffichage] = useState(() => fuseauDuVisiteur(FUSEAU_ETABLISSEMENT))
  const fuseaux = useMemo(() => fuseauxProposes(fuseauDuVisiteur(FUSEAU_ETABLISSEMENT)), [])

  const [typeProgramme, setTypeProgramme] = useState<TypeProgrammeProspect>(typeInitial)
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [objectif, setObjectif] = useState('')
  const [message, setMessage] = useState('')
  /* DUO : les deux personnes réservent ensemble — demande client du 2026-09-21. Nom de groupe
     facultatif, à défaut « Prénom1/Prénom2 » (calculé côté serveur, voir lib/duo.ts). */
  const [prenom2, setPrenom2] = useState('')
  const [nom2, setNom2] = useState('')
  const [email2, setEmail2] = useState('')
  const [telephone2, setTelephone2] = useState('')
  const [nomGroupe, setNomGroupe] = useState('')
  const [consent, setConsent] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [confirme, setConfirme] = useState<string | null>(null)

  useEffect(() => {
    setTypeProgramme(typeInitial)
  }, [typeInitial])

  useEffect(() => {
    let annule = false
    setChargement(true)
    fetch(`/api/prospects/creneaux?etablissement=${encodeURIComponent(etablissementSlug)}`)
      .then((r) => r.json())
      .then((reponse: ReponseCreneaux & { error?: string }) => {
        if (annule) return
        if (reponse.error) setErreurChargement(reponse.error)
        else setDonnees(reponse)
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

  /* Les créneaux sont recalculés en instants UTC côté serveur ; l'affichage se contente de les
     reformater dans le fuseau choisi par le prospect (par défaut celui de l'établissement), sans
     jamais toucher à l'instant réel envoyé dans la demande de réservation. */
  const jours = useMemo(
    () => (donnees ? grouperParJour(donnees.creneaux, fuseauAffichage) : []),
    [donnees, fuseauAffichage],
  )
  const joursVisibles = jours.slice(pageJours * JOURS_PAR_PAGE, pageJours * JOURS_PAR_PAGE + JOURS_PAR_PAGE)

  /* Changer de fuseau peut déplacer certains créneaux d'un jour à l'autre : on revient à la
     première page pour ne pas laisser le prospect sur une pagination devenue incohérente. */
  useEffect(() => {
    setPageJours(0)
  }, [fuseauAffichage])

  const heure = (iso: string) =>
    new Intl.DateTimeFormat('fr-FR', { timeZone: fuseauAffichage, hour: '2-digit', minute: '2-digit' }).format(
      new Date(iso),
    )
  const jourLong = (date: string) =>
    new Intl.DateTimeFormat('fr-FR', { timeZone: fuseauAffichage, weekday: 'long', day: 'numeric', month: 'long' }).format(
      new Date(`${date}T12:00:00Z`),
    )

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    if (!creneauChoisi) return
    setEnvoi(true)
    setErreur(null)

    const reponse = await fetch('/api/prospects/reserver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        etablissementSlug,
        creneau: creneauChoisi,
        nom,
        prenom,
        email,
        telephone,
        /* Hari Online Club n'enseigne que l'anglais : plus la peine de le demander au prospect. */
        langueVisee: 'Anglais',
        objectif,
        typeProgramme,
        message,
        ...(typeProgramme === 'duo'
          ? { duo: { prenom: prenom2, nom: nom2, email: email2, telephone: telephone2, nomGroupe: nomGroupe.trim() || undefined } }
          : {}),
      }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Envoi impossible. Réessayez dans un instant.' }))

    setEnvoi(false)
    if (reponse.error) {
      setErreur(reponse.error)
      /* Créneau pris entre-temps : on rafraîchit la liste pour qu'il n'apparaisse plus. */
      if (reponse.error.includes('créneau')) {
        setCreneauChoisi(null)
        fetch(`/api/prospects/creneaux?etablissement=${encodeURIComponent(etablissementSlug)}`)
          .then((r) => r.json())
          .then((maj: ReponseCreneaux) => setDonnees(maj))
          .catch(() => null)
      }
      return
    }
    setConfirme(reponse.quand ?? null)
    onConfirme?.()
  }

  if (confirme) {
    return (
      <div className={sansCadre ? '' : 'card'} style={{ padding: sansCadre ? '8px 0' : 32, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
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
        <h3 style={{ fontSize: 20, margin: 0, color: 'var(--ink)' }}>Votre demande est enregistrée</h3>
        <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--muted)', maxWidth: 440, margin: 0 }}>
          {etablissementNom} confirme votre appel du <strong>{confirme}</strong> très vite. Vous recevrez alors
          une invitation avec le lien de visioconférence à l’adresse {email}.
        </p>
      </div>
    )
  }

  return (
    <div className={sansCadre ? '' : 'card'} style={{ padding: sansCadre ? 0 : 30, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!sansCadre && (
        <div>
          <h3 style={{ fontSize: 22, margin: '0 0 6px', color: 'var(--ink)' }}>Réserver mon appel diagnostic</h3>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
            {donnees ? `${donnees.dureeMinutes} minutes en visioconférence, sans engagement.` : 'Quelques minutes en visioconférence, sans engagement.'}{' '}
            Choisissez l’horaire qui vous arrange : l’agenda ci-dessous est à jour.
          </p>
        </div>
      )}
      {sansCadre && donnees && (
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
          {donnees.dureeMinutes} minutes en visioconférence. Choisissez l’horaire qui vous arrange : l’agenda est à jour.
        </p>
      )}

      {chargement && <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>Chargement des créneaux…</p>}
      {erreurChargement && <p style={{ fontSize: 13.5, color: 'var(--danger)' }}>{erreurChargement}</p>}

      {!chargement && !erreurChargement && jours.length === 0 && (
        <div style={{ padding: 18, borderRadius: 12, background: 'var(--surface-alt)', fontSize: 13.5, color: 'var(--muted)' }}>
          Aucun créneau n’est ouvert pour le moment.{' '}
          {onPrefererContact && (
            <button type="button" onClick={onPrefererContact} style={lienBouton(accent)}>
              Laissez-nous vos coordonnées
            </button>
          )}
        </div>
      )}

      {jours.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Fuseau horaire</label>
            <select
              value={fuseauAffichage}
              onChange={(e) => setFuseauAffichage(e.target.value)}
              style={champStyle}
            >
              {fuseaux.map((f) => (
                <option key={f.valeur} value={f.valeur}>
                  {f.libelle} ({decalageLisible(f.valeur)})
                </option>
              ))}
            </select>
          </div>

          {creneauChoisi && (
            <button
              type="button"
              onClick={() => setCreneauChoisi(null)}
              style={{
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
              }}
            >
              <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
                Créneau choisi :{' '}
                <strong style={{ color: accent.accent }}>
                  {jourLong(creneauChoisi.slice(0, 10))} à {heure(creneauChoisi)}
                </strong>
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: accent.accent, whiteSpace: 'nowrap' }}>
                Changer ✕
              </span>
            </button>
          )}

          {/* Repli en accordéon CSS (grid-template-rows 0fr/1fr) : une fois un créneau choisi, les
              jours et heures encore libres se replient pour laisser la place au formulaire de
              coordonnées ; un nouveau clic sur la puce ci-dessus les fait réapparaître. */}
          <div
            style={{
              display: 'grid',
              gridTemplateRows: creneauChoisi ? '0fr' : '1fr',
              transition: 'grid-template-rows 260ms ease',
              overflow: 'hidden',
            }}
          >
            <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted-2)' }}>
                  Choisissez un créneau
                </span>
                <span style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setPageJours((p) => Math.max(0, p - 1))}
                    disabled={pageJours === 0}
                    style={boutonNavigation(pageJours === 0)}
                    aria-label="Jours précédents"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageJours((p) => (p + 1) * JOURS_PAR_PAGE < jours.length ? p + 1 : p)}
                    disabled={(pageJours + 1) * JOURS_PAR_PAGE >= jours.length}
                    style={boutonNavigation((pageJours + 1) * JOURS_PAR_PAGE >= jours.length)}
                    aria-label="Jours suivants"
                  >
                    →
                  </button>
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(joursVisibles.length, 1)}, 1fr)`, gap: 10 }}>
                {joursVisibles.map((jour) => (
                  <div key={jour.date} style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', textAlign: 'center', textTransform: 'capitalize' }}>
                      {jourLong(jour.date)}
                    </span>
                    {jour.creneaux.map((creneau) => {
                      const choisi = creneau === creneauChoisi
                      return (
                        <button
                          key={creneau}
                          type="button"
                          onClick={() => setCreneauChoisi(choisi ? null : creneau)}
                          aria-pressed={choisi}
                          style={{
                            padding: '9px 6px',
                            borderRadius: 9,
                            border: `1px solid ${choisi ? 'transparent' : accent.accentBorder}`,
                            background: choisi ? accent.accentGrad : 'transparent',
                            color: choisi ? accent.accentInk : accent.accent,
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          {heure(creneau)}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--muted-2)', margin: 0 }}>
                Horaires affichés dans le fuseau sélectionné : {fuseaux.find((f) => f.valeur === fuseauAffichage)?.libelle ?? libelleFuseau(fuseauAffichage)}.
              </p>
            </div>
          </div>
        </div>
      )}

      {creneauChoisi && (
        <form onSubmit={envoyer} style={{ display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid var(--border-soft)', paddingTop: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <Champ label={typeProgramme === 'duo' ? 'Prénom (personne 1)' : 'Prénom'} obligatoire valeur={prenom} onChange={setPrenom} />
            <Champ label={typeProgramme === 'duo' ? 'Nom (personne 1)' : 'Nom'} obligatoire valeur={nom} onChange={setNom} />
            <Champ label="E-mail" obligatoire type="email" valeur={email} onChange={setEmail} placeholder="vous@exemple.fr" />
            <Champ label="Téléphone" valeur={telephone} onChange={setTelephone} placeholder="+261 ..." />
            <Champ label="Votre objectif" valeur={objectif} onChange={setObjectif} placeholder="Entretien, expatriation…" />
          </div>

          {typeProgramme === 'duo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>La deuxième personne du binôme</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <Champ label="Prénom (personne 2)" obligatoire valeur={prenom2} onChange={setPrenom2} />
                <Champ label="Nom (personne 2)" obligatoire valeur={nom2} onChange={setNom2} />
                <Champ label="E-mail (personne 2)" obligatoire type="email" valeur={email2} onChange={setEmail2} placeholder="elle-ou-lui@exemple.fr" />
                <Champ label="Téléphone (personne 2)" valeur={telephone2} onChange={setTelephone2} placeholder="+261 ..." />
              </div>
              <Champ
                label="Nom du binôme (facultatif)"
                valeur={nomGroupe}
                onChange={setNomGroupe}
                placeholder={prenom && prenom2 ? `${prenom}/${prenom2}` : 'Ex. Les Rakoto'}
              />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Un mot pour l’établissement (facultatif)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              style={{ ...champStyle, resize: 'vertical' }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color: 'var(--muted)' }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required style={{ marginTop: 2 }} />
            J’accepte d’être recontacté(e) au sujet de ma demande.
          </label>

          {erreur && <p style={{ fontSize: 13, color: 'var(--danger)', margin: 0 }}>{erreur}</p>}

          <button
            type="submit"
            disabled={envoi || !consent}
            className="btn-shine"
            style={{
              background: accent.accentGrad,
              color: accent.accentInk,
              opacity: envoi || !consent ? 0.6 : 1,
              cursor: envoi || !consent ? 'not-allowed' : 'pointer',
              padding: '14px 24px',
              fontSize: 14.5,
            }}
          >
            {envoi ? 'Envoi…' : 'Confirmer ma demande'}
          </button>
          <p style={{ fontSize: 11.5, color: 'var(--muted-2)', margin: 0, textAlign: 'center' }}>
            {etablissementNom} valide votre créneau, puis vous recevez l’invitation avec le lien de visioconférence.
          </p>
        </form>
      )}

      {!creneauChoisi && jours.length > 0 && onPrefererContact && (
        <button type="button" onClick={onPrefererContact} style={{ ...lienBouton(accent), alignSelf: 'flex-start' }}>
          Aucun créneau ne convient ? Laissez-nous vos coordonnées
        </button>
      )}
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

function boutonNavigation(desactive: boolean): CSSProperties {
  return {
    width: 30,
    height: 30,
    borderRadius: 999,
    border: '1px solid var(--border)',
    background: 'var(--surface-alt)',
    color: 'var(--ink-2)',
    cursor: desactive ? 'not-allowed' : 'pointer',
    opacity: desactive ? 0.45 : 1,
    fontFamily: 'inherit',
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
