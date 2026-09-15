import { useEffect, useRef, useState, type CSSProperties } from 'react'

/* Vue d'accueil : la maquette du client EST la page. Elle porte déjà sa barre de navigation, ses
   deux boutons d'en-tête, son bouton « Commencer maintenant » et sa barre de bénéfices — on n'en
   redessine donc aucun en HTML par-dessus (demande client du 2026-09-15 : « pas de redondance, il
   me faut exactement la figure de l'image »). L'interactivité passe par des zones transparentes
   posées sur les éléments dessinés (voir ZONES) : ce que l'on voit est l'image, au pixel près, et
   ce que l'on clique est l'application.

   Corollaire dans LandingEtablissement.tsx : l'en-tête et le pied de page HTML sont masqués sur
   cette vue — ils feraient doublon avec la barre dessinée.

   L'image fait 1600 × 900 (16/9), le format d'un écran : elle couvre donc la fenêtre entière
   sans rien rogner dès que celle-ci est au même format. Hors de cette plage de proportions, on
   bascule en « contenir » — aucun élément ne doit disparaître — et l'espace restant est comblé
   par le PROLONGEMENT EN MIROIR des bords de l'image (voir Bande) : le décor se poursuit de
   lui-même, sans raccord visible, au lieu d'un aplat ou d'une copie floutée de toute la scène. */

const IMAGE = { largeur: 1600, hauteur: 900 }

/* Plage de proportions dans laquelle on peut couvrir l'écran sans amputer un élément.
   En deçà (fenêtre trop haute), le rognage latéral atteindrait le logo, à 7 % du bord gauche.
   Au-delà (fenêtre trop large), le rognage vertical mordrait sur la barre de navigation, à 2 % du
   bord supérieur, et sur la barre de bénéfices en bas. */
const RATIO_MIN_COUVERTURE = 1.564
const RATIO_MAX_COUVERTURE = 1.852

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

/* Comble l'espace laissé libre en rejouant les bords de l'image, retournés. Un miroir est continu
   par construction : le raccord au bord de la maquette est invisible, là où un dégradé laissait
   une couture. Le flou croît avec la largeur de la bande — étroite, elle ne reprend que le
   feuillage déjà hors focus du décor ; large, il faut effacer ce qu'elle rejouerait de la
   maquette elle-même (le logo est à 7 % du bord gauche). */
function Bande({
  cote,
  epaisseur,
  scene,
}: {
  cote: 'gauche' | 'droite' | 'haut' | 'bas'
  epaisseur: number
  scene: { largeur: number; hauteur: number }
}) {
  const horizontal = cote === 'gauche' || cote === 'droite'
  const flou = Math.min(40, Math.max(6, epaisseur * 0.12))

  return (
    <div
      aria-hidden
      className={`hero-bande hero-bande--${cote}`}
      style={
        horizontal
          ? { width: epaisseur, height: scene.hauteur }
          : { height: epaisseur, width: scene.largeur }
      }
    >
      <picture>
        <source srcSet="/hero-hoc.webp" type="image/webp" />
        <img
          src="/hero-hoc.png"
          alt=""
          className="hero-bande-image"
          style={{
            width: scene.largeur,
            height: scene.hauteur,
            /* Le bord retourné de l'image est collé contre celui de la maquette : la symétrie se
               fait exactement sur la couture, ce qui la fait disparaître. */
            [cote === 'gauche' ? 'left' : cote === 'droite' ? 'right' : 'left']: horizontal ? epaisseur : 0,
            [cote === 'haut' ? 'top' : cote === 'bas' ? 'bottom' : 'top']: horizontal ? 0 : epaisseur,
            transform: horizontal ? 'scaleX(-1)' : 'scaleY(-1)',
            transformOrigin: cote === 'gauche' ? 'left center' : cote === 'droite' ? 'right center' : cote === 'haut' ? 'center top' : 'center bottom',
            filter: `blur(${flou}px)`,
          }}
        />
      </picture>
    </div>
  )
}

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

      const ratio = width / height
      /* « Couvrir » remplit l'écran quitte à rogner, « contenir » montre tout quitte à laisser des
         bandes : on prend le premier tant qu'il ne coûte aucun élément de la maquette. */
      const couvrir = ratio >= RATIO_MIN_COUVERTURE && ratio <= RATIO_MAX_COUVERTURE
      const echelle = couvrir
        ? Math.max(width / IMAGE.largeur, height / IMAGE.hauteur)
        : Math.min(width / IMAGE.largeur, height / IMAGE.hauteur)

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

  /* Nulles dès que l'image couvre l'écran, c'est-à-dire dans le cas courant. */
  const bandeX = Math.max(0, Math.round(scene.gauche))
  const bandeY = Math.max(0, Math.round(scene.haut))

  return (
    <div ref={zoneRef} className="hero-plein">
      {scene.largeur > 0 && bandeX > 0 && (
        <>
          <Bande cote="gauche" epaisseur={bandeX} scene={scene} />
          <Bande cote="droite" epaisseur={bandeX} scene={scene} />
        </>
      )}
      {scene.largeur > 0 && bandeY > 0 && (
        <>
          <Bande cote="haut" epaisseur={bandeY} scene={scene} />
          <Bande cote="bas" epaisseur={bandeY} scene={scene} />
        </>
      )}

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
              left: `${(x / IMAGE.largeur) * 100}%`,
              top: `${(y / IMAGE.hauteur) * 100}%`,
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
