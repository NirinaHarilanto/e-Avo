import { useMemo, useState } from 'react'
import { jetonAcces } from '../../lib/jetonAcces'
import { AdminLayout } from '../layout/AdminLayout'
import { useSeancesAdmin, type SeanceAdmin } from '../../hooks/useSeancesAdmin'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useRendezVous } from '../../hooks/useRendezVous'
import { useEvenementsAdmin } from '../../hooks/useEvenementsAdmin'
import {
  agendaAdminComplet,
  estEvenementGooglePersonnel,
  estEvenementPrestation,
  idGoogleDepuisEvenement,
  idPrestationDepuisEvenement,
  seanceSansEffet,
  versEvenementAdmin,
  versEvenementPrestation,
  versEvenementSeance,
} from '../../lib/agendaEvenements'
import { useEvenementsGoogleCalendarPersonnel } from '../../hooks/useGoogleCalendarPersonnel'
import { libelleTypeSeance, nomsElevesInscrits } from '../../lib/seances'
import { BadgeStatutSeance } from '../shared/BadgeStatutSeance'
import { EditerSeancePlanifieeModale } from '../shared/EditerSeancePlanifieeModale'
import { PopupEvenementAdmin, estEvenementAdmin } from '../shared/PopupEvenementAdmin'
import { FicheEvenementGoogle } from '../shared/FicheEvenementGoogle'
import { DetailSeanceModale } from '../shared/DetailSeanceModale'
import { LegendeTypeSeance } from '../shared/LegendeTypeSeance'
import { LignePrestation } from '../professeurs/PrestationsExternes'
import { usePrestationsExternesEtablissement } from '../../hooks/usePrestationsExternes'
import { Modale } from '../ui/Modale'
import { initiales } from '../etudiants/DossierEtudiantVue'
import { EnTetePage } from '../ui/EnTetePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { boutonSecondaireStyle } from '../ui/Boutons'
import { GroupeSection } from '../ui/Section'
import { Onglets } from '../ui/Onglets'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { AgendaHebdo } from '../ui/AgendaHebdo'
import { useProfileContext } from '../../context/ProfileContext'
import { estLienReel, getJoinUrl } from '../../lib/visio'
import { ajouterJours, lundiDeLaSemaine } from '../../lib/agenda'

type Vue = 'semaine' | 'globale'

/* Une teinte par professeur, stable d'une semaine à l'autre : sur l'agenda de l'établissement,
   la couleur est le seul repère qui permet de distinguer d'un coup d'œil les cours de chacun
   quand aucun filtre n'est actif. */
/* Pseudo-identifiant pour « l'agenda de l'admin » (rendez-vous prospects + événements créés par
   l'admin) dans la liste de personnes sélectionnables — jamais un UUID réel, donc jamais en
   conflit avec un professeur ou un étudiant. Demande client du 2026-09-21 : pouvoir cocher
   plusieurs professeurs et/ou étudiants à la fois, plus « Admin » pour voir son propre agenda. */
const ID_ADMIN = '__admin__'

