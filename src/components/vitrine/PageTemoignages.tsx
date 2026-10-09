import { useCallback, useEffect, useState } from 'react'
import { IcoHX } from './IconesHX'
import { initialesDe } from './PageEquipe'

/* Témoignages — carrousel en anneau 3D, d'après la maquette fournie par le client le
   2026-10-09 : les cartes tournent sur un cercle incliné, celle de devant en pleine lecture,
   les autres de profil et en retrait, le tout posé sur une orbite dorée semée d'étincelles et
   sur un socle de verre.

   Cette vue remplace le carrousel horizontal à aimantation de la maquette d'origine
   (hoc-temoignages.html). La piste défilante a disparu avec lui : la position ne se lit plus
   dans un `scrollLeft` mais dans un index, et c'est un décalage angulaire par rapport à cet
   index qui place chaque carte.

   Les dix-huit témoignages réels s'affichent ici, les sept qui ont une photo en tête de liste.
   Textes repris tels quels des documents fournis par le client, en anglais, langue d'origine
   des citations. */

type Temoignage = {
  id: string
  annee: 2024 | 2025 | 2026
  nom: string
  texte: string
  photo?: string
}

const TEMOIGNAGES: Temoignage[] = [
  {
    id: 'dia',
    annee: 2026,
    nom: 'Dia',
    photo: 'temoignage-dia.webp',
    texte:
      'I really enjoy my English lessons with Hari. She is kind, patient, and always willing to help. She creates a positive and comfortable learning environment, which makes it easier for me to speak and improve my English with confidence. Thanks to her support, encouragement, and clear explanations, I have made noticeable progress and feel much more confident using English in everyday situations. Thank you, Hari, for your dedication and continuous support!',
  },
  {
    id: 'miora',
    annee: 2025,
    nom: 'Miora Christelle',
    photo: 'temoignage-miora.webp',
    texte:
      'Thank you from the bottom of my heart for everything you have done for me. Thanks to you, Harinjo English has become a place where I found not only knowledge, but also support, motivation, and a true family. Because of your support, I’ve improved, regained confidence, and most of all, I’ve come to love this language. Thank you, Mrs. Hari, Mrs. Manda and Mr. Landry : there are people you never forget — and you are one of them.',
  },
  {
    id: 'mihanta',
    annee: 2025,
    nom: 'Mihanta Andriantsoa',
    photo: 'temoignage-mihanta.webp',
    texte:
      'I started English classes to be more fluent and confident when speaking. The courses were more than just a learning session, they became a real hobby for me — a great way to disconnect from daily stress and talk about different topics in English. If you are looking for a way to learn and have fun at the same time, I definitely recommend this adventure. Thank you to the whole team for this great experience!',
  },
  {
    id: 'frederica',
    annee: 2025,
    nom: 'Frederica Andriananténaina',
    photo: 'temoignage-frederica.webp',
    texte:
      'Personally, I really loved my online classes with the team, especially with Miss Sandra. I’ve already learned so much, and I truly feel like I’ve made incredible progress in a short amount of time. Her approach was clear, dynamic, and encouraging — she really helped me build confidence and speak without fear of making mistakes. A big thank you to the whole team, and especially to Miss Sandra, for this wonderful experience!',
  },
  {
    id: 'cynthia',
    annee: 2025,
    nom: 'Cynthia Raobelina',
    photo: 'temoignage-cynthia.webp',
    texte:
      'I would like to sincerely thank you for your support and dedication throughout this English course. Your lessons have truly helped me improve my language skills, especially in speaking and vocabulary. I have noticed a real difference in my confidence and fluency, and I’m very grateful for the motivating learning environment you created.',
  },
  {
    id: 'fanirisoa',
    annee: 2025,
    nom: 'Fanirisoa Randria',
    photo: 'temoignage-fanirisoa.webp',
    texte:
      'I was so sad that my sessions had ended because I truly enjoyed them. It wasn’t just an English course; it was a discovery of a new world and an opportunity to meet wonderful people. A huge thank you to Harinjo’s team, from the bottom of my heart — especially my teacher Patricia, for her support and incredible patience with me. I’ve improved so much and I’m no longer worried about speaking with native English speakers. I’ll be back.',
  },
  {
    id: 'stephane',
    annee: 2024,
    nom: 'Stéphane Rakotonjanahary',
    photo: 'temoignage-stephane.webp',
    texte:
      'Hari’s Online Courses has truly impressed me with the quality and professionalism of its courses. The lessons are clear, engaging, well-structured, and highly practical — complex topics explained in a simple and easy-to-understand way. I highly recommend Hari’s Online Courses to anyone looking to improve their skills, gain confidence, and take their learning to the next level.',
  },
  {
    id: 'fara',
    annee: 2026,
    nom: 'Fara',
    texte:
      'I really enjoyed learning English with Manda. She is very kind, always willing to help, and ready to listen to what I needed so that I could improve my English-speaking skills with confidence. I will definitely come back, and I also encourage others to study here.',
  },
  {
    id: 'leonardo',
    annee: 2026,
    nom: 'Leonardo',
    texte:
      'When I first started, I didn’t know anything about English, but after just one month, I saw significant progress. I’m not a pro yet, but Hari Online Club has taught me how to study on my own, and I’m confident that one day I will speak like a native. A big thank you to Teacher Manda and Teacher Lucie for their guidance and support.',
  },
  {
    id: 'henintsoa',
    annee: 2026,
    nom: 'Henintsoa',
    texte:
      'Even though I didn’t reach my ideal score for the IELTS Speaking test, I still achieved my target overall IELTS band score of 7.5, and I couldn’t have reached that without you. Thank you, Manda, for being such a great and kind teacher. And thank you to the whole HOC team for being so organised and attentive to my needs.',
  },
  {
    id: 'mahery',
    annee: 2025,
    nom: 'Mahery',
    texte:
      'I’ve been taking online English courses with Hari, a passionate young Malagasy teacher, and I’m very satisfied. The lessons are pedagogical and well-structured, making it easy to learn new words in a natural way. The organization is professional, and I have absolutely no regrets about having devoted my time and money. I wish her every success in developing her online courses.',
  },
  {
    id: 'nancy',
    annee: 2025,
    nom: 'Nancy',
    texte:
      'I’ve been taking English lessons with Hari for about a month now, and I’ve truly enjoyed the experience. The lessons are tailored to my needs and goals. Hari is very supportive and encouraging, always prompting me to speak freely and gently correcting me when I make mistakes. Her positive energy makes the lessons enjoyable — we laugh a lot, but we always stay focused on learning English!',
  },
  {
    id: 'manoa',
    annee: 2025,
    nom: 'Manoa Finoana',
    texte:
      'I would like to sincerely thank the wonderful Manda for my 15 hours of lessons. Her pedagogy and good humor, as well as our laughter, helped me break the wall so I could practice my spoken English. I’ll be back soon and yes, I’d love to continue with Harinjo and her team, especially Manda.',
  },
  {
    id: 'rianah',
    annee: 2025,
    nom: 'Rianah',
    texte:
      'I finally found exactly what I needed with Teacher Manda and Harinjo. Their teaching skills are excellent; they explain everything clearly and never hesitate to answer any questions I have, no matter how specific. They have helped me significantly improve my English, especially when it comes to expressing myself and organizing my ideas. It has been a wonderful experience!',
  },
  {
    id: 'nekena',
    annee: 2025,
    nom: 'Nekena',
    texte:
      'I want to thank Hari’s team, especially Patricia, who supported me throughout my learning journey. From the first session, Patricia immediately understood how to adapt the lessons to my needs. I was learning without even noticing it, simply because I was enjoying the process. For anyone looking to improve their English in a practical and engaging way, I genuinely recommend Hari’s team.',
  },
  {
    id: 'carol',
    annee: 2025,
    nom: 'Carol',
    texte:
      'I just wanted to say thank you. Thanks to Harinjo’s support, I’ve finally been able to express myself in English, something I had never managed to do elsewhere or on my own. She is truly a gifted and inspiring teacher. I’m incredibly grateful. She really makes it easy.',
  },
  {
    id: 'lovatiana',
    annee: 2025,
    nom: 'Only Lovatiana Rahajanirina',
    texte:
      'This was my first time attending an online English class, and it was a great experience. What I appreciated the most: the energy and enthusiasm of the teachers, the friendly and welcoming atmosphere, and most importantly the kindness — it truly felt like a safe space for learning. I was corrected with kindness, and that made a big difference. I’m even planning to sign up for more courses.',
  },
  {
    id: 'nathalie',
    annee: 2024,
    nom: 'Nathalie Delpierre',
    texte:
      'I am very satisfied with Hari’s online courses. In 20 hours of lessons, I’ve expanded my vocabulary, improved my grammar, and learned many common expressions. The strength of Hari’s lessons lies in the audios, which are interesting, easy to understand, and encourage us to talk about subjects we enjoy. Try the Hari method, you’ll love it.',
  },
]


