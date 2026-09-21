import { useMemo, useState, type FormEvent } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useRendezVous } from '../../hooks/useRendezVous'
import { useEvenementsAdmin } from '../../hooks/useEvenementsAdmin'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { lundiDeLaSemaine } from '../../lib/agenda'
import { agendaAdminComplet } from '../../lib/agendaEvenements'
import { PopupEvenementAdmin, CarteRendezVous } from '../shared/PopupEvenementAdmin'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { champStyle } from '../ui/Champ'
import { Section } from '../ui/Section'
import { Onglets } from '../ui/Onglets'
import { Modale } from '../ui/Modale'
import { AgendaHebdo } from '../ui/AgendaHebdo'
import { Icone } from '../ui/Icones'
import { SelecteurPersonnes } from '../ui/SelecteurPersonnes'

type VueRendezVous = 'agenda' | 'liste'

function versDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function RendezVousAdmin() {
  const { profile, session } = useProfileContext()
  const { rendezVous, loading, erreur, recharger } = useRendezVous()
  const { evenements: evenementsAdmin, loading: chargementEvenements, recharger: rechargerEvenements } = useEvenementsAdmin()
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

  const evenementsAgenda = useMemo(() => agendaAdminComplet(rendezVous, evenementsAdmin), [rendezVous, evenementsAdmin])

  return (
    <AdminLayout actif="Agenda">
      <EnTetePage
        compact
        titre="Agenda"
        description="Les demandes d’appel diagnostic prises depuis la page d’accueil arrivent ici pour validation, et vous pouvez aussi y créer vous-même un rendez-vous avec un ou plusieurs étudiants et professeurs — cliquez un créneau libre de l’agenda, ou le bouton ci-contre."
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
            Vous pouvez aussi <strong>créer vous-même un rendez-vous</strong> avec un ou plusieurs étudiants et
            professeurs déjà inscrits : cliquez un créneau libre de l’agenda, ou le bouton{' '}
            <strong>Créer un rendez-vous</strong>.
          </>,
          <>
            Dans l’<strong>agenda</strong>, la couleur indique qui est concerné : <strong>jaune</strong> un prospect,{' '}
            <strong>bleu</strong> des étudiants, <strong>vert</strong> des professeurs, <strong>violet</strong> les
            deux à la fois. Cliquez un événement pour l’ouvrir.
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

      {(loading || chargementEvenements) && <EtatChargement lignes={3} hauteur={92} />}

      {!loading && !chargementEvenements && vue === 'agenda' && (
        <AgendaHebdo
          evenements={evenementsAgenda}
          semaineDebut={semaineDebut}
          onSemaineChange={setSemaineDebut}
          onSelectionner={(evenement) => setElementOuvertId(evenement.id)}
          onCreneauLibre={(debut) => setCreationOuverte(debut)}
          videMessage="Aucun rendez-vous cette semaine. Utilisez les flèches pour changer de semaine, ou cliquez un créneau pour en créer un."
          legende={
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--muted)' }}>
              <PastilleLegende couleur="var(--accent-gold)" libelle="Prospect" />
              <PastilleLegende couleur="var(--accent-blue)" libelle="Étudiant(s)" />
              <PastilleLegende couleur="var(--accent-teal)" libelle="Professeur(s)" />
              <PastilleLegende couleur="var(--accent-violet)" libelle="Mixte" />
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
      />

      {creationOuverte && session && (
        <FormulaireCreerEvenement
          debutInitial={creationOuverte}
          session={session}
          onFermer={() => setCreationOuverte(null)}
          onCree={() => {
            setCreationOuverte(null)
            rechargerEvenements()
          }}
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
function FormulaireCreerEvenement({
  debutInitial,
  session,
  onFermer,
  onCree,
}: {
  debutInitial: Date
  session: { access_token: string }
  onFermer: () => void
  onCree: () => void
}) {
  const { etudiants } = useEtudiants()
  const { professeurs } = useProfesseurs()
  const [titre, setTitre] = useState('')
  const [debut, setDebut] = useState(versDatetimeLocal(debutInitial))
  const [dureeMinutes, setDureeMinutes] = useState(60)
  const [obligatoiresIds, setObligatoiresIds] = useState<string[]>([])
  const [optionnelsIds, setOptionnelsIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  /* Un seul vivier, étudiants et professeurs mélangés — demande client du 2026-09-16 :
     « toutes les personnes de l'application devraient être retrouvables dans ces zones de
     recherche ». L'étiquette de rôle affichée dans les suggestions (voir SelecteurPersonnes)
     permet de les distinguer sans les séparer en deux listes. */
  const toutLeMonde = useMemo(
    () => [
      ...etudiants.map((e) => ({ ...e, role: 'Étudiant' })),
      ...professeurs.map((p) => ({ ...p, role: 'Professeur' })),
    ],
    [etudiants, professeurs],
  )

  async function creer(e: FormEvent) {
    e.preventDefault()
    if (!titre.trim() || !debut || (obligatoiresIds.length === 0 && optionnelsIds.length === 0)) {
      setErreur('Le titre, la date et au moins un participant sont obligatoires.')
      return
    }
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/creer-evenement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        titre: titre.trim(),
        debut: new Date(debut).toISOString(),
        dureeMinutes,
        obligatoiresIds,
        optionnelsIds,
        notes: notes.trim() || undefined,
      }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
    setEnCours(false)
    if (reponse.error) {
      setErreur(reponse.error)
      return
    }
    onCree()
  }

  return (
    <Modale titre="Créer un rendez-vous" onFermer={onFermer} largeurMax={480}>
      <form onSubmit={creer} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input required placeholder="Titre (ex. Point de mi-parcours)" value={titre} onChange={(e) => setTitre(e.target.value)} style={champStyle} />
        <div style={{ display: 'flex', gap: 10 }}>
          <input required type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} style={{ ...champStyle, flex: 1 }} />
          <input
            required
            type="number"
            min={5}
            max={480}
            value={dureeMinutes}
            onChange={(e) => setDureeMinutes(Number(e.target.value))}
            style={{ ...champStyle, width: 90 }}
            title="Durée en minutes"
          />
        </div>

        {/* Deux zones de recherche façon Outlook — demande client du 2026-09-16 : « on devrait
            avoir le même principe que Outlook lors de la réservation d'un point ». Une même
            personne ne peut pas se retrouver dans les deux à la fois (`exclure`). */}
        <SelecteurPersonnes
          etiquette="Participants obligatoires"
          placeholder="Rechercher un nom…"
          candidats={toutLeMonde}
          selectionnes={obligatoiresIds}
          onChange={setObligatoiresIds}
          exclure={optionnelsIds}
        />
        <SelecteurPersonnes
          etiquette="Participants optionnels"
          placeholder="Rechercher un nom…"
          candidats={toutLeMonde}
          selectionnes={optionnelsIds}
          onChange={setOptionnelsIds}
          exclure={obligatoiresIds}
        />

        <textarea
          placeholder="Notes (facultatif)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />

        {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erreur}</p>}
        <button type="submit" disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, opacity: enCours ? 0.7 : 1 }}>
          {enCours ? 'Création…' : 'Créer le rendez-vous'}
        </button>
      </form>
    </Modale>
  )
}

