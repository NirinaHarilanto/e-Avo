import { useRef, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { FlecheBouton, IcoHX, type NomIcoHX } from './IconesHX'

/* Accueil, d'après hoc-accueil.html, puis d'après la maquette du client du 2026-10-29 pour le
   visuel et le bandeau de thèmes.

   Ce que la nouvelle maquette change : l'illustration 3D du hero devient une fenêtre de
   visioconférence — carte blanche, professeure à l'écran, barre d'appel et deux bulles de
   conversation — et un bandeau annonce en bas ce que les cours couvrent. Les orbites, le halo et
   l'inclinaison sous la souris sont conservés : c'est l'habillage du hero, pas l'illustration.

   Les trois pastilles de garanties restent sous le visuel, à la demande du client (2026-10-29),
   bien que la maquette ne les dessine plus : elles et le bandeau ne disent pas la même chose, les
   unes sur la manière d'apprendre, l'autre sur ce qu'on y apprend.

   « Commencer maintenant » mène à la page Cours & tarifs, d'où part la réservation ; « Voir les
   formules » y mène aussi mais sans promesse d'engagement, comme sur la maquette. */

const ATOUTS: { icone: NomIcoHX; libelle: string }[] = [
  { icone: 'globe', libelle: '100% en ligne' },
  /* « certifiés » et non « natifs » : les formateurs HOC sont des Malgaches diplômés ou
     certifiés (demande 2 du 2026-10-08, le mot « natifs » ne doit apparaître nulle part). */
  { icone: 'medaille', libelle: 'Professeurs certifiés' },
  { icone: 'horloge', libelle: 'Accès 24/7' },
]

const THEMES = ['Anglais du quotidien', 'Anglais professionnel', 'TOEIC · TOEFL · IELTS', 'Projet de migration']

/* Boutons de la barre d'appel. Purement décoratifs : la fenêtre illustre un cours, elle ne
   commande rien — d'où le `aria-hidden` sur l'ensemble et aucun élément focusable. */
function BarreAppel() {
  return (
    <div className="barre" aria-hidden="true">
      <span className="b">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
        </svg>
      </span>
      <span className="b">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="13" height="12" rx="3" />
          <path d="m22 8-7 4 7 4z" />
        </svg>
      </span>
      <span className="b">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" />
        </svg>
      </span>
      <span className="b fin">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10.5c5-3.3 13-3.3 18 0v3.2l-4 .6-.7-2.8a14 14 0 0 0-8.6 0l-.7 2.8-4-.6z" />
        </svg>
      </span>
    </div>
  )
}

export function PageAccueil({ nomEtablissement }: { nomEtablissement: string }) {
  const illustration = useRef<HTMLDivElement>(null)

  /* L'illustration s'incline sous la souris. Comme dans la maquette, la position est rapportée à
     la fenêtre et non au cadre, et le transform est écrit directement dans le style : passer par
     l'état React déclencherait un rendu à chaque pixel parcouru. */
  function incliner(evenement: MouseEvent<HTMLElement>) {
    const cible = illustration.current
    if (!cible || !matchMedia('(hover:hover)').matches) return
    const x = evenement.clientX / window.innerWidth - 0.5
    const y = evenement.clientY / window.innerHeight - 0.5
    cible.style.transform = `rotateY(${x * 10}deg) rotateX(${-y * 8}deg) translate(${x * 16}px,${y * 12}px)`
  }

  return (
    <>
      <section className="dark hero" onMouseMove={incliner}>
        <div className="glow g1" />
        <div className="glow g2" />
        <div className="glow g3" />
        <div className="ghost" aria-hidden="true">
          English
        </div>
        <div className="spot" />
        <div className="grain" />

        <div className="wrap">
          <div className="grid">
            <div className="text reveal">
              <div className="eyebrow">Your English, your future</div>
              <h1 className="display">
                <span className="line">
                  <span>Apprenez</span>
                </span>
                <span className="line">
                  <span style={{ transitionDelay: '.12s' }}>l’anglais</span>
                </span>
                <span className="line">
                  <span className="it" style={{ transitionDelay: '.24s' }}>
                    à votre rythme
                  </span>
                </span>
              </h1>
              <p className="lead rv" style={{ transitionDelay: '.4s' }}>
                Des cours interactifs, des professeurs passionnés et une expérience d’apprentissage unique. Rejoignez{' '}
                {nomEtablissement} dès aujourd’hui !
              </p>
              <div className="btns rv" style={{ transitionDelay: '.55s' }}>
                <Link className="btn btn-gold" to="/cours">
                  Commencer maintenant <FlecheBouton />
                </Link>
                <Link className="btn btn-nu" to="/cours">
                  Voir les formules
                </Link>
              </div>
            </div>

            <div className="visual rv" style={{ transitionDelay: '.3s' }}>
              <div className="halo" />
              <div className="ring" />
              <div className="orbit" />
              <div className="orbit o2" />
              <div className="art" ref={illustration}>
                <div className="visio">
                  <div className="t">
                    <span className="pts" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="nom">Cours individuel</span>
                    <span className="live">
                      <i aria-hidden="true" />
                      En direct
                    </span>
                  </div>
                  <div className="ecran">
                    <img
                      src="/hero-visio.webp"
                      alt={`Professeure d’anglais au casque pendant un cours en visioconférence avec ${nomEtablissement}`}
                      fetchPriority="high"
                      draggable={false}
                    />
                    <span className="etiquette">Teacher</span>
                  </div>
                  <BarreAppel />
                </div>
                {/* Les deux répliques de la maquette : la question du professeur, la réponse de
                    l'élève. En anglais, c'est le cours lui-même qui est montré. */}
                <span className="bulle haut" aria-hidden="true">
                  How was your weekend?
                </span>
                <span className="bulle bas" aria-hidden="true">
                  I went to the beach with my family!
                </span>
              </div>
            </div>
          </div>

          <div className="perks">
            {ATOUTS.map((atout) => (
              <span key={atout.libelle} className="perk">
                <i>
                  <IcoHX nom={atout.icone} />
                </i>
                {atout.libelle}
              </span>
            ))}
          </div>
        </div>

        {/* Pas de `rv` : le bandeau ferme le hero, il n'est pas un contenu qui se révèle au
            défilement. Sur un écran court il tombe juste sous le pli, et un `.rv` y creusait un
            vide de sa hauteur tant que le visiteur n'avait pas défilé. */}
        <div className="themes">
          <div className="wrap">
            {THEMES.map((theme, rang) => (
              <span key={theme} className="t">
                {/* Séparateur dessiné en CSS et non écrit en glyphe : un caractère d'étoile ou
                    de losange peut être rendu par une police emoji couleur, qui ignore `color`
                    et sortirait du doré de la charte. */}
                {rang > 0 && <i className="sep" aria-hidden="true" />}
                {theme}
              </span>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
