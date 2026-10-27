import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useCalendrierProfesseur } from '../../hooks/useCalendrierProfesseur'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { useSecondairesDuo } from '../../hooks/useSecondairesDuo'
import { sansSecondairesDuo } from '../../lib/duo'
import { useStatutsContratsSignature } from '../../hooks/useStatutsContratsSignature'
import { useTypesProgrammeEtudiants } from '../../hooks/useTypesProgrammeEtudiants'
import { PlanifierSeancesForfait } from '../etudiants/PlanifierSeancesForfait'
import { DossierEtudiantVue } from '../etudiants/DossierEtudiantVue'
import { CarteListeEtudiant, TagAncienEleve, TagDossierIncomplet } from '../etudiants/CarteListeEtudiant'
import { EnquetesParcoursAffichage } from '../shared/EnquetesParcoursAffichage'
import { PanneauInformationsDuo, informationsPersonnellesCompletes } from '../shared/InformationsPersonnelles'
import { SyntheseComptesRendus } from '../shared/SyntheseComptesRendus'
import { EnTetePage } from '../ui/EnTetePage'
import { ChampRecherche } from '../ui/BarreOutils'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'

/* Équivalent, côté professeur, de EtudiantsAdmin.tsx : même agencement liste + dossier, scope
   réduit aux élèves actuellement assignés à ce professeur. Longtemps en lecture seule (aucun
   panneau d'action), jusqu'à la demande client du 2026-09-29 : « renseigner, modifier, annuler
   le planning prévisionnel dans la section Étudiants de son espace, comme ce que l'on a dans
   l'espace admin » — le seul panneau d'action désormais ouvert ici (onglet « Planning » du
   dossier, DossierPanel plus bas). Ne pas confondre avec PlanningPrevisionnelProfesseur.tsx,
   qui vit dans l'agenda (CalendrierProfesseur.tsx) : même finalité, écran différent — celui-ci
   plutôt qu'un élève à la fois, l'autre en partant d'une vague ou de tous les élèves à la fois.
   Bloc de liste et panneau d'informations personnelles PARTAGÉS avec EtudiantsAdmin.tsx
   (CarteListeEtudiant / PanneauInformationsDuo) — demande client du 2026-09-23 : « il faut que
   le bloc étudiant dans l'espace admin soit repris exactement » côté professeur, DUO compris.
   Informations personnelles, forfait et statut de contrat sont désormais visibles ici (demande
   client du 2026-09-22/23, « exactement comme dans l'espace admin »), via les policies RLS
   étendues au professeur sur `packages`/`hour_ledger` (0061) et `contracts` (0063). Restent hors
   de portée, volontairement : les diagnostics et les paiements, qui ne concernent ni la
   préparation d'un cours ni le suivi pédagogique. */
