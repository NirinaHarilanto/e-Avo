import { useMemo, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useCalendrierProfesseur, type SeanceProfesseur } from '../../hooks/useCalendrierProfesseur'
import { useVagues } from '../../hooks/useVagues'
import { useClassesAvecMembres } from '../../hooks/useClassesAvecMembres'
import { useEvenementsProfesseur } from '../../hooks/useEvenementsAdmin'
import { etudiantsSelectionnables, vaguesSelectionnables, classesSelectionnables } from '../../lib/invitations'
import { LABEL_NIVEAU_CLASSE } from '../../lib/classesCollectif'
import type { Database } from '../../types/database.types'
import { getJoinUrl } from '../../lib/visio'
import { lundiDeLaSemaine, type EvenementAgenda } from '../../lib/agenda'
import { nomsElevesInscrits } from '../../lib/seances'
import { versEvenementAdmin } from '../../lib/agendaEvenements'
import { type NatureRendezVous } from '../../lib/natureRendezVous'
import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { GroupeSection } from '../ui/Section'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'
import { Onglets } from '../ui/Onglets'
import { Modale } from '../ui/Modale'
import { AgendaHebdo } from '../ui/AgendaHebdo'
import { SelecteurPersonnes } from '../ui/SelecteurPersonnes'
import { BadgeStatutSeance } from '../shared/BadgeStatutSeance'
import { AvertissementDureeMeet } from '../shared/AvertissementDureeMeet'
import { ChoixNatureRendezVous } from '../shared/ChoixNatureRendezVous'
import { PopupEvenementAdmin, estEvenementAdmin } from '../shared/PopupEvenementAdmin'
import { CompteRenduSeance } from './CompteRenduSeance'
import { PlanningPrevisionnelProfesseur } from './PlanningPrevisionnelProfesseur'
import { EditerSeancePlanifieeModale } from '../shared/EditerSeancePlanifieeModale'
import { champStyle } from '../ui/Champ'
import { formaterHeures } from '../../lib/heures'

type Profile = Database['public']['Tables']['profiles']['Row']
type VueCalendrier = 'agenda' | 'liste' | 'previsionnel'

/* `sessions.type` ne distingue que 'individuel'/'collectif' (0008) : une séance à deux élèves
   est déjà classée 'collectif' à la création (voir plus bas, `type: studentIds.length > 1 ?
   'collectif' : 'individuel'`), qu'il s'agisse d'un vrai groupe ou d'un binôme DUO. Le distinguer
   demande donc de regarder QUI est inscrit, pas la colonne `type` : exactement deux élèves,
   mutuellement liés par `duo_partenaire_id` (0054). Une coïncidence — deux élèves d'une vague,
   non liés en duo, mais seuls inscrits ce jour-là — ne matche pas ce test et reste « collectif ». */
function estSeanceDuo(seance: SeanceProfesseur): boolean {
  if (seance.inscriptions.length !== 2) return false
  const [a, b] = seance.inscriptions
  if (!a.etudiant || !b.etudiant) return false
  return a.etudiant.duo_partenaire_id === b.etudiant.id || b.etudiant.duo_partenaire_id === a.etudiant.id
}

function libelleTypeSeance(seance: SeanceProfesseur): string {
  if (estSeanceDuo(seance)) return 'Duo'
  return seance.session.type === 'individuel' ? 'Individuel' : 'Collectif'
}

/* Une séance telle que l'agenda hebdomadaire la connaît. Le composant de grille ignore tout des
   séances et des inscriptions : il ne manipule que des `EvenementAgenda`. */
