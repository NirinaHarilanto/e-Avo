import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import type { Database, TypeProgrammeProspect } from '../../types/database.types'
import { deriveAccent } from '../../lib/accent'
import { SLUG_ETABLISSEMENT_PRINCIPAL } from '../../lib/etablissement'
import { useTarifs } from '../../hooks/useTarifs'
import { CoquilleVitrine } from '../vitrine/CoquilleVitrine'
import { PageAccueil } from '../vitrine/PageAccueil'
import { PageAPropos } from '../vitrine/PageAPropos'
import { PageCours } from '../vitrine/PageCours'
import { PageEquipe } from '../vitrine/PageEquipe'
import { PageTemoignages } from '../vitrine/PageTemoignages'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

/* Violet de la charte Hari Online Club. Il ne sert plus à peindre la vitrine, qui a sa propre
   palette depuis la refonte du 2026-10-09 (voir vitrine-hx.css), mais reste l'accent des deux
   modules de réservation réutilisés dans la fenêtre des formules. */
const VIOLET_MARQUE = '#6d3bd1'

type Vue = 'accueil' | 'cours' | 'professeurs' | 'temoignages' | 'apropos'

/* Chaque vue de la maquette est une vraie page, avec sa propre adresse : c'est ce que les
   maquettes écrivent dans leur barre de navigation, et c'est la condition pour que les
   apparitions au défilement, la barre qui se solidifie et le chevauchement des sections aient un
   sens. La navigation par état interne et le blocage du défilement (demande du 2026-09-15, « la
   page publique tient dans une seule vue ») ont été abandonnés à cette occasion, arbitrage
   explicite du client le 2026-10-09. */
const VUE_PAR_CHEMIN: Record<string, Vue> = {
  '/': 'accueil',
  '/cours': 'cours',
  '/professeurs': 'professeurs',
  '/temoignages': 'temoignages',
  '/a-propos': 'apropos',
}

/* Anciennes adresses en `?vue=`, déjà partagées et encore produites par l'écran de connexion.
   Elles basculent vers le chemin correspondant au lieu de retomber sur l'accueil. */
const CHEMIN_PAR_ANCIENNE_VUE: Record<string, string> = {
  programmes: '/cours',
  tarifs: '/cours',
  professeurs: '/professeurs',
  temoignages: '/temoignages',
  avis: '/a-propos',
  accueil: '/',
}

/* Les pages dont le haut est un hero sombre posent un fond violet sous la page, celles qui
   ouvrent sur du clair un fond blanc lavande — exactement l'attribut `style` du <body> de chaque
   maquette. Le fond ne se voit que pendant le rebond de défilement, mais sans lui la page
   paraît cassée sur mobile. */
const FOND_PAR_VUE: Record<Vue, string> = {
  accueil: '#4E356F',
  cours: '#F7F4FF',
  professeurs: '#F7F4FF',
  temoignages: '#4E356F',
  apropos: '#4E356F',
}

