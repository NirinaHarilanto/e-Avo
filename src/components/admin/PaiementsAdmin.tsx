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

type Onglet = 'etudiants' | 'professeurs'

const STATUTS: StatutPaiement[] = ['attendu', 'paye', 'en_retard', 'annule']
const LABELS_STATUT: Record<StatutPaiement, string> = { attendu: 'Attendu', paye: 'Payé', en_retard: 'En retard', annule: 'Annulé' }

export function PaiementsAdmin() {
  const { profile } = useProfileContext()
  const [onglet, setOnglet] = useState<Onglet>('etudiants')
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)

  const paiementsEtudiants = usePaiementsEtudiants()
  const remunerationsProfs = useRemunerationsProfesseurs()

  return (
    <AdminLayout actif="Paiements">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 28, color: '#fff' }}>Paiements</h1>
        <button onClick={() => setFormulaireOuvert((v) => !v)} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510' }}>
          {onglet === 'etudiants' ? 'Enregistrer un paiement' : 'Enregistrer une rémunération'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {(['etudiants', 'professeurs'] as const).map((o) => (
          <button
            key={o}
            onClick={() => {
              setOnglet(o)
              setFormulaireOuvert(false)
            }}
            className={`nav-item${onglet === o ? ' nav-item-active' : ''}`}
            style={{
              padding: '9px 16px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: onglet === o ? 800 : 600,
              color: onglet === o ? '#1b1510' : 'var(--ink-2)',
              background: onglet === o ? 'var(--accent-gradient)' : undefined,
              cursor: 'pointer',
            }}
          >
            {o === 'etudiants' ? 'Étudiants' : 'Professeurs'}
          </button>
        ))}
      </div>

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
  if (loading) return <p style={{ color: 'var(--muted)' }}>Chargement…</p>
  if (erreur) return <p style={{ color: 'var(--danger)' }}>{erreur}</p>
  if (paiements.length === 0) return <p style={{ color: 'var(--muted)' }}>Aucun paiement enregistré.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {paiements.map(({ paiement, etudiant }) => (
        <LigneFinanciere
          key={paiement.id}
          table="student_payments"
          id={paiement.id}
          nomPersonne={etudiant ? `${etudiant.prenom} ${etudiant.nom}` : 'Étudiant inconnu'}
          sousTitre={[paiement.moyen_paiement, paiement.reference].filter(Boolean).join(' · ') || undefined}
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
  if (loading) return <p style={{ color: 'var(--muted)' }}>Chargement…</p>
  if (erreur) return <p style={{ color: 'var(--danger)' }}>{erreur}</p>
  if (remunerations.length === 0) return <p style={{ color: 'var(--muted)' }}>Aucune rémunération enregistrée.</p>

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
