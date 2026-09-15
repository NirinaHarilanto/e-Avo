import { useEffect, useRef, useState, type MouseEvent } from 'react'

/* Vue d'accueil : reprend la maquette du client telle quelle (titre, script manuscrit, coches,
   pile de livres avec leurs intitulés, décor de fond, badges) comme UNE SEULE image, plutôt que
   de recomposer chaque détail en HTML. Demande client du 2026-09-15 : « il faut que l'image soit
   calquée exactement ».

   Le cadrage montre TOUJOURS la largeur entière de l'image (jamais rognée sur les côtés) : les
   badges Confiance/Opportunités/Avenir global et la statue, à l'extrême droite, doivent rester
   visibles — quitte à afficher les deux élèves un peu plus petits que si l'image était zoomée
   pour remplir toute la hauteur disponible. Un rognage horizontal aurait aussi l'effet indésirable
   d'agrandir les petits éléments (bulle "Live Class") au-delà de la définition du fichier source,
   les rendant flous ; les montrer à une échelle plus proche de 1:1 les garde nets.

   La barre de navigation est une vraie surimpression translucide (voir LandingEtablissement.tsx)
   posée sur l'image plutôt qu'une bande blanche opaque séparée. La légère inclinaison 3D au
   survol (voir surProfondeur) répond à la demande du client de donner une impression de
   profondeur au décor. */

const RATIO_IMAGE = 1365 / 584

/* Rectangle du bouton « Commencer maintenant » sur l'image source, en fraction de sa largeur et
   hauteur. Volontairement un peu plus grand que la mesure exacte du bouton d'origine : le but est
   de le recouvrir ENTIÈREMENT (lui et son ombre portée), pas de l'égaler au pixel près — un
   rectangle trop juste laissait dépasser des coins violets de l'ancien bouton. */
const BOUTON = { gauche: 0.03, haut: 0.552, largeur: 0.215, hauteur: 0.11, rotation: -3.5 }

/* Amplitude maximale de l'inclinaison 3D au survol, en degrés. Volontairement discrète : l'effet
   doit se sentir, pas donner le mal de mer. */
const INCLINAISON_MAX = 3.5

export function HeroPublic({
  nomEtablissement,
  onReserver,
}: {
  nomEtablissement: string
  onReserver: () => void
}) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const [cadre, setCadre] = useState({ largeur: 0, hauteur: 0 })
  const [inclinaison, setInclinaison] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const zone = zoneRef.current
    if (!zone) return

    function recalculer() {
      const { width, height } = zone!.getBoundingClientRect()
      // Toujours la largeur entière de l'image ; si cela dépasse la hauteur disponible (écran
      // très large et peu haut), on retombe sur la hauteur entière — cas rare, mais qui évite un
      // débordement du bas de l'image hors de sa zone.
      const hauteurSiPleineLargeur = width / RATIO_IMAGE
      if (hauteurSiPleineLargeur <= height) {
        setCadre({ largeur: width, hauteur: hauteurSiPleineLargeur })
      } else {
        setCadre({ largeur: height * RATIO_IMAGE, hauteur: height })
      }
    }

    recalculer()
    const observateur = new ResizeObserver(recalculer)
    observateur.observe(zone)
    return () => observateur.disconnect()
  }, [])

  /* Parallaxe légère : l'image s'incline dans la direction du curseur, comme un panneau vu en
     perspective — c'est ce qui donne l'impression de profondeur demandée, un simple aplat 2D ne
     réagissant jamais au passage de la souris. */
  function surMouvement(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / rect.width - 0.5
    const relY = (e.clientY - rect.top) / rect.height - 0.5
    setInclinaison({ x: relY * -2 * INCLINAISON_MAX, y: relX * 2 * INCLINAISON_MAX })
  }
  function surSortie() {
    setInclinaison({ x: 0, y: 0 })
  }

  return (
    <div
      ref={zoneRef}
      className="hero-image-zone"
      onMouseMove={surMouvement}
      onMouseLeave={surSortie}
    >
      {/* Fond flouté : la même image, très agrandie et floutée, remplit tout le cadre derrière la
          version nette. Sans lui, montrer l'image entière en largeur (donc jamais rognée) laisse
          un bandeau de fond de page vide sous elle dès que l'écran est plus haut que large par
          rapport à l'image — repéré à la fois par le client et par une autre session travaillant
          sur ce même projet le 2026-09-15. Le flou reprend les couleurs de la scène plutôt qu'un
          aplat arbitraire, et le contraste net/flou entre les deux couches est aussi ce qui vend
          l'impression de profondeur demandée : rester immobile pendant que le premier plan
          s'incline au survol (voir .hero-profondeur) évoque un vrai arrière-plan photographique. */}
      <picture aria-hidden className="hero-fond-flou">
        <source srcSet="/hero-maquette.webp" type="image/webp" />
        <img src="/hero-maquette.jpg" alt="" />
      </picture>

      <div
        className="hero-profondeur"
        style={{ transform: `perspective(1400px) rotateX(${inclinaison.x}deg) rotateY(${inclinaison.y}deg)` }}
      >
        <picture>
          <source srcSet="/hero-maquette.webp" type="image/webp" />
          <img
            src="/hero-maquette.jpg"
            alt={`${nomEtablissement} — apprenez l’anglais à votre rythme : cours interactifs, professeurs passionnés, 100 % en ligne`}
            className="hero-image"
            fetchPriority="high"
            style={{ width: cadre.largeur, height: cadre.hauteur }}
          />
        </picture>

        {cadre.largeur > 0 && (
          <button
            type="button"
            onClick={onReserver}
            className="bouton-hero-image"
            style={{
              left: cadre.largeur * BOUTON.gauche,
              top: cadre.hauteur * BOUTON.haut,
              width: cadre.largeur * BOUTON.largeur,
              height: cadre.hauteur * BOUTON.hauteur,
              fontSize: Math.max(9, cadre.largeur * 0.0078),
              transform: `rotate(${BOUTON.rotation}deg)`,
            }}
          >
            <IconeFusee />
            Réserve ton appel gratuitement
            <span aria-hidden>→</span>
          </button>
        )}
      </div>
    </div>
  )
}

function IconeFusee() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M12 2.5c3.5 2.2 5.5 6 5.5 10l-2.6 3.2h-5.8L6.5 12.5c0-4 2-7.8 5.5-10Z" />
      <circle cx="12" cy="10" r="1.9" />
      <path d="M9.2 17.2 7 21l4-1.4M14.8 17.2 17 21l-4-1.4" />
    </svg>
  )
}
