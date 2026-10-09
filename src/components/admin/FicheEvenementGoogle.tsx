import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import type { EvenementGoogle, InviteGoogle } from '../../lib/agendaEvenements'
import { FUSEAU_ETABLISSEMENT } from '../../lib/etablissement'
import { Modale } from '../ui/Modale'
import { Icone, type NomIcone } from '../ui/Icones'
import { champStyle, etiquetteStyle } from '../ui/Champ'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { MessageErreur } from '../ui/Etats'
import { ModaleConfirmation } from '../ui/ModaleConfirmation'

/* Fiche d'un événement lu dans l'agenda Google, calquée sur le pop-up de Google Agenda que le
   client a fourni en référence (2026-10-09) : mêmes informations, dans le même ordre — pastille de
   couleur et titre, horaire, répétition, invités avec leur réponse et l'organisateur, description,
   rappel, agenda propriétaire — et mêmes actions en en-tête (modifier, supprimer, fermer).

   Jusqu'ici ces événements étaient affichés dans la grille mais ignoraient le clic : toute cette
   information était invisible depuis HOC. */

const LIBELLE_REPONSE: Record<string, string> = {
  accepted: 'a accepté',
  declined: 'a refusé',
  tentative: 'peut-être',
  needsAction: 'en attente',
}

