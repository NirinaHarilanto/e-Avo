import { useRef, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { FlecheBouton, IcoHX, type NomIcoHX } from './IconesHX'

/* Accueil, d'après hoc-accueil.html. La maquette tient en une seule section : hero pleine
   hauteur, puis une bande claire de 140 px qui amorce le pied de page.

   Les quatre cartes de bénéfices cliquables de la version précédente ont disparu : la maquette
   leur substitue les trois pastilles de verre ci-dessous, qui reprennent mot pour mot les trois
   garanties déjà affichées. Décision du client le 2026-10-09, « suivre la maquette à la lettre ».
   « Commencer maintenant » mène désormais à la page Cours & tarifs, d'où part la réservation,
   plutôt que d'ouvrir directement la fenêtre de rendez-vous. */

const ATOUTS: { icone: NomIcoHX; libelle: string }[] = [
  { icone: 'globe', libelle: '100% en ligne' },
  /* « certifiés » et non « natifs » : les formateurs HOC sont des Malgaches diplômés ou
     certifiés (demande 2 du 2026-10-08, le mot « natifs » ne doit apparaître nulle part). */
  { icone: 'medaille', libelle: 'Professeurs certifiés' },
  { icone: 'horloge', libelle: 'Accès 24/7' },
]

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
              {/* Un seul bouton dans le hero (demande client du 2026-10-09) : « Nous
                  contacter » y faisait doublon avec le même bouton déjà présent en permanence
                  dans la barre de navigation (`.hx-nav .cta`) et dans le pied de page. */}
              <div className="btns rv" style={{ transitionDelay: '.55s' }}>
                <Link className="btn btn-gold" to="/cours">
                  Commencer maintenant <FlecheBouton />
                </Link>
              </div>
            </div>

            <div className="visual rv" style={{ transitionDelay: '.3s' }}>
              <div className="halo" />
              <div className="ring" />
              <div className="orbit" />
              <div className="orbit o2" />
              <div className="art" ref={illustration}>
                <img
                  src="/hero-illustration-3d.webp"
                  alt={`Cours d’anglais en ligne avec ${nomEtablissement}`}
                  fetchPriority="high"
                  draggable={false}
                />
              </div>
            </div>
          </div>

          <div className="perks rv">
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

        <div style={{ height: 70 }} />
      </section>
      <div className="after" />
    </>
  )
}