/* Six places sur l'anneau, à 60° l'une de l'autre : une devant, deux de chaque côté, une au
   fond. Les dix-huit témoignages se partagent ces six places — un témoignage dont le décalage
   sort de l'intervalle est simplement effacé. L'intervalle est volontairement asymétrique :
   +3 et -3 désignent le MÊME point de l'anneau (180° et -180°), garder les deux y empilerait
   deux cartes. */
const PAS_ANGULAIRE = 60
const DECALAGE_MIN = -2
const DECALAGE_MAX = 3

/* Rayon de l'anneau des cartes, en pixels. Repris tel quel dans la feuille de style
   (`--rayon-anneau`) : la valeur doit être la même des deux côtés, c'est elle qui décide de
   l'écart entre la carte de devant et ses voisines. */
const RAYON = 700

/* Inclinaison de l'anneau, en degrés. Elle aussi est écrite deux fois : `--inclinaison` dans
   la feuille de style la donne à l'anneau, et les cartes s'en servent ici pour l'annuler sur
   elles-mêmes (voir `transformationDe`). */
const INCLINAISON = 16

/* Fondu par la profondeur : une carte éloignée s'efface dans le violet du fond, comme sur la
   maquette. L'opacité est posée carte par carte en style en ligne plutôt qu'en CSS parce
   qu'elle dépend du décalage, qui change à chaque rotation. */
