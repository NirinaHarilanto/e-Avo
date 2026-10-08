import { useRef, type PointerEvent, type ReactNode } from 'react'
import { Scene3DHero } from './Scene3DHero'

/* Vue d'accueil (refonte visuelle du 2026-09-29, d'après les trois visuels de référence fournis
   par le client : mise en page « learning center » claire et violette, décor 3D animé).

   Jusqu'ici, l'accueil ÉTAIT une image : la maquette du client, texte compris, avec des zones
   cliquables invisibles posées dessus. Le contenu reste strictement le même — accroche, titre,
   paragraphe, bouton « Commencer maintenant », garanties, piliers, compétences, bénéfices — mais
   il est désormais écrit en HTML, ce qui le rend net à toute taille et lisible par les lecteurs
   d'écran. Seule l'illustration des deux élèves est reprise de la maquette, recadrée
   (public/hero-illustration.webp).

   La barre de navigation n'est plus dessinée ici : c'est celle de LandingEtablissement.tsx,
   commune à toutes les vues, qui s'affiche désormais aussi sur l'accueil.

   Les quatre cartes de bénéfices (demande client du 2026-09-29) renvoient chacune quelque part :
   Cours interactifs → Cours, Professeurs certifiés → Professeurs, Une communauté → À propos, Un
   suivi personnalisé → la même fenêtre de réservation que « Commencer maintenant ». */

const GARANTIES = ['100% en ligne', 'Professeurs certifiés', 'Accès 24/7']

const PILIERS: { libelle: string; icone: 'groupe' | 'mallette' | 'globe' }[] = [
  { libelle: 'Confiance', icone: 'groupe' },
  { libelle: 'Opportunités', icone: 'mallette' },
  { libelle: 'Avenir global', icone: 'globe' },
]

const COMPETENCES = ['Speaking', 'Listening', 'Reading', 'Writing']

/* Vue secondaire vers laquelle une carte de bénéfice renvoie, ou réservation (même fenêtre que
   « Commencer maintenant ») — demande client du 2026-09-29 : chaque carte doit mener quelque
   part plutôt que de rester décorative. */
type VueCible = 'programmes' | 'professeurs' | 'avis'
type ActionBenefice = { type: 'vue'; vue: VueCible } | { type: 'reserver' }

const BENEFICES: { titre: string; texte: string; icone: 'bulle' | 'groupe' | 'cible' | 'etoile'; action: ActionBenefice }[] = [
  { titre: 'Cours interactifs', texte: 'et pratiques', icone: 'bulle', action: { type: 'vue', vue: 'programmes' } },
  /* « certifiés » et non « natifs » (demande 2 du 2026-10-08) : les formateurs HOC sont des
     Malgaches diplômés/certifiés, pas des anglophones natifs — le mot « natifs » ne doit plus
     apparaître nulle part sur le site. */
  { titre: 'Professeurs certifiés', texte: 'et expérimentés', icone: 'groupe', action: { type: 'vue', vue: 'professeurs' } },
  { titre: 'Un suivi personnalisé', texte: 'pour progresser vite', icone: 'cible', action: { type: 'reserver' } },
  { titre: 'Une communauté', texte: 'motivée et bienveillante', icone: 'etoile', action: { type: 'vue', vue: 'avis' } },
]

