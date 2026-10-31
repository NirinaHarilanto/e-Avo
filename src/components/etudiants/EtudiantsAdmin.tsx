import { jourDansFuseauEtablissement } from '../../lib/etablissement'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Database } from '../../types/database.types'
import { AdminLayout } from '../layout/AdminLayout'
import { supabase } from '../../lib/supabaseClient'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { AttribuerProfesseur } from './AttribuerProfesseur'
import { CreerForfait } from './CreerForfait'
import { ChoixProgrammeInitial } from './ChoixProgrammeInitial'
import { DecisionHeureEssai } from './DecisionHeureEssai'
import { AjouterForfaitModale } from './AjouterForfaitModale'
import { useDemandesForfait } from '../../hooks/useDemandesForfait'
import { PlanifierSeancesForfait } from './PlanifierSeancesForfait'
import { NouveauCreneauEtudiant } from './NouveauCreneauEtudiant'
import { DossierEtudiantVue } from './DossierEtudiantVue'
import { CarteListeEtudiant, TagAucunCoursPlanifie, TagDossierIncomplet } from './CarteListeEtudiant'
import { useEtatsParcoursEtudiants } from '../../hooks/useEtatsParcoursEtudiants'
import { activiteEtudiant } from '../../lib/statutProfil'
import { AssistantNouvelEtudiant } from './AssistantNouvelEtudiant'
import { useProfileContext } from '../../context/ProfileContext'
import { PanneauInformationsDuo, informationsPersonnellesCompletes } from '../shared/InformationsPersonnelles'
import { SupprimerCompte } from '../shared/SupprimerCompte'
import { SyntheseComptesRendus } from '../shared/SyntheseComptesRendus'
import { heuresRestantes as calculerHeuresRestantes, totalHeuresCumulees } from '../../lib/heures'
import { MettreEnPauseCompte } from './MettreEnPauseCompte'
import { PanneauRelances } from '../shared/Relances'
import { EnquetesParcoursAffichage } from '../shared/EnquetesParcoursAffichage'
import { EnTetePage } from '../ui/EnTetePage'
import { Modale } from '../ui/Modale'
import { GroupeSection } from '../ui/Section'
import { LigneInfo } from '../ui/Champ'
import { GrilleStats, Stat } from '../ui/Stat'
import { ChampRecherche } from '../ui/BarreOutils'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle, boutonNeutreStyle, boutonDangerStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'
import { useStatutsContratsSignature } from '../../hooks/useStatutsContratsSignature'
import { useTypesProgrammeEtudiants } from '../../hooks/useTypesProgrammeEtudiants'
import { BadgeStatutContrat, statutContratEtudiantAffichable } from '../shared/BadgeStatutContrat'

type Profile = Database['public']['Tables']['profiles']['Row']

