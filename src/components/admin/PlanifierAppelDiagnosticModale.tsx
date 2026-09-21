import { useEffect, useMemo, useState } from 'react'
import { useRendezVous } from '../../hooks/useRendezVous'
import { useEvenementsAdmin } from '../../hooks/useEvenementsAdmin'
import { supabase } from '../../lib/supabaseClient'
import { lundiDeLaSemaine } from '../../lib/agenda'
import { agendaAdminComplet, PREFIXE_PROSPECT } from '../../lib/agendaEvenements'
import { formaterDansFuseauEtablissement } from '../../lib/etablissement'
import type { EvenementAgenda } from '../../lib/agenda'
import { Modale } from '../ui/Modale'
import { AgendaHebdo } from '../ui/AgendaHebdo'
import { EtatChargement, MessageErreur, MessageSucces } from '../ui/Etats'
import { boutonDangerStyle, boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { Champ, LigneInfo, champStyle } from '../ui/Champ'
import { PopupEvenementAdmin, estEvenementAdmin } from '../shared/PopupEvenementAdmin'

interface ProspectAPlanifier {
  id: string
  etablissement_id: string
  prenom: string
  nom: string
}

/* Fenêtre de planification d'un appel diagnostic — demande client du 2026-09-21 : remplace le
   bouton « Ouvrir Calendly » (et l'ancien formulaire de date isolé, qui ne créait qu'une note
   interne sans vrai rendez-vous) par l'agenda réel de l'admin, à l'état instantané. Cliquer un
   créneau libre réserve (ou déplace, si ce prospect a déjà un rendez-vous actif) ; cliquer le
   rendez-vous de CE prospect propose de l'annuler. Les autres événements de l'agenda ne sont là
   que pour donner le contexte — cette fenêtre ne gère que le rendez-vous du prospect ouvert. */
export function PlanifierAppelDiagnosticModale({
  prospect,
  profile,
  session,
  onFermer,
  onChange,
}: {
  prospect: ProspectAPlanifier
  profile: { id: string } | null
  session: { access_token: string }
  onFermer: () => void
  onChange: () => void
}) {
  const { rendezVous, loading: chargementRdv, recharger: rechargerRdv } = useRendezVous()
  const { evenements: evenementsAdmin, loading: chargementEvenements, recharger: rechargerEvenements } = useEvenementsAdmin()
  const [dureeDefaut, setDureeDefaut] = useState(15)
  const [semaineDebut, setSemaineDebut] = useState(() => lundiDeLaSemaine(new Date()))
  const [creneauChoisi, setCreneauChoisi] = useState<Date | null>(null)
  const [duree, setDuree] = useState(15)
  const [annulationOuverte, setAnnulationOuverte] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  /* Fiche d'un événement de l'agenda qui n'est PAS celui de ce prospect — un clic dessus doit lui
     aussi ouvrir un pop-up avec ses informations, comme partout ailleurs dans l'application
     (demande client du 2026-09-21 : « il faut le rendre uniforme »). L'annulation du rendez-vous
     DE CE prospect reste gérée séparément ci-dessous (surlignée en rouge, un clic propose
     directement l'annulation) : cette fenêtre reste dédiée à SON rendez-vous, les autres
     événements ne sont ouverts qu'en consultation/action ponctuelle, jamais pour re-planifier
     depuis ici le rendez-vous de quelqu'un d'autre. */
  const [autreElementOuvertId, setAutreElementOuvertId] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('reservation_parametres')
      .select('duree_minutes')
      .eq('etablissement_id', prospect.etablissement_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.duree_minutes) {
          setDureeDefaut(data.duree_minutes)
          setDuree(data.duree_minutes)
        }
      })
  }, [prospect.etablissement_id])

  const rdvDuProspect = useMemo(
    () => rendezVous.find((r) => r.prospect_id === prospect.id && (r.statut === 'en_attente' || r.statut === 'confirme')),
    [rendezVous, prospect.id],
  )

  // Se cadre sur la semaine du rendez-vous déjà pris pour ce prospect, s'il y en a un — sinon la
  // semaine courante, pour repérer tout de suite le premier créneau libre.
  useEffect(() => {
    if (rdvDuProspect) setSemaineDebut(lundiDeLaSemaine(new Date(rdvDuProspect.debut)))
  }, [rdvDuProspect?.id])

  const evenements = useMemo<EvenementAgenda[]>(() => {
    const tous = agendaAdminComplet(rendezVous, evenementsAdmin)
    if (!rdvDuProspect) return tous
    const idCible = PREFIXE_PROSPECT + rdvDuProspect.id
    return tous.map((e) => (e.id === idCible ? { ...e, ton: 'danger', marqueur: 'ce prospect' } : e))
  }, [rendezVous, evenementsAdmin, rdvDuProspect])

  function recharger() {
    rechargerRdv()
    rechargerEvenements()
  }

  async function appelServeur(url: string, corps: object) {
    const reponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(corps),
    })
    const resultat = await reponse.json().catch(() => null)
    if (!reponse.ok) return { error: resultat?.error ?? 'La demande a échoué.' }
    return { data: resultat }
  }

  async function confirmerCreneau() {
    if (!creneauChoisi) return
    setEnCours(true)
    setErreur(null)
    setMessage(null)
    const { error } = await appelServeur('/api/admin/planifier-rendez-vous', {
      prospectId: prospect.id,
      debut: creneauChoisi.toISOString(),
      dureeMinutes: duree,
    })
    setEnCours(false)
    if (error) {
      setErreur(error)
      return
    }
    setCreneauChoisi(null)
    setMessage(rdvDuProspect ? 'Rendez-vous déplacé et prospect prévenu par e-mail.' : 'Rendez-vous réservé et confirmation envoyée au prospect.')
    recharger()
    onChange()
  }

  async function annuler() {
    if (!rdvDuProspect) return
    setEnCours(true)
    setErreur(null)
    setMessage(null)
    const { error } = await appelServeur('/api/admin/annuler-rendez-vous', { rendezVousId: rdvDuProspect.id })
    setEnCours(false)
    if (error) {
      setErreur(error)
      return
    }
    setAnnulationOuverte(false)
    setMessage('Rendez-vous annulé, prospect prévenu par e-mail.')
    recharger()
    onChange()
  }

  const chargement = chargementRdv || chargementEvenements

  return (
    <Modale titre={`Planifier un appel diagnostic · ${prospect.prenom} ${prospect.nom}`} onFermer={onFermer} largeurMax={780}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.55 }}>
          {rdvDuProspect
            ? 'Ce prospect a déjà un rendez-vous actif, repéré en rouge ci-dessous. Cliquez un autre créneau libre pour le déplacer, ou son propre événement pour l’annuler.'
            : 'Cliquez un créneau libre de votre agenda pour réserver l’appel diagnostic de ce prospect. Les autres événements affichés ne sont là que pour éviter un double engagement.'}
        </p>

        {message && <MessageSucces>{message}</MessageSucces>}
        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        {rdvDuProspect && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flexGrow: 1 }}>
              Rendez-vous actuel : <strong>{formaterDansFuseauEtablissement(rdvDuProspect.debut)}</strong>
              {rdvDuProspect.statut === 'en_attente' ? ' (à valider)' : ''}
            </span>
            <button onClick={() => setAnnulationOuverte(true)} style={boutonDangerStyle}>
              Annuler ce rendez-vous
            </button>
          </div>
        )}

        {chargement ? (
          <EtatChargement lignes={3} hauteur={90} />
        ) : (
          <AgendaHebdo
            evenements={evenements}
            semaineDebut={semaineDebut}
            onSemaineChange={setSemaineDebut}
            onCreneauLibre={(debut) => {
              setCreneauChoisi(debut)
              setDuree(dureeDefaut)
            }}
            onSelectionner={(evenement) => {
              if (rdvDuProspect && evenement.id === PREFIXE_PROSPECT + rdvDuProspect.id) {
                setAnnulationOuverte(true)
                return
              }
              if (estEvenementAdmin(evenement.id)) setAutreElementOuvertId(evenement.id)
            }}
            videMessage="Aucun événement cette semaine dans l’agenda de l’établissement."
          />
        )}

      </div>

      {/* Pop-up de confirmation du créneau cliqué — demande client du 2026-09-21 : « quand je
          clique sur un créneau dans l'agenda, il n'y a toujours pas de pop-up avec les
          informations du créneau choisi et les boutons de validation ou d'annulation ». C'était
          auparavant un bandeau rendu SOUS la grille : l'agenda faisant toute la hauteur de la
          fenêtre, il tombait hors de l'écran et le clic semblait sans effet. */}
      {creneauChoisi && (
        <Modale
          titre={rdvDuProspect ? 'Déplacer le rendez-vous' : 'Réserver ce créneau'}
          onFermer={() => setCreneauChoisi(null)}
          largeurMax={430}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '11px 13px', borderRadius: 10, border: '1px solid var(--accent-blue)', background: 'rgba(94,179,255,.08)' }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--accent-blue)' }}>
                Créneau choisi
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                {formaterDansFuseauEtablissement(creneauChoisi.toISOString())}
              </span>
            </div>

            <LigneInfo label="Prospect" valeur={`${prospect.prenom} ${prospect.nom}`} />
            {rdvDuProspect && (
              <LigneInfo label="Rendez-vous actuel" valeur={formaterDansFuseauEtablissement(rdvDuProspect.debut)} />
            )}

            <Champ label="Durée (minutes)">
              <input
                type="number"
                min={5}
                max={240}
                value={duree}
                onChange={(e) => setDuree(Number(e.target.value))}
                style={champStyle}
              />
            </Champ>

            {erreur && <MessageErreur>{erreur}</MessageErreur>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setCreneauChoisi(null)} style={{ ...boutonNeutreStyle, flexGrow: 1 }}>
                Annuler
              </button>
              <button
                onClick={confirmerCreneau}
                disabled={enCours}
                className="btn-shine"
                style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours ? 0.7 : 1 }}
              >
                {enCours ? 'Enregistrement…' : rdvDuProspect ? 'Confirmer le déplacement' : 'Confirmer la réservation'}
              </button>
            </div>
          </div>
        </Modale>
      )}

      {/* Même traitement pour l'annulation : pop-up plutôt qu'un bandeau, pour que la
          confirmation soit toujours sous les yeux quelle que soit la position du défilement. */}
      {annulationOuverte && rdvDuProspect && (
        <Modale titre="Annuler ce rendez-vous" onFermer={() => setAnnulationOuverte(false)} largeurMax={420}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <LigneInfo label="Prospect" valeur={`${prospect.prenom} ${prospect.nom}`} />
            <LigneInfo label="Rendez-vous" valeur={formaterDansFuseauEtablissement(rdvDuProspect.debut)} />
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)', margin: 0 }}>
              Le créneau sera libéré et le prospect prévenu par e-mail.
            </p>

            {erreur && <MessageErreur>{erreur}</MessageErreur>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setAnnulationOuverte(false)} style={{ ...boutonNeutreStyle, flexGrow: 1 }}>
                Non, garder
              </button>
              <button onClick={annuler} disabled={enCours} style={{ ...boutonDangerStyle, flexGrow: 1, opacity: enCours ? 0.7 : 1 }}>
                {enCours ? 'Annulation…' : 'Oui, annuler'}
              </button>
            </div>
          </div>
        </Modale>
      )}

      <PopupEvenementAdmin
        elementOuvertId={autreElementOuvertId}
        onFermer={() => setAutreElementOuvertId(null)}
        rendezVous={rendezVous}
        evenementsAdmin={evenementsAdmin}
        profile={profile}
        session={session}
        onChange={recharger}
      />
    </Modale>
  )
}
