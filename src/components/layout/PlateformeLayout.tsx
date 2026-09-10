import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { usePlatformAdmin } from '../../hooks/usePlatformAdmin'
import { routeAccueilPourRole } from './EspaceLayout'
import { Logo } from '../shared/Logo'

const NAV_ITEMS = [{ label: 'Établissements', href: '/plateforme/etablissements' }]

/* Layout autonome, volontairement PAS une réutilisation d'EspaceLayout : la source
   d'autorisation est différente (présence dans `platform_admins`, pas `profile.role`) et
   EspaceLayout est déjà en production sur 3 espaces sans aucun test automatisé — un refactor
   pour partager le JSX de header/nav ne serait vérifiable qu'à l'œil, hors de portée ici. Le
   style visuel est repris à l'identique. */
export function PlateformeLayout({ children, actif }: { children: ReactNode; actif: string }) {
  const { session, profile, loading: contextLoading, seDeconnecter } = useProfileContext()
  const navigate = useNavigate()
  const { platformAdmin, loading: platformLoading } = usePlatformAdmin(session, contextLoading)
  const loading = contextLoading || platformLoading

  useEffect(() => {
    if (loading) return
    if (!session || !profile) {
      navigate('/connexion?next=/plateforme/etablissements', { replace: true })
      return
    }
    if (!platformAdmin) {
      navigate(routeAccueilPourRole(profile.role), { replace: true })
    }
  }, [session, profile, platformAdmin, loading, navigate])

  if (loading || !session || !profile || !platformAdmin) {
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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '6px 13px', borderRadius: 999, border: '1px solid var(--border)', background: 'rgba(255,255,255,.04)' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>Admin plateforme</span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
              <span className="brand-font" style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-gold, #e9cf94)' }}>
                {platformAdmin.prenom} {platformAdmin.nom}
              </span>
              <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Administrateur plateforme</span>
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
            <Link
              key={item.label}
              to={item.href}
              className={`nav-item${item.label === actif ? ' nav-item-active' : ''}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 9,
                padding: '11px 18px',
                borderRadius: 999,
                fontSize: 13.5,
                fontWeight: item.label === actif ? 800 : 600,
                color: item.label === actif ? '#1b1510' : 'var(--ink-2)',
                background: item.label === actif ? 'var(--accent-gradient)' : undefined,
                cursor: 'pointer',
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <div style={{ padding: '28px 32px 40px' }}>{children}</div>
    </div>
  )
}
