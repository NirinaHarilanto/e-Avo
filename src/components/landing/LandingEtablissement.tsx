import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import type { Database, TypeProgrammeProspect } from '../../types/database.types'
import { deriveAccent } from '../../lib/accent'
import { SLUG_ETABLISSEMENT_PRINCIPAL } from '../../lib/etablissement'
import { useTarifs } from '../../hooks/useTarifs'
import { HeroPublic } from './HeroPublic'
import { VueAvis, VueProfesseurs, VueProgrammes, VueTarifs } from './VuesPubliques'
import { ModaleReservation } from '../prospects/ModaleReservation'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

/* Violet de la charte Hari Online Club, repris du logo (#4A306D éclairci pour rester lisible en
   aplat de bouton). La page publique force cet accent plutôt que `etablissements.couleur_accent`,
   resté à l'or dont dépend tout l'habillage sombre des espaces connectés — le doré, très peu
   contrasté sur fond blanc, serait illisible ici. */
const VIOLET_MARQUE = '#6d3bd1'

type Vue = 'accueil' | 'programmes' | 'tarifs' | 'professeurs' | 'avis'

const ENTREES: { vue: Vue; libelle: string }[] = [
  { vue: 'accueil', libelle: 'Accueil' },
  { vue: 'programmes', libelle: 'Programme' },
  { vue: 'tarifs', libelle: 'Tarifs' },
  { vue: 'professeurs', libelle: 'Professeurs' },
  { vue: 'avis', libelle: 'Avis' },
]

/* Sur la vue d'accueil, la barre de navigation flotte AU-DESSUS du hero, qui porte déjà ses
   propres raccourcis (voir HeroPublic.tsx) : deux entrées y font donc double emploi et sont
   masquées — « Accueil », puisqu'on y est déjà, et « Avis », déplacé dans le badge Certifié vert
   (demande client du 2026-09-15). Elles restent affichées sur les autres vues, d'où le hero et
   son badge sont hors de portée. */
const MASQUEES_SUR_ACCUEIL: Vue[] = ['accueil', 'avis']

/* Page publique en vue unique : la barre de navigation remplace le contenu affiché au lieu de
   faire défiler la page (demande client du 2026-09-15). Chaque vue tient dans la hauteur de
   l'écran ; seul le corps d'une vue dense peut défiler dans son propre cadre, jamais la page. */
export function LandingEtablissement() {
  const { slug: slugUrl } = useParams<{ slug: string }>()
  const slug = slugUrl ?? SLUG_ETABLISSEMENT_PRINCIPAL
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null)
  const [loading, setLoading] = useState(true)
  const [introuvable, setIntrouvable] = useState(false)
  const [vue, setVue] = useState<Vue>('accueil')
  const [reservation, setReservation] = useState<TypeProgrammeProspect | null>(null)
  const { tarifs } = useTarifs(etablissement?.id)

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

  /* La page publique est la seule de l'application à interdire le défilement du document : la
     classe est posée sur <body> le temps de l'afficher, et retirée en quittant pour ne pas
     bloquer les espaces connectés. */
  useEffect(() => {
    document.body.classList.add('sans-defilement')
    return () => document.body.classList.remove('sans-defilement')
  }, [])

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

  function ouvrirReservation(type: TypeProgrammeProspect = 'individuel') {
    setReservation(type)
  }

  /* Les quatre vues Programme/Tarifs/Professeurs/Avis (CadreVue, voir VuesPubliques.tsx) portent
     désormais un thème sombre glassmorphism néon — seule l'accueil garde la photo du hero sur
     fond clair. Le pied de page doit s'adapter à ce fond sombre (voir .page-unique--sombre dans
     index.css) plutôt que garder sa bande blanche translucide pensée pour la photo. */
  const sombre = vue !== 'accueil'

  return (
    <div className={`page-claire page-unique${sombre ? ' page-unique--sombre' : ''}`}>
      <header className="en-tete-public">
        <button type="button" onClick={() => setVue('accueil')} className="bloc-logo" aria-label={`Accueil ${etablissement.nom}`}>
          <img src="/logo-hoc.png" alt={etablissement.nom} style={{ height: 42, width: 'auto', display: 'block' }} />
          {etablissement.specialite && <span className="baseline-logo">{etablissement.specialite}</span>}
        </button>

        <nav style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
          {ENTREES.filter((entree) => vue !== 'accueil' || !MASQUEES_SUR_ACCUEIL.includes(entree.vue)).map((entree) => (
            <button
              key={entree.vue}
              type="button"
              onClick={() => setVue(entree.vue)}
              className="lien-nav-public"
              aria-current={vue === entree.vue ? 'page' : undefined}
              style={{ background: 'transparent', border: 'none', borderBottomWidth: 2, borderBottomStyle: 'solid', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {entree.libelle}
            </button>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/connexion" className="bouton-contour">
            Se connecter
          </a>
          <button type="button" onClick={() => ouvrirReservation()} className="btn-shine" style={{ background: 'var(--accent-blue-gradient)', color: '#fff', border: 'none' }}>
            Réserver mon appel →
          </button>
        </div>
      </header>

      <main className="corps-unique">
        {vue === 'accueil' && (
          <HeroPublic nomEtablissement={etablissement.nom} onReserver={() => ouvrirReservation()} onNaviguer={setVue} />
        )}
        {vue === 'programmes' && <VueProgrammes accent={accent} onReserver={ouvrirReservation} />}
        {vue === 'tarifs' && <VueTarifs tarifs={tarifs} accent={accent} onReserver={ouvrirReservation} />}
        {vue === 'professeurs' && (
          <VueProfesseurs
            nomEtablissement={etablissement.nom}
            dossierAssets={dossierAssets}
            accent={accent}
            onReserver={() => ouvrirReservation()}
          />
        )}
        {vue === 'avis' && <VueAvis />}
      </main>

      {/* Bande légale réduite au strict nécessaire : sans elle, les liens de confidentialité et de
          conditions d'utilisation exigés par Google pour l'accès Calendar n'existeraient plus
          nulle part sur le site public, la page n'ayant plus de pied de page défilant. */}
      <footer className="pied-unique">
        <span>© 2026 {etablissement.nom}</span>
        <span style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <a href="/confidentialite">Confidentialité</a>
          <a href="/conditions-utilisation">Conditions d’utilisation</a>
          <a href="/plateforme/etablissements">Admin plateforme</a>
        </span>
      </footer>

      {reservation && (
        <ModaleReservation
          etablissementSlug={etablissement.slug}
          etablissementNom={etablissement.nom}
          accent={accent}
          typeInitial={reservation}
          onFermer={() => setReservation(null)}
        />
      )}
    </div>
  )
}
