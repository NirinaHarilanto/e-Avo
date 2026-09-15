import { useEffect, useRef, useState, type CSSProperties } from 'react'

/* Vue d'accueil : la maquette du client EST la page. Elle porte déjà sa barre de navigation, ses
   deux boutons d'en-tête, son bouton « Commencer maintenant » et sa barre de bénéfices — on n'en
   redessine donc aucun en HTML par-dessus (demande client du 2026-09-15 : « pas de redondance, il
   me faut exactement la figure de l'image »). L'interactivité passe par des zones transparentes
   posées sur les éléments dessinés (voir ZONES) : ce que l'on voit est l'image, au pixel près, et
   ce que l'on clique est l'application.

   Corollaire dans LandingEtablissement.tsx : l'en-tête et le pied de page HTML sont masqués sur
   cette vue — ils feraient doublon avec la barre dessinée.

   L'image source a été ÉLARGIE hors ligne (1600 × 900 → 2200 × 1600) en prolongeant son décor
   vers l'extérieur : les derniers pixels de bokeh s'y perdent en flou, sans aucun miroir ni motif
   rejoué (voir le commentaire de MAQUETTE). Cette marge est ce qui permet aux bords de l'image de
   coïncider avec ceux de l'écran quelle que soit sa forme — demande client du 2026-09-15 — sans
   jamais rogner la maquette ni la déformer : c'est la marge qu'on sacrifie au recadrage, pas le
   contenu. Il n'y a donc plus rien à combler, et plus de bandes en miroir. */

const IMAGE = { largeur: 2200, hauteur: 1600 }

/* Position de la maquette d'origine dans l'image élargie. Tout le reste est du décor prolongé,
   sacrifiable au recadrage. Les coordonnées des zones cliquables (ZONES) restent exprimées dans
   le repère de la maquette d'origine — celui où elles ont été mesurées — et sont décalées d'ici
   au moment du rendu. */
const MAQUETTE = { gauche: 300, haut: 350, largeur: 1600, hauteur: 900 }

export type VueRaccourci = 'accueil' | 'programmes' | 'tarifs' | 'professeurs' | 'avis'

type Action = { type: 'vue'; vue: VueRaccourci } | { type: 'reserver' } | { type: 'connexion' }

/* Rectangles des éléments dessinés, en pixels de l'image source — mesurés directement sur le
   fichier. Volontairement un peu plus larges que le texte qu'ils recouvrent : ils sont
   invisibles, donc mieux vaut une cible confortable qu'un calage au pixel près. */
const ZONES: { cle: string; libelle: string; boite: [number, number, number, number]; action: Action }[] = [
  { cle: 'logo', libelle: 'Hari Online Club, retour à l’accueil', boite: [115, 18, 140, 80], action: { type: 'vue', vue: 'accueil' } },
  { cle: 'accueil', libelle: 'Accueil', boite: [349, 31, 74, 32], action: { type: 'vue', vue: 'accueil' } },
  { cle: 'cours', libelle: 'Cours', boite: [459, 31, 65, 32], action: { type: 'vue', vue: 'programmes' } },
  { cle: 'professeurs', libelle: 'Professeurs', boite: [557, 31, 99, 32], action: { type: 'vue', vue: 'professeurs' } },
  { cle: 'tarifs', libelle: 'Tarifs', boite: [689, 31, 58, 32], action: { type: 'vue', vue: 'tarifs' } },
  /* L'application n'a pas de page « À propos » : la vue Avis est ce qui s'en approche le plus —
     ce que l'établissement est, raconté par ses élèves. */
  { cle: 'apropos', libelle: 'À propos', boite: [780, 31, 82, 32], action: { type: 'vue', vue: 'avis' } },
  { cle: 'connexion', libelle: 'Se connecter', boite: [1187, 27, 136, 37], action: { type: 'connexion' } },
  /* S'inscrire et Commencer maintenant ouvrent la même modale : dans ce parcours, s'inscrire
     commence par réserver l'appel diagnostic. */
  { cle: 'inscription', libelle: 'S’inscrire', boite: [1337, 27, 155, 37], action: { type: 'reserver' } },
  { cle: 'commencer', libelle: 'Commencer maintenant', boite: [69, 483, 308, 64], action: { type: 'reserver' } },
]

