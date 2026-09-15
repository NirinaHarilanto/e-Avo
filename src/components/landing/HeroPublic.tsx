import { useEffect, useRef, useState } from 'react'

/* Vue d'accueil : reprend la maquette du client telle quelle (titre, script manuscrit, coches,
   pile de livres avec leurs intitulés, décor de fond, badges) comme UNE SEULE image, plutôt que
   de recomposer chaque détail en HTML. Demande client du 2026-09-15 : « il faut que l'image soit
   calquée exactement », et que cette image « couvre totalement la page ».

   L'image remplit donc toute la zone (object-fit: cover calculé à la main, ancré en haut à
   gauche) : aucune bande de fond visible autour d'elle, contrairement à la version précédente en
   « contain » qui laissait des marges. L'ancrage en haut-gauche est volontaire — si la forme de
   l'écran oblige à rogner l'image, ce doit être le décor de droite (avion, statue) ou le bas
   (bureau) qui en fait les frais, jamais la colonne de texte ni le bouton, tous deux à gauche.

   La barre de navigation est une vraie surimpression translucide (voir LandingEtablissement.tsx)
   posée sur l'image plutôt qu'une bande blanche opaque séparée : elle s'intègre visuellement au
   décor au lieu de lui voler de la hauteur. La barre d'atouts qui vivait sous l'image a été
   retirée : elle répétait exactement ce que dit déjà le paragraphe d'accroche de l'image
   elle-même (« cours interactifs, professeurs passionnés »). */

const RATIO_IMAGE = 1365 / 584

/* Rectangle du bouton « Commencer maintenant » sur l'image source, en fraction de sa largeur et
   hauteur (mesuré au pixel près sur le fichier fourni). Réduit et légèrement incliné par rapport
   à la première version : trop grand, il débordait sur les coches de garantie juste en dessous —
   la maquette elle-même le montre plus petit et légèrement penché (rendu 3D). */
const BOUTON = { gauche: 0.04, haut: 0.564, largeur: 0.195, hauteur: 0.086, rotation: -3.5 }

export function HeroPublic({
  nomEtablissement,
  onReserver,
}: {
  nomEtablissement: string
  onReserver: () => void
}) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const [cadre, setCadre] = useState({ gauche: 0, haut: 0, largeur: 0, hauteur: 0 })

  useEffect(() => {
    const zone = zoneRef.current
    if (!zone) return

    function recalculer() {
      const { width, height } = zone!.getBoundingClientRect()
      const ratioZone = width / height
      // Équivalent d'un `object-fit: cover`, mais ancré en haut à gauche plutôt que centré : le
      // rognage (inévitable dès que la forme de l'écran diffère de celle de l'image) ne doit
      // jamais entamer la colonne de texte ni le bouton, tous deux dans le coin haut-gauche.
      if (ratioZone < RATIO_IMAGE) {
        const largeur = height * RATIO_IMAGE
        setCadre({ gauche: 0, haut: 0, largeur, hauteur: height })
      } else {
        const hauteur = width / RATIO_IMAGE
        setCadre({ gauche: 0, haut: 0, largeur: width, hauteur })
      }
    }

    recalculer()
    const observateur = new ResizeObserver(recalculer)
    observateur.observe(zone)
    return () => observateur.disconnect()
  }, [])

  return (
    <div ref={zoneRef} className="hero-image-zone">
      <picture>
        <source srcSet="/hero-maquette.webp" type="image/webp" />
        <img
          src="/hero-maquette.jpg"
          alt={`${nomEtablissement} — apprenez l’anglais à votre rythme : cours interactifs, professeurs passionnés, 100 % en ligne`}
          className="hero-image"
          fetchPriority="high"
          style={{ left: cadre.gauche, top: cadre.haut, width: cadre.largeur, height: cadre.hauteur }}
        />
      </picture>

      {cadre.largeur > 0 && (
        <button
          type="button"
          onClick={onReserver}
          className="bouton-hero-image"
          style={{
            left: cadre.gauche + cadre.largeur * BOUTON.gauche,
            top: cadre.haut + cadre.hauteur * BOUTON.haut,
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
