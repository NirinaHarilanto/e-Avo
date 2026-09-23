import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AdminLayout } from '../layout/AdminLayout'
import { supabase } from '../../lib/supabaseClient'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { AttribuerProfesseur } from './AttribuerProfesseur'
import { CreerForfait } from './CreerForfait'
import { AssignerVague } from './AssignerVague'
import { ChoixProgrammeInitial } from './ChoixProgrammeInitial'
import { DecisionHeureEssai } from './DecisionHeureEssai'
import { AjouterForfaitModale } from './AjouterForfaitModale'
import { useDemandesForfait } from '../../hooks/useDemandesForfait'
import { PlanifierSeancesForfait } from './PlanifierSeancesForfait'
import { DossierEtudiantVue } from './DossierEtudiantVue'
import { CarteListeEtudiant } from './CarteListeEtudiant'
import { FormulaireInvitation } from '../shared/FormulaireInvitation'
import { PanneauInformationsDuo, informationsPersonnellesCompletes } from '../shared/InformationsPersonnelles'
import { SupprimerCompte } from '../shared/SupprimerCompte'
import { MettreEnPauseCompte } from './MettreEnPauseCompte'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { ChampRecherche } from '../ui/BarreOutils'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle, boutonNeutreStyle, boutonDangerStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'
import { useStatutsContratsSignature } from '../../hooks/useStatutsContratsSignature'
import { useTypesProgrammeEtudiants } from '../../hooks/useTypesProgrammeEtudiants'