export function SeancesAdmin() {
  const { profile, session } = useProfileContext()
  const { seances, loading, erreur, recharger } = useSeancesAdmin()
  const { professeurs } = useProfesseurs()
  const { etudiants } = useEtudiants()
  const { rendezVous, recharger: rechargerRendezVous } = useRendezVous()
  const { evenements: evenementsAdmin, recharger: rechargerEvenementsAdmin } = useEvenementsAdmin()
  /* Prestations corporate / chat & chill de tout l'établissement — demande client du 2026-10-20 :
     elles occupaient un créneau dans l'agenda du professeur sans jamais apparaître ici, si bien
     que les deux agendas ne montraient pas la même semaine. */
  const { prestations, recharger: rechargerPrestations } = usePrestationsExternesEtablissement()
  const [vue, setVue] = useState<Vue>('semaine')
  const [semaineDebut, setSemaineDebut] = useState(() => lundiDeLaSemaine(new Date()))
  const [personnesSelectionnees, setPersonnesSelectionnees] = useState<Set<string>>(new Set())

  const [seanceOuverteId, setSeanceOuverteId] = useState<string | null>(null)
  const [prestationOuverteId, setPrestationOuverteId] = useState<string | null>(null)
  const [editionOuverte, setEditionOuverte] = useState(false)

  function basculerPersonne(id: string) {
    setPersonnesSelectionnees((s) => {
      const copie = new Set(s)
      if (copie.has(id)) copie.delete(id)
      else copie.add(id)
      return copie
    })
  }

  const semaineFin = useMemo(() => ajouterJours(semaineDebut, 7), [semaineDebut])

  /* Agenda Google personnel DE CET ADMIN (0098), superposé quand la case « Admin » est cochée —
     demande client du 2026-10-10 : « quand la box admin est coché, [l'agenda] devrait être
     synchronisé exactement avec l'agenda de l'admin dans la section Agenda ». Avant ce correctif,
     cette page n'ajoutait que les rendez-vous prospects et les événements admin
     (agendaAdminComplet) ; « Agenda » (RendezVousAdmin.tsx) y ajoute aussi cette superposition
     depuis le 2026-10-09 — les deux pages montraient donc, pour « Admin », deux agendas
     différents. Même hook, même source. */
  const {
    evenements: evenementsGooglePersonnel,
    parId: googleParId,
    recharger: rechargerGoogle,
  } = useEvenementsGoogleCalendarPersonnel(semaineDebut)

  const seancesSemaine = useMemo(
    () => seances.filter((s) => s.session.debut >= semaineDebut.toISOString() && s.session.debut < semaineFin.toISOString()),
    [seances, semaineDebut, semaineFin],
  )

  const professeurIds = useMemo(() => professeurs.map((p) => p.id), [professeurs])

  const adminSelectionne = personnesSelectionnees.has(ID_ADMIN)
  const profsSelectionnes = useMemo(
    () => new Set([...personnesSelectionnees].filter((id) => professeurIds.includes(id))),
    [personnesSelectionnees, professeurIds],
  )
  const etudiantIds = useMemo(() => etudiants.map((e) => e.id), [etudiants])
  const etudiantsSelectionnes = useMemo(
    () => new Set([...personnesSelectionnees].filter((id) => etudiantIds.includes(id))),
    [personnesSelectionnees, etudiantIds],
  )

  const evenements = useMemo(() => {
    // Rien coché : comportement d'origine, toutes les séances de la semaine, aucun agenda admin.
    const visibles =
      personnesSelectionnees.size === 0
        ? seancesSemaine
        : seancesSemaine.filter(
            (s) =>
              (s.professeur && profsSelectionnes.has(s.professeur.id)) ||
              s.inscriptions.some((i) => i.etudiant && etudiantsSelectionnes.has(i.etudiant.id)),
          )
    /* Conversion partagée avec l'agenda de l'espace admin (`versEvenementSeance`) : les deux pages
       doivent montrer la même séance de la même façon. Sans préfixe ici, l'id nu étant celui que
       les écrans de cette page attendent déjà. Une séance annulée/reportée est retirée de CETTE
       grille (demande client du 2026-10-11) — elle reste visible dans la vue « globale » en liste
       ci-dessous (aVenir/passees), qui sert justement d'historique. */
    const seancesEvenements = visibles
      .filter((seance) => !seanceSansEffet(seance.session.statut))
      .map((seance) => versEvenementSeance(seance, nomsElevesInscrits(seance.inscriptions), professeurIds))

    /* Prestations hors cursus de la semaine (0131), affichées ici comme dans l'agenda du
       professeur — même conversion partagée, donc même couleur et même libellé des deux côtés.
       Elles n'ont aucun élève : cocher un ÉTUDIANT n'en fait donc apparaître aucune, alors que
       cocher son professeur les montre toutes. Les annulées sont retirées de la grille, comme
       les séances annulées (demande client du 2026-10-11). */
    const prestationsEvenements = prestations
      .filter((p) => p.statut !== 'annulee')
      .filter((p) => p.debut >= semaineDebut.toISOString() && p.debut < semaineFin.toISOString())
      .filter((p) => personnesSelectionnees.size === 0 || profsSelectionnes.has(p.teacher_id))
      .map(versEvenementPrestation)

    /* Rendez-vous « autre » dont une personne COCHÉE est participante — demande client du
       2026-10-31 : « synchroniser les agendas des professeurs sélectionnés avec les agendas des
       professeurs ». Un professeur voit ces rendez-vous dans son propre agenda (policy
       `evenements_admin_teacher_select`, 0073) ; ici ils n'apparaissaient qu'avec la case Admin,
       et sans lien avec le professeur coché — cocher un professeur montrait donc une semaine
       différente de la sienne, exactement comme pour ses prestations avant le 2026-10-20. */
    const evenementsDesPersonnes = evenementsAdmin
      .filter((e) => !e.annule)
      .filter((e) => e.debut >= semaineDebut.toISOString() && e.debut < semaineFin.toISOString())
      .filter((e) =>
        [...e.obligatoires, ...e.optionnels].some((p) => profsSelectionnes.has(p.id) || etudiantsSelectionnes.has(p.id)),
      )
      .map(versEvenementAdmin)

    if (!adminSelectionne) return [...seancesEvenements, ...prestationsEvenements, ...evenementsDesPersonnes]

    const evenementsAgendaAdmin = agendaAdminComplet(rendezVous, evenementsAdmin).filter((e) => {
      const debutIso = e.debut
      return debutIso >= semaineDebut.toISOString() && debutIso < semaineFin.toISOString()
    })
    /* Admin ET professeur cochés : le même rendez-vous figure des deux côtés (l'agenda admin les
       porte tous), il ne doit apparaître qu'une fois dans la grille. */
    const dejaPoses = new Set(evenementsDesPersonnes.map((e) => e.id))
    // `evenementsGooglePersonnel` est déjà borné à la semaine affichée par le hook lui-même
    // (paramètre `semaineDebut`), aucun filtrage de date à refaire ici.
    return [
      ...seancesEvenements,
      ...prestationsEvenements,
      ...evenementsDesPersonnes,
      ...evenementsAgendaAdmin.filter((e) => !dejaPoses.has(e.id)),
      ...evenementsGooglePersonnel,
    ]
  }, [
    seancesSemaine,
    prestations,
    personnesSelectionnees,
    profsSelectionnes,
    etudiantsSelectionnes,
    professeurIds,
    adminSelectionne,
    rendezVous,
    evenementsAdmin,
    semaineDebut,
    semaineFin,
    evenementsGooglePersonnel,
  ])

  /* Toute séance s'ouvre, quel que soit son statut — demande client du 2026-09-23 (point 4) :
     une séance terminée doit livrer son compte rendu et les avis de ses élèves, ce que
     l'ancienne condition `statut === 'planifiee'` rendait impossible (le clic ne faisait rien).
     L'édition reste, elle, réservée aux séances encore planifiées. Quand le filtre « Admin » est
     coché, l'agenda mélange aussi des rendez-vous prospects, des événements admin et l'agenda
     Google personnel de l'admin (ids préfixés, voir lib/agendaEvenements.ts) : un clic dessus
     ouvre leur propre fiche. */
  const clicEstEvenementGoogle = estEvenementGooglePersonnel(seanceOuverteId)
  const clicEstEvenementAdmin = !clicEstEvenementGoogle && estEvenementAdmin(seanceOuverteId)
  const seanceOuverte = !clicEstEvenementAdmin && !clicEstEvenementGoogle
    ? seances.find((s) => s.session.id === seanceOuverteId) ?? null
    : null
  /* Une prestation hors cursus ouvre sa propre fiche (2026-10-20), comme dans l'agenda du
     professeur : elle n'a ni élève, ni présence à émarger, ni visio — la fiche de séance n'aurait
     rien à y montrer. */
  const prestationOuverte = prestations.find((p) => p.id === prestationOuverteId) ?? null
  const professeurDeLaPrestation = prestationOuverte
    ? (professeurs.find((p) => p.id === prestationOuverte.teacher_id) ?? null)
    : null
  const evenementGoogleOuvert =
    clicEstEvenementGoogle && seanceOuverteId ? (googleParId.get(idGoogleDepuisEvenement(seanceOuverteId)) ?? null) : null

  const maintenant = new Date().toISOString()
  const aVenir = seances
    .filter((s) => s.session.statut === 'planifiee')
    .sort((a, b) => a.session.debut.localeCompare(b.session.debut))
  // Chronologique comme le reste des plannings de l'app, y compris l'historique.
  const passees = seances
    .filter((s) => s.session.statut !== 'planifiee')
    .sort((a, b) => a.session.debut.localeCompare(b.session.debut))

  return (
    <AdminLayout actif="Séances & visio">
      <EnTetePage
        compact
        titre="Séances & visio"
        actions={
          <Onglets
            etiquette="Mode d’affichage du planning"
            actif={vue}
            onChange={setVue}
            onglets={[
              { value: 'semaine', label: 'Vue par semaine' },
              { value: 'globale', label: 'Vue globale' },
            ]}
          />
        }
      />

      {erreur && (
        <div style={{ marginBottom: 16 }}>
          <MessageErreur>{erreur}</MessageErreur>
        </div>
      )}

      {!loading && seances.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <GrilleStats min={160} compact>
            <Stat compact libelle="Séances au total" valeur={seances.length} ton="or" />
            <Stat compact libelle="À venir" valeur={aVenir.length} ton="bleu" aide="Statut « planifiée »" />
            <Stat compact libelle="Cette semaine" valeur={seancesSemaine.length} ton="teal" aide="Sur la semaine affichée" />
            <Stat
              compact
              libelle="Annulées"
              valeur={seances.filter((s) => s.session.statut === 'annulee').length}
              ton="neutre"
            />
          </GrilleStats>
        </div>
      )}

      {loading ? (
        <EtatChargement lignes={4} hauteur={74} />
      ) : vue === 'globale' ? (
        seances.length === 0 ? (
          <EtatVide
            icone="seances"
            titre="Aucune séance planifiée"
            description="Les séances apparaîtront ici dès qu’un professeur en programmera depuis son agenda, ou dès qu’un forfait étudiant sera planifié en lot depuis son dossier."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <GroupeSection compact titre={`À venir · ${aVenir.length}`}>
              {aVenir.length === 0 ? (
                <EtatVide compact icone="seances" titre="Aucune séance à venir" description="Toutes les séances programmées sont déjà passées." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {aVenir.map((seance) => (
                    <LigneSeance key={seance.session.id} seance={seance} maintenant={maintenant} onChange={recharger} />
                  ))}
                </div>
              )}
            </GroupeSection>
            <GroupeSection compact titre={`Passées · ${passees.length}`}>
              {passees.length === 0 ? (
                <EtatVide compact icone="seances" titre="Aucune séance passée" description="L’historique se remplira au fil des séances clôturées." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {passees.map((seance) => (
                    <LigneSeance key={seance.session.id} seance={seance} maintenant={maintenant} onChange={recharger} />
                  ))}
                </div>
              )}
            </GroupeSection>
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="grille-agenda-filtre">
            <aside style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              {personnesSelectionnees.size > 0 && (
                <button
                  onClick={() => setPersonnesSelectionnees(new Set())}
                  style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Tout décocher
                </button>
              )}

              <LigneFiltrePersonne
                id={ID_ADMIN}
                libelle="Admin"
                sousTitre="Rendez-vous, événements créés par l’admin, et son agenda Google — le même qu’en page Agenda"
                coche={adminSelectionne}
                onBasculer={() => basculerPersonne(ID_ADMIN)}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted-2)', padding: '2px 4px' }}>
                  Professeurs
                </span>
                {professeurs.map((prof) => {
                  const nb = seancesSemaine.filter((s) => s.professeur?.id === prof.id).length
                  return (
                    <LigneFiltrePersonne
                      key={prof.id}
                      id={prof.id}
                      libelle={`${prof.prenom} ${prof.nom}`}
                      compteur={nb}
                      initiales={initiales(prof)}
                      coche={profsSelectionnes.has(prof.id)}
                      onBasculer={() => basculerPersonne(prof.id)}
                    />
                  )
                })}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted-2)', padding: '2px 4px' }}>
                  Étudiants
                </span>
                {etudiants.map((etu) => {
                  const nb = seancesSemaine.filter((s) => s.inscriptions.some((i) => i.etudiant?.id === etu.id)).length
                  return (
                    <LigneFiltrePersonne
                      key={etu.id}
                      id={etu.id}
                      libelle={`${etu.prenom} ${etu.nom}`}
                      compteur={nb}
                      initiales={initiales(etu)}
                      coche={etudiantsSelectionnes.has(etu.id)}
                      onBasculer={() => basculerPersonne(etu.id)}
                    />
                  )
                })}
              </div>
            </aside>

            <div style={{ minWidth: 0 }}>
              <AgendaHebdo
                evenements={evenements}
                semaineDebut={semaineDebut}
                onSemaineChange={setSemaineDebut}
                onSelectionner={(evenement) =>
                  estEvenementPrestation(evenement.id)
                    ? setPrestationOuverteId(idPrestationDepuisEvenement(evenement.id))
                    : setSeanceOuverteId(evenement.id)
                }
                legende={<LegendeTypeSeance />}
                videMessage={
                  personnesSelectionnees.size > 0
                    ? 'Aucun événement pour les personnes cochées cette semaine. Changez la sélection ou de semaine.'
                    : 'Aucune séance cette semaine. Les professeurs les créent depuis leur propre agenda, ou l’admin en lot depuis un forfait étudiant.'
                }
              />
            </div>
          </div>
        </div>
      )}

      {seanceOuverte && !editionOuverte && (
        <DetailSeanceModale
          session={seanceOuverte.session}
          professeur={seanceOuverte.professeur}
          eleves={seanceOuverte.inscriptions.map((i) => i.etudiant)}
          video={seanceOuverte.video}
          onFermer={() => setSeanceOuverteId(null)}
          actions={
            seanceOuverte.session.statut === 'planifiee' ? (
              <button onClick={() => setEditionOuverte(true)} style={boutonSecondaireStyle}>
                Modifier ou annuler la séance
              </button>
            ) : undefined
          }
        />
      )}

      {/* Fiche d'une prestation hors cursus (2026-10-20) : l'admin y retrouve ce que le
          professeur voit depuis son propre agenda — détail, clôture et compte rendu (0134). */}
      {prestationOuverte && (
        <Modale titre="Prestation hors cursus" onFermer={() => setPrestationOuverteId(null)} largeurMax={520}>
          <LignePrestation
            prestation={prestationOuverte}
            professeur={professeurDeLaPrestation}
            peutGerer
            peutCloturer
            sansCadre
            onChange={() => {
              rechargerPrestations()
              setPrestationOuverteId(null)
            }}
          />
        </Modale>
      )}

      {seanceOuverte && editionOuverte && (
        <EditerSeancePlanifieeModale
          session={seanceOuverte.session}
          etudiants={seanceOuverte.inscriptions.map((i) => i.etudiant).filter((e): e is NonNullable<typeof e> => !!e)}
          professeur={seanceOuverte.professeur}
          video={seanceOuverte.video}
          onFermer={() => setEditionOuverte(false)}
          onEnregistre={() => {
            setEditionOuverte(false)
            setSeanceOuverteId(null)
            recharger()
          }}
        />
      )}

      {clicEstEvenementAdmin && (
        <PopupEvenementAdmin
          elementOuvertId={seanceOuverteId}
          onFermer={() => setSeanceOuverteId(null)}
          rendezVous={rendezVous}
          evenementsAdmin={evenementsAdmin}
          profile={profile}
          session={session}
          onChange={() => {
            rechargerRendezVous()
            rechargerEvenementsAdmin()
          }}
        />
      )}

      {/* Même fiche que dans « Agenda » (RendezVousAdmin.tsx) : cliquer un événement de l'agenda
          Google de l'admin doit donner la même chose des deux côtés. */}
      {evenementGoogleOuvert && (
        <FicheEvenementGoogle
          evenement={evenementGoogleOuvert}
          onFermer={() => setSeanceOuverteId(null)}
          onChange={rechargerGoogle}
        />
      )}
    </AdminLayout>
  )
}

