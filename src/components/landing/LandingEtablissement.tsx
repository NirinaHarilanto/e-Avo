import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import type { Database, TypeProgrammeProspect } from '../../types/database.types'
import { deriveAccent } from '../../lib/accent'
import { SLUG_ETABLISSEMENT_PRINCIPAL } from '../../lib/etablissement'
import { useTarifs } from '../../hooks/useTarifs'
import { HeroPublic } from './HeroPublic'
import { VueAvis, VueProfesseurs, VueProgrammes, VueTemoignages } from './VuesPubliques'
import { ModaleReservation } from '../prospects/ModaleReservation'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

/* Violet de la charte Hari Online Club, repris du logo (#4A306D éclairci pour rester lisible en
   aplat de bouton). La page publique force cet accent plutôt que `etablissements.couleur_accent`,
   resté à l'or dont dépend tout l'habillage sombre des espaces connectés — le doré, très peu
   contrasté sur fond blanc, serait illisible ici. */
const VIOLET_MARQUE = '#6d3bd1'

type Vue = 'accueil' | 'programmes' | 'professeurs' | 'avis' | 'temoignages'

/* Mêmes intitulés, dans le même ordre, que la barre de navigation dessinée dans la maquette du
   hero (voir HeroPublic.tsx) : en passant de l'accueil à une vue secondaire, on doit retrouver
   le menu qu'on vient de quitter, et non un autre vocabulaire.

   Depuis le 2026-10-08 (demande 4 du document de retours), « Cours » et « Tarifs » ne font plus
   qu'une seule entrée : chaque formule affiche son prix dans sa propre carte, pour que le
   visiteur ait la description et le prix au même endroit. L'ancienne adresse `?vue=tarifs`
   continue de fonctionner et bascule sur cette page fusionnée (voir plus bas).

   « Témoignages » est une entrée à part depuis le 2026-10-08, à la demande du client : les
   témoignages des stagiaires partageaient la page « À propos » avec le récit de la fondatrice,
   deux sujets qui n'ont rien à voir et que le visiteur ne vient pas chercher au même moment. */
