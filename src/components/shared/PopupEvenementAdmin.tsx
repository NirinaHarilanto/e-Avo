import { useMemo, useState } from 'react'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { etudiantsSelectionnables, type PersonneSelectionnable } from '../../lib/invitations'
import { SelecteurPersonnes } from '../ui/SelecteurPersonnes'
import { supabase } from '../../lib/supabaseClient'
import type { RendezVousAvecProspect } from '../../hooks/useRendezVous'
import type { EvenementAdminAvecParticipants } from '../../hooks/useEvenementsAdmin'
import { PREFIXE_PROSPECT, PREFIXE_EVENEMENT, typeEvenementAdmin, LIBELLE_ADMIN } from '../../lib/agendaEvenements'
import { formaterDansFuseauEtablissement } from '../../lib/etablissement'
import type { StatutRendezVous } from '../../types/database.types'
import { Modale } from '../ui/Modale'
import { MessageErreur, MessageSucces } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { ChampDate } from '../ui/ChampDate'

/* Fiche affichée au clic d'un créneau sur N'IMPORTE QUEL agenda de l'espace admin (page Agenda
   elle-même, fenêtre « Planifier un appel diagnostic », filtre « Admin » de Séances & visio) —
   demande client du 2026-09-21 : « quand on clique sur un créneau, un pop-up devrait apparaître
   avec les informations de réservation et les boutons déjà spécifiés [...] il faut le rendre
   uniforme ». Avant ce fichier, RendezVousAdmin.tsx définissait ces deux cartes pour son propre
   usage ; les deux autres agendas ne les reprenaient pas et un clic sur un événement qui n'était
   pas géré localement ne faisait donc rien (bug relevé sur Séances & visio, filtre Admin coché :
   `seanceOuverteId` prenait l'id préfixé de l'événement mais aucune recherche ne le reconnaissait
   nulle part). Centraliser la reconnaissance de préfixe ET le rendu ici garantit qu'un futur
   agenda admin héritera du même comportement sans rien dupliquer. */

const LIBELLE_STATUT: Record<StatutRendezVous, string> = {
  en_attente: 'À valider',
  confirme: 'Confirmé',
  refuse: 'Refusé',
  annule: 'Annulé',
}

const COULEUR_STATUT: Record<StatutRendezVous, string> = {
  en_attente: 'var(--warning)',
  confirme: 'var(--success)',
  refuse: 'var(--danger)',
  annule: 'var(--muted)',
}

const boutonSecondaire = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '9px 16px',
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--ink-2)',
  fontFamily: 'inherit',
}

/* Format attendu par <input type="datetime-local"> — reprise locale de la même petite fonction
   que RendezVousAdmin.tsx (trop courte pour justifier un import partagé). */
function versDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/* Fiche d'une demande de prospect : détail et, si elle est encore en attente, les actions de
   décision. Reprise à l'identique dans la liste de RendezVousAdmin (avec le cadre de Section posé
   par l'appelant) et dans la modale ouverte depuis n'importe quel agenda — un seul endroit où
   vivent la logique de décision et son affichage. */