export function FicheEvenementGoogle({
  evenement,
  onFermer,
  onChange,
}: {
  evenement: EvenementGoogle
  onFermer: () => void
  onChange: () => void
}) {
  const { session } = useProfileContext()
  const [edition, setEdition] = useState(false)
  const [confirmationSuppression, setConfirmationSuppression] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const [titre, setTitre] = useState(evenement.titre)
  const [description, setDescription] = useState(evenement.description ?? '')
  const [debut, setDebut] = useState(() => pourChampDateHeure(evenement.debut))
  const [duree, setDuree] = useState(() =>
    Math.max(15, Math.round((new Date(evenement.fin).getTime() - new Date(evenement.debut).getTime()) / 60_000)),
  )

  async function appeler(corps: Record<string, unknown>) {
    if (!session) return false
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/google-evenement', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: evenement.id, ...corps }),
    }).catch(() => null)
    setEnCours(false)
    if (!reponse?.ok) {
      const detail = (await reponse?.json().catch(() => null)) as { error?: string } | null
      setErreur(detail?.error ?? 'L’opération a échoué.')
      return false
    }
    return true
  }

  async function enregistrer() {
    if (!titre.trim()) {
      setErreur('Le titre est obligatoire.')
      return
    }
    const ok = await appeler({
      action: 'modifier',
      titre: titre.trim(),
      description: description.trim(),
      debut: new Date(debut).toISOString(),
      dureeMinutes: duree,
    })
    if (ok) {
      onChange()
      onFermer()
    }
  }

  async function supprimer(): Promise<boolean> {
    const ok = await appeler({ action: 'supprimer' })
    if (ok) {
      onChange()
      onFermer()
    }
    return ok
  }

  const reponses = compterReponses(evenement.invites)

  return (
    <>
      <Modale titre={edition ? 'Modifier l’événement' : 'Événement de l’agenda Google'} onFermer={onFermer} largeurMax={560}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {erreur && <MessageErreur>{erreur}</MessageErreur>}

          {evenement.modifiable && !edition && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <BoutonAction icone="parametres" libelle="Modifier" onClick={() => setEdition(true)} />
              <BoutonAction icone="supprimer" libelle="Supprimer" danger onClick={() => setConfirmationSuppression(true)} />
            </div>
          )}

          {edition ? (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={etiquetteStyle}>Titre</span>
                <input value={titre} onChange={(e) => setTitre(e.target.value)} style={champStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={etiquetteStyle}>Date et heure</span>
                <input type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} style={champStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={etiquetteStyle}>Durée (minutes)</span>
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={duree}
                  onChange={(e) => setDuree(Math.max(15, Number(e.target.value)))}
                  style={champStyle}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={etiquetteStyle}>Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  style={{ ...champStyle, resize: 'vertical' }}
                />
              </label>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.55 }}>
                Les invités de cet événement reçoivent automatiquement l’invitation mise à jour par Google.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setEdition(false)} disabled={enCours} style={boutonNeutreStyle}>
                  Annuler
                </button>
                <button type="button" onClick={enregistrer} disabled={enCours} className="btn-shine" style={boutonPrimaireStyle}>
                  {enCours ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span
                  aria-hidden
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: 4,
                    marginTop: 6,
                    flexShrink: 0,
                    background: evenement.couleur ?? 'var(--accent-blue)',
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <h3 className="brand-font" style={{ fontSize: 20, color: 'var(--ink)', margin: 0, lineHeight: 1.3 }}>
                    {evenement.titre}
                  </h3>
                  <p style={{ fontSize: 13.5, color: 'var(--ink-2)', margin: '6px 0 0', lineHeight: 1.5 }}>
                    {formaterPlage(evenement.debut, evenement.fin)}
                  </p>
                  {evenement.recurrence && (
                    <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '3px 0 0', lineHeight: 1.5 }}>{evenement.recurrence}</p>
                  )}
                </div>
              </div>

              {evenement.invites.length > 0 && (
                <Rubrique icone="etudiants">
                  <span style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 700 }}>
                    {evenement.invites.length} invité{evenement.invites.length > 1 ? 's' : ''}
                  </span>
                  {reponses && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{reponses}</span>}
                  <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {evenement.invites.map((invite) => (
                      <LigneInvite key={invite.email} invite={invite} />
                    ))}
                  </ul>
                </Rubrique>
              )}

              {evenement.description && (
                <Rubrique icone="documents">
                  <DescriptionAvecLiens texte={evenement.description} />
                </Rubrique>
              )}

              {evenement.lieu && (
                <Rubrique icone="etablissements">
                  <DescriptionAvecLiens texte={evenement.lieu} />
                </Rubrique>
              )}

              {evenement.rappels.length > 0 && (
                <Rubrique icone="alerte">
                  <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                    {evenement.rappels.map((minutes) => formaterRappel(minutes)).join(', ')}
                  </span>
                </Rubrique>
              )}

              {evenement.organisateur && (
                <Rubrique icone="seances">
                  <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                    {evenement.organisateur.nom ?? evenement.organisateur.email}
                  </span>
                </Rubrique>
              )}

              {!evenement.modifiable && (
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.55 }}>
                  {evenement.recurrent
                    ? 'Cet événement fait partie d’une série qui se répète : modifiez-le depuis Google Agenda, pour choisir s’il faut changer cette occurrence ou toute la série.'
                    : 'Cet événement vient d’un agenda Google personnel, affiché en lecture seule.'}
                </p>
              )}
            </>
          )}
        </div>
      </Modale>

      {confirmationSuppression && (
        <ModaleConfirmation
          titre="Supprimer cet événement ?"
          description={`« ${evenement.titre} » sera supprimé de l’agenda Google, et ses invités en seront prévenus. Cette action est définitive.`}
          libelleConfirmer="Supprimer"
          enCours={enCours}
          erreur={erreur}
          onConfirmer={async () => {
            const ok = await supprimer()
            if (ok !== false) setConfirmationSuppression(false)
          }}
          onFermer={() => setConfirmationSuppression(false)}
        />
      )}
    </>
  )
}

function Rubrique({ icone, children }: { icone: NomIcone; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', borderTop: '1px solid var(--border-soft)', paddingTop: 13 }}>
      <span aria-hidden style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }}>
        <Icone nom={icone} taille={17} />
      </span>
      <div style={{ minWidth: 0, flexGrow: 1 }}>{children}</div>
    </div>
  )
}