function versEvenement(seance: SeanceProfesseur): EvenementAgenda {
  const eleves = nomsElevesInscrits(seance.inscriptions)
  return {
    id: seance.session.id,
    debut: seance.session.debut,
    dureeMinutes: seance.session.duree_minutes,
    titre: eleves.join(', ') || 'Séance sans élève inscrit',
    sousTitre: `${libelleTypeSeance(seance)} · ${seance.session.duree_minutes} min`,
    /* Couleur par TYPE de cours plutôt que par statut (demande client du 2026-09-23, « mets les
       évènements de cours DUO et collectif avec des couleurs différentes que celle des
       évènements de cours individuels ») — l'annulation reste signalée en gris quel que soit le
       type, seul état jugé plus important à distinguer qu'à quel programme appartient le cours.
       Or/violet reprennent les teintes déjà associées à Duo/Collectif ailleurs dans
       l'application (TagProgramme, EtudiantsAdmin). */
    ton: seance.session.statut === 'annulee' ? 'neutre' : estSeanceDuo(seance) ? 'or' : seance.session.type === 'collectif' ? 'violet' : 'bleu',
    attenue: seance.session.statut === 'annulee',
  }
}

/* Légende des couleurs par type de cours (0068, demande client du 2026-09-23) — mêmes teintes
   que `versEvenement` ci-dessus et que le vocabulaire de couleur déjà établi ailleurs dans
   l'application pour Duo/Collectif (TagProgramme, EtudiantsAdmin.tsx : or = duo, ici étendu à
   violet pour collectif faute d'un troisième ton déjà associé). */
function LegendeTypeSeance() {
  const puces: { libelle: string; couleur: string }[] = [
    { libelle: 'Individuel', couleur: 'var(--accent-blue)' },
    { libelle: 'Duo', couleur: 'var(--accent-gold)' },
    { libelle: 'Collectif', couleur: 'var(--accent-violet)' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {puces.map((puce) => (
        <span key={puce.libelle} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--muted)' }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: puce.couleur, flexShrink: 0 }} />
          {puce.libelle}
        </span>
      ))}
    </div>
  )
}

function versDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function CalendrierProfesseur() {
  const { profile, session } = useProfileContext()
  const { seances, etudiantsActifs, vagues, heuresEnseignees, loading, erreur, recharger } = useCalendrierProfesseur(profile?.id)
  /* Rendez-vous « autre » (entretien, séance d'information…) créés par le professeur lui-même ou
     où il est participant — demande client du 2026-09-23, même mécanisme que RendezVousAdmin.tsx.
     Distinct des séances : ils vivent dans `evenements_admin`, pas `sessions`, et n'affectent
     jamais les heures. */
  const { evenements: evenementsAutres, loading: chargementEvenements, recharger: rechargerEvenements } = useEvenementsProfesseur()
  const [vue, setVue] = useState<VueCalendrier>('agenda')
  const [semaineDebut, setSemaineDebut] = useState(() => lundiDeLaSemaine(new Date()))
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [debutPreselectionne, setDebutPreselectionne] = useState<string>('')
  /* La séance ouverte est retenue par son identifiant, pas par sa valeur : après une clôture ou
     une reprogrammation, `recharger()` remplace l'objet et la fiche doit afficher la version à
     jour, pas celle capturée au moment du clic. */
  const [seanceOuverteId, setSeanceOuverteId] = useState<string | null>(null)
  const [elementOuvertId, setElementOuvertId] = useState<string | null>(null)

  const maintenant = new Date().toISOString()
  const aVenir = seances
    .filter((s) => s.session.statut === 'planifiee')
    .sort((a, b) => a.session.debut.localeCompare(b.session.debut))
  // Chronologique comme le reste des plannings de l'app, y compris l'historique.
  const passees = seances
    .filter((s) => s.session.statut !== 'planifiee')
    .sort((a, b) => a.session.debut.localeCompare(b.session.debut))

  const evenements = useMemo(
    () => [...seances.map(versEvenement), ...evenementsAutres.map(versEvenementAdmin)],
    [seances, evenementsAutres],
  )
  const seanceOuverte = seances.find((s) => s.session.id === seanceOuverteId) ?? null

  function ouvrirPlanification(debut?: Date) {
    setDebutPreselectionne(debut ? versDatetimeLocal(debut) : '')
    setFormulaireOuvert(true)
  }

  return (
    <ProfesseurLayout actif="Calendrier">
      <EnTetePage
        titre="Mon calendrier"
        description="Votre semaine de cours, heure par heure. C’est ici que vous planifiez une séance, que vous notez les présences et que vous clôturez un cours une fois donné."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Onglets
              etiquette="Mode d’affichage du calendrier"
              actif={vue}
              onChange={setVue}
              onglets={[
                { value: 'agenda', label: 'Agenda' },
                { value: 'liste', label: 'Liste' },
                { value: 'previsionnel', label: 'Planning prévisionnel' },
              ]}
            />
            <button onClick={() => ouvrirPlanification()} className="btn-shine" style={boutonPrimaireStyle}>
              <Icone nom="plus" taille={15} />
              Créer un rendez-vous
            </button>
          </div>
        }
      />

      <GuidePage
        id="professeur-calendrier"
        etapes={[
          <>
            L’<strong>agenda</strong> affiche votre semaine comme un agenda professionnel. Cliquez un{' '}
            <strong>créneau libre</strong> pour y créer un rendez-vous, ou un événement existant pour l’ouvrir.
          </>,
          <>
            <strong>Créer un rendez-vous</strong> : choisissez d’abord sa nature — une <strong>séance de cours</strong>{' '}
            (décompte les heures) ou <strong>autre</strong> (entretien, séance d’information… sans effet sur les
            heures) — puis un ou plusieurs élèves, une date et une durée. Plusieurs élèves sélectionnés pour une
            séance de cours créent une séance collective.
          </>,
          <>
            Après le cours, ouvrez la séance et notez la <strong>présence</strong> de chaque élève, puis clôturez-la.
          </>,
          <>
            La clôture est le geste important : c’est elle qui met à jour vos heures enseignées, le forfait de l’élève
            et son taux d’assiduité. Une séance passée non clôturée ne compte nulle part.
          </>,
          <>
            L’onglet <strong>Planning prévisionnel</strong> crée d’un coup toutes les séances récurrentes d’un élève
            (par exemple tous les mardis à 18 h jusqu’à la fin de son forfait) et permet de reprogrammer chaque séance
            au cas par cas. Un changement d’horaire de votre part est soumis à validation de l’administration.
          </>,
          <>
            Agenda et planning prévisionnel montrent les mêmes séances : un cours créé depuis l’agenda apparaît
            aussitôt dans le planning de l’élève et dans la vue de l’administration, sans ressaisie.
          </>,
        ]}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        {!loading && (
          <GrilleStats>
            <Stat libelle="Élèves actifs" valeur={etudiantsActifs.length} ton="bleu" aide="Actuellement attribués" />
            <Stat libelle="Heures enseignées" valeur={formaterHeures(heuresEnseignees)} ton="or" aide="Séances clôturées uniquement" />
            <Stat libelle="Séances à venir" valeur={aVenir.length} ton="teal" />
            <Stat
              libelle="À clôturer"
              valeur={aVenir.filter((s) => s.session.debut < maintenant).length}
              ton={aVenir.some((s) => s.session.debut < maintenant) ? 'alerte' : 'neutre'}
              aide="Séances passées encore au statut planifiée"
            />
          </GrilleStats>
        )}

        {formulaireOuvert && profile && (
          <FormulairePlanification
            etudiantsActifs={etudiantsActifs}
            debutInitial={debutPreselectionne}
            onAnnuler={() => setFormulaireOuvert(false)}
            onCree={() => {
              setFormulaireOuvert(false)
              recharger()
            }}
          />
        )}

        {loading || chargementEvenements ? (
          <EtatChargement lignes={3} hauteur={110} />
        ) : vue === 'agenda' ? (
          <AgendaHebdo
            evenements={evenements}
            semaineDebut={semaineDebut}
            onSemaineChange={setSemaineDebut}
            onSelectionner={(evenement) => (estEvenementAdmin(evenement.id) ? setElementOuvertId(evenement.id) : setSeanceOuverteId(evenement.id))}
            onCreneauLibre={etudiantsActifs.length > 0 ? ouvrirPlanification : undefined}
            legende={<LegendeTypeSeance />}
            videMessage={
              etudiantsActifs.length === 0
                ? 'Aucun élève ne vous est encore attribué : l’administration doit le faire avant que vous puissiez planifier un cours.'
                : 'Aucun cours cette semaine. Cliquez un créneau libre pour en planifier un.'
            }
          />
        ) : vue === 'previsionnel' ? (
          <PlanningPrevisionnelProfesseur seances={seances} etudiantsActifs={etudiantsActifs} vagues={vagues} onChange={recharger} />
        ) : (
          <>
            <GroupeSection titre="À venir" description="Vos prochaines séances, de la plus proche à la plus lointaine.">
              {aVenir.length === 0 ? (
                <EtatVide
                  icone="seances"
                  titre="Aucune séance planifiée"
                  description="Utilisez « Planifier une séance » pour programmer votre prochain cours. Sans séance planifiée, vos élèves n’ont aucune échéance affichée dans leur espace."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {aVenir.map((seance) => (
                    <CarteSeance key={seance.session.id} seance={seance} maintenant={maintenant} onChange={recharger} />
                  ))}
                </div>
              )}
            </GroupeSection>

            <GroupeSection titre="Passées" description="Séances terminées ou annulées. C’est ici que vous rédigez vos comptes rendus.">
              {passees.length === 0 ? (
                <EtatVide compact icone="seances" titre="Aucune séance passée" description="Votre historique se remplira au fil de vos cours." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {passees.map((seance) => (
                    <CarteSeance key={seance.session.id} seance={seance} maintenant={maintenant} onChange={recharger} />
                  ))}
                </div>
              )}
            </GroupeSection>
          </>
        )}
      </div>

      {seanceOuverte && (
        <Modale
          titre={new Date(seanceOuverte.session.debut).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}
          onFermer={() => setSeanceOuverteId(null)}
          largeurMax={520}
        >
          {/* Exactement la carte de la vue liste, sans son cadre : présence, clôture, annulation,
              reprogrammation et compte rendu restent écrits à un seul endroit. */}
          <CarteSeance seance={seanceOuverte} maintenant={maintenant} onChange={recharger} sansCadre />
        </Modale>
      )}

      {/* Fiche d'un rendez-vous « autre » (entretien, séance d'information…) — même composant que
          l'espace admin, restreint à sa propre annulation (api/professeur/annuler-evenement.ts). */}
      <PopupEvenementAdmin
        elementOuvertId={elementOuvertId}
        onFermer={() => setElementOuvertId(null)}
        rendezVous={[]}
        evenementsAdmin={evenementsAutres}
        profile={profile}
        session={session}
        onChange={rechargerEvenements}
        urlAnnulation="/api/professeur/annuler-evenement"
      />
    </ProfesseurLayout>
  )
}

