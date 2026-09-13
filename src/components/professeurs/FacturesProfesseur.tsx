import { useCallback, useEffect, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { FactureImprimable } from '../facturation/FactureImprimable'
import { BadgeStatutFacture } from '../shared/BadgeStatutFacture'
import type { Database } from '../../types/database.types'

type Invoice = Database['public']['Tables']['invoices']['Row']

export function FacturesProfesseur() {
  const { profile } = useProfileContext()
  const [factures, setFactures] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [factureAImprimer, setFactureAImprimer] = useState<Invoice | null>(null)

  const charger = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const { data } = await supabase.from('invoices').select('*').eq('teacher_id', profile.id).order('date_emission', { ascending: false })
    setFactures(data ?? [])
    setLoading(false)
  }, [profile])

  useEffect(() => {
    charger()
  }, [charger])

  return (
    <ProfesseurLayout actif="Mes factures">
      <h1 style={{ fontSize: 28, color: '#fff', marginBottom: 22 }}>Mes factures</h1>

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : factures.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Aucune facture pour le moment.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {factures.map((f) => (
            <div key={f.id} className="card card-lift" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flexGrow: 1, minWidth: 200 }}>
                <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)' }}>
                  {f.numero}
                </span>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{f.objet}</div>
              </div>
              <span className="brand-font" style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>
                {f.montant_ttc.toFixed(2)} €
              </span>
              <BadgeStatutFacture statut={f.statut} />
              <button
                onClick={() => setFactureAImprimer(f)}
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}
              >
                Voir / Imprimer
              </button>
            </div>
          ))}
        </div>
      )}

      {factureAImprimer && <FactureImprimable facture={factureAImprimer} destinataire={profile} onFermer={() => setFactureAImprimer(null)} />}
    </ProfesseurLayout>
  )
}
