import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/* Vue d'accueil : reprend la maquette du client telle quelle (titre, script manuscrit, coches,
   pile de livres avec leurs intitulés, décor de fond, badges) comme UNE SEULE image, plutôt que
   de recomposer chaque détail en HTML. Demande client du 2026-09-15 : « il faut que l'image soit
   calquée exactement ».

   L'image est STATIQUE : plus aucune inclinaison 3D au survol ni calque flouté derrière elle
   (demande client du 2026-09-15). Elle remplit désormais tout le cadre, à la manière d'un
   `object-fit: cover` — c'était la demande la plus appuyée du client : aucune bande de fond, ni
   en haut, ni en bas, ni sur les côtés.

   Couvrir un écran 16/9 avec une image au ratio 2.34 impose forcément un rognage horizontal :
   on rogne TOUJOURS par la droite (image calée à gauche, voir recalculer), pour ne jamais
   entamer la colonne de texte « Apprenez l'anglais à votre rythme » ni son bouton. Les trois
   badges dessinés à l'extrême droite de l'image (Confiance / Opportunités / Avenir global)
   sortent donc du cadre : ils sont remplacés par de vrais raccourcis HTML (voir RACCOURCIS),
   posés au bord droit de l'écran et habillés comme les pastilles violettes de la maquette pour
   rester en harmonie avec le décor. PART_VISIBLE_MAX garantit qu'ils sont rognés même sur un
   écran très large, pour qu'on ne voie jamais les pastilles dessinées EN PLUS des vraies. */

const RATIO_IMAGE = 1365 / 584

/* Fraction maximale de la largeur de l'image qui peut rester visible. Elle coupe net avant tout
   le décor de droite : les badges dessinés (vers 0.86 dans le fichier source), qui feraient
   doublon avec les raccourcis HTML posés par-dessus, mais aussi la carte « Progression / Level
   B1 » juste avant eux, qu'un cadrage plus large laisserait tranchée en deux — un élément
   flottant coupé au milieu se lit comme un bug, pas comme un cadrage.

   C'est presque exactement le cadrage qu'impose déjà un écran 16/9 : le rendu reste donc le même
   d'un format à l'autre, seul le rognage vertical varie. */
const PART_VISIBLE_MAX = 0.762

/* Part du rognage vertical prélevée en haut (le reste l'est en bas). 0.5 centrerait l'image ;
   on garde volontairement le haut presque intact pour préserver le script manuscrit « Your
   English, Your Future », qui frôle le bord supérieur, et sacrifier plutôt le bas de la pile de
   livres. N'a d'effet que sur les écrans très larges, seuls à imposer un rognage vertical. */
const ANCRE_VERTICALE = 0.15

/* Rectangle du bouton « Commencer maintenant » sur l'image source, en fraction de sa largeur et
   hauteur. Volontairement un peu plus grand que la mesure exacte du bouton d'origine : le but est
   de le recouvrir ENTIÈREMENT (lui et son ombre portée), pas de l'égaler au pixel près — un
   rectangle trop juste laissait dépasser des coins violets de l'ancien bouton. */
const BOUTON = { gauche: 0.03, haut: 0.552, largeur: 0.215, hauteur: 0.11, rotation: -3.5 }

/* En dessous de cette largeur (le même point de bascule que la feuille de style), couvrir toute la
   hauteur reviendrait à n'afficher qu'un cinquième de la largeur de l'image : le titre lui-même
   sortirait du cadre. L'image devient donc une bande en haut de la zone, dimensionnée par la seule
   largeur, et les raccourcis descendent sous elle (voir .hero-raccourcis en media query). */
const SEUIL_MOBILE = 820
const PART_VISIBLE_MOBILE = 0.40

export type VueRaccourci = 'programmes' | 'tarifs' | 'professeurs' | 'avis'

/* Les trois pastilles violettes remplacent mot pour mot celles dessinées dans la maquette
   (Confiance → Programme, Opportunités → Tarifs, Avenir global → Professeurs) et ouvrent la vue
   correspondante. Avis n'est pas ici : il vit dans le badge « Certifié » vert juste en dessous. */