export function LandingEtablissement() {
  const { slug: slugUrl } = useParams<{ slug: string }>()
  const slug = slugUrl ?? SLUG_ETABLISSEMENT_PRINCIPAL
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null)
  const [loading, setLoading] = useState(true)
  const [introuvable, setIntrouvable] = useState(false)
  const { tarifs } = useTarifs(etablissement?.id)
  const [parametresUrl, setParametresUrl] = useSearchParams()
  const [dateVague, setDateVague] = useState<string | null>(null)
  const [formuleAOuvrir, setFormuleAOuvrir] = useState<TypeProgrammeProspect | null>(null)

  const vue = VUE_PAR_CHEMIN[pathname] ?? 'accueil'

  /* Date de démarrage de la prochaine vague de cours collectifs, affichée en ruban sur la carte
     Collectif. Elle est lue dans les vagues que l'administration gère déjà, via une fonction
     `security definer` qui ne renvoie que cette date : la table des vagues reste fermée au
     public. Une erreur n'est pas remontée à l'écran, c'est une information d'appoint. */
  useEffect(() => {
    if (!slug) return
    let annule = false
    supabase.rpc('prochaine_vague_publique', { p_slug: slug }).then(({ data }) => {
      if (!annule) setDateVague((data as string | null) ?? null)
    })
    return () => {
      annule = true
    }
  }, [slug])

  useEffect(() => {
    if (!slug) return
    let annule = false
    supabase
      .from('etablissements')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (annule) return
        if (error || !data) setIntrouvable(true)
        else setEtablissement(data)
        setLoading(false)
      })
    return () => {
      annule = true
    }
  }, [slug])

  /* Changer de page remet la vue en haut : le navigateur le ferait pour de vraies pages, pas
     React Router, qui conserve la position de défilement. */
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  /* `?reserver=1` conduit directement à la formule individuelle, fenêtre ouverte — l'écran de
     connexion y renvoie le visiteur sans compte, pour qu'il retrouve en un clic la réservation
     qu'il cherchait. Le paramètre est retiré de l'URL une fois lu, pour qu'un rafraîchissement
     ne rouvre pas la fenêtre tout seul. */
  useEffect(() => {
    if (parametresUrl.get('reserver') !== '1') return
    setFormuleAOuvrir('individuel')
    parametresUrl.delete('reserver')
    setParametresUrl(parametresUrl, { replace: true })
    if (pathname !== '/cours') navigate('/cours', { replace: true })
  }, [parametresUrl, setParametresUrl, pathname, navigate])

  useEffect(() => {
    const demandee = parametresUrl.get('vue')
    if (!demandee) return
    const cible = CHEMIN_PAR_ANCIENNE_VUE[demandee]
    parametresUrl.delete('vue')
    setParametresUrl(parametresUrl, { replace: true })
    if (cible && cible !== pathname) navigate(cible, { replace: true })
  }, [parametresUrl, setParametresUrl, pathname, navigate])

  if (loading) {
    return (
      <div className="page-claire" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
        Chargement…
      </div>
    )
  }

  if (introuvable || !etablissement) {
    return (
      <div className="page-claire" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p style={{ color: 'var(--danger)' }}>Établissement introuvable.</p>
        <a href="/" className="btn-shine" style={{ background: 'var(--accent-blue-gradient)', color: '#fff' }}>
          Retour à l’accueil
        </a>
      </div>
    )
  }

  const accent = deriveAccent(VIOLET_MARQUE)
  const dossierAssets = `/etablissements/${etablissement.slug}`

  /* Mise en forme en toutes lettres de la date renvoyée par la base (« 2026-01-12 » →
     « 12 janvier 2026 »). Le découpage manuel évite `new Date('2026-01-12')`, interprété en UTC,
     qui reculait la date d'un jour pour un visiteur à l'ouest de Greenwich. */
  const prochaineVague = dateVague
    ? (() => {
        const [annee, mois, jour] = dateVague.split('-').map(Number)
        return new Date(annee, mois - 1, jour).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      })()
    : null

  return (
    <CoquilleVitrine fond={FOND_PAR_VUE[vue]}>
      {vue === 'accueil' && <PageAccueil nomEtablissement={etablissement.nom} />}
      {vue === 'cours' && (
        <PageCours
          tarifs={tarifs}
          prochaineVague={prochaineVague}
          etablissementSlug={etablissement.slug}
          etablissementNom={etablissement.nom}
          accent={accent}
          typeOuvertInitial={formuleAOuvrir}
        />
      )}
      {vue === 'professeurs' && <PageEquipe dossierAssets={dossierAssets} />}
      {vue === 'temoignages' && <PageTemoignages dossierAssets={dossierAssets} />}
      {vue === 'apropos' && <PageAPropos dossierAssets={dossierAssets} />}
    </CoquilleVitrine>
  )
}
