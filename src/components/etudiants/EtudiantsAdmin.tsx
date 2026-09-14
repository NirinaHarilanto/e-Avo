import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AdminLayout } from '../layout/AdminLayout'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { AttribuerProfesseur } from './AttribuerProfesseur'
import { CreerForfait } from './CreerForfait'
import { AssignerVague } from './AssignerVague'
import { ChoixProgrammeInitial } from './ChoixProgrammeInitial'
import { PlanifierSeancesForfait } from './PlanifierSeancesForfait'
import { DossierEtudiantVue, initiales } from './DossierEtudiantVue'
import { FormulaireInvitation } from '../shared/FormulaireInvitation'
import { InformationsPersonnelles } from '../shared/InformationsPersonnelles'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { ChampRecherche } from '../ui/BarreOutils'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

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

  return (
    <AdminLayout actif="Étudiants">
      <EnTetePage
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
        <div style={{ marginBottom: 20 }}>
          <GrilleStats min={180}>
            <Stat libelle="Étudiants inscrits" valeur={etudiants.length} ton="or" />
            <Stat libelle="Comptes actifs" valeur={actifs} ton="teal" aide="Invitation acceptée et mot de passe défini" />
            <Stat
              libelle="En attente d’activation"
              valeur={etudiants.length - actifs}
              ton={etudiants.length - actifs > 0 ? 'alerte' : 'neutre'}
              aide="Invitation envoyée, pas encore acceptée"
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
                borderRadius: 14,
                border: etudiant.id === id ? '1px solid rgba(94,179,255,.5)' : '1px solid var(--border)',
                background: 'var(--surface)',
                padding: '13px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                color: 'inherit',
              }}
            >
              <span style={{ width: 38, height: 38, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                {initiales(etudiant)}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                  {etudiant.prenom} {etudiant.nom}
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{etudiant.status === 'approved' ? 'Actif' : etudiant.status}</span>
              </div>
            </button>
          ))}
        </aside>

        <div style={{ minWidth: 0 }}>
          {id ? (
            <DossierPanel studentId={id} />
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

function DossierPanel({ studentId }: { studentId: string }) {
  const { dossier, loading, erreur, recharger } = useDossierEtudiant(studentId)

  if (loading) return <EtatChargement lignes={3} hauteur={110} />
  if (erreur || !dossier) return <MessageErreur>{erreur ?? 'Dossier introuvable.'}</MessageErreur>

  const periodeActuelle = dossier.periodes[0] && !dossier.periodes[0].affectation.date_fin ? dossier.periodes[0] : null
  const affectationActuelle = periodeActuelle?.affectation ?? null
  const forfait = dossier.packages[0] ?? null
  const { etudiant } = dossier

  return (
    <DossierEtudiantVue
      dossier={dossier}
      panneauProfesseur={
        <AttribuerProfesseur
          studentId={etudiant.id}
          etablissementId={etudiant.etablissement_id}
          affectationActuelle={affectationActuelle}
          onTermine={recharger}
        />
      }
      panneauInformations={<InformationsPersonnelles personne={etudiant} onChange={recharger} />}
      panneauChoixInitial={
        <ChoixProgrammeInitial studentId={etudiant.id} etablissementId={etudiant.etablissement_id} onCree={recharger} />
      }
      panneauForfaitEdition={
        forfait ? <CreerForfait studentId={etudiant.id} etablissementId={etudiant.etablissement_id} forfaitExistant={forfait} onCree={recharger} /> : undefined
      }
      panneauPlanification={
        forfait && periodeActuelle?.professeur ? (
          <PlanifierSeancesForfait
            studentIds={[etudiant.id]}
            teacherId={periodeActuelle.professeur.id}
            dureeParDefaut={60}
            dateFinParDefaut={forfait.echeance}
            onCree={recharger}
          />
        ) : undefined
      }
      panneauVague={
        dossier.cohorte ? (
          <AssignerVague studentId={etudiant.id} etablissementId={etudiant.etablissement_id} vagueActuelle={dossier.cohorte} ouvertParDefaut onTermine={recharger} />
        ) : undefined
      }
    />
  )
}