function opaciteDe(ecart: number, surAnneau: boolean) {
  if (!surAnneau) return 0
  if (ecart === 0) return 1
  if (Math.abs(ecart) === 1) return 0.86
  if (Math.abs(ecart) === 2) return 0.6
  return 0.48
}

/* Une carte qui suivrait la tangente du cercle montrerait son dos passé 90°, et celle du fond
   serait franchement retournée. Chaque place reçoit donc son propre angle de présentation :
   la carte est posée sur le cercle, puis redressée vers le spectateur de ce qu'il faut. De
   face et au fond elle est plate, de côté elle se présente de trois quarts. */
function orientationDe(ecart: number) {
  if (ecart === 1) return 32
  if (ecart === -1) return -32
  if (ecart === 2) return 30
  if (ecart === -2) return -30
  return 0
}

/* Place ET redresse une carte. Deux temps, qu'il faut lire de gauche à droite comme une
   trajectoire :

   1. `rotateY(angle) translateZ(R) rotateY(-angle)` — la carte part au point voulu du cercle,
      et le dernier quart de tour défait la rotation que le premier lui a imprimée : elle
      arrive donc là-bas sans avoir pivoté sur elle-même.
   2. `rotateX(inclinaison) rotateY(orientation)` — son orientation propre, choisie et non
      subie. Le `rotateX` annule exactement l'inclinaison que `.anneau` impose à toute sa
      descendance.

   Sans cette annulation (première version), toutes les cartes partageaient l'inclinaison de
   l'anneau : celle de devant arrivait penchée de 16° vers l'arrière, son texte rendu sur un
   plan oblique, donc rééchantillonné et flou — le client l'a signalé. Désormais les cartes se
   tiennent droites sur un plateau incliné : le cercle ne décide plus que de la position, et
   celle de devant est parfaitement de face. */