export function EtudiantsProfesseur() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useProfileContext()
  const { etudiantsActifs, etudiantsAnciens, loading } = useCalendrierProfesseur(profile?.id)
  const [recherche, setRecherche] = useState('')

  /* DUO (0058) : un binôme secondaire n'a ni séance ni affectation propre (voir la migration
     0054 — son dossier est celui du principal), donc `etudiantsActifs` ne le contient jamais.
     Il faut le retrouver par une requête dédiée plutôt que de le déduire de cette liste, comme
     le fait EtudiantsAdmin.tsx à partir de la liste complète des étudiants de l'établissement
     (dont un professeur n'a justement pas la vue). */
  const idsActifs = useMemo(() => etudiantsActifs.map((e) => e.id), [etudiantsActifs])
  const { secondaireParPrincipal } = useSecondairesDuo(idsActifs)

  /* Une seule carte par binôme (demande client du 2026-10-11) : `etudiantsActifs` contient aussi
     les partenaires DUO, ajoutés exprès par useCalendrierProfesseur pour le formulaire de
     planification — ici, ils donnaient une seconde carte au même binôme. Voir sansSecondairesDuo.
     `idsActifs` reste construit sur la liste COMPLÈTE : le secondaire doit continuer d'alimenter
     la résolution de binôme, les statuts de contrat et les programmes. */
  const aAfficher = useMemo(() => sansSecondairesDuo(etudiantsActifs), [etudiantsActifs])

  const filtres = useMemo(
    () =>
      aAfficher.filter((e) => {
        const secondaire = secondaireParPrincipal.get(e.id)
        const cible = `${e.prenom ?? ''} ${e.nom ?? ''} ${secondaire ? `${secondaire.prenom ?? ''} ${secondaire.nom ?? ''}` : ''}`
        return cible.toLowerCase().includes(recherche.toLowerCase())
      }),
    [aAfficher, recherche, secondaireParPrincipal],
  )
  const anciensFiltres = useMemo(
    () => etudiantsAnciens.filter((e) => `${e.profil.prenom ?? ''} ${e.profil.nom ?? ''}`.toLowerCase().includes(recherche.toLowerCase())),
    [etudiantsAnciens, recherche],
  )
  const statutsContrats = useStatutsContratsSignature(idsActifs)
  const programmes = useTypesProgrammeEtudiants(idsActifs)

  return (
    <ProfesseurLayout actif="Mes étudiants">
      <EnTetePage
        titre="Mes étudiants"
      />

      <div className="grille-maitre-detail">
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <ChampRecherche valeur={recherche} onChange={setRecherche} placeholder="Rechercher un élève…" etiquette="Rechercher un élève" />

          {loading && <EtatChargement lignes={3} hauteur={58} />}

          {!loading && aAfficher.length === 0 && (
            <EtatVide
              compact
              icone="etudiants"
              titre="Aucun élève assigné"
              description="L’administration ne vous a pas encore attribué d’élève."
            />
          )}

          {!loading && aAfficher.length > 0 && filtres.length === 0 && (
            <EtatVide compact icone="recherche" titre="Aucun résultat" description={`Aucun élève ne correspond à « ${recherche} ».`} />
          )}

          {filtres.map((etudiant) => {
            const secondaire = secondaireParPrincipal.get(etudiant.id) ?? null
            return (
              <CarteListeEtudiant
                key={etudiant.id}
                principal={etudiant}
                secondaire={secondaire}
                selectionne={etudiant.id === id}
                onClick={() => navigate(`/professeur/etudiants/${etudiant.id}`)}
                programme={programmes[etudiant.id]}
                statutContrat={statutsContrats[etudiant.id]}
              />
            )
          })}

          {anciensFiltres.length > 0 && (
            <>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.8, padding: '10px 4px 2px' }}>
                Anciens élèves
              </span>
              {/* Même bloc de liste que les élèves en cours depuis le 2026-09-30 : le rendu
                  parallèle qui vivait ici n'affichait qu'une date de transfert, sans le tag
                  « Ancien élève » demandé par le client — et il aurait fallu le retoucher à chaque
                  évolution de la carte partagée. */}
              {anciensFiltres.map(({ profil, transfereLe }) => (
                <CarteListeEtudiant
                  key={profil.id}
                  principal={profil}
                  selectionne={profil.id === id}
                  onClick={() => navigate(`/professeur/etudiants/${profil.id}`)}
                  ancienEleve={{ transfereLe }}
                />
              ))}
            </>
          )}
        </aside>

        <div style={{ minWidth: 0 }}>
          {id ? (
            <DossierPanel studentId={id} transfereLe={etudiantsAnciens.find((e) => e.profil.id === id)?.transfereLe ?? null} />
          ) : (
            <EtatVide
              icone="dossier"
              titre="Sélectionnez un élève"
              description="Choisissez un nom dans la liste de gauche pour afficher son parcours : séances suivies avec vous, présence, heures et prochaine échéance."
            />
          )}
        </div>
      </div>
    </ProfesseurLayout>
  )
}

/* `transfereLe` vient de la liste `etudiantsAnciens` (useCalendrierProfesseur), jamais d'une
   déduction locale : l'absence du professeur courant parmi `dossier.periodesActuelles` serait
   aussi vraie pour un élève de cours COLLECTIF, qui n'a aucune affectation individuelle (0069)
   et n'est pour autant pas un ancien élève — il serait tagué à tort. */
