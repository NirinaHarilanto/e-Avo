import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PlateformeLayout } from '../layout/PlateformeLayout'
import { useAdminsEtablissement } from '../../hooks/useAdminsEtablissement'
import { supabase } from '../../lib/supabaseClient'
import { FormulaireInvitation } from '../shared/FormulaireInvitation'
import type { Database } from '../../types/database.types'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

export function EtablissementDetailPlateforme() {
  const { id } = useParams<{ id: string }>()
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null)
  const [loadingEtablissement, setLoadingEtablissement] = useState(true)
  const { admins, loading: loadingAdmins, recharger } = useAdminsEtablissement(id)
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase
      .from('etablissements')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        setEtablissement(data)
        setLoadingEtablissement(false)
      })
  }, [id])

  return (
    <PlateformeLayout actif="Établissements">
      {loadingEtablissement ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : !etablissement ? (
        <p style={{ color: 'var(--danger)' }}>Établissement introuvable.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <h1 style={{ fontSize: 28, color: '#fff' }}>{etablissement.nom}</h1>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              /e/{etablissement.slug}
              {etablissement.specialite && ` · ${etablissement.specialite}`}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 19, color: 'var(--accent-gold, #e9cf94)' }}>Administrateurs</h2>
            <button onClick={() => setFormulaireOuvert((v) => !v)} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510' }}>
              Ajouter un admin
            </button>
          </div>

          {formulaireOuvert && (
            <FormulaireInvitation
              endpoint="/api/plateforme/inviter-admin-etablissement"
              roleLabel="un admin"
              corpsSupplementaire={{ etablissementId: etablissement.id }}
              onTermine={() => {
                setFormulaireOuvert(false)
                recharger()
              }}
            />
          )}

          {loadingAdmins ? (
            <p style={{ color: 'var(--muted)' }}>Chargement…</p>
          ) : admins.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>Aucun administrateur pour cet établissement.</p>
          ) : (
            <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {admins.map((admin) => (
                <div key={admin.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: '1px solid var(--border-soft)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink)', flexGrow: 1 }}>
                    {admin.prenom} {admin.nom}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{admin.email}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </PlateformeLayout>
  )
}