const ENTREES: { vue: Vue; libelle: string }[] = [
  { vue: 'accueil', libelle: 'Accueil' },
  { vue: 'programmes', libelle: 'Cours & tarifs' },
  { vue: 'professeurs', libelle: 'Professeurs' },
  { vue: 'temoignages', libelle: 'Témoignages' },
  { vue: 'avis', libelle: 'À propos' },
]

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
  const [parametresUrl, setParametresUrl] = useSearchParams()
  const [dateVague, setDateVague] = useState<string | null>(null)

  /* Date de démarrage de la prochaine vague de cours collectifs, affichée sur la carte Collectif
     (demande 6 du 2026-10-08). Elle est lue directement dans les vagues que l'administration gère
     déjà (« Cours collectifs »), via une fonction `security definer` qui ne renvoie que cette
     date : pas de seconde date à ressaisir ailleurs, et la table des vagues reste fermée au
     public. Une erreur ici n'est pas remontée à l'écran — c'est une information d'appoint, la
     page doit s'afficher sans elle. */
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

  /* La page publique est la seule de l'application à interdire le défilement du document : la
     classe est posée sur <body> le temps de l'afficher, et retirée en quittant pour ne pas
     bloquer les espaces connectés. */
  useEffect(() => {
    document.body.classList.add('sans-defilement')
    return () => document.body.classList.remove('sans-defilement')
  }, [])

  /* `?reserver=1` ouvre directement la fenêtre de réservation à l'arrivée sur la page — demande
     client du 2026-10-05 : un prospect qui tombe sur l'écran de connexion (réservé aux personnes
     déjà inscrites) est renvoyé ici avec ce paramètre, pour retrouver en un clic le bouton
     « Commencer » qu'il cherchait, sans avoir à le repérer lui-même dans la page. Le paramètre
     est retiré de l'URL une fois lu, pour qu'un rafraîchissement de la page ne rouvre pas la
     fenêtre tout seul. */
  useEffect(() => {
    if (parametresUrl.get('reserver') !== '1') return
    setReservation('individuel')
    parametresUrl.delete('reserver')
    setParametresUrl(parametresUrl, { replace: true })
  }, [parametresUrl, setParametresUrl])

  /* `?vue=programmes` ouvre la page directement sur l'onglet demandé — l'écran de connexion y
     renvoie le visiteur qui n'a pas de compte, pour qu'il arrive sur les formules de cours plutôt
     que sur l'accueil, où il devrait les chercher. Liste blanche : la valeur vient de l'URL et
     alimente un état de navigation. */
  useEffect(() => {
    const demandee = parametresUrl.get('vue')
    if (!demandee) return
    /* `tarifs` n'est plus une vue depuis la fusion du 2026-10-08, mais reste accepté : les liens
       déjà partagés vers l'ancienne page Tarifs doivent arriver sur la page fusionnée plutôt que
       sur l'accueil (demande 4, « l'ancienne adresse renvoie automatiquement vers la nouvelle »). */
    const cible = demandee === 'tarifs' ? 'programmes' : demandee
    const connues: Vue[] = ['accueil', 'programmes', 'professeurs', 'avis', 'temoignages']
    if (connues.includes(cible as Vue)) setVue(cible as Vue)
    parametresUrl.delete('vue')
    setParametresUrl(parametresUrl, { replace: true })
  }, [parametresUrl, setParametresUrl])

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

  function ouvrirReservation(type: TypeProgrammeProspect = 'individuel') {
    setReservation(type)
  }

  /* Refonte visuelle du 2026-09-29 : l'accueil n'est plus une image qui dessinait sa propre barre
     de navigation, mais une page HTML (voir HeroPublic.tsx). L'en-tête ci-dessous s'affiche donc
     désormais sur TOUTES les vues, avec exactement les entrées qu'avait la barre dessinée : logo,
     cinq liens, « Devenir professeur chez HOC », « Se connecter » et « Réserver mon appel » —
     le même contenu partout, pour que rien ne bouge d'une vue à l'autre. Le pied de page légal
     reste propre aux vues secondaires. */
  const accueil = vue === 'accueil'

  return (
    <div className={`page-claire page-unique${accueil ? ' page-unique--accueil' : ' page-unique--secondaire'}`}>
      <header className="en-tete-public">
        <button type="button" onClick={() => setVue('accueil')} className="bloc-logo" aria-label={`Accueil ${etablissement.nom}`}>
          <img src="/logo-hoc.png" alt={etablissement.nom} style={{ height: 42, width: 'auto', display: 'block' }} />
          {etablissement.specialite && <span className="baseline-logo">{etablissement.specialite}</span>}
        </button>

        <nav className="nav-publique">
          {ENTREES.map((entree) => (
            <button
              key={entree.vue}
              type="button"
              onClick={() => setVue(entree.vue)}
              className="lien-nav-public"
              aria-current={vue === entree.vue ? 'page' : undefined}
            >
              {entree.libelle}
            </button>
          ))}
        </nav>

        <div className="actions-publiques">
          {/* Libellé explicite plutôt que « Rejoignez-nous ! » (demande client du 2026-09-29) :
              la destination (candidature formateur) est la même, seul le texte change. */}
          <a href="/rejoignez-nous" className="lien-rejoindre">
            Devenir professeur chez HOC
          </a>
          <a href="/connexion" className="bouton-connexion">
            <span className="bouton-connexion-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            Se connecter
          </a>
          {/* Présent sur TOUTES les vues, accueil compris (demande client du 2026-09-29) : absent
              de l'accueil, il faisait bouger tous les éléments de la barre au passage d'une vue
              à l'autre. Même fenêtre que « Commencer maintenant ». */}
          <button type="button" onClick={() => ouvrirReservation()} className="btn-shine bouton-reserver-public">
            Réserver mon appel →
          </button>
        </div>
      </header>

      <main className="corps-unique">
        {vue === 'accueil' && (
          <HeroPublic
            nomEtablissement={etablissement.nom}
            onReserver={() => ouvrirReservation()}
            onNaviguer={(cible) => setVue(cible)}
          />
        )}
        {vue === 'programmes' && (
          <VueProgrammes
            accent={accent}
            onReserver={ouvrirReservation}
            tarifs={tarifs}
            prochaineVague={prochaineVague}
          />
        )}
        {vue === 'professeurs' && (
          <VueProfesseurs
            dossierAssets={dossierAssets}
            accent={accent}
            onReserver={() => ouvrirReservation()}
          />
        )}
        {vue === 'temoignages' && <VueTemoignages dossierAssets={dossierAssets} />}
        {vue === 'avis' && <VueAvis dossierAssets={dossierAssets} />}
      </main>

      {/* Bande légale : les liens de confidentialité et de conditions d'utilisation exigés par
          Google pour l'accès Calendar vivent ici, sur les quatre vues secondaires. L'accueil n'en
          porte pas, la maquette n'en dessinant aucun. */}
      {!accueil && (
      <footer className="pied-unique">
        <span>© 2026 {etablissement.nom}</span>
        <span style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <a href="/confidentialite">Confidentialité</a>
          <a href="/conditions-utilisation">Conditions d’utilisation</a>
          <a href="/rejoignez-nous">Devenir formateur</a>
          <a href="/plateforme/etablissements">Admin plateforme</a>
        </span>
      </footer>
      )}

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
