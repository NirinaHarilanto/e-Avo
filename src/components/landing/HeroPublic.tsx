import type { ReactNode } from 'react'

/* Vue d'accueil, tenant dans un seul écran : aucune barre de défilement, l'illustration couvre
   toute la moitié droite jusqu'aux bords. Le texte de la maquette est reconstruit en HTML plutôt
   que repris en image — sans quoi il serait impossible d'en changer un mot, et un moteur de
   recherche ne lirait rien de la page. Chaque détail visuel de la maquette a son équivalent ici :
   le trait manuscrit sous « Your Future », la fusée du bouton, les coches rondes, les compétences
   empilées en escalier et les séparateurs de la barre d'atouts. */

const COMPETENCES: { libelle: string; fond: string; icone: ReactNode }[] = [
  { libelle: 'Speaking', fond: 'linear-gradient(135deg, #9b6bf5, #7038d4)', icone: <IconeMicro /> },
  { libelle: 'Listening', fond: 'linear-gradient(135deg, #7b6cf0, #4a3fd8)', icone: <IconeCasque /> },
  { libelle: 'Reading', fond: 'linear-gradient(135deg, #4f86e8, #2260c6)', icone: <IconeLivre /> },
  { libelle: 'Writing', fond: 'linear-gradient(135deg, #34b394, #128069)', icone: <IconeCrayon /> },
]

const ATOUTS: { icone: ReactNode; titre: string; detail: string }[] = [
  { icone: <IconeBulle />, titre: 'Cours interactifs', detail: 'et pratiques' },
  { icone: <IconeGroupe />, titre: 'Professeurs natifs', detail: 'et expérimentés' },
  { icone: <IconeCible />, titre: 'Un suivi personnalisé', detail: 'pour progresser vite' },
  { icone: <IconeEtoile />, titre: 'Une communauté', detail: 'motivée et bienveillante' },
]

const GARANTIES = ['100 % en ligne', 'Professeurs certifiés', 'Accès 24/7']

export const TEMOIGNAGES = [
  { initiales: 'AL', nom: 'A. L.', texte: 'Un vrai suivi, un professeur qui connaît mes objectifs semaine après semaine.' },
  { initiales: 'MK', nom: 'M. K.', texte: 'Les cours en petit groupe m’ont redonné confiance pour parler sans hésiter.' },
  { initiales: 'SB', nom: 'S. B.', texte: 'L’appel diagnostic a tout de suite posé un cap clair pour mes cours.' },
]

export function HeroPublic({
  nomEtablissement,
  onReserver,
}: {
  nomEtablissement: string
  onReserver: () => void
}) {
  return (
    <div className="vue-hero">
      <div className="hero-visuel" aria-hidden>
        <picture>
          <source srcSet="/hero-illustration.webp" type="image/webp" />
          <img src="/hero-illustration.jpg" alt="" fetchPriority="high" />
        </picture>
        <span className="hero-voile" />
      </div>

      <div className="hero-contenu">
        <span className="hero-badge arrive-text">Appels diagnostic ouverts cette semaine</span>

        <p className="bloc-manuscrit arrive-text">
          <span className="mention-manuscrite">
            Your English,
            <br />
            Your Future
          </span>
          {/* Le trait courbe tracé sous « Your Future » dans la maquette. */}
          <svg className="trait-manuscrit" viewBox="0 0 210 22" fill="none" aria-hidden>
            <path d="M3 13C38 4 120 2 178 9c12 1.5 22 4 27 8" stroke="#5a2fb5" strokeWidth="3.4" strokeLinecap="round" />
          </svg>
        </p>

        <h1 className="titre-hero arrive-text">
          Apprenez l’anglais
          <br />
          <span className="fragment-indigo">à votre </span>
          <span className="fragment-violet">rythme</span>
        </h1>

        <p className="arrive-text hero-accroche">
          Des cours interactifs, des professeurs passionnés et une expérience d’apprentissage unique.
          Rejoignez {nomEtablissement} dès aujourd’hui !
        </p>

        <button type="button" onClick={onReserver} className="bouton-hero arrive">
          <span className="fusee" aria-hidden>
            <IconeFusee />
          </span>
          Réserve ton appel gratuitement
          <span className="fleche-cercle" aria-hidden>
            →
          </span>
        </button>

        <div className="ligne-garanties">
          {GARANTIES.map((garantie) => (
            <span key={garantie} className="garantie">
              <span aria-hidden className="coche-garantie">
                ✓
              </span>
              {garantie}
            </span>
          ))}
        </div>

        {/* Empilées en escalier comme la pile de livres de la maquette, chacune décalée un peu
            plus à droite que la précédente. */}
        <ul className="pile-competences">
          {COMPETENCES.map((competence, index) => (
            <li
              key={competence.libelle}
              className="pastille-competence arrive"
              style={{
                background: competence.fond,
                marginLeft: index * 16,
                animationDelay: `${0.32 + index * 0.08}s`,
              }}
            >
              <span aria-hidden style={{ display: 'inline-flex' }}>{competence.icone}</span>
              {competence.libelle}
            </li>
          ))}
        </ul>
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

        {/* Avis conservés sur l'écran d'accueil, en version condensée : ils rassurent au moment
            du choix, et n'ont plus de section à eux depuis le passage en vue unique. */}
        <div className="hero-avis">
          {TEMOIGNAGES.map((temoignage) => (
            <div key={temoignage.nom} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <span aria-hidden style={{ fontSize: 10, letterSpacing: 1.5, color: '#6d3bd1' }}>★★★★★</span>
              <span className="avis-texte">« {temoignage.texte} »</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted-2)' }}>{temoignage.nom}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* Icônes dessinées à la main plutôt qu'importées : la bibliothèque du socle admin n'a ni micro,
   ni casque, ni crayon, et ajouter une dépendance d'icônes pour quatre pastilles serait cher
   payé. Même trait de 1.7 que le reste de l'application. */
const traits = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function IconeMicro() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...traits}>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </svg>
  )
}

function IconeCasque() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...traits}>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="2.5" y="13.5" width="4.5" height="7" rx="2" />
      <rect x="17" y="13.5" width="4.5" height="7" rx="2" />
    </svg>
  )
}

function IconeLivre() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...traits}>
      <path d="M12 6.5C10 4.8 7.5 4.2 4 4.5v13c3.5-.3 6 .3 8 2 2-1.7 4.5-2.3 8-2v-13c-3.5-.3-6 .3-8 2Z" />
      <path d="M12 6.5v13" />
    </svg>
  )
}

function IconeCrayon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...traits}>
      <path d="M4 20h4L19.5 8.5a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="M14.5 5.5l4 4" />
    </svg>
  )
}

function IconeFusee() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...traits}>
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
