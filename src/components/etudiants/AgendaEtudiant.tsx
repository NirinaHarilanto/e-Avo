import { useMemo, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useDossierEtudiant, type SeanceDuParcours } from '../../hooks/useDossierEtudiant'
import { getJoinUrl } from '../../lib/visio'
import { lundiDeLaSemaine, type EvenementAgenda } from '../../lib/agenda'
import { EtudiantLayout } from '../layout/EtudiantLayout'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { AgendaHebdo } from '../ui/AgendaHebdo'
import { Modale } from '../ui/Modale'
import { LigneInfo } from '../ui/Champ'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { EtatVide } from '../ui/EtatVide'
import { BadgeStatutSeance } from '../shared/BadgeStatutSeance'
import { useRafraichirSurNotification } from '../../hooks/useRafraichirSurNotification'
import { useCacheRequete } from '../../hooks/useCacheRequete'
import { supabase } from '../../lib/supabaseClient'

const PREFIXE_RDV = 'rdv:'
const PREFIXE_EVT = 'evt:'

interface MonRendezVous {
  id: string
  debut: string
  duree_minutes: number
  statut: 'en_attente' | 'confirme'
  lien_meet: string | null
}

interface MonEvenement {
  id: string
  titre: string
  debut: string
  duree_minutes: number
  lien_meet: string | null
}

interface MesRendezVous {
  rendezVous: MonRendezVous[]
  evenements: MonEvenement[]
}

async function chargerMonRendezVous(): Promise<MesRendezVous> {
  const { data: session } = await supabase.auth.getSession()
  const reponse = await fetch('/api/etudiant/mon-rendez-vous', {
    headers: { Authorization: `Bearer ${session.session?.access_token}` },
  })
  const corps = (await reponse.json().catch(() => null)) as { rendezVous?: MonRendezVous[]; evenements?: MonEvenement[]; error?: string } | null
  if (!reponse.ok) throw new Error(corps?.error ?? 'Rendez-vous indisponible.')
  return { rendezVous: corps?.rendezVous ?? [], evenements: corps?.evenements ?? [] }
}

/* Agenda de l'élève : même grille horaire que celle du professeur et de l'administration, mais
   sans aucune action — un élève consulte son emploi du temps, il ne le modifie pas. Les séances
   viennent du dossier déjà chargé (useDossierEtudiant), aucune requête supplémentaire. */
