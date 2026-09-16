import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import type { Database } from '../../types/database.types'
import { Logo } from '../shared/Logo'
import { NotificationsBell } from '../shared/NotificationsBell'
import { Icone, type NomIcone } from '../ui/Icones'

type Role = Database['public']['Tables']['profiles']['Row']['role']

export interface NavItem {
  label: string
  href: string
  disponible: boolean
  icone: NomIcone
  description?: string
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

const LIBELLE_ESPACE: Record<Role, string> = {
  admin_etablissement: 'Espace admin',
  professeur: 'Espace professeur',
  etudiant: 'Espace étudiant',
}

interface EspaceLayoutProps {
  roleAttendu: Role
  roleLabel: string
  navGroups: NavGroup[]
  actif: string
  children: ReactNode
}

/* Coquille générique des espaces admin / professeur / étudiant : barre latérale groupée à
   gauche, barre supérieure avec fil d'Ariane à droite. Remplace l'ancienne navigation en deux
   rangées de pilules, qui n'affichait jamais les titres de groupes pourtant prévus dans
   `NavGroup` — les douze entrées admin se lisaient donc comme une liste à plat. */
export function EspaceLayout({ roleAttendu, roleLabel, navGroups, actif, children }: EspaceLayoutProps) {
  const {
    session,
    profile,
    loading: profileLoading,
    seDeconnecter,
    platformAdmin,
    platformAdminLoading,
  } = useProfileContext()
  const loading = profileLoading || platformAdminLoading
  const navigate = useNavigate()
  const location = useLocation()
  const [tiroirOuvert, setTiroirOuvert] = useState(false)

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

  // Sur mobile la barre latérale est un tiroir superposé au contenu : le laisser ouvert après
  // un clic masquerait la page qu'on vient justement de demander.
  useEffect(() => {
    setTiroirOuvert(false)
  }, [location.pathname])

  /* Volontairement sans `loading` : tant que session et profil sont déjà connus, un
     rafraîchissement de fond (renouvellement de jeton au retour sur l'onglet, rechargement du
     profil après une modification) ne doit pas remplacer toute la page par « Chargement… » —
     c'est ce clignotement que l'utilisateur voyait à chaque changement de fenêtre. Au tout
     premier chargement, session et profil sont encore nuls : l'écran d'attente s'affiche bien. */
  if (!session || !profile || !accesAutorise) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
        Chargement…
      </div>
    )
  }

  const groupeActif = navGroups.find((groupe) => groupe.items.some((item) => item.label === actif))
  const itemActif = groupeActif?.items.find((item) => item.label === actif)

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <div className="coquille">
        <button
          type="button"
          aria-label="Fermer le menu"
          tabIndex={tiroirOuvert ? 0 : -1}
          className={`voile-tiroir${tiroirOuvert ? ' tiroir-ouvert' : ''}`}
          onClick={() => setTiroirOuvert(false)}
          style={{ border: 'none', padding: 0 }}
        />

        <nav
          className={`barre-laterale${tiroirOuvert ? ' tiroir-ouvert' : ''}`}
          aria-label={`Navigation ${LIBELLE_ESPACE[roleAttendu].toLowerCase()}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Logo taille={30} />
              <button
                type="button"
                onClick={() => setTiroirOuvert(false)}
                aria-label="Fermer le menu"
                className="bouton-tiroir"
                style={{ alignItems: 'center', background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
              >
                <Icone nom="fermer" taille={18} />
              </button>
            </div>
            {/* Le nom de l'établissement est porté par le logo juste au-dessus : seul l'espace
                courant reste à nommer ici. */}
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted-2)' }}>
              {LIBELLE_ESPACE[roleAttendu]}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flexGrow: 1 }}>
            {navGroups.map((groupe, index) => (
              <div key={groupe.titre ?? index} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {groupe.titre && (
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.9, padding: '0 12px 5px' }}>
                    {groupe.titre}
                  </span>
                )}
                {groupe.items.map((item) => (
                  <LienNav key={item.label} item={item} actif={item.label === actif} />
                ))}
              </div>
            ))}
          </div>

          <div style={{ padding: '12px 12px 0', borderTop: '1px solid var(--border-soft)' }}>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted-2)', lineHeight: 1.5 }}>
              Connecté en tant que
            </span>
            <span className="brand-font" style={{ display: 'block', fontSize: 12.5, color: 'var(--accent-gold, #e9cf94)', marginTop: 2 }}>
              {profile.prenom} {profile.nom}
            </span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{roleLabel}</span>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <button
                type="button"
                onClick={() => setTiroirOuvert(true)}
                aria-label="Ouvrir le menu de navigation"
                className="bouton-tiroir"
                style={{ alignItems: 'center', background: 'rgba(255,255,255,.05)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--ink-2)', cursor: 'pointer', padding: 7 }}
              >
                <Icone nom="menu" taille={17} />
              </button>
              <FilAriane
                racine={LIBELLE_ESPACE[roleAttendu]}
                groupe={groupeActif?.titre}
                page={itemActif?.label ?? actif}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <NotificationsBell profileId={profile.id} />
              <button
                onClick={async () => {
                  // Navigue AVANT d'attendre seDeconnecter() — et non après (bug signalé par le client
                  // le 2026-09-16, « à chaque déconnexion il faut le renvoyer à la page Hero, cette
                  // partie n'est toujours pas prise en compte ») : `seDeconnecter()` déclenche de façon
                  // asynchrone `onAuthStateChange`, qui vide `session` PENDANT que ce composant est
                  // encore monté. Son effet de garde (plus haut) voit alors passer session à `null`
                  // avant que ce gestionnaire n'ait fini d'attendre, et navigue lui-même vers
                  // `/connexion` — cette seconde navigation, plus tardive, écrasait alors le retour au
                  // Hero. Naviguer d'abord démonte ce composant immédiatement : son effet de garde ne
                  // peut plus se déclencher, quel que soit le moment où `session` se vide réellement.
                  navigate('/', { replace: true })
                  await seDeconnecter()
                }}
                style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 15px', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Déconnexion
              </button>
            </div>
          </header>

          <main style={{ padding: '26px 26px 48px', minWidth: 0 }}>{children}</main>
        </div>
      </div>
    </div>
  )
}

function FilAriane({ racine, groupe, page }: { racine: string; groupe?: string; page: string }) {
  const segments = [racine, ...(groupe ? [groupe] : []), page]
  return (
    <nav aria-label="Fil d’Ariane" style={{ minWidth: 0 }}>
      <ol style={{ display: 'flex', alignItems: 'center', gap: 7, margin: 0, padding: 0, listStyle: 'none', flexWrap: 'wrap' }}>
        {segments.map((segment, index) => {
          const dernier = index === segments.length - 1
          return (
            <li key={segment} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              {index > 0 && (
                <span aria-hidden style={{ color: 'var(--muted-2)', display: 'inline-flex' }}>
                  <Icone nom="chevron" taille={12} />
                </span>
              )}
              <span
                aria-current={dernier ? 'page' : undefined}
                style={{ fontSize: 12.5, fontWeight: dernier ? 700 : 500, color: dernier ? 'var(--ink)' : 'var(--muted)' }}
              >
                {segment}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function LienNav({ item, actif }: { item: NavItem; actif: boolean }) {
  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    padding: '10px 12px',
    borderRadius: 11,
    fontSize: 13.5,
    fontWeight: actif ? 800 : 600,
    color: actif ? '#1b1510' : item.disponible ? 'var(--ink-2)' : 'var(--muted-2)',
    background: actif ? 'var(--accent-gradient)' : undefined,
    opacity: item.disponible ? 1 : 0.55,
  }

  if (!item.disponible) {
    return (
      <span className="nav-item" style={{ ...style, cursor: 'default' }} title="Bientôt disponible">
        <Icone nom={item.icone} taille={17} />
        <span style={{ flexGrow: 1 }}>{item.label}</span>
        <span style={{ fontSize: 9.5, fontWeight: 700 }}>bientôt</span>
      </span>
    )
  }

  return (
    <Link
      to={item.href}
      className={`nav-item${actif ? ' nav-item-active' : ''}`}
      aria-current={actif ? 'page' : undefined}
      title={item.description}
      style={{ ...style, cursor: 'pointer' }}
    >
      <Icone nom={item.icone} taille={17} />
      <span style={{ flexGrow: 1, minWidth: 0 }}>{item.label}</span>
    </Link>
  )
}
