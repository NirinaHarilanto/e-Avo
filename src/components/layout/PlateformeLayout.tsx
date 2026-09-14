import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { routeAccueilPourRole } from './EspaceLayout'
import { Logo } from '../shared/Logo'
import { Icone } from '../ui/Icones'

const NAV_ITEMS = [{ label: 'Établissements', href: '/plateforme/etablissements', icone: 'etablissements' as const }]

/* Layout autonome, volontairement PAS une réutilisation d'EspaceLayout : la source
   d'autorisation est différente (présence dans `platform_admins`, pas `profile.role`) et
   EspaceLayout garde ses gardes-fous de rôle qui rejetteraient un admin plateforme. Seule la
   présentation est reprise à l'identique de la coquille des autres espaces. */
export function PlateformeLayout({ children, actif }: { children: ReactNode; actif: string }) {
  const {
    session,
    profile,
    loading: contextLoading,
    seDeconnecter,
    etablissement,
    platformAdmin,
    platformAdminLoading,
  } = useProfileContext()
  const navigate = useNavigate()
  const loading = contextLoading || platformAdminLoading

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

  // Sans `loading` : voir EspaceLayout.tsx — un rafraîchissement de fond ne doit pas vider la
  // page une fois la session et le profil connus.
  if (!session || !profile || !platformAdmin) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
        Chargement…
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <div className="coquille">
        <nav className="barre-laterale" aria-label="Navigation plateforme">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 6px' }}>
            <Logo size={22} />
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>Admin plateforme</span>
              <span style={{ fontSize: 10.5, color: 'var(--muted-2)' }}>Toutes les écoles</span>
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexGrow: 1 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.9, padding: '0 12px 5px' }}>
              Plateforme
            </span>
            {NAV_ITEMS.map((item) => {
              const estActif = item.label === actif
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  className={`nav-item${estActif ? ' nav-item-active' : ''}`}
                  aria-current={estActif ? 'page' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    padding: '10px 12px',
                    borderRadius: 11,
                    fontSize: 13.5,
                    fontWeight: estActif ? 800 : 600,
                    color: estActif ? '#1b1510' : 'var(--ink-2)',
                    background: estActif ? 'var(--accent-gradient)' : undefined,
                    cursor: 'pointer',
                  }}
                >
                  <Icone nom={item.icone} taille={17} />
                  <span style={{ flexGrow: 1 }}>{item.label}</span>
                </Link>
              )
            })}
          </div>

          <div style={{ padding: '12px 12px 0', borderTop: '1px solid var(--border-soft)' }}>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted-2)' }}>Connecté en tant que</span>
            <span className="brand-font" style={{ display: 'block', fontSize: 12.5, color: 'var(--accent-gold, #e9cf94)', marginTop: 2 }}>
              {platformAdmin.prenom} {platformAdmin.nom}
            </span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>Administrateur plateforme</span>
          </div>
        </nav>

        <div className="zone-contenu">
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              padding: '13px 26px',
              borderBottom: '1px solid var(--border-soft)',
              position: 'sticky',
              top: 0,
              zIndex: 20,
              background: 'rgba(5,10,22,.82)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--muted)' }}>
              Plateforme
              <Icone nom="chevron" taille={12} />
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{actif}</span>
            </span>
            <button
              onClick={async () => {
                await seDeconnecter()
                navigate(etablissement ? `/e/${etablissement.slug}` : '/', { replace: true })
              }}
              style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 15px', cursor: 'pointer' }}
            >
              Déconnexion
            </button>
          </header>

          <main style={{ padding: '26px 26px 48px', minWidth: 0 }}>{children}</main>
        </div>
      </div>
    </div>
  )
}