export function CarteRendezVous({
  rdv,
  profile,
  onChange,
}: {
  rdv: RendezVousAvecProspect
  profile: { id: string } | null
  onChange: () => void
}) {
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [echec, setEchec] = useState<string | null>(null)
  const [refusEnCours, setRefusEnCours] = useState(false)
  const [motifRefus, setMotifRefus] = useState('')
  /* Modifier / annuler un rendez-vous déjà confirmé (demande client du 2026-09-29, avec les
     mêmes mécaniques que la fenêtre « Planifier un appel diagnostic » — voir
     PlanifierAppelDiagnosticModale.tsx, qui appelle déjà ces deux mêmes routes). Distinct de
     `decider()` ci-dessous : celui-ci traite une demande encore EN ATTENTE, ceci un rendez-vous
     déjà ACTIF. */
  const [modificationEnCours, setModificationEnCours] = useState(false)
  const [annulationEnCours, setAnnulationEnCours] = useState(false)
  const [nouveauDebut, setNouveauDebut] = useState(() => versDatetimeLocal(new Date(rdv.debut)))
  const [nouvelleDuree, setNouvelleDuree] = useState(rdv.duree_minutes)

  const prospect = rdv.prospects
  const quand = formaterDansFuseauEtablissement(rdv.debut)

  async function appelServeur(url: string, corps: object) {
    const { data: session } = await supabase.auth.getSession()
    const jeton = session.session?.access_token
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
      body: JSON.stringify(corps),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
  }

  async function modifierRendezVous() {
    if (!prospect || !nouveauDebut) return
    setEnCours(true)
    setEchec(null)
    setMessage(null)
    const reponse = await appelServeur('/api/admin/planifier-rendez-vous', {
      prospectId: rdv.prospect_id,
      debut: new Date(nouveauDebut).toISOString(),
      dureeMinutes: nouvelleDuree,
    })
    setEnCours(false)
    if (reponse.error) {
      setEchec(reponse.error)
      return
    }
    setModificationEnCours(false)
    setMessage('Rendez-vous déplacé et prospect prévenu par e-mail.')
    onChange()
  }

  async function annulerRendezVous() {
    setEnCours(true)
    setEchec(null)
    setMessage(null)
    const reponse = await appelServeur('/api/admin/annuler-rendez-vous', { rendezVousId: rdv.id })
    setEnCours(false)
    if (reponse.error) {
      setEchec(reponse.error)
      return
    }
    setAnnulationEnCours(false)
    setMessage('Rendez-vous annulé, prospect prévenu par e-mail.')
    onChange()
  }

  async function decider(decision: 'confirmer' | 'refuser') {
    setEnCours(true)
    setEchec(null)
    setMessage(null)

    const { data: session } = await supabase.auth.getSession()
    const jeton = session.session?.access_token
    const reponse = await fetch('/api/admin/valider-rendez-vous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ rendezVousId: rdv.id, decision, motifRefus: decision === 'refuser' ? motifRefus : undefined }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))

    setEnCours(false)
    setRefusEnCours(false)
    setMotifRefus('')

    if (reponse.error) {
      setEchec(reponse.error)
      return
    }
    setMessage(
      decision === 'confirmer'
        ? reponse.lienMeet
          ? 'Rendez-vous confirmé, lien Google Meet créé et invitation envoyée.'
          : 'Rendez-vous confirmé. Le lien Meet n’a pas pu être créé : vérifiez la connexion Google dans Paramètres.'
        : 'Demande refusée, le créneau est de nouveau disponible.',
    )
    onChange()
  }

  return (
    <>
      {message && <MessageSucces>{message}</MessageSucces>}
      {echec && <MessageErreur>{echec}</MessageErreur>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
              {prospect ? `${prospect.prenom} ${prospect.nom}` : 'Prospect supprimé'}
            </span>
            {/* Statut à côté du nom (demande client du 2026-09-29, capture annotée) : il flottait
                jusqu'ici au milieu de la fiche, à distance de tout ce qu'il qualifie. */}
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                color: COULEUR_STATUT[rdv.statut],
                border: `1px solid ${COULEUR_STATUT[rdv.statut]}`,
                borderRadius: 999,
                padding: '3px 10px',
              }}
            >
              {LIBELLE_STATUT[rdv.statut]}
            </span>
          </span>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{quand} · {rdv.duree_minutes} min</span>
          {prospect && (
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              {prospect.email}
              {prospect.telephone ? ` · ${prospect.telephone}` : ''}
            </span>
          )}
          {prospect?.langue_visee && (
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Langue : {prospect.langue_visee}</span>
          )}
          {prospect?.objectif && (
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Objectif : {prospect.objectif}</span>
          )}
          {rdv.message && (
            <span style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>« {rdv.message} »</span>
          )}
          {rdv.motif_refus && (
            <span style={{ fontSize: 12.5, color: 'var(--danger)' }}>Motif du refus : {rdv.motif_refus}</span>
          )}
          {rdv.lien_meet && (
            <a href={rdv.lien_meet} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 700 }}>
              Lien de visioconférence
            </a>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
          {rdv.statut === 'en_attente' && profile && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              {refusEnCours ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  <input
                    value={motifRefus}
                    onChange={(e) => setMotifRefus(e.target.value)}
                    placeholder="Motif communiqué au prospect (facultatif)"
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 9,
                      padding: '9px 12px',
                      fontSize: 13,
                      color: 'var(--ink)',
                      background: 'var(--surface-alt)',
                      minWidth: 260,
                      fontFamily: 'inherit',
                    }}
                  />
                  <span style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setRefusEnCours(false)} style={{ ...boutonSecondaire, cursor: 'pointer' }}>
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={() => decider('refuser')}
                      disabled={enCours}
                      style={{ ...boutonSecondaire, color: 'var(--danger)', borderColor: 'var(--danger)', cursor: 'pointer' }}
                    >
                      {enCours ? 'En cours…' : 'Confirmer le refus'}
                    </button>
                  </span>
                </div>
              ) : (
                <span style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setRefusEnCours(true)} style={{ ...boutonSecondaire, cursor: 'pointer' }}>
                    Refuser
                  </button>
                  <button
                    type="button"
                    onClick={() => decider('confirmer')}
                    disabled={enCours}
                    className="btn-shine"
                    style={{ ...boutonPrimaireStyle, opacity: enCours ? 0.6 : 1 }}
                  >
                    {enCours ? 'Confirmation…' : 'Confirmer'}
                  </button>
                </span>
              )}
            </div>
          )}

          {rdv.statut === 'confirme' && prospect && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              {modificationEnCours ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <ChampDate
                      type="datetime-local"
                      value={nouveauDebut}
                      onChange={(e) => setNouveauDebut(e.target.value)}
                      style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '9px 12px', fontSize: 13, color: 'var(--ink)', background: 'var(--surface-alt)', fontFamily: 'inherit' }}
                    />
                    <input
                      type="number"
                      min={5}
                      max={240}
                      value={nouvelleDuree}
                      onChange={(e) => setNouvelleDuree(Number(e.target.value))}
                      title="Durée en minutes"
                      style={{ width: 70, border: '1px solid var(--border)', borderRadius: 9, padding: '9px 10px', fontSize: 13, color: 'var(--ink)', background: 'var(--surface-alt)', fontFamily: 'inherit' }}
                    />
                  </div>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setModificationEnCours(false)} style={{ ...boutonSecondaire, cursor: 'pointer' }}>
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={modifierRendezVous}
                      disabled={enCours}
                      className="btn-shine"
                      style={{ ...boutonPrimaireStyle, opacity: enCours ? 0.6 : 1 }}
                    >
                      {enCours ? 'Déplacement…' : 'Confirmer le déplacement'}
                    </button>
                  </span>
                </div>
              ) : annulationEnCours ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--muted)', maxWidth: 260, textAlign: 'right' }}>
                    Le créneau sera libéré et le prospect prévenu par e-mail.
                  </span>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setAnnulationEnCours(false)} style={{ ...boutonSecondaire, cursor: 'pointer' }}>
                      Non, garder
                    </button>
                    <button
                      type="button"
                      onClick={annulerRendezVous}
                      disabled={enCours}
                      style={{ ...boutonSecondaire, color: 'var(--danger)', borderColor: 'var(--danger)', cursor: 'pointer', opacity: enCours ? 0.6 : 1 }}
                    >
                      {enCours ? 'Annulation…' : 'Oui, annuler'}
                    </button>
                  </span>
                </div>
              ) : (
                <span style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setAnnulationEnCours(true)} style={{ ...boutonSecondaire, color: 'var(--danger)', borderColor: 'var(--danger)', cursor: 'pointer' }}>
                    Annuler
                  </button>
                  <button type="button" onClick={() => setModificationEnCours(true)} style={{ ...boutonSecondaire, cursor: 'pointer' }}>
                    Modifier
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* Fiche d'un événement créé par l'admin (voir api/admin/creer-evenement.ts) : indique explicitement
   son type — demande client du 2026-09-16, « il faut indiquer si c'est un rendez-vous Prospect,
   étudiant, professeurs ou mixte » (le cas Prospect vit dans CarteRendezVous, cette fiche-ci ne
   couvre que les trois autres). */