export function EtudiantsAdmin() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { etudiants: tousLesEtudiants, loading, recharger } = useEtudiants()
  const [recherche, setRecherche] = useState('')
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)

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

  // Comptés par personne, pas par bloc : un duo, c'est bien deux élèves inscrits.
  const actifs = tousLesEtudiants.filter((e) => e.status === 'approved').length
  const statutsContrats = useStatutsContratsSignature(useMemo(() => etudiants.map((e) => e.id), [etudiants]))
  const programmes = useTypesProgrammeEtudiants(useMemo(() => etudiants.map((e) => e.id), [etudiants]))
  const sansContratSigne = etudiants.filter((e) => statutsContrats[e.id] && statutsContrats[e.id] !== 'signe').length

  return (
    <AdminLayout actif="Étudiants">
      <EnTetePage
        compact
        titre="Étudiants"
        description="Le dossier de chaque étudiant réunit son professeur, son programme, ses séances et son compteur d’heures. Sélectionnez un nom à gauche pour l’ouvrir."
        actions={
          <button onClick={() => setFormulaireOuvert((v) => !v)} className="btn-shine" style={boutonPrimaireStyle}>
            <Icone nom="plus" taille={15} />
            {formulaireOuvert ? 'Fermer' : 'Ajouter un étudiant'}
          </button>
        }
      />

      <GuidePage
        id="admin-etudiants"
        compact
        etapes={[
          <>
            Cliquez sur <strong>Ajouter un étudiant</strong> pour lui envoyer une invitation par e-mail. Il choisira
            lui-même son mot de passe.
          </>,
          <>
            Ouvrez son dossier dans la liste de gauche, puis attribuez-lui un <strong>professeur</strong> depuis la
            colonne de droite.
          </>,
          <>
            Choisissez ensuite son <strong>programme</strong> : individuel ou duo (forfait d’heures), ou collectif
            (inscription à une vague).
          </>,
          <>
            Le compteur d’heures et le taux d’assiduité se mettent à jour automatiquement à la clôture de chaque séance,
            il n’y a rien à saisir à la main.
          </>,
          <>
            Le badge <strong>Contrat signé / en attente / aucun contrat</strong> sous chaque nom indique s’il reste à
            faire signer un contrat avant le début des cours — la génération se fait page <strong>Contrats</strong>.
          </>,
          <>
            Un étudiant en collectif peut <strong>changer de promotion</strong> tant qu'il n'a suivi aucune séance
            décomptée de son forfait dans sa promotion actuelle. Dès la première séance clôturée, le changement est
            bloqué automatiquement.
          </>,
        ]}
      />

      {formulaireOuvert && (
        <FormulaireInvitation
          endpoint="/api/admin/inviter-etudiant"
          roleLabel="un étudiant"
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
            <Stat compact libelle="Comptes actifs" valeur={actifs} ton="teal" aide="Invitation acceptée et mot de passe défini" />
            <Stat
              compact
              libelle="En attente d’activation"
              valeur={tousLesEtudiants.length - actifs}
              ton={tousLesEtudiants.length - actifs > 0 ? 'alerte' : 'neutre'}
              aide="Invitation envoyée, pas encore acceptée"
            />
            <Stat
              compact
              libelle="Contrats non signés"
              valeur={sansContratSigne}
              ton={sansContratSigne > 0 ? 'alerte' : 'neutre'}
              aide={sansContratSigne > 0 ? 'À signer avant le début des cours' : 'Tous les contrats sont signés'}
            />
          </GrilleStats>
        </div>
      )}

      <div className="grille-maitre-detail">
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <ChampRecherche valeur={recherche} onChange={setRecherche} placeholder="Rechercher un étudiant…" etiquette="Rechercher un étudiant" />

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
                statutContrat={statutsContrats[etudiant.id]}
                dossierIncomplet={(secondaire ? [etudiant, secondaire] : [etudiant]).some((m) => !informationsPersonnellesCompletes(m))}
              />
            )
          })}
        </aside>

        <div style={{ minWidth: 0 }}>
          {id ? (
            <DossierPanel
              studentId={id}
              onSupprime={() => {
                recharger()
                navigate('/admin/etudiants')
              }}
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

function DossierPanel({ studentId, onSupprime }: { studentId: string; onSupprime: () => void }) {
  const { dossier, loading, erreur, recharger } = useDossierEtudiant(studentId)

  if (loading) return <EtatChargement lignes={3} hauteur={110} />
  if (erreur || !dossier) return <MessageErreur>{erreur ?? 'Dossier introuvable.'}</MessageErreur>

  const periodeActuelle = dossier.periodeActuelle
  const affectationActuelle = periodeActuelle?.affectation ?? null
  const forfait = dossier.packages[0] ?? null
  const { etudiant } = dossier

  return (
    <DossierEtudiantVue
      dossier={dossier}
      panneauProfesseur={
        <AttribuerProfesseur studentId={etudiant.id} affectationActuelle={affectationActuelle} onTermine={recharger} />
      }
      panneauInformations={<PanneauInformationsDuo etudiant={etudiant} duoPartenaire={dossier.duoPartenaire} onChange={recharger} />}
      panneauSuppression={
        <div style={{ display: 'flex', gap: 8 }}>
          <MettreEnPauseCompte personne={etudiant} onChange={recharger} />
          <SupprimerCompte personne={etudiant} onSupprime={onSupprime} />
        </div>
      }
      panneauChoixInitial={
        <ChoixProgrammeInitial studentId={etudiant.id} etablissementId={etudiant.etablissement_id} onCree={recharger} />
      }
      panneauForfaitEdition={
        forfait ? <CreerForfait studentId={etudiant.id} etablissementId={etudiant.etablissement_id} forfaitExistant={forfait} onCree={recharger} /> : undefined
      }
      panneauPlanification={
        forfait && periodeActuelle?.professeur
          ? (fermer) => (
              <PlanifierSeancesForfait
                studentIds={[etudiant.id]}
                teacherId={periodeActuelle.professeur!.id}
                dureeParDefaut={60}
                dateFinParDefaut={forfait.echeance}
                heuresForfait={forfait.total_heures}
                onCree={async (dateFinRetenue) => {
                  // Referme le formulaire pour révéler aussitôt le planning qu'il vient de créer
                  // (demande client du 2026-09-16) — même geste que côté professeur
                  // (PlanningPrevisionnelProfesseur.tsx), qui referme déjà son propre générateur.
                  fermer()
                  // Reporte l'échéance calculée (ou corrigée à la main) sur le forfait lui-même :
                  // sans cette écriture, seul le formulaire de planification la connaîtrait, et
                  // le reste de l'application (résumé du dossier, variable de contrat
                  // date_echeance_programme) continuerait d'afficher l'ancienne valeur, voire
                  // aucune — demande client du 2026-09-16, « l'échéance doit être définie
                  // automatiquement dans TOUTE l'application ».
                  if (dateFinRetenue && dateFinRetenue !== forfait.echeance) {
                    await supabase.from('packages').update({ echeance: dateFinRetenue }).eq('id', forfait.id)
                  }
                  recharger()
                }}
              />
            )
          : undefined
      }
      panneauDecisionEssai={
        /* Ne concerne que le forfait courant : un essai déjà tranché appartient à l'historique
           des forfaits, il n'a plus de décision à recevoir (0057). */
        forfait?.essai && !forfait.essai_resultat ? (
          <DecisionHeureEssai essai={forfait} heuresConsommees={dossier.heuresConsommees} onDecide={recharger} />
        ) : undefined
      }
      panneauAjoutForfait={<PanneauAjoutForfait studentId={etudiant.id} nomEtudiant={`${etudiant.prenom} ${etudiant.nom}`} onAjoute={recharger} />}
      panneauVague={
        dossier.cohorte ? (
          <AssignerVague studentId={etudiant.id} etablissementId={etudiant.etablissement_id} vagueActuelle={dossier.cohorte} ouvertParDefaut onTermine={recharger} />
        ) : undefined
      }
      peutModifierNiveau
      peutModifierPlanning
      onDossierChange={recharger}
    />
  )
}

/* Ajout de forfait (0061) : bouton toujours disponible, précédé d'un bandeau si l'élève a une
   demande en attente — la traiter pré-remplit les heures et referme la demande une fois le
   forfait créé. */
function PanneauAjoutForfait({
  studentId,
  nomEtudiant,
  onAjoute,
}: {
  studentId: string
  nomEtudiant: string
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
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 9px', fontSize: 12, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
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
          Ajouter un forfait
        </button>
      )}

      {modaleOuverte && (
        <AjouterForfaitModale
          studentId={studentId}
          nomEtudiant={nomEtudiant}
          demandeId={modaleOuverte.demandeId}
          heuresSuggerees={modaleOuverte.heures}
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

