import { useEffect, useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { supabase } from '../../lib/supabaseClient'
import { FormulaireInvitation } from '../shared/FormulaireInvitation'

export function ProfesseursAdmin() {
  const { professeurs, loading, recharger } = useProfesseurs()
  const [comptes, setComptes] = useState<Record<string, number>>({})
  const [heures, setHeures] = useState<Record<string, number>>({})
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)

  useEffect(() => {
    if (professeurs.length === 0) return
    const teacherIds = professeurs.map((p) => p.id)
    supabase
      .from('teacher_assignments')
      .select('teacher_id')
      .in('teacher_id', teacherIds)
      .is('date_fin', null)
      .then(({ data }) => {
        const compte: Record<string, number> = {}
        for (const row of data ?? []) {
          compte[row.teacher_id] = (compte[row.teacher_id] ?? 0) + 1
        }
        setComptes(compte)
      })
    supabase
      .from('teacher_hours_summary')
      .select('*')
      .in('teacher_id', teacherIds)
      .then(({ data }) => {
        setHeures(Object.fromEntries((data ?? []).map((row) => [row.teacher_id, row.heures_enseignees])))
      })
  }, [professeurs])

  return (
    <AdminLayout actif="Professeurs">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <h1 style={{ fontSize: 28, color: '#fff' }}>Professeurs</h1>
        <button onClick={() => setFormulaireOuvert((v) => !v)} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510' }}>
          Inviter un professeur
        </button>
      </div>

      {formulaireOuvert && (
        <FormulaireInvitation
          endpoint="/api/admin/inviter-professeur"
          roleLabel="un professeur"
          onTermine={() => {
            setFormulaireOuvert(false)
            recharger()
          }}
        />
      )}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : professeurs.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Aucun professeur pour le moment.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {professeurs.map((prof) => (
            <div key={prof.id} className="card card-lift" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <span style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--accent-blue-gradient)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
                  {(prof.prenom?.[0] ?? '').toUpperCase()}
                  {(prof.nom?.[0] ?? '').toUpperCase()}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="brand-font" style={{ fontSize: 15, color: 'var(--ink)' }}>
                    {prof.prenom} {prof.nom}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{prof.email}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{comptes[prof.id] ?? 0} élève(s) actif(s)</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)' }}>{heures[prof.id] ?? 0} h enseignées</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
