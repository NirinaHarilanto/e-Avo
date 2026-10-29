import { useRef, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { FlecheBouton, IcoHX, type NomIcoHX } from './IconesHX'

/* Accueil, d'après hoc-accueil.html, puis d'après la maquette du client du 2026-10-29 pour le
   visuel et le bandeau de thèmes.

   Ce que la nouvelle maquette change : l'illustration 3D du hero devient une vraie photo de
   cours — un élève au casque face à sa professeure en visioconférence — et un bandeau annonce en
   bas ce que les cours couvrent. Les orbites, le halo et l'inclinaison sous la souris sont
   conservés : c'est l'habillage du hero, pas l'illustration.

   La maquette dessinait autour de la photo une fenêtre de visioconférence complète (en-tête
   « Cours individuel », étiquette « Teacher », barre d'appel). Elle a été retirée quand le client
   a fourni cette photo le 2026-10-29 : la photo porte DÉJÀ un écran de visioconférence, avec sa
   propre barre d'appel et son propre badge « Live Class ». Les redoubler donnait une visio dans
   une visio. Restent le cadre, les deux répliques et un voile violet qui raccorde les tons chauds
   de la photo à la palette de la page.

   Les trois pastilles de garanties restent sous le visuel, à la demande du client (2026-10-29),
   bien que la maquette ne les dessine plus : elles et le bandeau ne disent pas la même chose, les
   unes sur la manière d'apprendre, l'autre sur ce qu'on y apprend.

   « Commencer maintenant » mène à la page Cours & tarifs, d'où part la réservation. Il est de
   nouveau seul depuis le 2026-10-29 : « Voir les formules », ajouté la veille d'après la
   maquette, menait exactement au même endroit et faisait donc doublon — c'est la raison qui
   avait déjà fait retirer un second bouton du hero le 2026-10-09. */

const ATOUTS: { icone: NomIcoHX; libelle: string }[] = [
  { icone: 'globe', libelle: '100% en ligne' },
  /* « certifiés » et non « natifs » : les formateurs HOC sont des Malgaches diplômés ou
     certifiés (demande 2 du 2026-10-08, le mot « natifs » ne doit apparaître nulle part). */
  { icone: 'medaille', libelle: 'Professeurs certifiés' },
  { icone: 'horloge', libelle: 'Accès 24/7' },
]

const THEMES = ['Anglais du quotidien', 'Anglais professionnel', 'TOEIC · TOEFL · IELTS', 'Projet de migration']

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
              </div>
            </div>

            {/* Plus de `rv` ici : la photo a sa propre entrée (voir `.photo-cours` dans
                vitrine-hx.css), et le fondu global de `rv` se serait superposé au dévoilement en
                le rendant mou. Une animation CSS ne dépend d'aucun observateur, ce qui la met
                aussi à l'abri du défaut rencontré sur la carte de rentrée. */}
            <div className="visual">
              <div className="halo" />
              <div className="ring" />
              <div className="orbit" />
              <div className="orbit o2" />
              <div className="art" ref={illustration}>
                <div className="photo-cours">
                  <img
                    src="/hero-visio.webp"
                    alt={`Un élève au casque suivant son cours d’anglais en visioconférence avec sa professeure ${nomEtablissement}`}
                    fetchPriority="high"
                    draggable={false}
                  />
                  {/* Voile violet : la photo est dans des tons bois et bleu marine, la page est
                      violette. Posé en CSS et non incrusté dans le fichier, pour rester réglable
                      sans regénérer l'image. */}
                  <span className="voile" aria-hidden="true" />
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
