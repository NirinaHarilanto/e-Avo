import { useMemo, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useDossierEtudiant, type SeanceDuParcours } from '../../hooks/useDossierEtudiant'
import { getJoinUrl } from '../../lib/visio'
import { lundiDeLaSemaine, type EvenementAgenda } from '../../lib/agenda'
import { LIBELLE_ADMIN, seanceSansEffet } from '../../lib/agendaEvenements'
import { EtudiantLayout } from '../layout/EtudiantLayout'
import { EnTetePage } from '../ui/EnTetePage'
import { AgendaHebdo } from '../ui/AgendaHebdo'
import { Modale } from '../ui/Modale'
import { LigneInfo } from '../ui/Champ'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { EtatVide } from '../ui/EtatVide'
import { BadgeStatutSeance } from '../shared/BadgeStatutSeance'
import { CompteRenduAffichage } from '../shared/CompteRenduAffichage'
import { BoutonRejoindreVisio } from '../shared/BoutonRejoindreVisio'
import { SectionRepliable, intituleAccentStyle } from '../shared/SectionRepliable'
import { useRafraichirSurNotification } from '../../hooks/useRafraichirSurNotification'
import { useCacheRequete } from '../../hooks/useCacheRequete'
import { useDetailSeance } from '../../hooks/useDetailSeance'
import { supabase } from '../../lib/supabaseClient'

const PREFIXE_RDV = 'rdv:'
const PREFIXE_EVT = 'evt:'

interface ParticipantResolu {
  id: string
  prenom: string | null
  nom: string | null
  role: string
}

interface MonRendezVous {
  id: string
  debut: string
  duree_minutes: number
  statut: 'en_attente' | 'confirme'
  lien_meet: string | null
  // Détails enrichis le 2026-09-29 (pièce jointe client, « personnes incluses dans
  // l'invitation... les détails du rendez-vous ») — voir api/etudiant/mon-rendez-vous.ts.
  message: string | null
  // Toujours vrai une fois confirmé — reformulé le 2026-09-30 : « Admin HOC », jamais le nom
  // personnel de l'admin (voir LIBELLE_ADMIN, src/lib/agendaEvenements.ts).
  avecAdmin: boolean
}

interface MonEvenement {
  id: string
  titre: string
  debut: string
  duree_minutes: number
  lien_meet: string | null
  notes: string | null
  obligatoires: ParticipantResolu[]
  optionnels: ParticipantResolu[]
  creeParAdmin: boolean
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
  const { profile, idEtudiantEffectif, derniereNotification } = useProfileContext()
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

