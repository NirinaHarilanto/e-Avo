import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { Logo } from '../shared/Logo'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

const NAV_ITEMS = [
  { label: 'Prospects', href: '/admin/prospects', disponible: true },
  { label: 'Étudiants', href: '/admin/etudiants', disponible: true },
  { label: 'Professeurs', href: '/admin/professeurs', disponible: true },
  { label: 'Séances & visio', href: '#', disponible: false },
  { label: 'Heures & forfaits', href: '#', disponible: false },
]

export function AdminLayout({ children, actif }: { children: ReactNode; actif: string }) {
  const { session, profile, loading, seDeconnecter } = useProfileContext()
  const navigate = useNavigate()
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null)

  useEffect(() => {
    if (loading) return
    if (!session || !profile) {
      navigate('/connexion', { replace: true })
      return
    }
    if (profile.role !== 'admin_etablissement') {
      navigate('/mon-espace', { replace: true })
    }
  }, [session, profile, loading, navigate])

  useEffect(() => {
    if (!profile) return
    supabase
      .from('etablissements')
      .select('*')
      .eq('id', profile.etablissement_id)
      .maybeSingle()
      .then(({ data }) => setEtablissement(data))
  }, [profile])

  if (loading || !session || !profile || profile.role !== 'admin_etablissement') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
        Chargement…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <header style={{ padding: '16px 32px 14px', borderBottom: '1px solid var(--border-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Logo size={24} />
            {etablissement && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '6px 13px', borderRadius: 999, border: '1px solid var(--border)', background: 'rgba(255,255,255,.04)' }}>
                <span
                  className="brand-font"
                  style={{ width: 22, height: 22, borderRadius: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#1b1510', background: 'var(--accent-gradient)' }}
                >
                  {etablissement.nom.slice(0, 2).toUpperCase()}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>{etablissement.nom}</span>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
              <span className="brand-font" style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-gold, #e9cf94)' }}>
                {profile.prenom} {profile.nom}
              </span>
              <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Administrateur</span>
            </div>
            <button
              onClick={() => seDeconnecter()}
              style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px', cursor: 'pointer' }}
            >
              Déconnexion
            </button>
          </div>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
          {NAV_ITEMS.map((item) => (
            <a
              key={item.label}
              href={item.disponible ? item.href : undefined}
              className={`nav-item${item.label === actif ? ' nav-item-active' : ''}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 9,
                padding: '11px 18px',
                borderRadius: 999,
                fontSize: 13.5,
                fontWeight: item.label === actif ? 800 : 600,
                color: item.label === actif ? '#1b1510' : item.disponible ? 'var(--ink-2)' : 'var(--muted-2)',
                background: item.label === actif ? 'var(--accent-gradient)' : undefined,
                cursor: item.disponible ? 'pointer' : 'default',
                opacity: item.disponible ? 1 : 0.55,
              }}
            >
              {item.label}
              {!item.disponible && <span style={{ fontSize: 9.5, fontWeight: 700 }}>· bientôt</span>}
            </a>
          ))}
        </nav>
      </header>

      <div style={{ padding: '28px 32px 40px' }}>{children}</div>
    </div>
  )
}