const RACCOURCIS: { vue: VueRaccourci; libelle: string; icone: ReactNode }[] = [
  { vue: 'programmes', libelle: 'Programme', icone: <IconeProgramme /> },
  { vue: 'tarifs', libelle: 'Tarifs', icone: <IconeTarifs /> },
  { vue: 'professeurs', libelle: 'Professeurs', icone: <IconeProfesseurs /> },
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
  const [cadre, setCadre] = useState({ largeur: 0, hauteur: 0, haut: 0 })

  useEffect(() => {
    const zone = zoneRef.current
    if (!zone) return

    function recalculer() {
      const { width, height } = zone!.getBoundingClientRect()

      if (width <= SEUIL_MOBILE) {
        const largeur = width / PART_VISIBLE_MOBILE
        setCadre({ largeur, hauteur: largeur / RATIO_IMAGE, haut: 0 })
        return
      }

      /* Deux contraintes, on garde la plus exigeante : montrer au plus PART_VISIBLE_MAX de la
         largeur de l'image, et couvrir toute la hauteur du cadre. Le résultat déborde donc
         toujours du cadre (sur la droite, sur la hauteur, ou les deux) — c'est ce débordement,
         rogné par l'overflow du conteneur, qui garantit l'absence de bande vide. */
      const largeur = Math.max(width / PART_VISIBLE_MAX, height * RATIO_IMAGE)
      const hauteur = largeur / RATIO_IMAGE
      setCadre({ largeur, hauteur, haut: (height - hauteur) * ANCRE_VERTICALE })
    }

    recalculer()
    const observateur = new ResizeObserver(recalculer)
    observateur.observe(zone)
    return () => observateur.disconnect()
  }, [])

  return (
    <div
      ref={zoneRef}
      className="hero-image-zone"
      /* Publiée en variable CSS pour que la media query mobile puisse caler les raccourcis juste
         sous la bande d'image, dont la hauteur n'est connue qu'ici. */
      style={{ '--hauteur-image': `${cadre.hauteur}px` } as CSSProperties}
    >
      <picture>
        <source srcSet="/hero-maquette.webp" type="image/webp" />
        <img
          src="/hero-maquette.jpg"
          alt={`${nomEtablissement} — apprenez l’anglais à votre rythme : cours interactifs, professeurs passionnés, 100 % en ligne`}
          className="hero-image"
          fetchPriority="high"
          style={{ width: cadre.largeur, height: cadre.hauteur, top: cadre.haut }}
        />
      </picture>

      {cadre.largeur > 0 && (
        <button
          type="button"
          onClick={onReserver}
          className="bouton-hero-image"
          style={{
            left: cadre.largeur * BOUTON.gauche,
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

      {/* Colonne de raccourcis calée sur le bord droit de l'ÉCRAN (et non sur un point de l'image,
          dont la partie droite est rognée) : c'est la seule position qui tienne quelle que soit la
          forme du cadre. Elle reprend l'habillage des pastilles de la maquette — dégradé violet,
          contour blanc translucide, icône en médaillon — pour se fondre dans le décor. */}
      <nav className="hero-raccourcis" aria-label="Découvrir">
        {RACCOURCIS.map((raccourci) => (
          <button key={raccourci.vue} type="button" className="hero-pastille" onClick={() => onNaviguer(raccourci.vue)}>
            <span className="hero-pastille-medaillon" aria-hidden>
              {raccourci.icone}
            </span>
            {raccourci.libelle}
          </button>
        ))}

        {/* Badge de certification : posé sous les pastilles, donc sur le décor et jamais sur un
            texte de la maquette. Il porte aussi l'accès aux avis (demande client du 2026-09-15 :
            « déplace Avis et ses fonctionnalités dans le badge »). Vert, seule couleur hors charte
            de la page : c'est ce qui lui donne sa valeur de label. */}
        <button type="button" className="hero-badge-certifie" onClick={() => onNaviguer('avis')}>
          <span className="hero-badge-medaillon" aria-hidden>
            <IconeCertifie />
          </span>
          <span className="hero-badge-textes">
            <span className="hero-badge-surtitre">Certifié</span>
            <span className="hero-badge-titre">Avis</span>
          </span>
        </button>
      </nav>
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

function IconeProgramme() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v13H5.5A1.5 1.5 0 0 0 4 18.5Z" />
      <path d="M4 18.5A1.5 1.5 0 0 1 5.5 20H19" />
      <path d="M8.5 8.5h6M8.5 12h4" />
    </svg>
  )
}

function IconeTarifs() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12.6 3.5H20v7.4l-8.7 8.7a1.6 1.6 0 0 1-2.3 0l-5.1-5.1a1.6 1.6 0 0 1 0-2.3Z" />
      <circle cx="16.3" cy="7.7" r="1.4" />
    </svg>
  )
}

function IconeProfesseurs() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9.5" cy="8" r="3.2" />
      <path d="M3.5 19.5c0-3.1 2.7-5.2 6-5.2s6 2.1 6 5.2" />
      <path d="M16.2 5.4a3.2 3.2 0 0 1 0 6M17.6 14.8c2 .7 3.4 2.4 3.4 4.7" />
    </svg>
  )
}

function IconeCertifie() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2.6l2.4 1.8 3-.2.9 2.9 2.5 1.7-1.2 2.7 1.2 2.7-2.5 1.7-.9 2.9-3-.2L12 20.6l-2.4-1.8-3 .2-.9-2.9L3.2 14.4l1.2-2.7-1.2-2.7 2.5-1.7.9-2.9 3 .2Z" />
      <path d="M8.8 11.9l2.2 2.2 4.2-4.3" />
    </svg>
  )
}