export function CarteEvenementAdmin({
  evenement,
  session,
  onChange,
  urlAnnulation = '/api/admin/annuler-evenement',
  urlModification = '/api/admin/modifier-evenement',
}: {
  evenement: EvenementAdminAvecParticipants
  session: { access_token: string } | null
  onChange: () => void
  /* Un professeur annule via sa propre route, restreinte à ses événements (voir
     api/professeur/annuler-evenement.ts) — demande client du 2026-09-23, « exactement comme dans
     l'espace admin » côté mécanisme, mais pas côté droits : il ne peut pas annuler le rendez-vous
     d'un autre. */
  urlAnnulation?: string
  /* Même principe pour la modification (demande client du 2026-09-29) : sa propre route,
     restreinte aux événements qu'il a lui-même créés (api/professeur/modifier-evenement.ts). */
  urlModification?: string
}) {
  const [enCours, setEnCours] = useState(false)
  const [echec, setEchec] = useState<string | null>(null)
  const [modificationEnCours, setModificationEnCours] = useState(false)
  const [titre, setTitre] = useState(evenement.titre)
  const [nouveauDebut, setNouveauDebut] = useState(() => versDatetimeLocal(new Date(evenement.debut)))
  const [nouvelleDuree, setNouvelleDuree] = useState(evenement.duree_minutes)
  const [notes, setNotes] = useState(evenement.notes ?? '')
  const [obligatoiresIds, setObligatoiresIds] = useState(() => evenement.obligatoires.map((p) => p.id))
  const [optionnelsIds, setOptionnelsIds] = useState(() => evenement.optionnels.map((p) => p.id))
  const quand = formaterDansFuseauEtablissement(evenement.debut)

  async function annuler() {
    if (!session) return
    setEnCours(true)
    setEchec(null)
    const reponse = await fetch(urlAnnulation, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ evenementId: evenement.id }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
    setEnCours(false)
    if (reponse.error) {
      setEchec(reponse.error)
      return
    }
    onChange()
  }

  /* Modifie l'horaire, le titre et les notes (demande client du 2026-09-29) — pas les
     participants, dont la réaffectation reste à faire depuis « Créer un rendez-vous » en
     annulant puis recréant, comme pour un rendez-vous prospect (voir modifierRendezVous
     ci-dessus, qui ne change lui non plus jamais le destinataire). Google Calendar prévient
     lui-même chaque invité du changement (`sendUpdates=all`, voir modifierEvenementMeet). */
  async function modifier() {
    if (!session || !titre.trim() || !nouveauDebut) return
    if (obligatoiresIds.length + optionnelsIds.length === 0) {
      setEchec('Gardez au moins un participant.')
      return
    }
    setEnCours(true)
    setEchec(null)
    const reponse = await fetch(urlModification, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        evenementId: evenement.id,
        titre: titre.trim(),
        debut: new Date(nouveauDebut).toISOString(),
        dureeMinutes: nouvelleDuree,
        notes: notes.trim(),
        obligatoiresIds,
        optionnelsIds,
      }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
    setEnCours(false)
    if (reponse.error) {
      setEchec(reponse.error)
      return
    }
    setModificationEnCours(false)
    onChange()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span
        style={{
          alignSelf: 'flex-start',
          fontSize: 11,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: 'var(--accent-violet)',
          background: 'rgba(199,156,255,.14)',
          border: '1px solid rgba(199,156,255,.32)',
          borderRadius: 999,
          padding: '4px 11px',
        }}
      >
        {typeEvenementAdmin(evenement)}
      </span>
      {modificationEnCours ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Motif du rendez-vous"
            aria-label="Motif du rendez-vous"
            style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '9px 12px', fontSize: 13, color: 'var(--ink)', background: 'var(--surface-alt)', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <ChampDate
              type="datetime-local"
              value={nouveauDebut}
              onChange={(e) => setNouveauDebut(e.target.value)}
              style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '9px 12px', fontSize: 13, color: 'var(--ink)', background: 'var(--surface-alt)', fontFamily: 'inherit', flex: 1 }}
            />
            <input
              type="number"
              min={5}
              max={480}
              value={nouvelleDuree}
              onChange={(e) => setNouvelleDuree(Number(e.target.value))}
              title="Durée en minutes"
              style={{ width: 70, border: '1px solid var(--border)', borderRadius: 9, padding: '9px 10px', fontSize: 13, color: 'var(--ink)', background: 'var(--surface-alt)', fontFamily: 'inherit' }}
            />
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (facultatif)"
            rows={2}
            style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '9px 12px', fontSize: 13, color: 'var(--ink)', background: 'var(--surface-alt)', fontFamily: 'inherit', resize: 'vertical' }}
          />
          {/* Ajouter ou retirer des participants (demande client du 2026-09-29) : les personnes
              retirées reçoivent une notification d'annulation et l'événement quitte leur agenda,
              les nouvelles une invitation, celles qui restent la mise à jour des informations
              (voir notifierModificationEvenement côté serveur). */}
          <EditeurParticipants
            obligatoiresIds={obligatoiresIds}
            optionnelsIds={optionnelsIds}
            onObligatoires={setObligatoiresIds}
            onOptionnels={setOptionnelsIds}
            participantsActuels={[...evenement.obligatoires, ...evenement.optionnels]}
          />
        </div>
      ) : (
        <>
          <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{quand} · {evenement.duree_minutes} min</span>

          {/* « Admin HOC » en tête de la liste des obligatoires dès que c'est l'admin qui a créé
              ce rendez-vous (demande client du 2026-09-29) — jamais un participant réel au sens
              de participants_obligatoires (le vivier de création ne propose pas les admins),
              donc ajouté ici à l'affichage plutôt qu'en base. Voir creeParAdmin. */}
          {(evenement.creeParAdmin || evenement.obligatoires.length > 0) && (
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Obligatoire : {[...(evenement.creeParAdmin ? [LIBELLE_ADMIN] : []), ...evenement.obligatoires.map((p) => `${p.prenom} ${p.nom}`)].join(', ')}
            </span>
          )}
          {evenement.optionnels.length > 0 && (
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Optionnel : {evenement.optionnels.map((p) => `${p.prenom} ${p.nom}`).join(', ')}
            </span>
          )}
          {evenement.notes && (
            <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)', background: 'rgba(0,0,0,.24)', borderRadius: 10, padding: '10px 12px', margin: 0 }}>
              {evenement.notes}
            </p>
          )}
          {evenement.lien_meet && (
            <a href={evenement.lien_meet} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 700 }}>
              Lien de visioconférence
            </a>
          )}
        </>
      )}
      {evenement.annule && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>Événement annulé.</span>}

      {echec && <MessageErreur>{echec}</MessageErreur>}

      {!evenement.annule && (
        <span style={{ display: 'flex', gap: 8 }}>
          {modificationEnCours ? (
            <>
              <button type="button" onClick={() => setModificationEnCours(false)} disabled={enCours} style={{ ...boutonSecondaire, cursor: 'pointer' }}>
                Annuler
              </button>
              <button
                type="button"
                onClick={modifier}
                disabled={enCours || !titre.trim()}
                className="btn-shine"
                style={{ ...boutonPrimaireStyle, opacity: enCours ? 0.6 : 1 }}
              >
                {enCours ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={annuler}
                disabled={enCours}
                style={{ ...boutonSecondaire, color: 'var(--danger)', borderColor: 'var(--danger)', cursor: 'pointer', opacity: enCours ? 0.6 : 1 }}
              >
                {enCours ? 'Annulation…' : 'Annuler le rendez-vous'}
              </button>
              <button type="button" onClick={() => setModificationEnCours(true)} style={{ ...boutonSecondaire, cursor: 'pointer' }}>
                Modifier
              </button>
            </>
          )}
        </span>
      )}
    </div>
  )
}