export function AgendaEtudiant() {
  const { idEtudiantEffectif, derniereNotification } = useProfileContext()
  const { dossier, loading, erreur, recharger } = useDossierEtudiant(idEtudiantEffectif ?? undefined)
  /* Couche 2 de la stratégie temps réel du 2026-09-29 : une séance reprogrammée/annulée
     recharge l'agenda de l'élève sans qu'il ait à rafraîchir — voir
     useRafraichirSurNotification.ts. */
  useRafraichirSurNotification(derniereNotification, ['seance_reprogrammee', 'seance_annulee', 'seance_reportee', 'absence_comptabilisee'], recharger)
  const [semaineDebut, setSemaineDebut] = useState(() => lundiDeLaSemaine(new Date()))
  const [seanceOuverteId, setSeanceOuverteId] = useState<string | null>(null)

  const seances = useMemo(() => (dossier?.periodes ?? []).flatMap((p) => p.seances), [dossier])
  const professeurParSeance = useMemo(() => {
    const table = new Map<string, string>()
    for (const periode of dossier?.periodes ?? []) {
      const nom = periode.professeur ? `${periode.professeur.prenom} ${periode.professeur.nom}` : 'Professeur'
      for (const seance of periode.seances) table.set(seance.session.id, nom)
    }
    return table
  }, [dossier])

  const evenements = useMemo(
    () =>
      seances.map((seance): EvenementAgenda => ({
        id: seance.session.id,
        debut: seance.session.debut,
        dureeMinutes: seance.session.duree_minutes,
        titre: professeurParSeance.get(seance.session.id) ?? 'Cours',
        sousTitre: `${seance.session.type === 'individuel' ? 'Cours individuel' : 'Cours collectif'} · ${seance.session.duree_minutes} min`,
        // 'reportee' (0085) : absence à la clôture, séance reportée — traitée comme 'annulee' à
        // l'affichage (cette occurrence n'a pas eu lieu), statut exact lisible via `statut`.
        ton: seance.session.statut === 'terminee' ? 'teal' : seance.session.statut === 'annulee' || seance.session.statut === 'reportee' ? 'neutre' : 'bleu',
        attenue: seance.session.statut === 'annulee' || seance.session.statut === 'reportee',
        statut: seance.session.statut === 'reportee' ? 'Reportée' : seance.session.statut === 'annulee' ? 'Annulée' : undefined,
      })),
    [seances, professeurParSeance],
  )

  const seanceOuverte = seances.find((s) => s.session.id === seanceOuverteId) ?? null

  /* Rendez-vous d'appel diagnostic pris avant la conversion en étudiant — demande client du
     2026-09-29 : il n'apparaissait nulle part dans l'espace de l'élève (lecture réservée à
     l'admin par RLS, voir api/etudiant/mon-rendez-vous.ts). */
  const { valeur: rendezVous, recharger: rechargerRendezVous } = useCacheRequete(
    `mon-rendez-vous-${idEtudiantEffectif}`,
    chargerMonRendezVous,
    { intervalleSondageMs: 25_000 },
  )
  useRafraichirSurNotification(derniereNotification, ['seance_reprogrammee', 'seance_annulee', 'rendez_vous_deplace', 'rendez_vous_annule', 'evenement_annule', 'evenement_invitation', 'evenement_modifie'], rechargerRendezVous)
  const [rdvOuvertId, setRdvOuvertId] = useState<string | null>(null)
  const evenementsRdv = useMemo(
    () => [
      ...(rendezVous?.evenements ?? []).map((e): EvenementAgenda => ({
        id: PREFIXE_EVT + e.id,
        debut: e.debut,
        dureeMinutes: e.duree_minutes,
        titre: e.titre,
        sousTitre: `Rendez-vous · ${e.duree_minutes} min`,
        ton: 'violet',
        statut: 'Invité(e)',
      })),
      ...(rendezVous?.rendezVous ?? []).map((rdv): EvenementAgenda => ({
        id: PREFIXE_RDV + rdv.id,
        debut: rdv.debut,
        dureeMinutes: rdv.duree_minutes,
        titre: 'Appel diagnostic',
        sousTitre: `Rendez-vous · ${rdv.duree_minutes} min`,
        ton: 'or',
        statut: rdv.statut === 'confirme' ? 'Confirmé' : 'À valider',
      })),
    ],
    [rendezVous],
  )
  const rdvOuvert = (rendezVous?.rendezVous ?? []).find((r) => PREFIXE_RDV + r.id === rdvOuvertId) ?? null
  const evenementOuvert = (rendezVous?.evenements ?? []).find((e) => PREFIXE_EVT + e.id === rdvOuvertId) ?? null

  return (
    <EtudiantLayout actif="Mon agenda">
      <EnTetePage
        titre="Mon agenda"
        description="Vos cours de la semaine, heure par heure. Cliquez sur un cours pour voir son professeur, sa durée et son lien de visioconférence."
      />

      <GuidePage
        id="etudiant-agenda"
        etapes={[
          <>
            Utilisez les flèches pour changer de semaine, et <strong>Aujourd’hui</strong> pour revenir à la semaine en
            cours.
          </>,
          <>
            Un cours <strong>à venir</strong> apparaît en bleu, un cours <strong>déjà donné</strong> en vert, un cours
            annulé en grisé.
          </>,
          <>
            Le lien <strong>Rejoindre le cours</strong> se trouve dans la fiche du cours : cliquez dessus quelques
            minutes avant le début.
          </>,
          <>
            Cet agenda est alimenté par votre professeur et par l’administration. Si un horaire vous semble faux,
            signalez-le à votre établissement plutôt que de l’ignorer.
          </>,
        ]}
      />

      {loading && <EtatChargement lignes={3} hauteur={110} />}
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      {!loading && !erreur && !dossier && (
        <EtatVide
          icone="seances"
          titre="Votre agenda est encore vide"
          description="Il se remplira dès qu’un professeur vous aura été attribué et que vos premiers cours seront planifiés."
        />
      )}

      {dossier && (
        <AgendaHebdo
          evenements={[...evenements, ...evenementsRdv]}
          semaineDebut={semaineDebut}
          onSemaineChange={setSemaineDebut}
          onSelectionner={(evenement) => (evenement.id.startsWith(PREFIXE_RDV) || evenement.id.startsWith(PREFIXE_EVT) ? setRdvOuvertId(evenement.id) : setSeanceOuverteId(evenement.id))}
          videMessage="Aucun cours cette semaine. Changez de semaine avec les flèches pour voir les suivants."
        />
      )}

      {evenementOuvert && (
        <Modale
          titre={new Date(evenementOuvert.debut).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}
          onFermer={() => setRdvOuvertId(null)}
          largeurMax={430}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <LigneInfo label="Motif" valeur={evenementOuvert.titre} />
            <LigneInfo label="Durée" valeur={`${evenementOuvert.duree_minutes} minutes`} />
            {evenementOuvert.lien_meet && (
              <a
                href={evenementOuvert.lien_meet}
                target="_blank"
                rel="noreferrer"
                className="btn-shine"
                style={{ textAlign: 'center', padding: '11px 18px', background: 'var(--accent-blue-gradient)', color: '#fff', fontSize: 13, fontWeight: 700 }}
              >
                Rejoindre la visioconférence
              </a>
            )}
          </div>
        </Modale>
      )}

      {rdvOuvert && (
        <Modale
          titre={new Date(rdvOuvert.debut).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}
          onFermer={() => setRdvOuvertId(null)}
          largeurMax={430}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <LigneInfo label="Rendez-vous" valeur="Appel diagnostic" />
            <LigneInfo label="Statut" valeur={rdvOuvert.statut === 'confirme' ? 'Confirmé' : 'À valider'} />
            <LigneInfo label="Durée" valeur={`${rdvOuvert.duree_minutes} minutes`} />
            {rdvOuvert.lien_meet && (
              <a
                href={rdvOuvert.lien_meet}
                target="_blank"
                rel="noreferrer"
                className="btn-shine"
                style={{ textAlign: 'center', padding: '11px 18px', background: 'var(--accent-blue-gradient)', color: '#fff', fontSize: 13, fontWeight: 700 }}
              >
                Rejoindre la visioconférence
              </a>
            )}
          </div>
        </Modale>
      )}

      {seanceOuverte && (
        <FicheSeance
          seance={seanceOuverte}
          professeur={professeurParSeance.get(seanceOuverte.session.id) ?? 'Professeur'}
          onFermer={() => setSeanceOuverteId(null)}
        />
      )}
    </EtudiantLayout>
  )
}

