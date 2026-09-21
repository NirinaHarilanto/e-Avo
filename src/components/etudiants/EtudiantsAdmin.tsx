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
import { PlanifierSeancesForfait } from './PlanifierSeancesForfait'
import { DossierEtudiantVue, initiales } from './DossierEtudiantVue'
import { FormulaireInvitation } from '../shared/FormulaireInvitation'
import { InformationsPersonnelles, informationsPersonnellesCompletes } from '../shared/InformationsPersonnelles'
import { SupprimerCompte } from '../shared/SupprimerCompte'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { ChampRecherche } from '../ui/BarreOutils'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'
import { useStatutsContratsSignature } from '../../hooks/useStatutsContratsSignature'
import { useTypesProgrammeEtudiants } from '../../hooks/useTypesProgrammeEtudiants'
import { BadgeStatutContrat } from '../shared/BadgeStatutContrat'

export function EtudiantsAdmin() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { etudiants, loading, recharger } = useEtudiants()
  const [recherche, setRecherche] = useState('')
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)

  const filtres = useMemo(
    () =>
      etudiants.filter((e) =>
        `${e.prenom ?? ''} ${e.nom ?? ''}`.toLowerCase().includes(recherche.toLowerCase()),
      ),
    [etudiants, recherche],
  )

  const actifs = etudiants.filter((e) => e.status === 'approved').length
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
            <Stat compact libelle="Étudiants inscrits" valeur={etudiants.length} ton="or" />
            <Stat compact libelle="Comptes actifs" valeur={actifs} ton="teal" aide="Invitation acceptée et mot de passe défini" />
            <Stat
              compact
              libelle="En attente d’activation"
              valeur={etudiants.length - actifs}
              ton={etudiants.length - actifs > 0 ? 'alerte' : 'neutre'}
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

          {filtres.map((etudiant) => (
            <button
              key={etudiant.id}
              onClick={() => navigate(`/admin/etudiants/${etudiant.id}`)}
              aria-current={etudiant.id === id ? 'true' : undefined}
              className="carte-ligne"
              style={{
                textAlign: 'left',
                borderRadius: 12,
                border: etudiant.id === id ? '1px solid rgba(94,179,255,.5)' : '1px solid var(--border)',
                background: 'var(--surface)',
                padding: '9px 11px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                color: 'inherit',
              }}
            >
              <span style={{ width: 30, height: 30, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 11.5, fontWeight: 800, flexShrink: 0 }}>
                {initiales(etudiant)}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
                  {etudiant.prenom} {etudiant.nom}
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{etudiant.status === 'approved' ? 'Actif' : etudiant.status}</span>
                <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {programmes[etudiant.id] && <TagProgramme programme={programmes[etudiant.id]} />}
                  {statutsContrats[etudiant.id] && <BadgeStatutContrat statut={statutsContrats[etudiant.id]} compact />}
                  {/* Téléphone, adresse, ville, date et lieu de naissance : tant qu'un de ces
                      champs manque, le dossier ne peut pas servir de base à un contrat ou à une
                      facture complets — voir informationsPersonnellesCompletes. */}
                  {!informationsPersonnellesCompletes(etudiant) && <TagDossierIncomplet />}
                </span>
              </div>
            </button>
          ))}
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
      panneauInformations={<InformationsPersonnelles personne={etudiant} onChange={recharger} carte={false} />}
      panneauSuppression={<SupprimerCompte personne={etudiant} onSupprime={onSupprime} />}
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

const FOND_TON: Record<'teal' | 'bleu' | 'or', { color: string; bg: string; border: string }> = {
  teal: { color: 'var(--accent-teal)', bg: 'rgba(111,227,192,.14)', border: 'rgba(111,227,192,.3)' },
  bleu: { color: 'var(--accent-blue)', bg: 'rgba(94,179,255,.14)', border: 'rgba(94,179,255,.3)' },
  or: { color: 'var(--accent-gold, #e9cf94)', bg: 'rgba(233,207,148,.14)', border: 'rgba(233,207,148,.32)' },
}

/* Petit tag discret indiquant si l'étudiant suit des cours particuliers (individuel/duo) ou un
   cours collectif, et dans ce cas laquelle vague — demande client du 2026-09-21. */
function TagProgramme({ programme }: { programme: { libelle: string; ton: 'teal' | 'bleu' | 'or' } }) {
  const style = FOND_TON[programme.ton]
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: style.color, background: style.bg, border: `1px solid ${style.border}`, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>
      {programme.libelle}
    </span>
  )
}

/* Signale, dans la liste de gauche, un étudiant dont les informations personnelles (téléphone,
   adresse, ville, date et lieu de naissance — voir informationsPersonnellesCompletes) sont
   encore incomplètes. Même vocabulaire de couleur que BadgeStatutContrat côté « en attente » :
   ambre, pas rouge — ce n'est pas bloquant, seulement à surveiller avant de générer un contrat
   ou une facture. */
function TagDossierIncomplet() {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--warning)',
        background: 'rgba(233,207,148,.12)',
        border: '1px solid rgba(233,207,148,.32)',
        borderRadius: 999,
        padding: '2px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      Dossier à compléter
    </span>
  )
}
