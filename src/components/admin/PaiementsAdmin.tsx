import { useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { usePaiementsEtudiants, type PaiementEtudiant } from '../../hooks/usePaiementsEtudiants'
import { useRemunerationsProfesseurs, type RemunerationProfesseur } from '../../hooks/useRemunerationsProfesseurs'
import { supabase } from '../../lib/supabaseClient'
import { CreerPaiementEtudiant } from '../paiements/CreerPaiementEtudiant'
import { CreerRemunerationProfesseur } from '../paiements/CreerRemunerationProfesseur'
import { BadgeStatutPaiement } from '../shared/BadgeStatutPaiement'
import type { StatutPaiement } from '../../types/database.types'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { Onglets } from '../ui/Onglets'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

type Onglet = 'etudiants' | 'professeurs'

const STATUTS: StatutPaiement[] = ['attendu', 'paye', 'en_retard', 'annule']
const LABELS_STATUT: Record<StatutPaiement, string> = { attendu: 'Attendu', paye: 'Payé', en_retard: 'En retard', annule: 'Annulé' }

/* Totaux dérivés des lignes déjà chargées par les hooks — la page n'affichait jusqu'ici aucun
   montant cumulé, obligeant à additionner les lignes à la main pour savoir où en était la
   trésorerie. Les lignes annulées sont volontairement exclues de tous les totaux. */
function totaux(lignes: { montant: number; statut: StatutPaiement }[]) {
  const cumul = (statut: StatutPaiement) =>
    lignes.filter((l) => l.statut === statut).reduce((total, l) => total + l.montant, 0)
  return { paye: cumul('paye'), attendu: cumul('attendu'), enRetard: cumul('en_retard') }
}

export function PaiementsAdmin() {
  const { profile } = useProfileContext()
  const [onglet, setOnglet] = useState<Onglet>('etudiants')
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)

  const paiementsEtudiants = usePaiementsEtudiants()
  const remunerationsProfs = useRemunerationsProfesseurs()

  return (
    <AdminLayout actif="Paiements">
      <EnTetePage
        titre="Paiements"
        description="Le suivi financier de l’établissement dans les deux sens : ce que les étudiants règlent, et ce que vous versez aux professeurs. La saisie est manuelle, aucun prélèvement n’est automatisé."
        actions={
          <button onClick={() => setFormulaireOuvert((v) => !v)} className="btn-shine" style={boutonPrimaireStyle}>
            <Icone nom="plus" taille={15} />
            {formulaireOuvert ? 'Fermer' : onglet === 'etudiants' ? 'Enregistrer un paiement' : 'Enregistrer une rémunération'}
          </button>
        }
      />

      <GuidePage
        id="admin-paiements"
        etapes={[
          <>
            Choisissez l’onglet <strong>Étudiants</strong> pour enregistrer un encaissement, ou{' '}
            <strong>Professeurs</strong> pour une rémunération à verser.
          </>,
          <>
            Créez la ligne avec son montant et son échéance, puis faites évoluer son <strong>statut</strong> (attendu,
            payé, en retard, annulé) directement dans la liste, sans rouvrir de formulaire.
          </>,
          <>
            Passer un paiement étudiant à <strong>payé</strong> génère automatiquement un reçu, que l’élève retrouve
            dans son espace « Mes paiements ».
          </>,
          <>
            Pour un professeur rémunéré à l’heure, le montant est proposé à partir de son taux horaire et de ses heures
            non encore payées : vérifiez-le avant de valider.
          </>,
        ]}
      />

      <div style={{ marginBottom: 18 }}>
        <Onglets
          etiquette="Type de mouvement financier"
          actif={onglet}
          onChange={(valeur) => {
            setOnglet(valeur)
            setFormulaireOuvert(false)
          }}
          onglets={[
            { value: 'etudiants', label: 'Étudiants', compteur: paiementsEtudiants.paiements.length },
            { value: 'professeurs', label: 'Professeurs', compteur: remunerationsProfs.remunerations.length },
          ]}
        />
      </div>

      {onglet === 'etudiants' && !paiementsEtudiants.loading && paiementsEtudiants.paiements.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <GrilleStats min={180}>
            <Stat
              libelle="Encaissé"
              valeur={totaux(paiementsEtudiants.paiements.map((p) => p.paiement)).paye.toFixed(2)}
              unite="Ar"
              ton="teal"
            />
            <Stat
              libelle="Attendu"
              valeur={totaux(paiementsEtudiants.paiements.map((p) => p.paiement)).attendu.toFixed(2)}
              unite="Ar"
              ton="or"
              aide="Échéances à venir non réglées"
            />
            <Stat
              libelle="En retard"
              valeur={totaux(paiementsEtudiants.paiements.map((p) => p.paiement)).enRetard.toFixed(2)}
              unite="Ar"
              ton={totaux(paiementsEtudiants.paiements.map((p) => p.paiement)).enRetard > 0 ? 'alerte' : 'neutre'}
              aide="À relancer en priorité"
            />
            <Stat libelle="Lignes enregistrées" valeur={paiementsEtudiants.paiements.length} ton="neutre" />
          </GrilleStats>
        </div>
      )}

      {onglet === 'professeurs' && !remunerationsProfs.loading && remunerationsProfs.remunerations.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <GrilleStats min={180}>
            <Stat
              libelle="Versé"
              valeur={totaux(remunerationsProfs.remunerations.map((r) => r.paiement)).paye.toFixed(2)}
              unite="Ar"
              ton="teal"
            />
            <Stat
              libelle="À verser"
              valeur={totaux(remunerationsProfs.remunerations.map((r) => r.paiement)).attendu.toFixed(2)}
              unite="Ar"
              ton="or"
            />
            <Stat
              libelle="En retard"
              valeur={totaux(remunerationsProfs.remunerations.map((r) => r.paiement)).enRetard.toFixed(2)}
              unite="Ar"
              ton={totaux(remunerationsProfs.remunerations.map((r) => r.paiement)).enRetard > 0 ? 'alerte' : 'neutre'}
            />
            <Stat libelle="Lignes enregistrées" valeur={remunerationsProfs.remunerations.length} ton="neutre" />
          </GrilleStats>
        </div>
      )}

      {formulaireOuvert && profile && onglet === 'etudiants' && (
        <CreerPaiementEtudiant
          etablissementId={profile.etablissement_id}
          onAnnuler={() => setFormulaireOuvert(false)}
          onCree={() => {
            setFormulaireOuvert(false)
            paiementsEtudiants.recharger()
          }}
        />
      )}
      {formulaireOuvert && profile && onglet === 'professeurs' && (
        <CreerRemunerationProfesseur
          etablissementId={profile.etablissement_id}
          onAnnuler={() => setFormulaireOuvert(false)}
          onCree={() => {
            setFormulaireOuvert(false)
            remunerationsProfs.recharger()
          }}
        />
      )}

      {onglet === 'etudiants' ? (
        <ListePaiementsEtudiants
          paiements={paiementsEtudiants.paiements}
          loading={paiementsEtudiants.loading}
          erreur={paiementsEtudiants.erreur}
          recharger={paiementsEtudiants.recharger}
        />
      ) : (
        <ListeRemunerationsProfesseurs
          remunerations={remunerationsProfs.remunerations}
          loading={remunerationsProfs.loading}
          erreur={remunerationsProfs.erreur}
          recharger={remunerationsProfs.recharger}
        />
      )}
    </AdminLayout>
  )
}