/* Ligne à case à cocher du filtre multi-personnes — demande client du 2026-09-21 : pouvoir
   sélectionner plusieurs professeurs et/ou étudiants à la fois, plus « Admin », et voir d'un
   coup d'œil qui est coché. */
function LigneFiltrePersonne({
  id,
  libelle,
  sousTitre,
  compteur,
  initiales: initialesPersonne,
  coche,
  onBasculer,
}: {
  id: string
  libelle: string
  sousTitre?: string
  compteur?: number
  initiales?: string
  coche: boolean
  onBasculer: () => void
}) {
  return (
    <label
      htmlFor={`filtre-personne-${id}`}
      className="carte-ligne"
      style={{
        textAlign: 'left',
        borderRadius: 12,
        border: coche ? '1px solid rgba(169,140,255,.5)' : '1px solid var(--border)',
        background: 'var(--surface)',
        padding: '8px 11px',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        cursor: 'pointer',
      }}
    >
      <input id={`filtre-personne-${id}`} type="checkbox" checked={coche} onChange={onBasculer} style={{ flexShrink: 0 }} />
      {initialesPersonne && (
        <span style={{ width: 26, height: 26, borderRadius: 999, background: 'var(--voile, rgba(255,255,255,.06))', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
          {initialesPersonne}
        </span>
      )}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flexGrow: 1, minWidth: 0 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)' }}>{libelle}</span>
        {sousTitre && <span style={{ fontSize: 10, color: 'var(--muted-2)' }}>{sousTitre}</span>}
      </span>
      {compteur !== undefined && <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{compteur}</span>}
    </label>
  )
}

function LigneSeance({ seance, onChange }: { seance: SeanceAdmin; maintenant: string; onChange: () => void }) {
  const { session: authSession } = useProfileContext()
  const [editionOuverte, setEditionOuverte] = useState(false)
  const [generationEnCours, setGenerationEnCours] = useState(false)
  const [erreurVisio, setErreurVisio] = useState<string | null>(null)
  const modifiable = seance.session.statut === 'planifiee'
  const lienReel = seance.video ? estLienReel(seance.video) : false

  async function genererLienMeet() {
    if (!authSession) return
    setGenerationEnCours(true)
    setErreurVisio(null)
    const reponse = await fetch('/api/admin/generer-lien-visio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonAcces()}` },
      body: JSON.stringify({ sessionId: seance.session.id }),
    })
    setGenerationEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreurVisio(corps?.error ?? 'La génération du lien a échoué.')
      return
    }
    onChange()
  }

  return (
    <div
      onClick={modifiable ? () => setEditionOuverte(true) : undefined}
      className={modifiable ? 'card card-lift row-hl' : 'card card-lift'}
      style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', cursor: modifiable ? 'pointer' : 'default' }}
    >
      <span style={{ fontSize: 12.5, color: 'var(--muted)', width: 150, flexShrink: 0 }}>
        {new Date(seance.session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
      </span>
      <span className="brand-font" style={{ fontSize: 13.5, color: 'var(--ink)', width: 170, flexShrink: 0 }}>
        {seance.professeur ? `${seance.professeur.prenom} ${seance.professeur.nom}` : 'Professeur inconnu'}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flexGrow: 1, minWidth: 200 }}>
        {libelleTypeSeance(seance.session.type, seance.inscriptions)} · {seance.session.duree_minutes} min ·{' '}
        {nomsElevesInscrits(seance.inscriptions).join(', ') || 'aucun élève inscrit'}
      </span>
      <BadgeStatutSeance statut={seance.session.statut} seance={seance.session} />

      {modifiable &&
        (lienReel && seance.video ? (
          <a
            href={getJoinUrl(seance.video)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-teal)' }}
          >
            Lien visio
          </a>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              genererLienMeet()
            }}
            disabled={generationEnCours}
            style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {generationEnCours ? 'Génération…' : 'Générer le lien visio'}
          </button>
        ))}

      {erreurVisio && (
        <span style={{ fontSize: 11, color: 'var(--danger)', flexBasis: '100%' }} onClick={(e) => e.stopPropagation()}>
          {erreurVisio}
        </span>
      )}

      {editionOuverte && (
        <div onClick={(e) => e.stopPropagation()}>
          <EditerSeancePlanifieeModale
            session={seance.session}
            etudiants={seance.inscriptions.map((i) => i.etudiant).filter((e): e is NonNullable<typeof e> => !!e)}
            professeur={seance.professeur}
            video={seance.video}
            onFermer={() => setEditionOuverte(false)}
            onEnregistre={() => {
              setEditionOuverte(false)
              onChange()
            }}
          />
        </div>
      )}
    </div>
  )
}
