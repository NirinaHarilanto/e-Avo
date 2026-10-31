import { useMemo, useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useRendezVous } from '../../hooks/useRendezVous'
import { useEvenementsAdmin } from '../../hooks/useEvenementsAdmin'
import { lundiDeLaSemaine } from '../../lib/agenda'
import { agendaAdminComplet, estEvenementGooglePersonnel, idGoogleDepuisEvenement } from '../../lib/agendaEvenements'
import { FicheEvenementGoogle } from '../shared/FicheEvenementGoogle'
import { useEvenementsGoogleCalendarPersonnel } from '../../hooks/useGoogleCalendarPersonnel'
import { PopupEvenementAdmin, CarteRendezVous } from '../shared/PopupEvenementAdmin'
import { FormulaireCreerEvenement } from '../shared/FormulaireCreerEvenement'
import { EnTetePage } from '../ui/EnTetePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { Section } from '../ui/Section'
import { Onglets } from '../ui/Onglets'
import { AgendaHebdo } from '../ui/AgendaHebdo'
import { Icone } from '../ui/Icones'
import { useRafraichirSurNotification } from '../../hooks/useRafraichirSurNotification'

type VueRendezVous = 'agenda' | 'liste'

export function RendezVousAdmin() {
  const { profile, session, derniereNotification } = useProfileContext()
  const { rendezVous, loading, erreur, recharger } = useRendezVous()
  const { evenements: evenementsAdmin, loading: chargementEvenements, recharger: rechargerEvenements } = useEvenementsAdmin()
  /* Couche 2 de la stratégie temps réel du 2026-09-29 : une nouvelle demande de rendez-vous
     depuis la vitrine recharge cette page sans intervention — voir useRafraichirSurNotification.ts. */
  useRafraichirSurNotification(derniereNotification, ['rendez_vous_demande'], recharger)
  const [vue, setVue] = useState<VueRendezVous>('agenda')
  const [onglet, setOnglet] = useState('À valider')
  const [semaineDebut, setSemaineDebut] = useState(() => lundiDeLaSemaine(new Date()))
  /* Retenu par identifiant préfixé plutôt que par valeur : après une décision, `recharger()`
     remplace l'objet et la fiche ouverte doit refléter le nouveau statut, pas celui capturé au
     clic. */
  const [elementOuvertId, setElementOuvertId] = useState<string | null>(null)
  const [creationOuverte, setCreationOuverte] = useState<Date | null>(null)

  const enAttente = rendezVous.filter((r) => r.statut === 'en_attente')
  const confirmes = rendezVous.filter((r) => r.statut === 'confirme')
  const traites = rendezVous.filter((r) => r.statut === 'refuse' || r.statut === 'annule')
  const liste = onglet === 'À valider' ? enAttente : onglet === 'Confirmés' ? confirmes : traites

  // Superposition en lecture seule de l'agenda Google personnel DE CET ADMIN (0098) — vide tant
  // que rien n'est connecté. Chaque admin ne voit que le sien (voir la vue
  // google_integration_personnelle_statut, filtrée sur auth.uid()) : ce n'est pas « l'agenda
  // Google de l'établissement », une notion qui n'existe pas ici.
  const {
    evenements: evenementsGooglePersonnel,
    parId: googleParId,
    recharger: rechargerGoogle,
  } = useEvenementsGoogleCalendarPersonnel(semaineDebut)
  /* Les cours professeur ↔ élève NE SONT PAS superposés ici — règle client rappelée le
     2026-10-11 : « toute séance de cours entre étudiant et professeur s'affichera uniquement dans
     les agendas du professeur et de l'étudiant », sauf si l'admin est lui-même convié à la
     réunion. Ils avaient été ajoutés le 2026-10-09 pour aligner cette page sur « Séances & visio » ;
     c'est cette dernière, faite pour le planning de l'établissement, qui les porte désormais
     seule. L'exception est couverte sans rien de particulier : un rendez-vous auquel l'admin
     participe est un `evenements_admin`, pas une `sessions`, et reste donc affiché. */
  const evenementsAgenda = useMemo(
    () => [...agendaAdminComplet(rendezVous, evenementsAdmin), ...evenementsGooglePersonnel],
    [rendezVous, evenementsAdmin, evenementsGooglePersonnel],
  )
  const [evenementGoogleOuvert, setEvenementGoogleOuvert] = useState<string | null>(null)

  return (
    <AdminLayout actif="Agenda">
      <EnTetePage
        compact
        titre="Agenda"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Onglets
              etiquette="Mode d’affichage"
              actif={vue}
              onChange={setVue}
              onglets={[
                { value: 'agenda', label: 'Agenda' },
                { value: 'liste', label: 'Liste' },
              ]}
            />
            <button onClick={() => setCreationOuverte(new Date())} className="btn-shine" style={boutonPrimaireStyle}>
              <Icone nom="plus" taille={15} />
              Créer un rendez-vous
            </button>
          </div>
        }
      />

      <GrilleStats>
        <Stat libelle="À valider" valeur={enAttente.length} />
        <Stat libelle="Confirmés à venir" valeur={confirmes.filter((r) => new Date(r.debut) > new Date()).length} />
        <Stat libelle="Total des demandes" valeur={rendezVous.length} />
      </GrilleStats>

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {(loading || chargementEvenements) && <EtatChargement lignes={3} hauteur={92} />}

      {!loading && !chargementEvenements && vue === 'agenda' && (
        <AgendaHebdo
          evenements={evenementsAgenda}
          semaineDebut={semaineDebut}
          onSemaineChange={setSemaineDebut}
          onSelectionner={(evenement) => {
            /* Un événement venu de Google n'a pas de fiche HOC, mais il a la sienne : il était
               jusqu'ici affiché dans la grille en ignorant le clic, et toute son information —
               invités, description, lien de visioconférence — restait invisible depuis HOC
               (signalé par le client le 2026-10-09). */
            if (estEvenementGooglePersonnel(evenement.id)) {
              setEvenementGoogleOuvert(idGoogleDepuisEvenement(evenement.id))
              return
            }
            setElementOuvertId(evenement.id)
          }}
          onCreneauLibre={(debut) => setCreationOuverte(debut)}
          videMessage="Rien cette semaine. Utilisez les flèches pour changer de semaine, ou cliquez un créneau pour créer un rendez-vous."
          legende={
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--muted)' }}>
              <PastilleLegende couleur="var(--accent-gold)" libelle="Prospect" />
              <PastilleLegende couleur="var(--accent-blue)" libelle="Étudiant(s)" />
              <PastilleLegende couleur="var(--accent-teal)" libelle="Professeur(s)" />
              <PastilleLegende couleur="var(--accent-violet)" libelle="Mixte" />
              <span style={{ color: 'var(--muted-2)' }}>·</span>
              <span>Agenda Google : sa couleur d’origine</span>
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

      <PopupEvenementAdmin
        elementOuvertId={elementOuvertId}
        onFermer={() => setElementOuvertId(null)}
        rendezVous={rendezVous}
        evenementsAdmin={evenementsAdmin}
        profile={profile}
        session={session}
        onChange={() => {
          recharger()
          rechargerEvenements()
        }}
        afficherSuppression
      />

      {creationOuverte && session && (
        <FormulaireCreerEvenement
          debutInitial={creationOuverte}
          onFermer={() => setCreationOuverte(null)}
          onCree={() => {
            setCreationOuverte(null)
            rechargerEvenements()
          }}
        />
      )}

      {evenementGoogleOuvert && googleParId.get(evenementGoogleOuvert) && (
        <FicheEvenementGoogle
          evenement={googleParId.get(evenementGoogleOuvert)!}
          onFermer={() => setEvenementGoogleOuvert(null)}
          onChange={rechargerGoogle}
        />
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

/* Création d'un rendez-vous par l'admin depuis l'agenda (créneau libre ou bouton "Créer un
   rendez-vous") — demande client du 2026-09-16. `debutInitial` préremplit la date/heure sans la
   verrouiller : un créneau cliqué reste modifiable, pour rattraper une estimation au pixel près
   dans la grille. */
