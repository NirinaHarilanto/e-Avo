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

/* Agenda de l'élève : même grille horaire que celle du professeur et de l'administration, mais
   sans aucune action — un élève consulte son emploi du temps, il ne le modifie pas. Les séances
   viennent du dossier déjà chargé (useDossierEtudiant), aucune requête supplémentaire. */
export function AgendaEtudiant() {
  const { profile } = useProfileContext()
  const { dossier, loading, erreur } = useDossierEtudiant(profile?.id)
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
        ton: seance.session.statut === 'terminee' ? 'teal' : seance.session.statut === 'annulee' ? 'neutre' : 'bleu',
        attenue: seance.session.statut === 'annulee',
      })),
    [seances, professeurParSeance],
  )

  const seanceOuverte = seances.find((s) => s.session.id === seanceOuverteId) ?? null

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
          evenements={evenements}
          semaineDebut={semaineDebut}
          onSemaineChange={setSemaineDebut}
          onSelectionner={(evenement) => setSeanceOuverteId(evenement.id)}
          videMessage="Aucun cours cette semaine. Changez de semaine avec les flèches pour voir les suivants."
        />
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