export function HeroPublic({
  nomEtablissement,
  onReserver,
  onNaviguer,
}: {
  nomEtablissement: string
  onReserver: () => void
  onNaviguer: (vue: VueCible) => void
}) {
  function activerBenefice(action: ActionBenefice) {
    if (action.type === 'reserver') onReserver()
    else onNaviguer(action.vue)
  }

  const visuelRef = useRef<HTMLDivElement>(null)

  /* Inclinaison 3D du cadre sous la souris : écrite directement en variables CSS, sans passer par
     l'état React, pour ne déclencher aucun rendu à chaque mouvement. */
  function incliner(evenement: PointerEvent<HTMLDivElement>) {
    const visuel = visuelRef.current
    if (!visuel || evenement.pointerType !== 'mouse') return
    const boite = visuel.getBoundingClientRect()
    const x = (evenement.clientX - boite.left) / boite.width - 0.5
    const y = (evenement.clientY - boite.top) / boite.height - 0.5
    visuel.style.setProperty('--incl-x', `${(-y * 7).toFixed(2)}deg`)
    visuel.style.setProperty('--incl-y', `${(x * 9).toFixed(2)}deg`)
  }
  function redresser() {
    visuelRef.current?.style.setProperty('--incl-x', '0deg')
    visuelRef.current?.style.setProperty('--incl-y', '0deg')
  }

  return (
    <div className="hero-hoc" onPointerMove={incliner} onPointerLeave={redresser}>
      <span className="hero-deco-anneau" aria-hidden="true" />
      <span className="hero-deco-points" aria-hidden="true" />

      <div className="hero-grille">
        <div className="hero-texte">
          <p className="hero-accroche">
            <span className="hero-accroche-barre" aria-hidden="true" />
            {/* « future » en minuscule, « English » garde sa majuscule : en anglais, les noms de
                langue en prennent toujours une (demande 1 du document de retours du 2026-10-08). */}
            <span className="mention-manuscrite">Your English, your future</span>
          </p>
          <h1 className="hero-titre">
            Apprenez l’anglais <span className="hero-titre-degrade">à votre rythme</span>
          </h1>
          <p className="hero-intro">
            Des cours interactifs, des professeurs passionnés et une expérience d’apprentissage unique. Rejoignez{' '}
            {nomEtablissement} dès aujourd’hui !
          </p>
          <button type="button" className="hero-cta" onClick={onReserver}>
            <Icone nom="fusee" />
            Commencer maintenant
            <span className="hero-cta-fleche" aria-hidden="true">
              →
            </span>
          </button>
          <ul className="hero-garanties">
            {GARANTIES.map((garantie) => (
              <li key={garantie}>
                <Icone nom="coche" />
                {garantie}
              </li>
            ))}
          </ul>
        </div>

        <div ref={visuelRef} className="hero-visuel">
          <Scene3DHero />
          <div className="hero-cadre-3d">
            <span className="hero-cercle" aria-hidden="true" />
            <div className="hero-cadre">
              <img
                src="/hero-illustration.webp"
                alt={`Deux élèves de ${nomEtablissement} suivent ensemble un cours d’anglais en ligne`}
                fetchPriority="high"
                draggable={false}
              />
            </div>

            <div className="hero-flottant hero-progression">
              <span className="hero-progression-icone" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="hero-progression-texte">
                <small>Progression</small>
                <strong>Level B1</strong>
                <span className="hero-progression-barre" aria-hidden="true">
                  <span />
                </span>
              </span>
              {/* Plus de flèche ronde à droite (demande client du 2026-09-29) : sur certains
                  écrans, elle recouvrait « Progression » et « Level B1 ». */}
            </div>

            <ul className="hero-flottant hero-piliers">
              {PILIERS.map((pilier) => (
                <li key={pilier.libelle}>
                  <Icone nom={pilier.icone} />
                  {pilier.libelle}
                </li>
              ))}
            </ul>

            <ul className="hero-flottant hero-livres">
              {COMPETENCES.map((competence) => (
                <li key={competence}>{competence}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Chaque carte est un vrai bouton de navigation (demande client du 2026-09-29), pas une
          simple liste décorative : d'où <div>/<button> plutôt que <ul>/<li>. */}
      <div className="hero-benefices">
        {BENEFICES.map((benefice) => (
          <button key={benefice.titre} type="button" className="hero-benefice" onClick={() => activerBenefice(benefice.action)}>
            <span className="hero-benefice-icone">
              <Icone nom={benefice.icone} />
            </span>
            <span>
              <strong>{benefice.titre}</strong>
              <small>{benefice.texte}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

type NomIcone = 'fusee' | 'coche' | 'groupe' | 'mallette' | 'globe' | 'bulle' | 'cible' | 'etoile'

/* Pictogrammes au trait, repris des icônes de la maquette. */
function Icone({ nom }: { nom: NomIcone }) {
  const chemins: Record<NomIcone, ReactNode> = {
    fusee: (
      <>
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
        <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
      </>
    ),
    coche: <path d="M20 6 9 17l-5-5" />,
    groupe: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    mallette: (
      <>
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </>
    ),
    bulle: (
      <>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 10h.01M12 10h.01M16 10h.01" />
      </>
    ),
    cible: (
      <>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
    etoile: <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />,
  }
  return (
    <svg
      className="icone-hero"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {chemins[nom]}
    </svg>
  )
}
