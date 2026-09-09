import { useEffect, useState, type FormEvent } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { supabase } from '../../lib/supabaseClient'

export function ProfesseursAdmin() {
  const { professeurs, loading } = useProfesseurs()
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

      {formulaireOuvert && <FormulaireInvitation onTermine={() => setFormulaireOuvert(false)} />}

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

function FormulaireInvitation({ onTermine }: { onTermine: () => void }) {
  const { session } = useProfileContext()
  const [email, setEmail] = useState('')
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState(false)

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    if (!session) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/inviter-professeur', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ email, nom, prenom }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? "L'invitation a échoué.")
      return
    }
    setSucces(true)
    setTimeout(onTermine, 1200)
  }

  if (succes) {
    return (
      <div className="card" style={{ padding: 20, marginBottom: 20, color: 'var(--accent-teal)' }}>
        Invitation envoyée à {email}.
      </div>
    )
  }

  return (
    <form onSubmit={envoyer} className="card" style={{ padding: 20, marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1, minWidth: 160 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Prénom</label>
        <input required value={prenom} onChange={(e) => setPrenom(e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', fontSize: 13, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1, minWidth: 160 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Nom</label>
        <input required value={nom} onChange={(e) => setNom(e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', fontSize: 13, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 2, minWidth: 220 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>E-mail</label>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', fontSize: 13, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }} />
      </div>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5, width: '100%' }}>{erreur}</p>}
      <button type="submit" disabled={enCours} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours ? 0.6 : 1 }}>
        {enCours ? 'Envoi…' : 'Envoyer'}
      </button>
    </form>
  )
}