  /* Séance annulée/reportée : retirée de l'agenda (demande client du 2026-10-11), pas seulement
     grisée — `seances` reste intact pour `seanceOuverte` ci-dessous et les autres usages. */
  const evenements = useMemo(
    () =>
      seances
        .filter((seance) => !seanceSansEffet(seance.session.statut))
        .map((seance): EvenementAgenda => ({
          id: seance.session.id,
          debut: seance.session.debut,
          dureeMinutes: seance.session.duree_minutes,
          titre: professeurParSeance.get(seance.session.id) ?? 'Cours',
          /* « Cours duo » dès que l'élève a un binôme : ses cours individuels sont par définition
             suivis à deux (0054). Le dossier ne charge que SES propres inscriptions, le partenaire
             ne s'y lit donc pas séance par séance — c'est `duoPartenaire` qui fait foi ici. */
          sousTitre: `${seance.session.type === 'collectif' ? 'Cours collectif' : dossier?.duoPartenaire ? 'Cours duo' : 'Cours individuel'} · ${seance.session.duree_minutes} min`,
          ton: seance.session.statut === 'terminee' ? 'teal' : 'bleu',
        })),
    [seances, professeurParSeance, dossier?.duoPartenaire],
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
          titre={`Événement de l’agenda de ${profile?.prenom ?? ''}`}
          onFermer={() => setRdvOuvertId(null)}
          largeurMax={430}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <LigneInfo label="Motif" valeur={evenementOuvert.titre} />
            <LigneInfo label="Date et heure" valeur={new Date(evenementOuvert.debut).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })} />
            <LigneInfo label="Durée" valeur={`${evenementOuvert.duree_minutes} minutes`} />
            {(evenementOuvert.creeParAdmin || evenementOuvert.obligatoires.length > 0) && (
              <LigneInfo
                label="Participants"
                valeur={[...(evenementOuvert.creeParAdmin ? [LIBELLE_ADMIN] : []), ...evenementOuvert.obligatoires.map((p) => `${p.prenom} ${p.nom}`)].join(', ')}
              />
            )}
            {evenementOuvert.optionnels.length > 0 && (
              <LigneInfo label="Participants (optionnel)" valeur={evenementOuvert.optionnels.map((p) => `${p.prenom} ${p.nom}`).join(', ')} />
            )}
            {evenementOuvert.notes && (
              <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)', background: 'var(--fond-champ, rgba(0,0,0,.22))', borderRadius: 10, padding: '10px 12px', margin: 0 }}>
                {evenementOuvert.notes}
              </p>
            )}
            {/* Un événement « autre » de l'admin part toujours du compte Google Meet de
                l'établissement — jamais Jitsi, réservé aux cours. */}
            {evenementOuvert.lien_meet && <BoutonRejoindreVisio lien={evenementOuvert.lien_meet} fournisseur="google_meet" variante="primaire" />}
            {evenementOuvert.creeParAdmin && <LigneInfo label="Organisateur" valeur={LIBELLE_ADMIN} />}
          </div>
        </Modale>
      )}

      {rdvOuvert && (
        <Modale
          titre={`Événement de l’agenda de ${profile?.prenom ?? ''}`}
          onFermer={() => setRdvOuvertId(null)}
          largeurMax={430}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <LigneInfo label="Rendez-vous" valeur="Appel diagnostic" />
            <LigneInfo label="Date et heure" valeur={new Date(rdvOuvert.debut).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })} />
            <LigneInfo label="Statut" valeur={rdvOuvert.statut === 'confirme' ? 'Confirmé' : 'À valider'} />
            <LigneInfo label="Durée" valeur={`${rdvOuvert.duree_minutes} minutes`} />
            {rdvOuvert.avecAdmin && <LigneInfo label="Avec" valeur={LIBELLE_ADMIN} />}
            {rdvOuvert.message && (
              <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)', background: 'var(--fond-champ, rgba(0,0,0,.22))', borderRadius: 10, padding: '10px 12px', margin: 0, fontStyle: 'italic' }}>
                « {rdvOuvert.message} »
              </p>
            )}
            {rdvOuvert.lien_meet && <BoutonRejoindreVisio lien={rdvOuvert.lien_meet} fournisseur="google_meet" variante="primaire" />}
            {rdvOuvert.avecAdmin && <LigneInfo label="Organisateur" valeur={LIBELLE_ADMIN} />}
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
  const termine = seance.session.statut === 'terminee'
  // Compte rendu et enquête de satisfaction (0068/0052) visibles depuis l'agenda de l'élève —
  // demande client du 2026-09-30 : « le compte rendu de la séance devrait être également
  // visible par l'étudiant [...] dans les agendas respectifs ». Déjà le cas côté admin
  // (DetailSeanceModale.tsz) ; manquait côté élève. La RLS renvoie déjà exactement ce que
  // l'élève a le droit de voir (son propre avis de satisfaction, le compte rendu du professeur).
  const { profile } = useProfileContext()
  const { detail } = useDetailSeance(termine ? seance.session.id : null)
  return (
    <Modale
      titre={`Événement de l’agenda de ${profile?.prenom ?? ''}`}
      onFermer={onFermer}
      largeurMax={460}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <BadgeStatutSeance statut={seance.session.statut} />
        </div>
        <LigneInfo label="Type" valeur={seance.session.type === 'individuel' ? 'Cours individuel' : 'Cours collectif'} />
        <LigneInfo label="Date et heure" valeur={new Date(seance.session.debut).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })} />
        <LigneInfo label="Durée" valeur={`${seance.session.duree_minutes} minutes`} />
        <LigneInfo label="Participants" valeur={professeur} />
        {termine && <LigneInfo label="Présence" valeur={seance.enrollment.present ? 'Présent' : 'Absent'} />}
        {aVenir && seance.video && (seance.video.provider === 'jitsi' || seance.video.provider === 'google_meet') && (
          <BoutonRejoindreVisio lien={getJoinUrl(seance.video)} fournisseur={seance.video.provider} variante="primaire" />
        )}
        {seance.video?.organisateur_email && <LigneInfo label="Organisateur" valeur={seance.video.organisateur_email} />}

        {/* Repliée par défaut (demande client du 2026-10-13, « c'est à l'utilisateur de le
            déplier manuellement ») uniquement quand il y a un compte rendu à déplier. */}
        {termine && (
          detail?.compteRendu ? (
            <SectionRepliable titre="Compte rendu du cours">
              <CompteRenduAffichage rapport={detail.compteRendu} />
            </SectionRepliable>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-soft, var(--border))', paddingTop: 12 }}>
              <span style={intituleAccentStyle()}>Compte rendu du cours</span>
              <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0 }}>Le professeur n’a pas encore rédigé de compte rendu.</p>
            </div>
          )
        )}

      </div>
    </Modale>
  )
}
