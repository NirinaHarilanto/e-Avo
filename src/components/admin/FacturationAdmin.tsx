import { useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useDevis, type DevisAvecEtudiant } from '../../hooks/useDevis'
import { useFactures, type FactureAvecEtudiant } from '../../hooks/useFactures'
import { usePaiementsEtudiants } from '../../hooks/usePaiementsEtudiants'
import { supabase } from '../../lib/supabaseClient'
import { CreerDevis } from '../facturation/CreerDevis'
import { CreerFacture } from '../facturation/CreerFacture'
import { DevisImprimable } from '../facturation/DevisImprimable'
import { FactureImprimable } from '../facturation/FactureImprimable'
import type { StatutDevis, StatutFacture } from '../../types/database.types'

type Onglet = 'devis' | 'factures'

const LABELS_DEVIS: Record<StatutDevis, string> = { brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé', expire: 'Expiré' }
const LABELS_FACTURE: Record<StatutFacture, string> = { emise: 'Émise', envoyee: 'Envoyée', payee: 'Payée', en_retard: 'En retard', annulee: 'Annulée' }

async function supprimerLigne(table: 'quotes' | 'invoices', id: string, accessToken: string) {
  return fetch('/api/admin/supprimer-ligne-financiere', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ table, id }),
  })
}

export function FacturationAdmin() {
  const { profile, session } = useProfileContext()
  const [onglet, setOnglet] = useState<Onglet>('devis')
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [devisAImprimer, setDevisAImprimer] = useState<DevisAvecEtudiant | null>(null)
  const [factureAImprimer, setFactureAImprimer] = useState<FactureAvecEtudiant | null>(null)

  const { devis, loading: chargementDevis, erreur: erreurDevis, recharger: rechargerDevis } = useDevis()
  const { factures, loading: chargementFactures, erreur: erreurFactures, recharger: rechargerFactures } = useFactures()
  const { paiements } = usePaiementsEtudiants()

  const devisAcceptes = devis.filter((d) => d.devis.statut === 'accepte')

  return (
    <AdminLayout actif="Facturation">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 28, color: '#fff' }}>Facturation</h1>
        <button onClick={() => setFormulaireOuvert((v) => !v)} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510' }}>
          {onglet === 'devis' ? 'Nouveau devis' : 'Nouvelle facture'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {(['devis', 'factures'] as const).map((o) => (
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
              textTransform: 'capitalize',
            }}
          >
            {o}
          </button>
        ))}
      </div>

      {formulaireOuvert && profile && onglet === 'devis' && (
        <CreerDevis
          etablissementId={profile.etablissement_id}
          onAnnuler={() => setFormulaireOuvert(false)}
          onCree={() => {
            setFormulaireOuvert(false)
            rechargerDevis()
          }}
        />
      )}
      {formulaireOuvert && profile && onglet === 'factures' && (
        <CreerFacture
          etablissementId={profile.etablissement_id}
          devisAcceptes={devisAcceptes}
          onAnnuler={() => setFormulaireOuvert(false)}
          onCree={() => {
            setFormulaireOuvert(false)
            rechargerFactures()
          }}
        />
      )}

      {onglet === 'devis' ? (
        chargementDevis ? (
          <p style={{ color: 'var(--muted)' }}>Chargement…</p>
        ) : erreurDevis ? (
          <p style={{ color: 'var(--danger)' }}>{erreurDevis}</p>
        ) : devis.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Aucun devis enregistré.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {devis.map((d) => (
              <LigneDevis key={d.devis.id} item={d} onImprimer={() => setDevisAImprimer(d)} onChange={rechargerDevis} accessToken={session?.access_token} />
            ))}
          </div>
        )
      ) : chargementFactures ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : erreurFactures ? (
        <p style={{ color: 'var(--danger)' }}>{erreurFactures}</p>
      ) : factures.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Aucune facture enregistrée.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {factures.map((f) => (
            <LigneFacture
              key={f.facture.id}
              item={f}
              paiementsEtudiant={paiements.filter((p) => p.paiement.student_id === f.facture.student_id)}
              onImprimer={() => setFactureAImprimer(f)}
              onChange={rechargerFactures}
              accessToken={session?.access_token}
            />
          ))}
        </div>
      )}

      {devisAImprimer && <DevisImprimable devis={devisAImprimer.devis} etudiant={devisAImprimer.etudiant} onFermer={() => setDevisAImprimer(null)} />}
      {factureAImprimer && <FactureImprimable facture={factureAImprimer.facture} etudiant={factureAImprimer.etudiant} onFermer={() => setFactureAImprimer(null)} />}
    </AdminLayout>
  )
}