function LigneInvite({ invite }: { invite: InviteGoogle }) {
  const nom = invite.nom ?? invite.email
  return (
    <li style={{ display: 'flex', gap: 9, alignItems: 'center', minWidth: 0 }}>
      <span
        aria-hidden
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--ink)',
          background: 'rgba(169,140,255,.18)',
          border: '1px solid rgba(169,140,255,.3)',
        }}
      >
        {nom.slice(0, 1).toUpperCase()}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {nom}
        </span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>
          {invite.organisateur ? 'Organisateur' : LIBELLE_REPONSE[invite.reponse] ?? 'en attente'}
          {invite.optionnel ? ' · facultatif' : ''}
        </span>
      </span>
    </li>
  )
}

function BoutonAction({
  icone,
  libelle,
  onClick,
  danger = false,
}: {
  icone: NomIcone
  libelle: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={libelle}
      aria-label={libelle}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 12.5,
        fontWeight: 700,
        color: danger ? 'var(--danger)' : 'var(--ink-2)',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 999,
        padding: '6px 13px',
        cursor: 'pointer',
      }}
    >
      <Icone nom={icone} taille={15} />
      {libelle}
    </button>
  )
}

/* Les liens d'une description Google (lien de visioconférence, document joint) doivent rester
   cliquables : c'est souvent la seule information utile de l'événement. Découpage sur les URL
   plutôt qu'un rendu HTML — la description vient d'une source externe, l'injecter telle quelle
   ouvrirait une faille. */
function DescriptionAvecLiens({ texte }: { texte: string }) {
  const morceaux = texte.split(/(https?:\/\/[^\s<>"]+)/g)
  return (
    <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {morceaux.map((morceau, index) =>
        /^https?:\/\//.test(morceau) ? (
          <a key={index} href={morceau} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)' }}>
            {morceau}
          </a>
        ) : (
          morceau
        ),
      )}
    </p>
  )
}

function compterReponses(invites: InviteGoogle[]): string | null {
  const groupes: [string, string][] = [
    ['accepted', 'oui'],
    ['declined', 'non'],
    ['tentative', 'peut-être'],
    ['needsAction', 'en attente'],
  ]
  const parts = groupes
    .map(([cle, libelle]) => {
      const nombre = invites.filter((i) => i.reponse === cle).length
      return nombre > 0 ? `${nombre} ${libelle}` : null
    })
    .filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

/* Toujours en heure d'Antananarivo, comme partout dans les écrans d'administration : un admin en
   déplacement doit lire les heures telles que l'équipe les vit sur place. */
function formaterPlage(debut: string, fin: string): string {
  const jour = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: FUSEAU_ETABLISSEMENT,
  }).format(new Date(debut))
  const heure = (iso: string) =>
    new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU_ETABLISSEMENT }).format(new Date(iso))
  return `${jour} · de ${heure(debut)} à ${heure(fin)}`
}

function formaterRappel(minutes: number): string {
  if (minutes >= 1440) {
    const jours = Math.round(minutes / 1440)
    return `${jours} jour${jours > 1 ? 's' : ''} avant`
  }
  if (minutes >= 60) {
    const heures = Math.round(minutes / 60)
    return `${heures} heure${heures > 1 ? 's' : ''} avant`
  }
  return `${minutes} minutes avant`
}

/* `datetime-local` attend une heure locale sans fuseau : l'instant est donc rendu tel qu'il se lit
   à Antananarivo, et non dans le fuseau du navigateur, pour que l'admin modifie bien l'heure
   qu'il voit dans la grille. */
function pourChampDateHeure(iso: string): string {
  const parties = new Intl.DateTimeFormat('fr-CA', {
    timeZone: FUSEAU_ETABLISSEMENT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const valeur = (type: string) => parties.find((p) => p.type === type)?.value ?? '00'
  return `${valeur('year')}-${valeur('month')}-${valeur('day')}T${valeur('hour')}:${valeur('minute')}`
}