export function EtudiantsAdmin() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useProfileContext()
  const { etudiants: tousLesEtudiants, loading, recharger } = useEtudiants()
  const [recherche, setRecherche] = useState('')
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [listeInactifsOuverte, setListeInactifsOuverte] = useState(false)

  // DUO (0054) : la secondaire d'un binôme a son propre compte (son propre login), mais pas de
  // dossier à elle — le sien est celui de la principale. Demande client du 2026-09-21 : « les
  // deux personnes formant le DUO seront représentées par un seul bloc ». On la retire donc de
  // la liste plutôt que d'afficher deux entrées qui ouvriraient le même dossier ; la principale
  // porte le tag qui la nomme (voir TagProgramme ci-dessous).
  const secondaireParPrincipal = useMemo(() => {
    const table = new Map<string, (typeof tousLesEtudiants)[number]>()
    for (const e of tousLesEtudiants) {
      if (e.duo_partenaire_id) table.set(e.duo_partenaire_id, e)
    }
    return table
  }, [tousLesEtudiants])
  const etudiants = useMemo(() => tousLesEtudiants.filter((e) => !e.duo_partenaire_id), [tousLesEtudiants])

  /* La recherche porte aussi sur le second membre d'un binôme : son nom est affiché dans le bloc
     du duo, le taper doit donc ramener ce bloc — sinon il paraîtrait introuvable. */
  const filtres = useMemo(
    () =>
      etudiants.filter((e) => {
        const secondaire = secondaireParPrincipal.get(e.id)
        const cible = `${e.prenom ?? ''} ${e.nom ?? ''} ${secondaire ? `${secondaire.prenom ?? ''} ${secondaire.nom ?? ''}` : ''}`
        return cible.toLowerCase().includes(recherche.toLowerCase())
      }),
    [etudiants, recherche, secondaireParPrincipal],
  )

  const statutsContrats = useStatutsContratsSignature(useMemo(() => etudiants.map((e) => e.id), [etudiants]))
  const programmes = useTypesProgrammeEtudiants(useMemo(() => etudiants.map((e) => e.id), [etudiants]))

  /* Forfait épuisé et absence de cours planifié, pour toute la liste d'un coup — demandes client
     6 et 7 du 2026-10-19. Calculé sur les blocs affichés (le principal d'un binôme porte le
     dossier, le forfait et les séances du duo, 0054). */
  const { etats, recharger: rechargerEtats } = useEtatsParcoursEtudiants(useMemo(() => etudiants.map((e) => e.id), [etudiants]))

  /* « Actif » ne veut plus dire « compte approuvé » mais « parcours en cours » — demande client du
     2026-10-19 : un élève en pause OU dont le forfait est épuisé est inactif. Compté sur les
     blocs, et non par personne comme auparavant : l'état du parcours est celui du dossier, et
     celui d'un binôme DUO est partagé — compter deux fois un même forfait épuisé n'aurait aucun
     sens. Le total d'inscrits juste à côté, lui, reste bien par personne. */
  const actifs = etudiants.filter((e) => activiteEtudiant({ status: e.status, forfaitEpuise: !!etats[e.id]?.forfaitEpuise }) === 'actif').length
  /* La LISTE, et plus seulement son compte : la tuile s'ouvre sur ces dossiers-là depuis le
     2026-10-30 (demande client). Même filtre que le compte affiché juste au-dessus, jamais une
     seconde règle recalculée à côté. */
  const dossiersInactifs = etudiants.filter(
    (e) => activiteEtudiant({ status: e.status, forfaitEpuise: !!etats[e.id]?.forfaitEpuise }) === 'inactif',
  )
  const inactifs = dossiersInactifs.length
  const sansCoursPlanifie = etudiants.filter((e) => etats[e.id]?.sansCoursPlanifie).length

  return (
    <AdminLayout actif="Étudiants">
      <EnTetePage
        compact
        titre="Étudiants"
        actions={
          <button onClick={() => setFormulaireOuvert((v) => !v)} className="btn-shine" style={boutonPrimaireStyle}>
            <Icone nom="plus" taille={15} />
            {formulaireOuvert ? 'Fermer' : 'Ajouter un étudiant'}
          </button>
        }
      />

      {formulaireOuvert && (
        <AssistantNouvelEtudiant
          etablissementId={profile?.etablissement_id}
          onTermine={() => {
            setFormulaireOuvert(false)
            recharger()
          }}
        />
      )}

      {!loading && etudiants.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <GrilleStats min={160} compact>
            <Stat compact libelle="Étudiants inscrits" valeur={tousLesEtudiants.length} ton="or" />
            {/* Les deux tuiles ont perdu leur ligne d'explication le 2026-10-30, à la demande du
                client : « enlève visuellement la petite instruction ». Pour les inactifs, elle
                n'est pas perdue — elle est redite dans le pop-up qui s'ouvre au clic, à l'endroit
                où l'on se demande vraiment pourquoi ces dossiers-là y figurent. */}
            <Stat compact libelle="Dossiers actifs" valeur={actifs} ton="teal" />
            <Stat
              compact
              libelle="Dossiers inactifs"
              valeur={inactifs}
              ton={inactifs > 0 ? 'alerte' : 'neutre'}
              onClick={inactifs > 0 ? () => setListeInactifsOuverte(true) : undefined}
              titreAction="Voir les dossiers inactifs"
            />
            <Stat
              compact
              libelle="Sans cours à venir"
              valeur={sansCoursPlanifie}
              ton={sansCoursPlanifie > 0 ? 'alerte' : 'neutre'}
              aide="Aucune séance à venir au planning"
            />
            {/* La tuile « Contrats non signés » a été retirée le 2026-10-30 : les étudiants ne
                sont plus soumis à un contrat (voir statutContratEtudiantAffichable). */}
          </GrilleStats>
        </div>
      )}

      {listeInactifsOuverte && (
        <Modale titre="Dossiers inactifs" onFermer={() => setListeInactifsOuverte(false)} largeurMax={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* L’explication retirée de la tuile vit désormais ici — demande client du
                2026-10-30 : « déplace l’instruction visible [...] dans le pop-up ». */}
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
              En pause, ou forfait d’heures entièrement consommé.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dossiersInactifs.map((etudiant) => {
                const secondaire = secondaireParPrincipal.get(etudiant.id)
                return (
                  <button
                    key={etudiant.id}
                    type="button"
                    className="row-hl"
                    onClick={() => {
                      setListeInactifsOuverte(false)
                      navigate(`/admin/etudiants/${etudiant.id}`)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 12px',
                      borderRadius: 12,
                      border: '1px solid var(--border-soft)',
                      background: 'var(--surface)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      font: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: 'var(--ink)', flexGrow: 1 }}>
                      {etudiant.prenom} {etudiant.nom}
                      {secondaire ? ` & ${secondaire.prenom} ${secondaire.nom}` : ''}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      {etudiant.status === 'en_pause' ? 'En pause' : 'Forfait épuisé'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </Modale>
      )}

      <div className="grille-maitre-detail">
        <aside className="liste-maitre-sticky" style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <ChampRecherche valeur={recherche} onChange={setRecherche} placeholder="Rechercher un étudiant…" etiquette="Rechercher un étudiant" />

          <div className="liste-maitre-defilante" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading && <EtatChargement lignes={4} hauteur={62} />}

            {!loading && etudiants.length === 0 && (
              <EtatVide
                compact
                icone="etudiants"
                titre="Aucun étudiant"
                description="Invitez votre premier étudiant, ou convertissez un prospect depuis la page Prospects."
              />
            )}

            {!loading && etudiants.length > 0 && filtres.length === 0 && (
              <EtatVide compact icone="recherche" titre="Aucun résultat" description={`Aucun étudiant ne correspond à « ${recherche} ».`} />
            )}

            {filtres.map((etudiant) => {
              /* DUO (0058/0061) : le binôme ne fait qu'un seul bloc, les deux noms à l'intérieur —
                 demande client du 2026-09-22, « les deux étudiants doivent être contenus dans un
                 bloc ». Le dossier ouvert au clic reste celui du principal : c'est lui qui porte le
                 forfait, le planning et les heures partagés du binôme (voir migration 0054). */
              const secondaire = secondaireParPrincipal.get(etudiant.id) ?? null
              return (
                <CarteListeEtudiant
                  key={etudiant.id}
                  principal={etudiant}
                  secondaire={secondaire}
                  selectionne={etudiant.id === id}
                  onClick={() => navigate(`/admin/etudiants/${etudiant.id}`)}
                  programme={programmes[etudiant.id]}
                  statutContrat={statutContratEtudiantAffichable(statutsContrats[etudiant.id])}
                  etatParcours={etats[etudiant.id]}
                />
              )
            })}
          </div>
        </aside>

        <div style={{ minWidth: 0 }}>
          {id ? (
            <DossierPanel
              studentId={id}
              onSupprime={() => {
                recharger()
                navigate('/admin/etudiants')
              }}
              onParcoursChange={rechargerEtats}
            />
          ) : (
            <EtatVide
              icone="dossier"
              titre="Sélectionnez un étudiant"
              description="Choisissez un nom dans la liste de gauche pour afficher son dossier complet : parcours pédagogique, professeur attribué, programme, heures consommées et assiduité."
            />
          )}
        </div>
      </div>
    </AdminLayout>
  )
}

function DossierPanel({
  studentId,
  onSupprime,
  onParcoursChange,
}: {
  studentId: string
  onSupprime: () => void
  /* Recharge l'état de parcours (forfait épuisé, sans cours planifié) calculé par le PARENT pour
     toute la liste — clé de cache différente de celle ci-dessous, propre au seul dossier ouvert.
     Les deux doivent être rafraîchies ensemble dès qu'une séance est planifiée ou reprogrammée,
     demande client du 2026-10-19 : l'icône d'avertissement doit disparaître « instantanément et
     rapidement », pas seulement après le signal de synchro distant (jusqu'à ~1 s, voir
     src/lib/synchro.ts) qui suffisait jusqu'ici. */
  onParcoursChange: () => void
}) {
  const { dossier, loading, erreur, recharger } = useDossierEtudiant(studentId)
  /* Statut de contrat en toutes lettres dans l'en-tête de la fiche (demande client du
     2026-10-11) : la liste de gauche, elle, ne montre plus qu'un glyphe (CarteListeEtudiant.tsx)
     — rien n'est perdu, juste déplacé là où il y a la place de le lire. Appelé avec `studentId`
     (pas `dossier.etudiant.id`, pas encore connu avant le premier rendu) pour respecter les
     règles des hooks : jamais après un retour anticipé. */
  const statutsContrats = useStatutsContratsSignature(useMemo(() => [studentId], [studentId]))
  /* Même calcul que la liste de gauche, pour le seul dossier ouvert : la fiche doit annoncer
     exactement l'activité que la liste annonce, pas une variante. */
  const { etats, recharger: rechargerEtatLocal } = useEtatsParcoursEtudiants(useMemo(() => [studentId], [studentId]))
  const etat = etats[studentId]
  function rechargerParcours() {
    rechargerEtatLocal()
    onParcoursChange()
  }

  if (loading) return <EtatChargement lignes={3} hauteur={110} />
  if (erreur || !dossier) return <MessageErreur>{erreur ?? 'Dossier introuvable.'}</MessageErreur>

  const periodesActuelles = dossier.periodesActuelles
  const professeursAttribues = periodesActuelles.map((p) => p.professeur).filter((p): p is NonNullable<typeof p> => p !== null)
  const forfait = dossier.packages[0] ?? null
  const { etudiant } = dossier
  const heuresRestantes = calculerHeuresRestantes(dossier.packages, dossier.heuresConsommees)
  /* Dossier incomplet en toutes lettres dans l'en-tête de la fiche (déplacé depuis la carte de
     la liste le 2026-10-11, capture client) : même source que ce que calculait la liste pour
     chaque bloc, mais ici sur le binôme réel du dossier ouvert. */
  const dossierIncomplet = (dossier.duoPartenaire ? [etudiant, dossier.duoPartenaire] : [etudiant]).some((m) => !informationsPersonnellesCompletes(m))

  return (
    <DossierEtudiantVue
      dossier={dossier}
      activite={activiteEtudiant({ status: etudiant.status, forfaitEpuise: !!etat?.forfaitEpuise })}
      badgesSupplementaires={
        <>
          {statutContratEtudiantAffichable(statutsContrats[studentId]) && <BadgeStatutContrat statut="signe" />}
          {dossierIncomplet && <TagDossierIncomplet />}
          {etat?.sansCoursPlanifie && <TagAucunCoursPlanifie />}
        </>
      }
      panneauProfesseur={
        <AttribuerProfesseur
          studentId={etudiant.id}
          periodesActuelles={periodesActuelles}
          estCollectif={!!dossier.cohorte}
          onTermine={recharger}
        />
      }
      panneauInformations={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <PanneauInformationsDuo etudiant={etudiant} duoPartenaire={dossier.duoPartenaire} onChange={recharger} />
          {/* Relance d'un dossier à l'arrêt — demande client du 2026-10-19 (point 7) : date de
              relance, bouton de relance et historique. Proposé dès que le parcours est inactif,
              pas seulement en pause : un élève dont le forfait est épuisé est exactement
              quelqu'un qu'on veut pouvoir rappeler. */}
          {activiteEtudiant({ status: etudiant.status, forfaitEpuise: !!etat?.forfaitEpuise }) === 'inactif' && (
            <BlocRelanceEtudiant etudiant={etudiant} />
          )}
        </div>
      }
      panneauEnquetes={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Enquêtes de parcours de l'élève, et de son binôme s'il y en a un : chaque membre
              répond à la sienne (0130), les deux doivent donc se lire dans le dossier partagé.
              Onglet séparé depuis le 2026-10-19 (capture client) : vivait jusqu'ici tout en bas
              d'« Informations personnelles », sans rapport avec le reste de cet onglet. */}
          <EnquetesParcoursAffichage studentId={etudiant.id} titre={null} />
          {dossier.duoPartenaire && (
            <EnquetesParcoursAffichage
              studentId={dossier.duoPartenaire.id}
              titre={`Enquêtes de satisfaction — ${dossier.duoPartenaire.prenom} ${dossier.duoPartenaire.nom}`}
            />
          )}
        </div>
      }
      panneauSuppression={
        <div style={{ display: 'flex', gap: 8 }}>
          <MettreEnPauseCompte personne={etudiant} onChange={recharger} />
          <SupprimerCompte personne={etudiant} onSupprime={onSupprime} />
        </div>
      }
      panneauSynthese={
        <SyntheseComptesRendus studentId={etudiant.id} nomEleve={`${etudiant.prenom} ${etudiant.nom}`} portee="etablissement" />
      }
      panneauChoixInitial={
        <ChoixProgrammeInitial studentId={etudiant.id} etablissementId={etudiant.etablissement_id} onCree={recharger} />
      }
      panneauForfaitEdition={
        forfait ? <CreerForfait studentId={etudiant.id} etablissementId={etudiant.etablissement_id} forfaitExistant={forfait} onCree={recharger} /> : undefined
      }
      panneauNouveauCreneau={
        /* Même garde que la planification de série juste en dessous : sans professeur attribué,
           il n'y a personne à qui attacher la séance. Quand l'élève en a plusieurs (0138),
           l'admin choisit lequel, plutôt que de remplir en silence l'agenda du premier venu. */
        forfait && professeursAttribues.length > 0 ? (
          <ChoixProfesseurPlanification professeurs={professeursAttribues}>
            {(teacherId) => (
              <NouveauCreneauEtudiant
                studentIds={[etudiant.id]}
                teacherId={teacherId}
                onCree={() => {
                  recharger()
                  rechargerParcours()
                }}
              />
            )}
          </ChoixProfesseurPlanification>
        ) : undefined
      }
      panneauPlanification={
        forfait && professeursAttribues.length > 0
          ? (fermer) => (
              /* Pour QUEL professeur — l'admin tranche lui-même dès que l'élève en a plusieurs
                 (0138). Planifier chez le premier de la liste aurait rempli en silence l'agenda
                 d'un professeur que l'admin n'a pas choisi. */
              <ChoixProfesseurPlanification professeurs={professeursAttribues}>
                {(teacherId) => (
                  <PlanifierSeancesForfait
                    studentIds={[etudiant.id]}
                    teacherId={teacherId}
                    dureeParDefaut={60}
                    dateFinParDefaut={forfait.echeance}
                    heuresForfait={forfait.total_heures}
                    onCree={async (dateFinRetenue) => {
                      // Referme le formulaire pour révéler aussitôt le planning qu'il vient de
                      // créer (demande client du 2026-09-16) — même geste que côté professeur
                      // (PlanningPrevisionnelProfesseur.tsx), qui referme déjà son générateur.
                      fermer()
                      // Reporte l'échéance calculée (ou corrigée à la main) sur le forfait
                      // lui-même : sans cette écriture, seul le formulaire de planification la
                      // connaîtrait, et le reste de l'application (résumé du dossier, variable
                      // de contrat date_echeance_programme) continuerait d'afficher l'ancienne
                      // valeur, voire aucune — demande client du 2026-09-16, « l'échéance doit
                      // être définie automatiquement dans TOUTE l'application ».
                      if (dateFinRetenue && dateFinRetenue !== forfait.echeance) {
                        await supabase.from('packages').update({ echeance: dateFinRetenue }).eq('id', forfait.id)
                      }
                      recharger()
                      rechargerParcours()
                    }}
                  />
                )}
              </ChoixProfesseurPlanification>
            )
          : undefined
      }
      panneauDecisionEssai={
        /* Ne concerne que le forfait courant : un essai déjà tranché appartient à l'historique
           des forfaits, il n'a plus de décision à recevoir (0057) — y compris une tranche close
           par une prolongation (`essai_resultat = 'prolonge'`, 0115), dont la suivante a pris le
           relais. Les totaux, eux, additionnent TOUTES les tranches d'essai : depuis 0115, le
           forfait courant ne porte que la dernière. */
        forfait?.essai && !forfait.essai_resultat ? (
          <DecisionHeureEssai
            essai={forfait}
            heuresConsommees={dossier.heuresConsommees}
            heuresEssaiCumulees={totalHeuresCumulees(dossier.packages.filter((p) => p.essai))}
            montantEssaiCumule={dossier.packages.filter((p) => p.essai).reduce((somme, p) => somme + Number(p.montant ?? 0), 0)}
            onDecide={recharger}
          />
        ) : undefined
      }
      panneauAjoutForfait={
        <PanneauAjoutForfait
          studentId={etudiant.id}
          nomEtudiant={`${etudiant.prenom} ${etudiant.nom}`}
          heuresRestantes={heuresRestantes}
          onAjoute={recharger}
        />
      }
      peutModifierNiveau
      /* Jamais pour un élève collectif (2026-10-19) : ses séances appartiennent à sa classe, les
         reprogrammer d'ici n'aurait de sens que pour lui seul alors que toute la classe les suit
         — « les modifications se font par classe dans la section cours collectifs ». */
      peutModifierPlanning={!dossier.cohorte}
      onDossierChange={() => {
        recharger()
        rechargerParcours()
      }}
    />
  )
}

/* Choix du professeur pour lequel l'admin planifie, quand l'élève en a plusieurs (0138).
   Transparent avec un seul professeur attribué, de loin le cas courant : aucun sélecteur ne
   s'affiche et l'écran est exactement celui d'avant. */
function ChoixProfesseurPlanification({
  professeurs,
  children,
}: {
  professeurs: Profile[]
  children: (teacherId: string) => ReactNode
}) {
  const [teacherId, setTeacherId] = useState(professeurs[0].id)
  // Un professeur retiré pendant que le formulaire est ouvert ne doit pas laisser une sélection
  // fantôme : on retombe sur le premier encore attribué.
  const retenu = professeurs.some((p) => p.id === teacherId) ? teacherId : professeurs[0].id

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {professeurs.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>Planifier les séances de</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {professeurs.map((p) => {
              const actif = p.id === retenu
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTeacherId(p.id)}
                  aria-pressed={actif}
                  style={{
                    fontSize: 12.5,
                    padding: '7px 14px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    border: actif ? '1px solid rgba(169,140,255,.45)' : '1px solid var(--border)',
                    background: actif ? 'var(--accent-blue-gradient)' : 'transparent',
                    color: actif ? '#fff' : 'var(--ink-2)',
                  }}
                >
                  {p.prenom} {p.nom}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {children(retenu)}
    </div>
  )
}

/* Relance d'un étudiant dont le parcours est à l'arrêt (demande client du 2026-10-19, point 7).
   Rappelle la pause et sa date de relance quand elles existent, puis le bouton d'envoi et
   l'historique — le bouton reste actif après un premier envoi, c'est précisément ce que la
   demande rend possible. */
function BlocRelanceEtudiant({ etudiant }: { etudiant: Profile }) {
  const relanceDue = etudiant.relance_prevue_le ? etudiant.relance_prevue_le <= jourDansFuseauEtablissement() : false

  return (
    <GroupeSection titre="Relance">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {etudiant.status === 'en_pause' && etudiant.motif_pause && (
          <LigneInfo collee label="Motif de la pause" valeur={etudiant.motif_pause} />
        )}
        {etudiant.relance_prevue_le && (
          <LigneInfo
            collee
            label="Relance prévue le"
            valeur={
              <span style={{ color: relanceDue ? 'var(--warning)' : 'var(--ink-2)', fontWeight: relanceDue ? 700 : 400 }}>
                {new Date(etudiant.relance_prevue_le).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
                {relanceDue ? ' — à relancer' : ''}
              </span>
            }
          />
        )}
        <PanneauRelances cible={{ studentId: etudiant.id }} libelle="Envoyer le message de reprise" />
      </div>
    </GroupeSection>
  )
}

/* Ajout de forfait (0061) : bouton toujours disponible, précédé d'un bandeau si l'élève a une
   demande en attente — la traiter pré-remplit les heures et referme la demande une fois le
   forfait créé. */
function PanneauAjoutForfait({
  studentId,
  nomEtudiant,
  heuresRestantes,
  onAjoute,
}: {
  studentId: string
  nomEtudiant: string
  /* Heures encore disponibles, tous forfaits cumulés — décide du libellé du bouton (demande
     client du 2026-10-10) : « Prolonger le forfait » tant qu'il en reste, « Ajouter un forfait »
     une fois à 0. Le comportement réel ne change pas (c'est toujours un nouveau forfait qui
     s'ajoute, jamais un remplacement), seul le mot employé reflète ce que l'admin fait vraiment
     de son point de vue. */
  heuresRestantes: number
  onAjoute: () => void
}) {
  const { enAttente, recharger } = useDemandesForfait(studentId)
  const [modaleOuverte, setModaleOuverte] = useState<{ demandeId?: string; heures?: number } | null>(null)
  const [refusEnCours, setRefusEnCours] = useState<string | null>(null)
  const [motifRefus, setMotifRefus] = useState('')

  async function refuser(demandeId: string) {
    const { data: session } = await supabase.auth.getUser()
    if (!session.user) return
    await supabase
      .from('demandes_forfait')
      .update({ statut: 'refusee', motif_refus: motifRefus.trim() || null, decidee_le: new Date().toISOString(), decidee_par_profile_id: session.user.id })
      .eq('id', demandeId)
    setRefusEnCours(null)
    setMotifRefus('')
    recharger()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {enAttente.map((demande) => (
        <div
          key={demande.id}
          style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '11px 13px', borderRadius: 12, border: '1px solid rgba(233,207,148,.35)', background: 'rgba(233,207,148,.08)' }}
        >
          <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
            Demande de <strong>{demande.heures_demandees} h</strong> supplémentaires
            {demande.message ? ` — « ${demande.message} »` : ''}
          </span>
          {refusEnCours === demande.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                value={motifRefus}
                onChange={(e) => setMotifRefus(e.target.value)}
                placeholder="Motif du refus (facultatif)"
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 9px', fontSize: 12, color: 'var(--ink)', background: 'var(--fond-champ, rgba(0,0,0,.22))' }}
              />
              <span style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setRefusEnCours(null)} style={boutonNeutreStyle}>
                  Annuler
                </button>
                <button onClick={() => refuser(demande.id)} style={boutonDangerStyle}>
                  Confirmer le refus
                </button>
              </span>
            </div>
          ) : (
            <span style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setRefusEnCours(demande.id)} style={boutonNeutreStyle}>
                Refuser
              </button>
              <button
                onClick={() => setModaleOuverte({ demandeId: demande.id, heures: demande.heures_demandees })}
                className="btn-shine btn-secondary"
              >
                Traiter la demande
              </button>
            </span>
          )}
        </div>
      ))}

      {enAttente.length === 0 && (
        <button onClick={() => setModaleOuverte({})} className="btn-shine btn-secondary" style={{ alignSelf: 'flex-start' }}>
          {heuresRestantes > 0 ? 'Prolonger le forfait' : 'Ajouter un forfait'}
        </button>
      )}

      {modaleOuverte && (
        <AjouterForfaitModale
          studentId={studentId}
          nomEtudiant={nomEtudiant}
          demandeId={modaleOuverte.demandeId}
          heuresSuggerees={modaleOuverte.heures}
          prolongation={heuresRestantes > 0}
          onFermer={() => setModaleOuverte(null)}
          onAjoute={() => {
            setModaleOuverte(null)
            recharger()
            onAjoute()
          }}
        />
      )}
    </div>
  )
}

