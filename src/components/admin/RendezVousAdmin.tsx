import { useMemo, useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useRendezVous, type RendezVousAvecProspect } from '../../hooks/useRendezVous'
import { supabase } from '../../lib/supabaseClient'
import type { StatutRendezVous } from '../../types/database.types'
import { lundiDeLaSemaine, type EvenementAgenda } from '../../lib/agenda'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur, MessageSucces } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { Section } from '../ui/Section'
import { Onglets } from '../ui/Onglets'
import { Modale } from '../ui/Modale'
import { AgendaHebdo } from '../ui/AgendaHebdo'

type VueRendezVous = 'agenda' | 'liste'

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

/* Teinte de la pastille dans la grille horaire — même vocabulaire que le calendrier professeur
   (voir lib/agenda.ts) : or pour ce qui attend une décision, bleu pour ce qui est confirmé (donc
   déjà dans l'agenda Google avec son lien Meet), neutre et grisé pour ce qui est clos sans suite. */
function versEvenement(rdv: RendezVousAvecProspect): EvenementAgenda {
  const prospect = rdv.prospects
  const nomProspect = prospect ? `${prospect.prenom} ${prospect.nom}` : 'Prospect supprimé'
  return {
    id: rdv.id,
    debut: rdv.debut,
    dureeMinutes: rdv.duree_minutes,
    titre: nomProspect,
    sousTitre: `Appel diagnostic${prospect?.langue_visee ? ` · ${prospect.langue_visee}` : ''}`,
    ton: rdv.statut === 'confirme' ? 'bleu' : rdv.statut === 'en_attente' ? 'or' : 'neutre',
    attenue: rdv.statut === 'refuse' || rdv.statut === 'annule',
    marqueur: rdv.statut === 'en_attente' ? 'à valider' : undefined,
  }
}

export function RendezVousAdmin() {
  const { profile } = useProfileContext()
  const { rendezVous, loading, erreur, recharger } = useRendezVous()
  const [vue, setVue] = useState<VueRendezVous>('agenda')
  const [onglet, setOnglet] = useState('À valider')
  const [semaineDebut, setSemaineDebut] = useState(() => lundiDeLaSemaine(new Date()))
  /* Retenu par identifiant plutôt que par valeur : après une décision, `recharger()` remplace
     l'objet et la fiche ouverte doit refléter le nouveau statut, pas celui capturé au clic. */
  const [rdvOuvertId, setRdvOuvertId] = useState<string | null>(null)

  const enAttente = rendezVous.filter((r) => r.statut === 'en_attente')
  const confirmes = rendezVous.filter((r) => r.statut === 'confirme')
  const traites = rendezVous.filter((r) => r.statut === 'refuse' || r.statut === 'annule')
  const liste = onglet === 'À valider' ? enAttente : onglet === 'Confirmés' ? confirmes : traites

  const evenements = useMemo(() => rendezVous.map(versEvenement), [rendezVous])
  const rdvOuvert = rendezVous.find((r) => r.id === rdvOuvertId) ?? null

  return (
    <AdminLayout actif="Rendez-vous">
      <EnTetePage
        compact
        titre="Demandes d’appel diagnostic"
        description="Les créneaux réservés depuis la page d’accueil arrivent ici. Validez-les pour créer l’événement d’agenda et le lien de visioconférence."
        actions={
          <Onglets
            etiquette="Mode d’affichage"
            actif={vue}
            onChange={setVue}
            onglets={[
              { value: 'agenda', label: 'Agenda' },
              { value: 'liste', label: 'Liste' },
            ]}
          />
        }
      />

      <GuidePage
        id="admin-rendez-vous"
        compact
        etapes={[
          <>
            Un visiteur choisit un créneau sur la page d’accueil : sa demande apparaît dans{' '}
            <strong>À valider</strong> et vous recevez une notification (cloche en haut à droite).
          </>,
          <>
            <strong>Confirmer</strong> crée l’événement dans l’agenda Google de l’établissement avec un lien Meet, et
            envoie l’invitation au prospect. <strong>Refuser</strong> libère le créneau pour quelqu’un d’autre.
          </>,
          <>
            L’<strong>agenda</strong> montre votre semaine heure par heure, comme Outlook : cliquez un rendez-vous
            pour l’ouvrir et décider. La <strong>liste</strong> reste utile pour trier par statut.
          </>,
          <>
            Les créneaux proposés au public se règlent dans <strong>Paramètres → Disponibilités</strong> : jours,
            horaires, durée de l’appel et délai minimum avant réservation.
          </>,
        ]}
      />

      <GrilleStats>
        <Stat libelle="À valider" valeur={enAttente.length} />
        <Stat libelle="Confirmés à venir" valeur={confirmes.filter((r) => new Date(r.debut) > new Date()).length} />
        <Stat libelle="Total des demandes" valeur={rendezVous.length} />
      </GrilleStats>

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {loading && <EtatChargement lignes={3} hauteur={92} />}

      {!loading && vue === 'agenda' && (
        <AgendaHebdo
          evenements={evenements}
          semaineDebut={semaineDebut}
          onSemaineChange={setSemaineDebut}
          onSelectionner={(evenement) => setRdvOuvertId(evenement.id)}
          videMessage="Aucune demande de rendez-vous cette semaine. Utilisez les flèches pour changer de semaine."
          legende={
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--muted)' }}>
              <PastilleLegende couleur="var(--accent-gold)" libelle="À valider" />
              <PastilleLegende couleur="var(--accent-blue)" libelle="Confirmé" />
              <PastilleLegende couleur="var(--muted-2)" libelle="Refusé / Annulé" />
            </div>
          }
        />
      )}

      {!loading && vue === 'liste' && (
        <>
          <Onglets
            etiquette="Filtre des demandes"
            onglets={[
              { value: 'À valider', label: 'À valider', compteur: enAttente.length },
              { value: 'Confirmés', label: 'Confirmés', compteur: confirmes.length },
              { value: 'Historique', label: 'Historique', compteur: traites.length },
            ]}
            actif={onglet}
            onChange={setOnglet}
          />

          {liste.length === 0 && (
            <EtatVide
              icone="seances"
              titre={onglet === 'À valider' ? 'Aucune demande en attente' : 'Rien à afficher'}
              description={
                onglet === 'À valider'
                  ? 'Les nouvelles demandes de rendez-vous prises depuis la page d’accueil apparaîtront ici.'
                  : 'Aucun rendez-vous dans cette catégorie pour le moment.'
              }
            />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {liste.map((rdv) => (
              <Section key={rdv.id} padding={18}>
                <CarteRendezVous rdv={rdv} profile={profile} onChange={recharger} />
              </Section>
            ))}
          </div>
        </>
      )}

      {rdvOuvert && (
        <Modale
          titre={new Date(rdvOuvert.debut).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}
          onFermer={() => setRdvOuvertId(null)}
          largeurMax={520}
        >
          <CarteRendezVous rdv={rdvOuvert} profile={profile} onChange={recharger} />
        </Modale>
      )}
    </AdminLayout>
  )
}

function PastilleLegende({ couleur, libelle }: { couleur: string; libelle: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 9, height: 9, borderRadius: 999, background: couleur, flexShrink: 0 }} />
      {libelle}
    </span>
  )
}

/* Fiche d'une demande : détail du prospect et, si elle est encore en attente, les actions de
   décision. Reprise à l'identique dans la liste (avec le cadre de Section posé par l'appelant) et
   dans la modale ouverte depuis l'agenda — un seul endroit où vivent la logique de décision et
   son affichage. */
function CarteRendezVous({
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
  const quand = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(rdv.debut))

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
