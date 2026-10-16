import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import type { Database } from '../../types/database.types'
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

  /* Palier de police resserré, réservé aux 3 espaces que sert CE layout — admin, professeur,
     étudiant (0059, demande client du 2026-09-22 : « dans les espaces étudiants, professeurs,
     admin »). Posée sur `document.body`, pas sur un conteneur local, pour couvrir aussi les
     pop-up montées par portail (voir `body.echelle-connectee` dans index.css) ; retirée au
     démontage, sans effet pratique ici puisque ce layout reste monté tant qu'on est dans l'un
     des 3 espaces.
     `echelle-admin` (demande client du 2026-09-29, cette fois réservée au SEUL espace admin) s'y
     ajoute quand `roleAttendu` est l'admin d'établissement — professeur et étudiant restent au
     palier `echelle-connectee` seul. */
  /* `espace-clair` porte tout le thème clair des maquettes du 2026-10-16 (voir `body.espace-clair`
     dans index.css). Posée sur `document.body` pour la même raison que l'échelle : les pop-up sont
     montées par portail dans `body` et ne descendent d'aucun conteneur de page, donc une classe
     locale les laisserait sur l'ancien thème sombre. */
  useEffect(() => {
    document.body.classList.add('echelle-connectee', 'espace-clair')
    if (roleAttendu === 'admin_etablissement') document.body.classList.add('echelle-admin')
    return () => document.body.classList.remove('echelle-connectee', 'echelle-admin', 'espace-clair')
  }, [roleAttendu])

  /* Volontairement sans `loading` : tant que session et profil sont déjà connus, un
     rafraîchissement de fond (renouvellement de jeton au retour sur l'onglet, rechargement du
     profil après une modification) ne doit pas remplacer toute la page par « Chargement… » —
     c'est ce clignotement que l'utilisateur voyait à chaque changement de fenêtre. Au tout
     premier chargement, session et profil sont encore nuls : l'écran d'attente s'affiche bien. */
  if (!session || !profile || !accesAutorise) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6f6386' }}>
        Chargement…
      </div>
    )
  }

  const totalEntreesNav = navGroups.reduce((total, groupe) => total + groupe.items.length, 0)
  const initiales = `${profile.prenom?.[0] ?? ''}${profile.nom?.[0] ?? ''}`.toUpperCase()

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

        {/* Ouverture du menu sur mobile. La barre supérieure qui le portait a disparu avec la
            refonte du 2026-10-16 (les maquettes n'en ont pas) : ce bouton flotte donc au-dessus du
            contenu, et seulement sous 900 px — `.bouton-tiroir` est masquée au-delà. La zone de
            contenu lui réserve sa place par un retrait en haut (voir .zone-contenu en mobile). */}
        <button
          type="button"
          onClick={() => setTiroirOuvert(true)}
          aria-label="Ouvrir le menu de navigation"
          className="bouton-tiroir bouton-tiroir-flottant"
        >
          <Icone nom="menu" taille={18} />
        </button>

        <nav
          className={`barre-laterale${tiroirOuvert ? ' tiroir-ouvert' : ''}`}
          aria-label={`Navigation ${LIBELLE_ESPACE[roleAttendu].toLowerCase()}`}
          /* Le resserrement sur écran court est proportionné au nombre d'entrées RÉEL de l'espace
             (voir `--nb-entrees` dans index.css) : l'espace admin en compte 19 et doit se
             resserrer tôt, l'espace étudiant 8 et garde sa pleine taille bien plus longtemps.
             Sans cela, un élève sur un écran de portable voyait sa police réduite alors que sa
             barre avait toute la place voulue. */
          style={{ '--nb-entrees': totalEntreesNav } as React.CSSProperties}
        >
          {/* Même gouttière de 12 px que les pilules de navigation et que le pied de page : les
              trois zones de la barre s'alignent sur une seule verticale (2026-10-09). L'en-tête
              était jusque-là 6 px plus à gauche que les libellés. */}
          <div className="entete-barre" style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '0 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              {/* Logo écrit, et non l'image `/logo-hoc-blanc.png` : c'est ainsi que les maquettes
                  du 2026-10-16 dessinent la marque en tête de barre, « HARI » en Playfair sur une
                  ligne et « Online Club » en Fraunces italique sous lui. Les deux lignes sont
                  regroupées sous un seul rôle d'image accessible, pour être annoncées comme un
                  nom de marque et non comme deux fragments de texte sans lien. Les tailles vivent
                  dans `.logo-ecrit-*` (index.css) : comme tout le reste de la barre, elles suivent
                  la hauteur de la fenêtre. */}
              <span role="img" aria-label="Hari Online Club" style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span
                  aria-hidden
                  className="logo-ecrit-nom"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, lineHeight: 1, color: '#fefffa', letterSpacing: '0.02em' }}
                >
                  HARI
                </span>
                <span
                  aria-hidden
                  className="logo-ecrit-suite"
                  style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', lineHeight: 1.1, color: 'var(--hoc-barre-texte)' }}
                >
                  Online Club
                </span>
              </span>
              <button
                type="button"
                onClick={() => setTiroirOuvert(false)}
                aria-label="Fermer le menu"
                className="bouton-tiroir"
                style={{ alignItems: 'center', background: 'transparent', border: 'none', color: 'var(--hoc-barre-texte)', cursor: 'pointer', padding: 4 }}
              >
                <Icone nom="fermer" taille={18} />
              </button>
            </div>
            {/* Le nom de l'établissement est porté par le logo juste au-dessus : seul l'espace
                courant reste à nommer ici. Pastille lavande pleine depuis la refonte du
                2026-10-16, où il devient un repère et non plus une mention grise. */}
            <span
              className="pastille-espace"
              style={{
                alignSelf: 'flex-start',
                fontWeight: 700,
                letterSpacing: 1.3,
                textTransform: 'uppercase',
                color: 'var(--hoc-barre)',
                background: 'var(--hoc-lavande-forte)',
                padding: '4px 10px',
                borderRadius: 99,
              }}
            >
              {LIBELLE_ESPACE[roleAttendu]}
            </span>
          </div>

          {/* Les deux pôles se partagent toute la hauteur restante AU PRORATA de leur nombre
              d'entrées (`flexGrow: items.length`), et chacun répartit la sienne en `space-evenly`.
              C'est ce qui fait que la navigation remplit le bloc quelle que soit la hauteur
              d'écran, au lieu de s'entasser en haut en laissant un vide au-dessus du pied de page
              (demande du 2026-10-09). Au prorata, et non `flexGrow: 1` pour les deux : avec huit
              entrées d'un côté et dix de l'autre, un partage à parts égales aérerait visiblement
              plus le premier groupe que le second. Le `gap` reste un minimum : sur un écran court,
              `space-evenly` n'a plus d'espace à distribuer et c'est lui qui tient l'espacement. */}
          {/* Hauteur des pilules, taille du texte, des icônes et des écarts : TOUT suit la hauteur
              de la fenêtre (voir `.barre-laterale` dans index.css, `clamp(min, Xvh, max)`), au lieu
              de deux paliers fixes qui ne pouvaient couvrir que les hauteurs prévues. Demande
              client du 2026-10-13 : « tous les éléments du bloc nav devraient être visibles sur une
              vue [...] réduire un peu la taille des police si nécessaire ». Les 19 entrées, leur
              en-tête et le pied de page tiennent donc ensemble sans jamais défiler ni se
              chevaucher, y compris sur un écran mis à l'échelle par Windows — c'est ce qui
              raccourcissait la fenêtre du client sans que la hauteur CSS ne le laisse voir. */}
          <div className="zone-nav-barre" style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}>
            {navGroups.map((groupe, index) => (
              <div
                key={groupe.titre ?? index}
                className="groupe-nav-barre"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-evenly',
                  flexGrow: groupe.items.length,
                  flexBasis: 0,
                }}
              >
                {groupe.titre && (
                  /* Passé de `--muted-2` à `--muted` le 2026-10-09 (premier correctif), encore
                     jugé trop terne par le client le 2026-10-10 : sur fond violet sombre, un gris
                     reste un gris, aussi clair soit-il. Passé au dégradé or de `--accent-gradient`
                     — celui qui porte déjà tous les états « mise en avant » de l'application
                     (boutons primaires, onglet actif) — plutôt qu'à une couleur fixe, pour que le
                     titre de pôle se voie vraiment comme un repère, pas comme un énième gris. Le
                     halo (`filter: drop-shadow`) est ce qui rend ce dégradé « brillant » plutôt que
                     plat ; même technique que `.logo-glow` mais statique (sans l'animation
                     arc-en-ciel du logo, qui serait trop voyante pour un repère qu'on regarde en
                     continu pendant qu'on travaille). */
                  <span
                    className="titre-groupe-barre"
                    style={{
                      fontWeight: 800,
                      background: 'var(--accent-gradient)',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent',
                      filter: 'drop-shadow(0 0 6px rgba(233, 207, 148, 0.45))',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      padding: '0 12px',
                    }}
                  >
                    {groupe.titre}
                  </span>
                )}
                {groupe.items.map((item) => (
                  <LienNav key={item.label} item={item} actif={item.label === actif} />
                ))}
              </div>
            ))}
          </div>

          {/* Carte du compte connecté, reprise des maquettes du 2026-10-16 : avatar en goutte,
              nom, rôle, et la déconnexion ramenée ici — elle vivait dans la barre supérieure, que
              ces maquettes suppriment. La mention « Connecté en tant que » disparaît : l'avatar et
              la place en pied de barre disent déjà de quel compte il s'agit. */}
          <div
            className="pied-barre carte-compte"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 18,
              background: 'rgba(254, 255, 250, 0.08)',
            }}
          >
            <span
              aria-hidden
              className="petale avatar-compte"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontWeight: 700,
                color: 'var(--hoc-barre)',
                background: 'var(--hoc-lavande-forte)',
              }}
            >
              {initiales}
            </span>
            <span style={{ flexGrow: 1, minWidth: 0 }}>
              <span
                className="pied-barre-nom police-titre-italique"
                style={{ display: 'block', fontWeight: 600, color: '#fefffa', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {profile.prenom} {profile.nom}
              </span>
              <span className="pied-barre-mention" style={{ display: 'block', color: 'var(--hoc-barre-texte)' }}>
                {roleLabel}
              </span>
            </span>
            <button
              type="button"
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
              aria-label="Se déconnecter"
              title="Se déconnecter"
              className="bouton-deconnexion-barre"
            >
              <Icone nom="deconnexion" taille={17} />
            </button>
          </div>
        </nav>

        {/* Plus de barre supérieure depuis la refonte du 2026-10-16 : les maquettes n'en ont
            aucune. Le fil d'Ariane disparaît (il n'était pas cliquable), « Actualiser » et la
            cloche de notifications remontent dans l'en-tête de chaque page (voir EnTetePage.tsx,
            par lequel passent toutes les pages des trois espaces) et la déconnexion rejoint la
            carte du compte en pied de barre latérale. */}
        <div className="zone-contenu">
          <main style={{ padding: '28px 36px 48px', minWidth: 0 }}>{children}</main>
        </div>
      </div>
    </div>
  )
}

