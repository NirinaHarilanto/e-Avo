import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { RendezVousAvecProspect } from '../../hooks/useRendezVous'
import type { EvenementAdminAvecParticipants } from '../../hooks/useEvenementsAdmin'
import { PREFIXE_PROSPECT, PREFIXE_EVENEMENT, typeEvenementAdmin } from '../../lib/agendaEvenements'
import { formaterDansFuseauEtablissement } from '../../lib/etablissement'
import type { StatutRendezVous } from '../../types/database.types'
import { Modale } from '../ui/Modale'
import { MessageErreur, MessageSucces } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'

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

  const prospect = rdv.prospects
  const quand = formaterDansFuseauEtablissement(rdv.debut)

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
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
            {prospect ? `${prospect.prenom} ${prospect.nom}` : 'Prospect supprimé'}
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
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              color: COULEUR_STATUT[rdv.statut],
            }}
          >
            {LIBELLE_STATUT[rdv.statut]}
          </span>

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
}: {
  evenement: EvenementAdminAvecParticipants
  session: { access_token: string } | null
  onChange: () => void
}) {
  const [enCours, setEnCours] = useState(false)
  const [echec, setEchec] = useState<string | null>(null)
  const quand = formaterDansFuseauEtablissement(evenement.debut)

  async function annuler() {
    if (!session) return
    setEnCours(true)
    setEchec(null)
    const reponse = await fetch('/api/admin/annuler-evenement', {
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
      <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{quand} · {evenement.duree_minutes} min</span>

      {evenement.obligatoires.length > 0 && (
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          Obligatoire : {evenement.obligatoires.map((p) => `${p.prenom} ${p.nom}`).join(', ')}
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
      {evenement.annule && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>Événement annulé.</span>}

      {echec && <MessageErreur>{echec}</MessageErreur>}

      {!evenement.annule && (
        <button
          type="button"
          onClick={annuler}
          disabled={enCours}
          style={{ ...boutonSecondaire, alignSelf: 'flex-start', color: 'var(--danger)', borderColor: 'var(--danger)', cursor: 'pointer', opacity: enCours ? 0.6 : 1 }}
        >
          {enCours ? 'Annulation…' : 'Annuler le rendez-vous'}
        </button>
      )}
    </div>
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
}: {
  elementOuvertId: string | null
  onFermer: () => void
  rendezVous: RendezVousAvecProspect[]
  evenementsAdmin: EvenementAdminAvecParticipants[]
  profile: { id: string } | null
  session: { access_token: string } | null
  onChange: () => void
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
        <CarteEvenementAdmin evenement={evenementOuvert} session={session} onChange={onChange} />
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