/* Zones « obligatoires » et « optionnelles » façon Outlook, comme à la création (voir
   FormulaireCreerEvenement dans RendezVousAdmin.tsx). Le vivier vient des hooks habituels, donc
   filtré par RLS selon l'appelant (tout l'établissement pour l'admin, ses seuls élèves pour un
   professeur) ; les participants déjà présents y sont toujours ajoutés, même hors vivier, pour
   pouvoir être retirés. Monté seulement en mode édition : les hooks ne chargent rien avant. */
function EditeurParticipants({
  obligatoiresIds,
  optionnelsIds,
  onObligatoires,
  onOptionnels,
  participantsActuels,
}: {
  obligatoiresIds: string[]
  optionnelsIds: string[]
  onObligatoires: (ids: string[]) => void
  onOptionnels: (ids: string[]) => void
  participantsActuels: { id: string; nom: string | null; prenom: string | null; role: string }[]
}) {
  const { etudiants } = useEtudiants()
  const { professeurs } = useProfesseurs()
  const candidats = useMemo(() => {
    const parId = new Map<string, PersonneSelectionnable>()
    for (const p of participantsActuels) {
      parId.set(p.id, { ...(p as unknown as PersonneSelectionnable), role: p.role === 'professeur' ? 'Professeur' : 'Étudiant' })
    }
    for (const e of etudiantsSelectionnables(etudiants)) parId.set(e.id, e)
    for (const p of professeurs) parId.set(p.id, { ...p, role: 'Professeur' } as PersonneSelectionnable)
    return [...parId.values()]
  }, [etudiants, professeurs, participantsActuels])

  return (
    <>
      <SelecteurPersonnes
        etiquette="Participants obligatoires"
        placeholder="Rechercher un nom…"
        candidats={candidats}
        selectionnes={obligatoiresIds}
        onChange={onObligatoires}
        exclure={optionnelsIds}
      />
      <SelecteurPersonnes
        etiquette="Participants optionnels"
        placeholder="Rechercher un nom…"
        candidats={candidats}
        selectionnes={optionnelsIds}
        onChange={onOptionnels}
        exclure={obligatoiresIds}
      />
    </>
  )
}