function FormulairePlanification({
  etudiantsActifs,
  debutInitial,
  onAnnuler,
  onCree,
}: {
  etudiantsActifs: Profile[]
  debutInitial?: string
  onAnnuler: () => void
  onCree: () => void
}) {
  const { session } = useProfileContext()
  const { vagues } = useVagues()
  const { classes } = useClassesAvecMembres()
  const [nature, setNature] = useState<NatureRendezVous>('seance_cours')
  const [titre, setTitre] = useState('')
  const [notes, setNotes] = useState('')
  const [studentIds, setStudentIds] = useState<string[]>([])
  const [obligatoiresIds, setObligatoiresIds] = useState<string[]>([])
  const [optionnelsIds, setOptionnelsIds] = useState<string[]>([])
  const [debut, setDebut] = useState(debutInitial ?? '')
  const [dureeMinutes, setDureeMinutes] = useState(60)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const candidats = useMemo(
    () => [...etudiantsSelectionnables(etudiantsActifs), ...vaguesSelectionnables(vagues), ...classesSelectionnables(classes)],
    [etudiantsActifs, vagues, classes],
  )

  /* Une séance n'est rattachée à une classe/vague que si tout son effectif y est, et lui seul :
     c'est cette appartenance qui fait décompter l'heure à tous ses inscrits (0069, point 10). Une
     classe est plus spécifique qu'une vague entière (0074) : testée en premier, une promotion
     scindée en classes ne « retombe » sur la vague que si la sélection dépasse une seule classe. */
  const classeDeLaSeance = useMemo(() => {
    const choisis = new Set(studentIds)
    return classes.find((c) => c.membreIds.length === choisis.size && c.membreIds.every((id) => choisis.has(id)))
  }, [studentIds, classes])

  const vagueDeLaSeance = useMemo(() => {
    if (classeDeLaSeance) return undefined
    const choisis = new Set(studentIds)
    return vagues.find(
      (v) => v.membreIds.length === choisis.size && v.membreIds.every((id) => choisis.has(id)),
    )
  }, [studentIds, vagues, classeDeLaSeance])

  const participantsManquants = nature === 'seance_cours' ? studentIds.length === 0 : obligatoiresIds.length === 0 && optionnelsIds.length === 0

  async function creer() {
    if (!session || !debut || participantsManquants) return
    if (nature === 'autre' && !titre.trim()) {
      setErreur('Le titre est obligatoire.')
      return
    }
    setEnCours(true)
    setErreur(null)
    // Une séance de cours crée une vraie `sessions` (heures décomptées à la clôture) ; « autre »
    // crée un `evenements_admin`, sans effet sur les heures — demande client du 2026-09-23,
    // « exactement comme dans l'espace admin » (voir api/professeur/creer-evenement.ts).
    const reponse = await fetch(
      nature === 'seance_cours' ? '/api/professeur/planifier-seance' : '/api/professeur/creer-evenement',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(
          nature === 'seance_cours'
            ? {
                studentIds,
                type: studentIds.length > 1 ? 'collectif' : 'individuel',
                debut: new Date(debut).toISOString(),
                dureeMinutes,
                cohortId: classeDeLaSeance?.cohorte?.id ?? vagueDeLaSeance?.cohorte.id,
                cohortClassId: classeDeLaSeance?.classe.id,
              }
            : {
                titre: titre.trim(),
                debut: new Date(debut).toISOString(),
                dureeMinutes,
                obligatoiresIds,
                optionnelsIds,
                notes: notes.trim() || undefined,
              },
        ),
      },
    )
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? (nature === 'seance_cours' ? 'La planification a échoué.' : "La création a échoué."))
      return
    }
    onCree()
  }

  /* Pop-up plutôt que carte inline — demande client du 2026-09-21 : un clic sur un créneau de
     l'agenda doit toujours ouvrir une fenêtre avec les informations du créneau et ses boutons de
     validation/annulation. En carte inline, le formulaire s'affichait au-dessus de la grille et
     passait hors écran dès que le professeur avait fait défiler l'agenda : le clic semblait
     sans effet. */
  return (
    <Modale titre="Nouveau rendez-vous" onFermer={onAnnuler} largeurMax={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <ChoixNatureRendezVous valeur={nature} onChange={setNature} />

      {nature === 'autre' && (
        <input
          required
          placeholder="Titre (ex. Entretien de suivi)"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          style={champStyle}
        />
      )}

      {etudiantsActifs.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>Aucun élève ne vous est actuellement attribué.</p>
      ) : nature === 'seance_cours' ? (
        // Recherche façon Outlook, même principe que la création de rendez-vous côté admin
        // (demande client du 2026-09-16, voir SelecteurPersonnes.tsx) : on tape un nom, on
        // choisit dans les suggestions, la personne devient une pastille amovible.
        <SelecteurPersonnes
          etiquette="Élève(s)"
          placeholder="Rechercher un élève, une classe ou une vague…"
          candidats={candidats}
          selectionnes={studentIds}
          onChange={setStudentIds}
        />
      ) : (
        <>
          <SelecteurPersonnes
            etiquette="Participants obligatoires"
            placeholder="Rechercher un élève, une classe ou une vague…"
            candidats={candidats}
            selectionnes={obligatoiresIds}
            onChange={setObligatoiresIds}
            exclure={optionnelsIds}
          />
          <SelecteurPersonnes
            etiquette="Participants optionnels"
            placeholder="Rechercher un élève, une classe ou une vague…"
            candidats={candidats}
            selectionnes={optionnelsIds}
            onChange={setOptionnelsIds}
            exclure={obligatoiresIds}
          />
        </>
      )}

      {nature === 'seance_cours' && classeDeLaSeance && (
        <p style={{ fontSize: 12, color: 'var(--accent-violet)', margin: 0, lineHeight: 1.5 }}>
          Séance de la classe « {LABEL_NIVEAU_CLASSE[classeDeLaSeance.classe.niveau]}
          {classeDeLaSeance.classe.nom ? ` — ${classeDeLaSeance.classe.nom}` : ''} » : une fois clôturée, l’heure sera
          décomptée du forfait de ses {classeDeLaSeance.membreIds.length} inscrits, présents ou non.
        </p>
      )}
      {nature === 'seance_cours' && !classeDeLaSeance && vagueDeLaSeance && (
        <p style={{ fontSize: 12, color: 'var(--accent-violet)', margin: 0, lineHeight: 1.5 }}>
          Séance de la vague « {vagueDeLaSeance.cohorte.nom} » : une fois clôturée, l’heure sera décomptée du forfait de
          ses {vagueDeLaSeance.membreIds.length} inscrits, présents ou non.
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Date et heure</label>
          <input type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Durée (min)</label>
          <input type="number" min={15} step={15} value={dureeMinutes} onChange={(e) => setDureeMinutes(Number(e.target.value))} style={champStyle} />
        </div>
      </div>

      {nature === 'seance_cours' && <AvertissementDureeMeet dureeMinutes={dureeMinutes} nombreEleves={studentIds.length} />}

      {nature === 'autre' && (
        <textarea
          placeholder="Notes (facultatif)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      )}

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{erreur}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onAnnuler} style={{ flexGrow: 1, fontSize: 13, padding: 11, borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
          Annuler
        </button>
        <button
          onClick={creer}
          disabled={enCours || !debut || participantsManquants}
          className="btn-shine"
          style={{ flexGrow: 1, background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours || !debut || participantsManquants ? 0.6 : 1 }}
        >
          {enCours ? 'Création…' : nature === 'seance_cours' ? 'Planifier' : 'Créer le rendez-vous'}
        </button>
      </div>
      </div>
    </Modale>
  )
}

function CarteSeance({
  seance,
  maintenant,
  onChange,
  sansCadre = false,
}: {
  seance: SeanceProfesseur
  maintenant: string
  onChange: () => void
  /* Montée dans une modale (depuis l'agenda), la carte perd son propre cadre pour éviter une
     carte dans une carte — même convention que le prop `carte` d'InformationsPersonnelles. */
  sansCadre?: boolean
}) {
  const { session: authSession, profile } = useProfileContext()
  const [presences, setPresences] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(seance.inscriptions.map((i) => [i.student_id, true])),
  )
  const [clotureOuverte, setClotureOuverte] = useState(false)
  const [editionHoraireOuverte, setEditionHoraireOuverte] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const estAVenir = seance.session.statut === 'planifiee'
  const dejaCommencee = seance.session.debut <= maintenant

  async function annuler() {
    if (!authSession) return
    setEnCours(true)
    setErreur(null)
    // Passe par l'API plutôt que par un update direct : l'annulation doit aussi supprimer
    // l'événement Google Calendar et prévenir les invités, ce que seul le serveur peut faire.
    const reponse = await fetch('/api/professeur/annuler-seance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authSession.access_token}` },
      body: JSON.stringify({ sessionId: seance.session.id }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? "L'annulation a échoué.")
      return
    }
    onChange()
  }

  async function cloturer() {
    if (!authSession) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/professeur/cloturer-seance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authSession.access_token}` },
      body: JSON.stringify({
        sessionId: seance.session.id,
        presences: Object.entries(presences).map(([studentId, present]) => ({ studentId, present })),
      }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'La clôture a échoué.')
      return
    }
    setClotureOuverte(false)
    onChange()
  }

  return (
    <div
      className={sansCadre ? undefined : 'card card-lift'}
      style={{ padding: sansCadre ? 0 : 18, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="brand-font" style={{ fontSize: 15, color: 'var(--ink)' }}>
            {new Date(seance.session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {libelleTypeSeance(seance)} · {seance.session.duree_minutes} min ·{' '}
            {nomsElevesInscrits(seance.inscriptions).join(', ')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BadgeStatutSeance statut={seance.session.statut} />
        </div>
      </div>

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erreur}</p>}

      {estAVenir && !clotureOuverte && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {seance.video && (
            <a href={getJoinUrl(seance.video)} target="_blank" rel="noreferrer" className="btn-shine btn-secondary" style={{ fontSize: 12.5, padding: '9px 16px' }}>
              Rejoindre
            </a>
          )}
          {dejaCommencee && (
            <button onClick={() => setClotureOuverte(true)} className="btn-shine" style={{ fontSize: 12.5, padding: '9px 16px', background: 'var(--accent-gradient)', color: '#1b1510' }}>
              Clôturer
            </button>
          )}
          <button
            onClick={() => setEditionHoraireOuverte(true)}
            style={{ fontSize: 12.5, padding: '9px 16px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--accent-blue)', cursor: 'pointer' }}
          >
            Modifier l'heure
          </button>
          <button
            onClick={annuler}
            disabled={enCours}
            style={{ fontSize: 12.5, padding: '9px 16px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}
          >
            Annuler la séance
          </button>
        </div>
      )}

      {clotureOuverte && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>Présence</span>
          {seance.inscriptions.map((i) => (
            <label key={i.student_id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={presences[i.student_id] ?? true}
                onChange={(e) => setPresences((p) => ({ ...p, [i.student_id]: e.target.checked }))}
              />
              {i.etudiant?.prenom} {i.etudiant?.nom}
            </label>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setClotureOuverte(false)} style={{ flexGrow: 1, fontSize: 12.5, padding: 9, borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
              Annuler
            </button>
            <button onClick={cloturer} disabled={enCours} className="btn-shine" style={{ flexGrow: 1, fontSize: 12.5, padding: 9, background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours ? 0.6 : 1 }}>
              Confirmer la clôture
            </button>
          </div>
        </div>
      )}

      {seance.session.statut === 'terminee' && profile && (
        <CompteRenduSeance sessionId={seance.session.id} etablissementId={profile.etablissement_id} teacherId={profile.id} />
      )}

      {editionHoraireOuverte && (
        <EditerSeancePlanifieeModale
          session={seance.session}
          etudiants={seance.inscriptions.map((i) => i.etudiant).filter((e): e is NonNullable<typeof e> => !!e)}
          professeur={profile}
          video={seance.video}
          onFermer={() => setEditionHoraireOuverte(false)}
          onEnregistre={() => {
            setEditionHoraireOuverte(false)
            onChange()
          }}
        />
      )}
    </div>
  )
}