function ListePaiementsEtudiants({
  paiements,
  loading,
  erreur,
  recharger,
}: {
  paiements: PaiementEtudiant[]
  loading: boolean
  erreur: string | null
  recharger: () => void
}) {
  if (loading) return <EtatChargement lignes={4} hauteur={70} />
  if (erreur) return <MessageErreur>{erreur}</MessageErreur>
  if (paiements.length === 0) {
    return (
      <EtatVide
        icone="paiements"
        titre="Aucun paiement enregistré"
        description="Utilisez « Enregistrer un paiement » pour créer une première échéance : montant, date et étudiant concerné. Vous en suivrez ensuite le statut depuis cette liste."
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {paiements.map(({ paiement, etudiant, forfait }) => (
        <LigneFinanciere
          key={paiement.id}
          table="student_payments"
          id={paiement.id}
          nomPersonne={etudiant ? `${etudiant.prenom} ${etudiant.nom}` : 'Étudiant inconnu'}
          sousTitre={
            [forfait ? `Forfait ${forfait.type_programme} · ${forfait.total_heures} h` : null, paiement.moyen_paiement, paiement.reference]
              .filter(Boolean)
              .join(' · ') || undefined
          }
          montant={paiement.montant}
          devise={paiement.devise}
          statut={paiement.statut}
          dateEcheance={paiement.date_echeance}
          onChange={recharger}
        />
      ))}
    </div>
  )
}

function ListeRemunerationsProfesseurs({
  remunerations,
  loading,
  erreur,
  recharger,
}: {
  remunerations: RemunerationProfesseur[]
  loading: boolean
  erreur: string | null
  recharger: () => void
}) {
  if (loading) return <EtatChargement lignes={4} hauteur={70} />
  if (erreur) return <MessageErreur>{erreur}</MessageErreur>
  if (remunerations.length === 0) {
    return (
      <EtatVide
        icone="paiements"
        titre="Aucune rémunération enregistrée"
        description="Utilisez « Enregistrer une rémunération » pour créer un versement. Si le professeur a un taux horaire renseigné dans sa fiche, le montant vous sera proposé automatiquement à partir de ses heures non payées."
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {remunerations.map(({ paiement, professeur }) => (
        <LigneFinanciere
          key={paiement.id}
          table="teacher_payments"
          id={paiement.id}
          nomPersonne={professeur ? `${professeur.prenom} ${professeur.nom}` : 'Professeur inconnu'}
          sousTitre={
            paiement.periode_debut
              ? `${new Date(paiement.periode_debut).toLocaleDateString('fr-FR')}${paiement.periode_fin ? ` → ${new Date(paiement.periode_fin).toLocaleDateString('fr-FR')}` : ''}`
              : paiement.reference || undefined
          }
          montant={paiement.montant}
          devise={paiement.devise}
          statut={paiement.statut}
          dateEcheance={paiement.date_echeance}
          onChange={recharger}
        />
      ))}
    </div>
  )
}

function LigneFinanciere({
  table,
  id,
  nomPersonne,
  sousTitre,
  montant,
  devise,
  statut,
  dateEcheance,
  onChange,
}: {
  table: 'student_payments' | 'teacher_payments'
  id: string
  nomPersonne: string
  sousTitre?: string
  montant: number
  devise: string
  statut: StatutPaiement
  dateEcheance: string | null
  onChange: () => void
}) {
  const { session } = useProfileContext()
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function changerStatut(nouveauStatut: StatutPaiement) {
    setEnCours(true)
    setErreur(null)
    const datePaiement = nouveauStatut === 'paye' ? new Date().toISOString().slice(0, 10) : undefined
    // `table` est narrowé par branche : le client Supabase typé refuse un update générique sur
    // l'union des deux tables (les colonnes propres à l'autre table seraient `never`).
    const { error } =
      table === 'student_payments'
        ? await supabase
            .from('student_payments')
            .update({ statut: nouveauStatut, ...(datePaiement && { date_paiement: datePaiement }) })
            .eq('id', id)
        : await supabase
            .from('teacher_payments')
            .update({ statut: nouveauStatut, ...(datePaiement && { date_paiement: datePaiement }) })
            .eq('id', id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  async function supprimer() {
    if (!session) return
    if (!window.confirm('Supprimer cette ligne ?')) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/supprimer-ligne-financiere', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ table, id }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'La suppression a échoué.')
      return
    }
    onChange()
  }

  return (
    <div className="card card-lift" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flexGrow: 1, minWidth: 180 }}>
        <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)' }}>
          {nomPersonne}
        </span>
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          {sousTitre}
          {dateEcheance && `${sousTitre ? ' · ' : ''}échéance ${new Date(dateEcheance).toLocaleDateString('fr-FR')}`}
        </div>
      </div>
      <span className="brand-font" style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)', flexShrink: 0 }}>
        {montant} {devise}
      </span>
      <BadgeStatutPaiement statut={statut} />
      <select
        value={statut}
        disabled={enCours}
        onChange={(e) => changerStatut(e.target.value as StatutPaiement)}
        style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
      >
        {STATUTS.map((s) => (
          <option key={s} value={s}>
            {LABELS_STATUT[s]}
          </option>
        ))}
      </select>
      <button
        onClick={supprimer}
        disabled={enCours}
        style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}
      >
        Supprimer
      </button>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 11.5, width: '100%' }}>{erreur}</p>}
    </div>
  )
}
