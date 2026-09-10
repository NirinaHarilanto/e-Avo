import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { usePlatformAdmin } from '../../hooks/usePlatformAdmin'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { Logo } from '../shared/Logo'

type Etablissement = Database['public']['Tables']['etablissements']['Row']
type Role = Database['public']['Tables']['profiles']['Row']['role']

export interface NavItem {
  label: string
  href: string
  disponible: boolean
}

export interface NavGroup {
  titre?: string
  items: NavItem[]
}

/* Route d'accueil propre à chaque rôle — utilisée quand un profil atterrit sur un espace qui
   n'est pas le sien : on le renvoie vers SON espace plutôt que systématiquement vers
   /mon-espace, qui pourrait à son tour le rejeter (ex. un admin sur /mon-espace/documents). */
export function routeAccueilPourRole(role: Role): string {
  if (role === 'admin_etablissement') return '/admin/prospects'
  if (role === 'professeur') return '/professeur/calendrier'
  return '/mon-espace'
}

interface EspaceLayoutProps {
  roleAttendu: Role
  roleLabel: string
  navGroups: NavGroup[]
  actif: string
  children: ReactNode
}

/* Layout générique (header + nav en pilules groupées) partagé par les espaces admin et
   professeur — extrait de l'ancien AdminLayout pour que les deux espaces restent
   visuellement et structurellement identiques au fil des évolutions futures. */
export function EspaceLayout({ roleAttendu, roleLabel, navGroups, actif, children }: EspaceLayoutProps) {
  const { session, profile, loading: profileLoading, seDeconnecter } = useProfileContext()
  const { platformAdmin, loading: platformLoading } = usePlatformAdmin(session, profileLoading)
  const loading = profileLoading || platformLoading
  const navigate = useNavigate()
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null)

  // Un compte garde un rôle unique, sauf l'administrateur plateforme (platform_admins, 0022) qui
  // peut aussi accéder aux espaces admin/professeur de son propre établissement — voir la
  // redéfinition de is_admin_etablissement() en 0023, dont ce garde-fou front est le pendant.
  const accesAutorise = !!profile && (profile.role === roleAttendu || !!platformAdmin)

  useEffect(() => {
    if (loading) return
    if (!session || !profile) {
      navigate('/connexion', { replace: true })
      return
    }
    if (!accesAutorise) {
      navigate(routeAccueilPourRole(profile.role), { replace: true })
    }
  }, [session, profile, accesAutorise, loading, navigate])

  useEffect(() => {
    if (!profile) return
    supabase
      .from('etablissements')
      .select('*')
      .eq('id', profile.etablissement_id)
      .maybeSingle()
      .then(({ data }) => setEtablissement(data))
  }, [profile])

  if (loading || !session || !profile || !accesAutorise) {
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
              <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{roleLabel}</span>
            </div>
            <button
              onClick={() => seDeconnecter()}
              style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px', cursor: 'pointer' }}
            >
              Déconnexion
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {navGroups.map((groupe, index) => (
            <nav key={groupe.titre ?? index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
              {groupe.titre && (
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.6, marginRight: 4 }}>
                  {groupe.titre}
                </span>
              )}
              {groupe.items.map((item) => (
                <NavPill key={item.label} item={item} actif={item.label === actif} />
              ))}
            </nav>
          ))}
        </div>
      </header>

      <div style={{ padding: '28px 32px 40px' }}>{children}</div>
    </div>
  )
}

function NavPill({ item, actif }: { item: NavItem; actif: boolean }) {
  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 9,
    padding: '11px 18px',
    borderRadius: 999,
    fontSize: 13.5,
    fontWeight: actif ? 800 : 600,
    color: actif ? '#1b1510' : item.disponible ? 'var(--ink-2)' : 'var(--muted-2)',
    background: actif ? 'var(--accent-gradient)' : undefined,
    opacity: item.disponible ? 1 : 0.55,
  }

  if (!item.disponible) {
    return (
      <span className="nav-item" style={{ ...style, cursor: 'default' }}>
        {item.label}
        <span style={{ fontSize: 9.5, fontWeight: 700 }}>· bientôt</span>
      </span>
    )
  }

  return (
    <Link to={item.href} className={`nav-item${actif ? ' nav-item-active' : ''}`} style={{ ...style, cursor: 'pointer' }}>
      {item.label}
    </Link>
  )
}
