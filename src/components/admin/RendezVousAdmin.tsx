import { useMemo, useState, type FormEvent } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useRendezVous, type RendezVousAvecProspect } from '../../hooks/useRendezVous'
import { useEvenementsAdmin, type EvenementAdminAvecParticipants } from '../../hooks/useEvenementsAdmin'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { supabase } from '../../lib/supabaseClient'
import type { StatutRendezVous } from '../../types/database.types'
import { lundiDeLaSemaine, type EvenementAgenda } from '../../lib/agenda'
import { formaterDansFuseauEtablissement } from '../../lib/etablissement'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur, MessageSucces } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { champStyle } from '../ui/Champ'
import { Section } from '../ui/Section'
import { Onglets } from '../ui/Onglets'
import { Modale } from '../ui/Modale'
import { AgendaHebdo } from '../ui/AgendaHebdo'
import { Icone } from '../ui/Icones'
import { SelecteurPersonnes } from '../ui/SelecteurPersonnes'

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

/* Les identifiants des deux tables (rendez_vous et evenements_admin, voir useEvenementsAdmin.ts)
   sont chacun des UUID indépendants : rien n'empêche qu'ils coïncident un jour par hasard. Un
   préfixe sur l'id de l'EvenementAgenda lève toute ambiguïté au moment de rouvrir la bonne fiche
   au clic, plutôt que de chercher le même id dans les deux tableaux. */
const PREFIXE_PROSPECT = 'rdv:'
const PREFIXE_EVENEMENT = 'evt:'

/* Couleur = catégorie de participants, pas statut — demande client du 2026-09-16 : « jaune pour
   les prospects, bleu pour les étudiants, vert pour les professeurs, violet pour mixte étudiants
   et professeurs ». Le statut (à valider / annulé) reste lisible via `attenue` et `marqueur`,
   déjà pris en charge par AgendaHebdo, sans avoir besoin d'une cinquième teinte. */
function versEvenementProspect(rdv: RendezVousAvecProspect): EvenementAgenda {
  const prospect = rdv.prospects
  const nomProspect = prospect ? `${prospect.prenom} ${prospect.nom}` : 'Prospect supprimé'
  return {
    id: PREFIXE_PROSPECT + rdv.id,
    debut: rdv.debut,
    dureeMinutes: rdv.duree_minutes,
    titre: nomProspect,
    sousTitre: `Appel diagnostic${prospect?.langue_visee ? ` · ${prospect.langue_visee}` : ''}`,
    ton: 'or',
    attenue: rdv.statut === 'refuse' || rdv.statut === 'annule',
    marqueur: rdv.statut === 'en_attente' ? 'à valider' : undefined,
  }
}

/* La couleur ne dépend pas de la distinction obligatoire/optionnel (une seconde dimension,
   propre à Outlook, qui n'a rien à voir avec la catégorie de participants) — seulement du rôle
   de l'ensemble des personnes conviées, obligatoires et optionnelles confondues. */
function tousLesParticipants(evenement: EvenementAdminAvecParticipants) {
  return [...evenement.obligatoires, ...evenement.optionnels]
}

function versEvenementAdmin(evenement: EvenementAdminAvecParticipants): EvenementAgenda {
  const participants = tousLesParticipants(evenement)
  const aDesEtudiants = participants.some((p) => p.role === 'etudiant')
  const aDesProfesseurs = participants.some((p) => p.role === 'professeur')
  const noms = participants.map((p) => `${p.prenom} ${p.nom}`).join(', ')
  return {
    id: PREFIXE_EVENEMENT + evenement.id,
    debut: evenement.debut,
    dureeMinutes: evenement.duree_minutes,
    titre: evenement.titre,
    sousTitre: noms || undefined,
    ton: aDesEtudiants && aDesProfesseurs ? 'violet' : aDesProfesseurs ? 'teal' : 'bleu',
    attenue: evenement.annule,
  }
}

function typeEvenementAdmin(evenement: EvenementAdminAvecParticipants): string {
  const participants = tousLesParticipants(evenement)
  const aDesEtudiants = participants.some((p) => p.role === 'etudiant')
  const aDesProfesseurs = participants.some((p) => p.role === 'professeur')
  if (aDesEtudiants && aDesProfesseurs) return 'Mixte — étudiants et professeurs'
  if (aDesProfesseurs) return 'Professeurs'
  return 'Étudiants'
}

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

  const evenementsAgenda = useMemo(
    () => [...rendezVous.map(versEvenementProspect), ...evenementsAdmin.map(versEvenementAdmin)],
    [rendezVous, evenementsAdmin],
  )
  const rdvOuvert = elementOuvertId?.startsWith(PREFIXE_PROSPECT)
    ? rendezVous.find((r) => r.id === elementOuvertId!.slice(PREFIXE_PROSPECT.length))
    : undefined
  const evenementOuvert = elementOuvertId?.startsWith(PREFIXE_EVENEMENT)
    ? evenementsAdmin.find((e) => e.id === elementOuvertId!.slice(PREFIXE_EVENEMENT.length))
    : undefined

  return (
    <AdminLayout actif="Rendez-vous">
      <EnTetePage
        compact
        titre="Rendez-vous"
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

      {rdvOuvert && (
        <Modale
          titre={formaterDansFuseauEtablissement(rdvOuvert.debut)}
          onFermer={() => setElementOuvertId(null)}
          largeurMax={520}
        >
          <CarteRendezVous rdv={rdvOuvert} profile={profile} onChange={recharger} />
        </Modale>
      )}

      {evenementOuvert && (
        <Modale titre={evenementOuvert.titre} onFermer={() => setElementOuvertId(null)} largeurMax={480}>
          <CarteEvenementAdmin evenement={evenementOuvert} session={session} onChange={rechargerEvenements} />
        </Modale>
      )}

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

/* Fiche d'un événement créé par l'admin (voir api/admin/creer-evenement.ts) : indique explicitement
   son type — demande client du 2026-09-16, « il faut indiquer si c'est un rendez-vous Prospect,
   étudiant, professeurs ou mixte » (le cas Prospect vit dans CarteRendezVous, cette fiche-ci ne
   couvre que les trois autres). */
function CarteEvenementAdmin({
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

/* Fiche d'une demande de prospect : détail et, si elle est encore en attente, les actions de
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