export function HeroPublic({
  nomEtablissement,
  onReserver,
  onNaviguer,
}: {
  nomEtablissement: string
  onReserver: () => void
  onNaviguer: (vue: VueRaccourci) => void
}) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState({ largeur: 0, hauteur: 0, gauche: 0, haut: 0 })

  useEffect(() => {
    const zone = zoneRef.current
    if (!zone) return

    function recalculer() {
      const { width, height } = zone!.getBoundingClientRect()
      if (!width || !height) return

      /* Deux échelles de référence :
         — `entiere` : la plus grande qui laisse la maquette d'origine entièrement visible ;
         — `couvrante` : la plus petite qui remplit l'écran avec l'image élargie.
         Grâce à la marge de décor, `couvrante` est la plus petite des deux sur tout écran en
         paysage : on prend alors `entiere`, qui montre toute la maquette ET remplit l'écran. */
      const entiere = Math.min(width / MAQUETTE.largeur, height / MAQUETTE.hauteur)
      const couvrante = Math.max(width / IMAGE.largeur, height / IMAGE.hauteur)

      /* Les deux ne peuvent plus être satisfaites qu'aux proportions extrêmes. Au-delà (écran
         très large), on privilégie le remplissage : le rognage n'entame la maquette que de
         quelques pixels de marge. En portrait, on privilégie au contraire la maquette entière —
         la faire tenir en largeur y couperait tout le contenu, ce qui n'aurait aucun sens. */
      const paysage = width >= height
      const echelle = couvrante <= entiere ? entiere : paysage ? couvrante : entiere

      const largeur = IMAGE.largeur * echelle
      const hauteur = IMAGE.hauteur * echelle
      setScene({ largeur, hauteur, gauche: (width - largeur) / 2, haut: (height - hauteur) / 2 })
    }

    recalculer()
    const observateur = new ResizeObserver(recalculer)
    observateur.observe(zone)
    return () => observateur.disconnect()
  }, [])

  function declencher(action: Action) {
    if (action.type === 'reserver') onReserver()
    else if (action.type === 'vue') onNaviguer(action.vue)
  }

  return (
    <div ref={zoneRef} className="hero-plein">
      <div
        className="hero-scene"
        style={{ width: scene.largeur, height: scene.hauteur, left: scene.gauche, top: scene.haut }}
      >
        <picture>
          <source srcSet="/hero-hoc.webp" type="image/webp" />
          <img
            src="/hero-hoc.png"
            alt={`${nomEtablissement} — apprenez l’anglais à votre rythme : cours interactifs, professeurs passionnés, 100 % en ligne`}
            className="hero-image"
            fetchPriority="high"
            draggable={false}
          />
        </picture>

        {/* Zones transparentes : l'élément cliquable est dessiné dans l'image, pas ici. Le libellé
            n'est donc lisible que par les lecteurs d'écran — d'où aria-label plutôt qu'un texte. */}
        {scene.largeur > 0 &&
          ZONES.map((zone) => {
            const [x, y, l, h] = zone.boite
            const style: CSSProperties = {
              left: `${((MAQUETTE.gauche + x) / IMAGE.largeur) * 100}%`,
              top: `${((MAQUETTE.haut + y) / IMAGE.hauteur) * 100}%`,
              width: `${(l / IMAGE.largeur) * 100}%`,
              height: `${(h / IMAGE.hauteur) * 100}%`,
            }
            return zone.action.type === 'connexion' ? (
              <a key={zone.cle} href="/connexion" className="hero-zone" style={style} aria-label={zone.libelle} />
            ) : (
              <button
                key={zone.cle}
                type="button"
                className="hero-zone"
                style={style}
                aria-label={zone.libelle}
                onClick={() => declencher(zone.action)}
              />
            )
          })}
      </div>
    </div>
  )
}