function FicheSeance({
  seance,
  professeur,
  onFermer,
}: {
  seance: SeanceDuParcours
  professeur: string
  onFermer: () => void
}) {
  const aVenir = seance.session.statut === 'planifiee'
  return (
    <Modale
      titre={new Date(seance.session.debut).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}
      onFermer={onFermer}
      largeurMax={430}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <BadgeStatutSeance statut={seance.session.statut} />
        </div>
        <LigneInfo label="Professeur" valeur={professeur} />
        <LigneInfo label="Type" valeur={seance.session.type === 'individuel' ? 'Cours individuel' : 'Cours collectif'} />
        <LigneInfo label="Durée" valeur={`${seance.session.duree_minutes} minutes`} />
        {seance.session.statut === 'terminee' && (
          <LigneInfo label="Présence" valeur={seance.enrollment.present ? 'Présent' : 'Absent'} />
        )}
        {aVenir && seance.video && (
          <a
            href={getJoinUrl(seance.video)}
            target="_blank"
            rel="noreferrer"
            className="btn-shine"
            style={{ textAlign: 'center', padding: '11px 18px', background: 'var(--accent-blue-gradient)', color: '#fff', fontSize: 13, fontWeight: 700 }}
          >
            Rejoindre le cours
          </a>
        )}
      </div>
    </Modale>
  )
}