function DossierPanel({ studentId, transfereLe }: { studentId: string; transfereLe: string | null }) {
  const { profile } = useProfileContext()
  const { dossier, loading, erreur, recharger } = useDossierEtudiant(studentId)

  if (loading) return <EtatChargement lignes={3} hauteur={110} />
  if (erreur || !dossier) return <MessageErreur>{erreur ?? 'Dossier introuvable.'}</MessageErreur>

  const forfait = dossier.packages[0] ?? null
  /* Planning prévisionnel ouvert au professeur (0084, demande client du 2026-09-29 : « comme ce
     que l'on a dans l'espace admin ») — mais seulement tant qu'il est le professeur ACTUEL de
     l'élève : un « ancien élève » (transféré) garde son historique visible, jamais modifiable
     depuis ici. `api/professeur/planifier-seances-prevision.ts` revalide de toute façon
     l'attribution côté serveur ; ce test ne fait qu'éviter d'afficher un formulaire voué à
     échouer. Le collectif (vague) n'a pas de forfait/planning individuel — hors de portée ici,
     comme côté admin : voir CoursCollectifsProfesseur.tsx pour son propre planning de vague. */
  /* « L'UN des professeurs actuels », depuis 0138 : un élève peut en avoir plusieurs, et
     comparer avec un seul d'entre eux retirait son formulaire de planification à l'autre, alors
     que api/professeur/planifier-seances-prevision.ts l'y autorise — un écran qui refusait ce que
     le serveur accordait. */
  const estProfesseurActuel = dossier.periodesActuelles.some((p) => p.professeur?.id === profile?.id)
  /* Dossier incomplet en toutes lettres dans l'en-tête de la fiche (déplacé depuis la carte de
     la liste le 2026-10-11, capture client) — même source que la liste, sur le binôme réel. */
  const dossierIncomplet = (dossier.duoPartenaire ? [dossier.etudiant, dossier.duoPartenaire] : [dossier.etudiant]).some(
    (m) => !informationsPersonnellesCompletes(m),
  )

  return (
    <DossierEtudiantVue
      dossier={dossier}
      masquerEmailEnTete
      panneauInformations={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <PanneauInformationsDuo
            etudiant={dossier.etudiant}
            duoPartenaire={dossier.duoPartenaire}
            onChange={() => {}}
            lectureSeule
            masquerCoordonnees
          />
        </div>
      }
      panneauEnquetes={
        /* Demande client du 2026-10-19 (point 8) : « l'admin et le professeur concerné pourront
           voir l'enquête de satisfaction renseignée par l'étudiant ». En lecture seule — un
           professeur ne modifie pas l'avis qu'on porte sur lui (policy
           `jalons_parcours_teacher_select`, 0130). Onglet séparé depuis le même jour (capture
           client) : vivait jusqu'ici tout en bas d'« Informations personnelles ». */
        <EnquetesParcoursAffichage studentId={dossier.etudiant.id} titre={null} />
      }
      badgesSupplementaires={
        <>
          {transfereLe && <TagAncienEleve transfereLe={transfereLe} />}
          {dossierIncomplet && <TagDossierIncomplet />}
        </>
      }
      panneauSynthese={
        /* Portée « mes cours » : la RLS de `session_reports` (0033) ne donne au professeur que les
           comptes rendus dont il est l'auteur — la fenêtre le dit explicitement plutôt que de
           laisser croire à une synthèse de tout le parcours de l'élève. */
        <SyntheseComptesRendus
          studentId={dossier.etudiant.id}
          nomEleve={`${dossier.etudiant.prenom} ${dossier.etudiant.nom}`}
          portee="mes-cours"
        />
      }
      panneauPlanification={
        forfait && estProfesseurActuel
          ? (fermer) => (
              <PlanifierSeancesForfait
                studentIds={[dossier.etudiant.id]}
                packageId={forfait.id}
                dureeParDefaut={60}
                dateFinParDefaut={forfait.echeance}
                heuresForfait={forfait.total_heures}
                endpoint="/api/professeur/planifier-seances-prevision"
                onCree={() => {
                  // Même geste que côté admin (EtudiantsAdmin.tsx) : referme le formulaire pour
                  // révéler aussitôt le planning qu'il vient de créer. L'échéance du forfait est
                  // ici reportée par l'API elle-même (voir packageId ci-dessus), pas par un appel
                  // client direct : le professeur n'a qu'une policy de LECTURE sur `packages`.
                  fermer()
                  recharger()
                }}
              />
            )
          : undefined
      }
      peutModifierPlanning={estProfesseurActuel}
      /* Ses séances seulement : celles du co-professeur s'ouvrent en lecture seule (0138). */
      limiterEditionAuProfesseur={profile?.id}
      onDossierChange={recharger}
    />
  )
}
