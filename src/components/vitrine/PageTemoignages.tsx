import { useCallback, useEffect, useRef, useState } from 'react'
import { IcoHX } from './IconesHX'
import { initialesDe } from './PageEquipe'

/* Témoignages, d'après hoc-temoignages.html : un carrousel horizontal à aimantation, la carte
   centrale en pleine opacité, les voisines estompées.

   La maquette en dessine quatre et laisse un modèle en commentaire ; les dix-huit témoignages
   réels s'affichent ici, les sept qui ont une photo en tête de liste. Textes repris tels quels
   des documents fournis par le client, en anglais, langue d'origine des citations. */

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

export function PageTemoignages({ dossierAssets }: { dossierAssets: string }) {
  const piste = useRef<HTMLDivElement>(null)
  const [courant, setCourant] = useState(0)

  /* La carte active est celle dont le centre est le plus proche du centre de la piste — la
     maquette la recalcule au défilement plutôt que de la déduire d'un index, pour rester juste
     quand le visiteur fait glisser la piste au doigt ou à la molette. */
  const recalculer = useCallback(() => {
    const rail = piste.current
    if (!rail) return
    const milieu = rail.scrollLeft + rail.clientWidth / 2
    let meilleure = 0
    let ecartMin = Infinity
    Array.from(rail.children).forEach((enfant, index) => {
      const carte = enfant as HTMLElement
      const ecart = Math.abs(carte.offsetLeft + carte.clientWidth / 2 - milieu)
      if (ecart < ecartMin) {
        ecartMin = ecart
        meilleure = index
      }
    })
    setCourant(meilleure)
  }, [])

  useEffect(() => {
    const rail = piste.current
    if (!rail) return
    let minuterie: number | undefined
    const surDefilement = () => {
      window.clearTimeout(minuterie)
      minuterie = window.setTimeout(recalculer, 60)
    }
    recalculer()
    rail.addEventListener('scroll', surDefilement, { passive: true })
    window.addEventListener('resize', recalculer)
    return () => {
      window.clearTimeout(minuterie)
      rail.removeEventListener('scroll', surDefilement)
      window.removeEventListener('resize', recalculer)
    }
  }, [recalculer])

  function allerA(index: number) {
    const rail = piste.current
    if (!rail) return
    const cible = Math.max(0, Math.min(TEMOIGNAGES.length - 1, index))
    const carte = rail.children[cible] as HTMLElement | undefined
    if (!carte) return
    rail.scrollTo({ left: carte.offsetLeft - (rail.clientWidth - carte.clientWidth) / 2 })
  }

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

      <div className="track rv" ref={piste}>
        {TEMOIGNAGES.map((temoignage, index) => (
          <article key={temoignage.id} className={index === courant ? 'slide on' : 'slide'}>
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
          </article>
        ))}
      </div>

      {/* La bande de petits points a disparu (demande client du 2026-10-09) : avec 18
          témoignages, elle s'étirait en une longue ligne qui ressemblait à une barre de
          défilement plutôt qu'à une pagination. Les chevrons dorés suffisent à faire
          comprendre que d'autres témoignages suivent — la carte suivante, déjà visible en
          partie à droite (`.slide` hors de `.on` reste affichée, juste estompée), le montre
          aussi. */}
      <div className="nav2">
        <button type="button" className="arr prev" aria-label="Témoignage précédent" disabled={courant === 0} onClick={() => allerA(courant - 1)}>
          <IcoHX nom="fleche-gauche" />
        </button>
        <span aria-live="polite" className="compteur-temoignages">
          {courant + 1} / {TEMOIGNAGES.length}
        </span>
        <button
          type="button"
          className="arr next"
          aria-label="Témoignage suivant"
          disabled={courant === TEMOIGNAGES.length - 1}
          onClick={() => allerA(courant + 1)}
        >
          <IcoHX nom="fleche-droite" />
        </button>
      </div>
    </section>
  )
}