function transformationDe(ecart: number) {
  const angle = ecart * PAS_ANGULAIRE
  return [
    `rotateY(${angle}deg)`,
    `translateZ(${RAYON}px)`,
    `rotateY(${-angle}deg)`,
    `rotateX(${INCLINAISON}deg)`,
    `rotateY(${orientationDe(ecart)}deg)`,
  ].join(' ')
}

/* Poussière dorée autour de l'orbite. Tirage pseudo-aléatoire à graine fixe plutôt que
   `Math.random` : le semis doit être le même à chaque chargement, sans quoi la page change
   d'aspect à chaque visite — et il serait impossible de comparer deux captures d'écran. */
function semis(graine: number, nombre: number) {
  let etat = graine
  const suivant = () => {
    etat = (etat * 1664525 + 1013904223) % 4294967296
    return etat / 4294967296
  }
  return Array.from({ length: nombre }, (_, i) => ({
    cle: i,
    angle: suivant() * 360,
    rayon: 700 + suivant() * 240,
    hauteur: 40 + suivant() * 230,
    taille: 2 + suivant() * 3.4,
    delai: suivant() * 4.6,
  }))
}
const ETINCELLES = semis(20261009, 44)

export function PageTemoignages({ dossierAssets }: { dossierAssets: string }) {
  /* Le deuxième témoignage est mis en avant à l'ouverture (demande client du 2026-10-09) :
     sur le premier, rien n'indiquerait qu'on peut aussi reculer. */
  const [courant, setCourant] = useState(1)
  const total = TEMOIGNAGES.length

  /* Décalage signé par rapport à la carte de devant, ramené dans [-9, 8] : au-delà de la
     demi-liste, il est plus court de faire le tour par l'autre côté, et c'est ce chemin-là que
     l'anneau doit prendre. */
  const decalageDe = useCallback(
    (index: number) => {
      let ecart = index - courant
      if (ecart > total / 2) ecart -= total
      if (ecart < -total / 2) ecart += total
      return ecart
    },
    [courant, total],
  )

  const tourner = useCallback(
    (pas: number) => {
      setCourant((position) => (position + pas + total) % total)
    },
    [total],
  )

  /* Flèches du clavier : l'anneau est annoncé comme un groupe focalisable, il doit se
     manœuvrer sans souris. */
  useEffect(() => {
    const auClavier = (evenement: KeyboardEvent) => {
      if (evenement.key === 'ArrowLeft') tourner(-1)
      if (evenement.key === 'ArrowRight') tourner(1)
    }
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  }, [tourner])

  return (
    <section className="dark testi">
      <div className="glow g1" />
      <div className="glow g2" />
      <div className="spot" />
      <div className="grain" />

      <div className="wrap head reveal">
        <div className="eyebrow">Témoignages</div>
        <h1 className="h-xl">
          <span className="line">
            <span>Ce que disent</span>
          </span>
          <span className="line">
            <span className="it" style={{ transitionDelay: '.12s' }}>
              nos étudiants
            </span>
          </span>
        </h1>
        <p className="sub rv" style={{ transitionDelay: '.3s' }}>
          Des parcours réels, racontés par celles et ceux qui les ont suivis.
        </p>
      </div>

      {/* `rv` (apparition au défilement) est posé sur l'enveloppe et non sur `.scene` : il
          anime `transform`, qui sert déjà à poser la perspective. */}
      <div className="enveloppe-3d rv">
        <div className="scene">
          <div className="anneau">
            {/* Dans l'anneau et non dans la scène : le plateau est couché dans l'espace 3D de
                l'anneau, c'est de lui qu'il tient sa perspective et son rang en profondeur. */}
            <div className="socle" aria-hidden="true">
              <span className="dessus" />
            </div>
            <div className="lueur-orbite" />
            <div className="orbite" />
            {ETINCELLES.map((etincelle) => (
              <span
                key={etincelle.cle}
                className="etincelle"
                aria-hidden="true"
                style={{
                  width: `${etincelle.taille}px`,
                  height: `${etincelle.taille}px`,
                  transform: `rotateY(${etincelle.angle}deg) translateZ(${etincelle.rayon}px) translateY(${etincelle.hauteur}px)`,
                  animationDelay: `${etincelle.delai}s`,
                }}
              />
            ))}

            {TEMOIGNAGES.map((temoignage, index) => {
              const ecart = decalageDe(index)
              const surAnneau = ecart >= DECALAGE_MIN && ecart <= DECALAGE_MAX
              return (
                <article
                  key={temoignage.id}
                  className={`carte3d${ecart === 0 ? ' devant' : ''}${surAnneau ? '' : ' hors-anneau'}`}
                  style={{
                    transform: transformationDe(ecart),
                    opacity: opaciteDe(ecart, surAnneau),
                  }}
                >
                  <span className="q" aria-hidden="true">
                    “
                  </span>
                  <div className="meta">
                    <span className="stars" aria-label="5 étoiles sur 5">
                      ★★★★★
                    </span>
                    <span className="yr">{temoignage.annee}</span>
                  </div>
                  <p>« {temoignage.texte} »</p>
                  <div className="who">
                    <div className="av">
                      {temoignage.photo ? (
                        <img src={`${dossierAssets}/temoignages/${temoignage.photo}`} alt={temoignage.nom} loading="lazy" />
                      ) : (
                        initialesDe(temoignage.nom)
                      )}
                    </div>
                    <b>{temoignage.nom}</b>
                  </div>
                  {/* Une carte de côté s'amène au premier plan d'un clic. Le bouton couvre la
                      carte plutôt que d'en faire une : un `<button>` n'accepte pas de `<p>`,
                      et le témoignage doit rester un bloc de texte structuré. Il n'existe que
                      pour les cartes visibles — sinon la tabulation traverserait dix-huit
                      boutons invisibles. */}
                  {surAnneau && ecart !== 0 && (
                    <button
                      type="button"
                      className="amener"
                      onClick={() => tourner(ecart)}
                      aria-label={`Lire le témoignage de ${temoignage.nom}`}
                    />
                  )}
                </article>
              )
            })}
          </div>
        </div>

        {/* Chevrons dorés : trois par côté, qui s'allument l'un après l'autre dans le sens du
            défilement (demande client du 2026-10-09). Sous l'anneau et non de part et d'autre
            comme sur le premier croquis : l'anneau déployé occupe désormais toute la largeur
            utile, les chevrons posés sur les côtés chevaucheraient les cartes de profil dès
            qu'on descend sous les très grands écrans. Le décalage de chaque chevron est posé
            en style en ligne parce qu'il dépend du rang et s'inverse d'un côté à l'autre — à
            gauche, la vague part du chevron le plus proche du centre et file vers
            l'extérieur. */}
        <div className="nav-chevrons">
          <button type="button" className="chev prev" aria-label="Témoignage précédent" onClick={() => tourner(-1)}>
            {[0, 1, 2].map((rang) => (
              <span key={rang} style={{ animationDelay: `${(2 - rang) * 0.16}s` }} aria-hidden="true">
                <IcoHX nom="chevron-gauche" />
              </span>
            ))}
          </button>
          <button type="button" className="chev next" aria-label="Témoignage suivant" onClick={() => tourner(1)}>
            {[0, 1, 2].map((rang) => (
              <span key={rang} style={{ animationDelay: `${rang * 0.16}s` }} aria-hidden="true">
                <IcoHX nom="chevron-droite" />
              </span>
            ))}
          </button>
        </div>
      </div>
    </section>
  )
}