/* Pilule élargie et aérée le 2026-10-09 : la barre est resserrée à `zoom: 0.74` dans l'espace
   admin, où ces 13,5 px se lisaient à 10 px réels. La hauteur gagnée comble aussi le vide que les
   dix-huit entrées laissaient au-dessus du pied de page (voir `.barre-laterale` dans index.css). */
function LienNav({ item, actif }: { item: NavItem; actif: boolean }) {
  /* Ni `fontSize`, ni `padding`, ni `gap` ici : ces trois dimensions suivent la hauteur de la
     fenêtre et vivent donc dans `.barre-laterale .nav-item` (index.css). Un style inline
     l'emporterait sur la feuille de style quelle qu'en soit la spécificité — c'est précisément ce
     qui empêchait la barre de se resserrer sur un écran court (2026-10-13). Seule la gouttière
     horizontale reste ici : elle ne dépend pas de la hauteur. */
  /* Ni `color` ni `background` ici depuis la refonte du 2026-10-16 : les deux vivent dans
     `.barre-laterale .nav-item` et `.nav-item-active` (index.css), où le thème clair les redéfinit.
     Un style inline l'emporterait sur la feuille de style quelle qu'en soit la spécificité — la
     pilule active serait restée sur l'or du thème sombre. L'entrée indisponible est un `<span>` et
     non un `<a>` : c'est à ce sélecteur que la feuille s'accroche pour l'estomper. */
  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    borderRadius: 12,
    fontWeight: actif ? 700 : 600,
    opacity: item.disponible ? 1 : 0.55,
  }

  if (!item.disponible) {
    return (
      <span className="nav-item" style={{ ...style, cursor: 'default' }} title="Bientôt disponible">
        <Icone nom={item.icone} taille={18} />
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
      <Icone nom={item.icone} taille={18} />
      <span style={{ flexGrow: 1, minWidth: 0 }}>{item.label}</span>
    </Link>
  )
}