function LigneDevis({
  item,
  onImprimer,
  onChange,
  accessToken,
}: {
  item: DevisAvecEtudiant
  onImprimer: () => void
  onChange: () => void
  accessToken: string | undefined
}) {
  const { devis, etudiant } = item
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function changerStatut(nouveau: StatutDevis) {
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('quotes').update({ statut: nouveau }).eq('id', devis.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  async function supprimer() {
    if (!accessToken) return
    if (!window.confirm(`Supprimer le devis ${devis.numero} ?`)) return
    setEnCours(true)
    setErreur(null)
    const reponse = await supprimerLigne('quotes', devis.id, accessToken)
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
      <div style={{ flexGrow: 1, minWidth: 200 }}>
        <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)' }}>
          {devis.numero} — {etudiant ? `${etudiant.prenom} ${etudiant.nom}` : 'Étudiant inconnu'}
        </span>
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{devis.objet}</div>
      </div>
      <span className="brand-font" style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)', flexShrink: 0 }}>
        {devis.montant_ttc.toFixed(2)} €
      </span>
      <select
        value={devis.statut}
        disabled={enCours}
        onChange={(e) => changerStatut(e.target.value as StatutDevis)}
        style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
      >
        {(Object.keys(LABELS_DEVIS) as StatutDevis[]).map((s) => (
          <option key={s} value={s}>
            {LABELS_DEVIS[s]}
          </option>
        ))}
      </select>
      <button onClick={onImprimer} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}>
        Imprimer
      </button>
      <button onClick={supprimer} disabled={enCours} style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}>
        Supprimer
      </button>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 11.5, width: '100%' }}>{erreur}</p>}
    </div>
  )
}

function LigneFacture({
  item,
  paiementsEtudiant,
  onImprimer,
  onChange,
  accessToken,
}: {
  item: FactureAvecEtudiant
  paiementsEtudiant: ReturnType<typeof usePaiementsEtudiants>['paiements']
  onImprimer: () => void
  onChange: () => void
  accessToken: string | undefined
}) {
  const { facture, etudiant } = item
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function changerStatut(nouveau: StatutFacture) {
    setEnCours(true)
    setErreur(null)
    const datePaiement = nouveau === 'payee' ? new Date().toISOString().slice(0, 10) : undefined
    const { error } = await supabase
      .from('invoices')
      .update({ statut: nouveau, ...(datePaiement && { date_paiement: datePaiement }) })
      .eq('id', facture.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  async function rattacherPaiement(paymentId: string) {
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('invoices').update({ payment_id: paymentId || null }).eq('id', facture.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  async function supprimer() {
    if (!accessToken) return
    if (!window.confirm(`Supprimer la facture ${facture.numero} ?`)) return
    setEnCours(true)
    setErreur(null)
    const reponse = await supprimerLigne('invoices', facture.id, accessToken)
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
      <div style={{ flexGrow: 1, minWidth: 200 }}>
        <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)' }}>
          {facture.numero} — {etudiant ? `${etudiant.prenom} ${etudiant.nom}` : 'Étudiant inconnu'}
        </span>
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{facture.objet}</div>
      </div>
      <span className="brand-font" style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)', flexShrink: 0 }}>
        {facture.montant_ttc.toFixed(2)} €
      </span>
      <select
        value={facture.statut}
        disabled={enCours}
        onChange={(e) => changerStatut(e.target.value as StatutFacture)}
        style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
      >
        {(Object.keys(LABELS_FACTURE) as StatutFacture[]).map((s) => (
          <option key={s} value={s}>
            {LABELS_FACTURE[s]}
          </option>
        ))}
      </select>
      {paiementsEtudiant.length > 0 && (
        <select
          value={facture.payment_id ?? ''}
          disabled={enCours}
          onChange={(e) => rattacherPaiement(e.target.value)}
          style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
        >
          <option value="">Aucun paiement rattaché</option>
          {paiementsEtudiant.map(({ paiement }) => (
            <option key={paiement.id} value={paiement.id}>
              {paiement.montant} {paiement.devise} · {paiement.statut}
            </option>
          ))}
        </select>
      )}
      <button onClick={onImprimer} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}>
        Imprimer
      </button>
      <button onClick={supprimer} disabled={enCours} style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}>
        Supprimer
      </button>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 11.5, width: '100%' }}>{erreur}</p>}
    </div>
  )
}