/* Reconnaît le préfixe d'un id d'EvenementAgenda (voir lib/agendaEvenements.ts) et ouvre la fiche
   qui va avec — `null` si l'id ne correspond à aucun rendez-vous prospect ni événement admin
   connus (l'appelant gère alors lui-même son propre type d'événement, ex. une séance de cours). */
export function PopupEvenementAdmin({
  elementOuvertId,
  onFermer,
  rendezVous,
  evenementsAdmin,
  profile,
  session,
  onChange,
  urlAnnulation,
  urlModification,
}: {
  elementOuvertId: string | null
  onFermer: () => void
  rendezVous: RendezVousAvecProspect[]
  evenementsAdmin: EvenementAdminAvecParticipants[]
  profile: { id: string } | null
  session: { access_token: string } | null
  onChange: () => void
  urlAnnulation?: string
  urlModification?: string
}) {
  const rdvOuvert = elementOuvertId?.startsWith(PREFIXE_PROSPECT)
    ? rendezVous.find((r) => r.id === elementOuvertId!.slice(PREFIXE_PROSPECT.length))
    : undefined
  const evenementOuvert = elementOuvertId?.startsWith(PREFIXE_EVENEMENT)
    ? evenementsAdmin.find((e) => e.id === elementOuvertId!.slice(PREFIXE_EVENEMENT.length))
    : undefined

  if (rdvOuvert) {
    return (
      <Modale titre={formaterDansFuseauEtablissement(rdvOuvert.debut)} onFermer={onFermer} largeurMax={520}>
        <CarteRendezVous rdv={rdvOuvert} profile={profile} onChange={onChange} />
      </Modale>
    )
  }
  if (evenementOuvert) {
    return (
      <Modale titre={evenementOuvert.titre} onFermer={onFermer} largeurMax={480}>
        <CarteEvenementAdmin evenement={evenementOuvert} session={session} onChange={onChange} urlAnnulation={urlAnnulation} urlModification={urlModification} />
      </Modale>
    )
  }
  return null
}

/* Vrai si l'id vient de l'agenda admin (rendez-vous prospect ou événement) — pour qu'un agenda
   qui mélange ces événements avec les siens propres (ex. Séances & visio, filtre « Admin ») sache
   à qui confier l'ouverture de la fiche sans dupliquer la logique de préfixe. */
export function estEvenementAdmin(id: string | null): boolean {
  return !!id && (id.startsWith(PREFIXE_PROSPECT) || id.startsWith(PREFIXE_EVENEMENT))
}
