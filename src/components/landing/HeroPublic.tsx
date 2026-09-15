import { useEffect, useRef, useState, type ReactNode } from 'react'

/* Vue d'accueil : reprend la maquette du client telle quelle (titre, script manuscrit, coches,
   pile de livres avec leurs intitulés, décor de fond, badges) comme UNE SEULE image, plutôt que
   de recomposer chaque détail en HTML — une reconstruction, même soignée, ne retombe jamais
   exactement sur l'original (polices, inclinaison, ombres, placement du décor). Demande client
   du 2026-09-15 : « il faut que l'image soit calquée exactement ».

   Seul le bouton doit rester un vrai bouton cliquable avec un nouveau libellé : il est posé en
   surimpression, à l'emplacement exact du bouton dessiné dans l'image (mesuré sur le fichier
   source, 1365×590 une fois la barre de navigation retirée), assez opaque pour recouvrir
   entièrement l'ancien texte. Sa position est recalculée à chaque redimensionnement plutôt que
   fixée en pourcentages CSS : l'image est affichée en « contain » (jamais rognée, pour ne perdre
   aucun détail), et seul du JavaScript peut suivre le rectangle réellement affiché quand ses
   proportions ne correspondent pas à celles de son cadre. */

const RATIO_IMAGE = 1365 / 590

/* Rectangle du bouton « Commencer maintenant » sur l'image source, en fraction de sa largeur et
   hauteur (mesuré au pixel près sur le fichier fourni). Une marge est ajoutée à la mesure exacte
   pour recouvrir aussi l'ombre portée du bouton d'origine. */
const BOUTON = { gauche: 0.038, haut: 0.478, largeur: 0.2, hauteur: 0.108 }

const ATOUTS: { icone: ReactNode; titre: string; detail: string }[] = [
  { icone: <IconeBulle />, titre: 'Cours interactifs', detail: 'et pratiques' },
  { icone: <IconeGroupe />, titre: 'Professeurs natifs', detail: 'et expérimentés' },
  { icone: <IconeCible />, titre: 'Un suivi personnalisé', detail: 'pour progresser vite' },
  { icone: <IconeEtoile />, titre: 'Une communauté', detail: 'motivée et bienveillante' },
]

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
      // Même calcul qu'un `object-fit: contain` : l'image occupe toute la largeur si elle est
      // proportionnellement plus « plate » que la zone, toute la hauteur sinon.
      if (ratioZone > RATIO_IMAGE) {
        const largeur = height * RATIO_IMAGE
        setCadre({ gauche: (width - largeur) / 2, haut: 0, largeur, hauteur: height })
      } else {
        const hauteur = width / RATIO_IMAGE
        setCadre({ gauche: 0, haut: (height - hauteur) / 2, largeur: width, hauteur })
      }
    }

    recalculer()
    const observateur = new ResizeObserver(recalculer)
    observateur.observe(zone)
    return () => observateur.disconnect()
  }, [])

  return (
    <div className="vue-hero">
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
              fontSize: Math.max(10, cadre.largeur * 0.0092),
            }}
          >
            <IconeFusee />
            Réserve ton appel gratuitement
            <span aria-hidden>→</span>
          </button>
        )}
      </div>

      <div className="hero-bandeau">
        <div className="hero-atouts">
          {ATOUTS.map((atout) => (
            <div key={atout.titre} className="atout">
              <span aria-hidden className="puce-atout">
                {atout.icone}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{atout.titre}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{atout.detail}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const traits = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function IconeFusee() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2.5c3.5 2.2 5.5 6 5.5 10l-2.6 3.2h-5.8L6.5 12.5c0-4 2-7.8 5.5-10Z" />
      <circle cx="12" cy="10" r="1.9" />
      <path d="M9.2 17.2 7 21l4-1.4M14.8 17.2 17 21l-4-1.4" />
    </svg>
  )
}

function IconeBulle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...traits}>
      <path d="M20.5 12.5c0 3.9-3.8 7-8.5 7-1 0-2-.15-2.9-.42L4 20.5l1.5-3.6A6.6 6.6 0 0 1 3.5 12.5c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7Z" />
      <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" strokeWidth="2.4" />
    </svg>
  )
}

function IconeGroupe() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...traits}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 19.5c0-3 2.7-5 6-5s6 2 6 5" />
      <path d="M16 6.2a3.2 3.2 0 0 1 0 6.1M17.5 15.2c2 .7 3.5 2.3 3.5 4.3" />
    </svg>
  )
}

function IconeCible() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...traits}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.6" />
      <circle cx="12" cy="12" r="1.2" strokeWidth="2.2" />
    </svg>
  )
}

function IconeEtoile() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...traits}>
      <path d="m12 3.5 2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.65l5.9-.85L12 3.5Z" />
    </svg>
  )
}
