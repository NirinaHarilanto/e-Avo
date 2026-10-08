import { useState, type ReactNode } from 'react'
import type { Database, TypeProgrammeProspect } from '../../types/database.types'
import type { AccentPalette } from '../../lib/accent'

/* Les vues atteintes depuis la barre de navigation. Chacune remplace l'écran d'accueil au lieu de
   s'empiler dessous : la page publique tient désormais dans une seule vue, sans défilement
   (demande client du 2026-09-15). Seul le contenu d'une vue peut défiler à l'intérieur de son
   propre cadre quand il est dense — les tarifs, typiquement — pour qu'aucune information ne soit
   perdue au passage.

   Refonte visuelle du 2026-09-29, d'après les visuels de référence fournis par le client (qui
   remplace l'ambiance marine et or du 2026-09-22) : fond violet profond (code couleur officiel
   HOC, `--hoc-violet`/`--hoc-prune`), cartes violettes, titres et boutons jaune doré, trait doré
   sous le titre.

   Depuis le 2026-10-08 (demande client explicite, échantillon de couleur fourni, qui correspond
   au violet de marque déjà utilisé ailleurs dans l'app à quelques nuances de compression près) :
   les 4 sections Cours, Professeurs, Tarifs et À propos partagent toutes ce thème « violet », pour
   une ambiance unifiée sur toute la vitrine publique. Le thème « nuit » (fond bleu nuit sarcelle)
   reste disponible dans `CadreVue` mais n'est plus utilisé par aucune vue pour l'instant.
   Aucune donnée ni aucun mécanisme ne change (forfaits, programmes, extension de la liste des
   tarifs, réservation) : seuls les classes et les styles de présentation sont neufs. */

type Tarif = Database['public']['Tables']['tarifs']['Row']

/* Vrais témoignages d'élèves, fournis par le client le 2026-10-07/08 (documents « testimonial »/
   « Testimonial 2 »), en remplacement des 3 exemples de démonstration. Texte repris tel quel
   (langue d'origine : anglais — ce sont des citations de vrais élèves, pas un texte de l'app à
   traduire), seulement nettoyé des sauts de ligne de mise en forme Word.

   7 des 18 témoignages ont une vraie photo (les autres n'en avaient aucune dans les documents
   fournis) : ceux-là sont placés en tête de liste, pour que la section ouvre sur des visages
   réels — plus marquant qu'une suite de pastilles à initiales. Les 11 suivants gardent un avatar
   à initiales, comme avant. `annee` (donnée par les en-têtes 2024/2025/2026 du document client)
   s'affiche en petit badge sur chaque carte, pour montrer que les retours s'étalent dans la durée
   plutôt que d'être un lot ponctuel. */
type Temoignage = {
  id: string
  annee: 2024 | 2025 | 2026
  nom: string
  texte: string
  photo?: string
}

const TEMOIGNAGES: Temoignage[] = [
  // ── Avec photo ──────────────────────────────────────────────────────────
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
  // ── Sans photo (avatar à initiales) ─────────────────────────────────────
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

function initialesDe(nom: string) {
  return nom
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase())
    .join('')
}

/* Texte de présentation de la fondatrice (demande 10 du 2026-10-08), fourni mot pour mot par
   Harinjo. Les lignes isolées sont ses respirations à elle (« J'ai fait le pari inverse. »,
   « Elle se vit. ») : elles comptent autant que les paragraphes et s'affichent en relief, pas
   noyées dans le bloc précédent. `fort: true` = ligne mise en avant. */
const PRESENTATION_HOC: { texte: string; fort?: boolean }[] = [
  { texte: 'Je n’ai pas fondé HOC pour répondre à une demande. Je l’ai fondé pour en créer une.', fort: true },
  {
    texte:
      'Il y a encore dix ans, à Madagascar, apprendre signifiait une chose : une salle de classe, un tableau blanc, un professeur face à des rangées d’élèves. Les cours en ligne ? Peu y croyaient. Trop distants, trop impersonnels, pas « sérieux ».',
  },
  { texte: 'J’ai fait le pari inverse.', fort: true },
  {
    texte:
      'Forte de mes années passées à concevoir et piloter des formations à distance, j’ai voulu prouver qu’apprendre l’anglais en ligne pouvait être aussi humain, aussi exigeant et bien plus vivant qu’en salle. Pour les Malgaches d’ici, et pour notre diaspora, partout dans le monde.',
  },
  { texte: 'Ainsi est né Hari Online Club.', fort: true },
  { texte: 'Chez HOC, l’anglais se commande à la carte.', fort: true },
  {
    texte:
      'Imaginez un restaurant où vous ne subissez pas un menu imposé : vous choisissez ce dont vous avez envie, à votre rythme, selon vos goûts et vos objectifs. Décrocher votre certification (IELTS, TOEIC, TOEFL), préparer un entretien, voyager sereinement, prendre la parole en réunion, aider vos enfants, ou simplement oser parler : votre parcours est construit pour vous, et seulement pour vous.',
  },
  { texte: 'Notre vision est simple : vous faire aimer l’anglais.', fort: true },
  {
    texte:
      'Pas le subir. Pas le réviser par obligation. L’aimer. Grâce à une approche accessible, interactive et centrée sur la conversation, pensée pour tous les âges et tous les parcours.',
  },
  { texte: 'Parce qu’une langue ne s’apprend pas sur un tableau blanc.', fort: true },
  { texte: 'Elle se vit.', fort: true },
  { texte: 'HOC, l’anglais sur mesure, où que vous soyez.', fort: true },
]

export function VueAvis({ dossierAssets }: { dossierAssets: string }) {
  return (
    <CadreVue
      surtitre="À propos"
      titre="L’histoire de Hari Online Club"
      sousTitre="Par Harinjo, fondatrice."
      theme="violet"
    >
      {/* Bloc de présentation (demande 10), puis les témoignages (demande 13) : les deux vivent
          sur la même page « À propos », dans cet ordre, comme demandé. Photo d'équipe fournie par
          le client le 2026-10-08, recadrée pour retirer le crédit du studio photo visible en
          haut de l'image d'origine. */}
      <section className="bloc-presentation-hoc">
        <div className="photo-presentation-hoc">
          <img src={`${dossierAssets}/equipe-groupe.webp`} alt="L’équipe Hari Online Club réunie" loading="lazy" />
        </div>
        <div className="texte-presentation-hoc">
          {PRESENTATION_HOC.map((ligne) => (
            <p key={ligne.texte} className={ligne.fort ? 'ligne-presentation ligne-presentation--forte' : 'ligne-presentation'}>
              {ligne.texte}
            </p>
          ))}
        </div>
      </section>

      <h3 className="titre-bloc-temoignages">Témoignages de nos stagiaires</h3>

      {/* Pas de limite d'affichage : rien dans le document de retours du 2026-10-08 (demande 13)
          n'impose un nombre maximal de témoignages visibles — les 18 s'affichent d'un coup. */}
      <div className="grille-vue">
        {TEMOIGNAGES.map((temoignage) => (
          <article key={temoignage.id} className="carte-hoc carte-avis">
            <div className="entete-carte-avis">
              <span aria-hidden className="etoiles-avis">
                ★★★★★
              </span>
              <span className="badge-annee-avis">{temoignage.annee}</span>
            </div>
            <p className="citation-avis">« {temoignage.texte} »</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto' }}>
              {temoignage.photo ? (
                <span className="avatar-avis avatar-avis--photo">
                  <img
                    src={`${dossierAssets}/temoignages/${temoignage.photo}`}
                    alt={temoignage.nom}
                    loading="lazy"
                  />
                </span>
              ) : (
                <span className="avatar-avis">{initialesDe(temoignage.nom)}</span>
              )}
              <span className="nom-avis">{temoignage.nom}</span>
            </div>
          </article>
        ))}
      </div>

    </CadreVue>
  )
}

const PROGRAMMES: { type: TypeProgrammeProspect; tag: string; titre: string; texte: string; detail?: string }[] = [
  {
    type: 'individuel',
    tag: 'Individuel',
    titre: 'Cours particuliers',
    /* Le paragraphe de détail (anglais général/affaires, personnalisation) a été retiré ici
       (demande client du 2026-09-29) : à texte égal avec les deux autres cartes, les photos —
       calées en bas comme leur texte (voir .grille-cours dans index.css) — s'alignent
       naturellement, sans perdre l'espace qu'un texte plus long leur aurait pris. */
    texte:
      'Sur mesure : vous choisissez votre rythme et le sujet de chaque séance, avec un professeur rien que pour vous, calé sur votre objectif réel.',
  },
  {
    type: 'collectif',
    tag: 'Collectif',
    titre: 'Cours en petit groupe',
    texte:
      'Par vague, sur un planning établi par l’établissement, avec des groupes de niveaux différents pour progresser ensemble au bon rythme.',
  },
  {
    type: 'duo',
    tag: 'Duo',
    titre: 'Cours en duo',
    texte:
      'En couple ou entre amis, apprenez à deux sur un même créneau : un accompagnement pensé pour vos deux objectifs, à la fois complice et exigeant.',
  },
]

/* Description marketing + déroulé réel, formule par formule — demande client du 2026-10-06 :
   « une description marketing du cours et une explication du process [...] par rapport aux
   différents process définis dans HOC ». Chaque étape reprend un mécanisme qui existe vraiment
   dans l'application (appel diagnostic, forfait/rythme, professeur attitré, compte rendu et
   enquête de satisfaction après chaque séance pour l'individuel/duo ; quiz écrit puis test oral,
   conversion automatique et rattachement à une classe de niveau pour le collectif) — jamais une
   promesse que l'outil ne tient pas.

   Textes réécrits par la fondatrice le 2026-10-08 (demandes 7, 8 et 9 du document de retours) :
   paragraphe d'introduction de l'individuel et du duo remplacé, paragraphe supplémentaire ajouté
   au collectif (`descriptionComplement`), et étape 5 revue pour l'individuel et le collectif —
   l'enquête de satisfaction a lieu une seule fois, à la fin du parcours, et non à chaque séance. */
const DETAIL_PROGRAMMES: Record<
  TypeProgrammeProspect,
  { accroche: string; description: string; descriptionComplement?: string; etapes: string[] }
> = {
  individuel: {
    accroche: 'Un accompagnement sur-mesure, de la première minute à votre objectif',
    description:
      'Le cours individuel, c’est vous et votre formateur ou formatrice dédié·e, sur le rythme et les sujets qui comptent vraiment pour vous. Nous construisons votre parcours selon vos attentes et vos objectifs : préparer un entretien, développer votre anglais professionnel, préparer un projet de voyage ou d’immigration, réussir une certification (TOEIC, TOEFL, IELTS…) ou renforcer l’anglais de vos enfants. Chaque séance s’ajuste à la précédente : votre formateur ou formatrice suit votre progression et adapte le contenu en conséquence.',
    etapes: [
      'Réservez un appel diagnostic gratuit et sans engagement : nous évaluons votre niveau réel et clarifions votre objectif.',
      'Choisissez votre forfait d’heures et votre rythme hebdomadaire — vous gardez la main sur votre planning.',
      'Un professeur vous est attribué et devient votre interlocuteur unique pour toute la durée du forfait.',
      'Chaque séance se déroule en visioconférence, avec un compte rendu rédigé par votre professeur juste après.',
      'Votre progression est suivie séance après séance. À la fin de votre parcours, nous vous demandons de répondre à une enquête de satisfaction.',
    ],
  },
  duo: {
    accroche: 'Progressez à deux, sur un seul et même créneau',
    description:
      'Le cours en duo, c’est un professeur attitré et un suivi personnalisé, partagés entre deux personnes qui avancent ensemble : conjoints, amis, collègues ou membres d’une même famille. L’émulation du binôme entretient la motivation, sans jamais sacrifier l’attention portée à chacun : votre professeur veille à ce que les deux objectifs, même différents, soient servis à chaque séance. Les deux membres du duo doivent avoir le même niveau, ou des niveaux proches : nous les évaluons lors de l’appel diagnostic.',
    etapes: [
      'Réservez un appel diagnostic à deux : nous évaluons le niveau et l’objectif de chacun des deux membres du duo.',
      'Choisissez ensemble votre forfait d’heures et votre rythme hebdomadaire.',
      'Un seul professeur accompagne le binôme sur toute la durée du forfait, pour une vraie cohérence pédagogique.',
      'Les séances se déroulent en visioconférence, les deux membres du duo toujours réunis au même moment.',
      'Un compte rendu et un suivi de progression sont tenus pour le binôme à chaque séance.',
    ],
  },
  collectif: {
    accroche: 'Apprendre ensemble, au bon niveau, sur un planning établi',
    description:
      'Le cours collectif réunit un petit groupe d’élèves de niveau comparable au sein d’une même vague, sur un planning fixé à l’avance par l’établissement. C’est la formule la plus accessible pour qui aime apprendre au contact des autres, dans une dynamique de groupe qui pousse à parler, se corriger et progresser ensemble — sans jamais perdre en exigence pédagogique.',
    descriptionComplement:
      'Un cycle de cours collectifs dure 2 mois, à raison de 32 séances d’une heure. Nos cours collectifs n’ont rien d’élémentaire : nous avons développé une méthode interactive et communicative. Ici, pas de textes à trous pendant la séance. Les exercices se font en dehors du cours et sont remis à l’équipe pédagogique, pour que la séance en ligne reste un espace d’échange où chacun participe à des activités interactives.',
    etapes: [
      'Réservez une session de test oral rattachée à la prochaine vague qui vous intéresse.',
      'Répondez d’abord à un court questionnaire écrit de positionnement, qui situe un premier niveau indicatif.',
      'Passez le test oral en visioconférence : c’est lui qui confirme votre niveau définitif avec l’équipe pédagogique.',
      'Votre niveau validé, vous êtes automatiquement rattaché·e à la classe correspondante au sein de la vague.',
      'Les cours démarrent sur le planning de la vague. À la fin de chaque niveau, un test valide votre passage au niveau suivant. Un certificat vous est remis à la fin du niveau Advanced.',
    ],
  },
}

export function VueProgrammes({
  onReserver,
  tarifs,
  prochaineVague,
}: {
  accent: AccentPalette
  onReserver: (type: TypeProgrammeProspect) => void
  tarifs: Tarif[]
  prochaineVague: string | null
}) {
  const [detailOuvert, setDetailOuvert] = useState<TypeProgrammeProspect | null>(null)

  return (
    <CadreVue
      surtitre="Cours & tarifs"
      titre="Trois façons d’apprendre, un seul cap : votre objectif."
      sousTitre="Choisissez la formule qui correspond à votre rythme et à votre budget — prix compris."
      theme="violet"
    >
      <div className="grille-vue grille-cours">
        {PROGRAMMES.map((programme) => (
          <article key={programme.titre} className="carte-hoc carte-cours">
            {/* Photo en tête de carte, comme sur le visuel de référence (demande client du
                2026-09-29) : une personne seule, un duo en ligne, un groupe. */}
            <div className={`carte-cours-visuel carte-cours-visuel--${programme.type}`}>
              <img src={PHOTOS_FORMULE[programme.type].src} alt={PHOTOS_FORMULE[programme.type].alt} loading="lazy" />
              <span className="etiquette-programme">{programme.tag}</span>
              {/* Date de démarrage de la prochaine vague, à côté de l'étiquette « COLLECTIF »
                  (demande 6 du 2026-10-08). Renseignée depuis Paramètres (admin) : tant qu'elle
                  est vide, rien ne s'affiche plutôt qu'une date fausse ou un « à venir » creux. */}
              {programme.type === 'collectif' && prochaineVague && (
                <span className="etiquette-prochaine-vague">Prochaine vague : {prochaineVague}</span>
              )}
            </div>
            <div className="carte-cours-corps">
              <h3 className="titre-carte-hoc">{programme.titre}</h3>
              <p className="texte-carte-hoc">{programme.texte}</p>
              {programme.detail && <p className="detail-carte-hoc">{programme.detail}</p>}
              {/* Prix juste sous la description, dans la même carte (demande 4 du 2026-10-08 :
                  « le visiteur a l'information et le prix au même endroit ») — la page Tarifs
                  distincte a disparu au profit de cette page unique « Cours & tarifs ». */}
              <LignesTarif lignes={tarifs.filter((t) => t.type_programme === programme.type)} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
                <button type="button" onClick={() => onReserver(programme.type)} className="btn-shine bouton-or" style={{ marginTop: 0 }}>
                  {programme.type === 'collectif' ? 'Réserver mon test →' : 'Réserver mon appel →'}
                </button>
                <button type="button" onClick={() => setDetailOuvert(programme.type)} className="bouton-savoir-plus">
                  En savoir plus
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {detailOuvert && (
        <ModaleDetailProgramme
          type={detailOuvert}
          onFermer={() => setDetailOuvert(null)}
          onReserver={() => {
            setDetailOuvert(null)
            onReserver(detailOuvert)
          }}
        />
      )}
    </CadreVue>
  )
}

function ModaleDetailProgramme({
  type,
  onFermer,
  onReserver,
}: {
  type: TypeProgrammeProspect
  onFermer: () => void
  onReserver: () => void
}) {
  const detail = DETAIL_PROGRAMMES[type]
  const programme = PROGRAMMES.find((p) => p.type === type)

  return (
    <div className="voile-modale" onClick={onFermer}>
      <div role="dialog" aria-modal="true" aria-label={programme?.titre} className="card fenetre-reservation" onClick={(e) => e.stopPropagation()}>
        <header className="entete-reservation">
          <div style={{ minWidth: 0 }}>
            <span className="etiquette-programme" style={{ marginBottom: 8, display: 'inline-block' }}>
              {programme?.tag}
            </span>
            <h2 style={{ fontSize: 20, margin: '0 0 4px', color: 'var(--ink)' }}>{programme?.titre}</h2>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, fontStyle: 'italic' }}>{detail.accroche}</p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="fermer-modale">
            ×
          </button>
        </header>

        <div className="corps-reservation" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--ink-2)', margin: 0 }}>{detail.description}</p>
          {detail.descriptionComplement && (
            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--ink-2)', margin: 0 }}>{detail.descriptionComplement}</p>
          )}

          <div>
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', margin: '0 0 10px' }}>
              Comment ça se déroule
            </h3>
            <ol style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: 0, padding: 0, listStyle: 'none' }}>
              {detail.etapes.map((etape, index) => (
                <li key={index} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span
                    style={{
                      flexShrink: 0,
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 800,
                      color: '#2a1646',
                      background: 'var(--hoc-or)',
                    }}
                  >
                    {index + 1}
                  </span>
                  <span style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)' }}>{etape}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <button type="button" onClick={onReserver} className="btn-shine bouton-or" style={{ alignSelf: 'flex-start', marginTop: 0 }}>
          {type === 'collectif' ? 'Réserver mon test →' : 'Réserver mon appel →'}
        </button>
      </div>
    </div>
  )
}

/* Illustrations aquarelle générées (demande 5 du document de retours du 2026-10-08, règle B :
   uniquement des personnages illustrés aux traits africains/afro-asiatiques, jamais de photo de
   personne réelle) — remplacent les photos Unsplash utilisées jusqu'ici. Recadrées pour retirer
   le cadre blanc arrondi que l'outil de génération intègre à l'image, afin qu'elles occupent toute
   la carte comme les photos précédentes. */
const PHOTOS_FORMULE: Record<TypeProgrammeProspect, { src: string; alt: string }> = {
  individuel: { src: '/programmes/individuel.webp', alt: 'Illustration aquarelle d’un élève en appel vidéo avec son formateur sur son ordinateur portable' },
  duo: { src: '/programmes/duo.webp', alt: 'Illustration aquarelle de deux élèves côte à côte en appel vidéo avec leur professeur' },
  collectif: { src: '/programmes/collectif.webp', alt: 'Illustration aquarelle d’un petit groupe d’élèves qui échange autour d’un appel vidéo collectif' },
}

const LIMITE_TARIFS_VISIBLES = 4

/* Grille de prix d'une formule, affichée dans sa propre carte de la page « Cours & tarifs »
   (demande 4 du 2026-10-08 : la page Tarifs séparée a été fusionnée ici). Les 4 premières lignes
   sont visibles, le reste se déplie — un forfait individuel compte une dizaine de paliers, qui
   écraseraient la carte s'ils s'affichaient tous d'emblée. */
function LignesTarif({ lignes }: { lignes: Tarif[] }) {
  const [etendu, setEtendu] = useState(false)

  if (lignes.length === 0) {
    return <p className="detail-carte-hoc">Tarifs communiqués lors de l’appel diagnostic.</p>
  }

  const visibles = etendu ? lignes : lignes.slice(0, LIMITE_TARIFS_VISIBLES)
  const masquees = lignes.length - visibles.length

  return (
    <div className="bloc-tarifs-carte">
      {visibles.map((ligne) => (
        <div key={ligne.id} className="ligne-tarif">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <span className="ligne-tarif-titre">{ligne.titre}</span>
            <span className="ligne-tarif-prix">
              {ligne.prix.toLocaleString('fr-FR')} {ligne.unite}
            </span>
          </div>
          {ligne.description && <span className="ligne-tarif-description">{ligne.description}</span>}
        </div>
      ))}

      {lignes.length > LIMITE_TARIFS_VISIBLES && (
        <button type="button" onClick={() => setEtendu((v) => !v)} className="lien-deplier">
          {etendu ? 'Réduire ↑' : `Voir tous les tarifs (+${masquees}) ↓`}
        </button>
      )}
    </div>
  )
}

/* Équipe présentée en hiérarchie depuis le 2026-10-08 (demande 11 du document de retours, et
   ordre précisé par le client) : Harinjo seule en tête, puis Manda et Anael, puis Koloina, puis
   les formateurs. Les trois premiers niveaux sont l'équipe administrative, en grandes cartes ;
   les formateurs gardent la grille compacte de portraits ronds. */
export function VueProfesseurs({
  dossierAssets,
  onReserver,
}: {
  dossierAssets: string
  accent: AccentPalette
  onReserver: () => void
}) {
  const formateurs = EQUIPE_PEDAGOGIQUE.filter((m) => m.niveau === 4)

  return (
    <CadreVue
      surtitre="Professeurs"
      titre="Notre équipe"
      sousTitre="Des professeurs choisis pour leur pédagogie autant que pour leur passion des langues."
      theme="violet"
    >
      <div className="hierarchie-equipe">
        {([1, 2, 3] as const).map((niveau) => {
          const membres = EQUIPE_PEDAGOGIQUE.filter((m) => m.niveau === niveau)
          if (membres.length === 0) return null
          return (
            <div key={niveau} className="rangee-equipe-admin">
              {membres.map((membre) => (
                <article
                  key={membre.id ?? membre.nom}
                  className={niveau === 1 ? 'carte-equipe-admin carte-equipe-admin--fondatrice' : 'carte-equipe-admin'}
                >
                  {/* Niveau 1 = la fondatrice, seule à ce niveau par construction : seule sa photo
                      est carrée (demande client du 2026-10-08), le reste de l'équipe garde le
                      cadre rond d'origine (visuel de référence du 2026-10-06). */}
                  <PortraitMembre membre={membre} dossierAssets={dossierAssets} />
                  {membre.nom && <span className="nom-equipe-admin">{membre.nom}</span>}
                  <span className="etiquette-fonction">{membre.role}</span>
                  <p className="presentation-equipe-admin">{membre.slogan}</p>
                  {membre.linkedin && (
                    <a href={membre.linkedin} target="_blank" rel="noreferrer" className="lien-linkedin">
                      LinkedIn
                    </a>
                  )}
                </article>
              ))}
            </div>
          )
        })}
      </div>

      <h3 className="titre-bloc-formateurs">Nos formateurs et formatrices</h3>
      <div className="grille-equipe-pedagogique">
        {formateurs.map((membre) => (
          <article key={membre.id ?? membre.nom} className="carte-membre-equipe">
            <PortraitMembre membre={membre} dossierAssets={dossierAssets} />
            {/* Toutes les personnes de l'équipe sont nommées depuis le 2026-10-08. `nom` reste
                optionnel dans le type pour pouvoir ajouter quelqu'un sans nom en attendant sa
                photo ou son identité définitive, sans casser l'affichage (le rôle suffit alors). */}
            {membre.nom && <span className="nom-professeur">{membre.nom}</span>}
            <h3 className="role-professeur">{membre.role}</h3>
            <p className="slogan-membre-equipe">{membre.slogan}</p>
          </article>
        ))}
      </div>

      <div className="pied-equipe-pedagogique">
        <button type="button" onClick={onReserver} className="btn-shine bouton-or bouton-or--pilule">
          Rencontrer un professeur →
        </button>
      </div>
    </CadreVue>
  )
}

function PortraitMembre({
  membre,
  dossierAssets,
}: {
  membre: (typeof EQUIPE_PEDAGOGIQUE)[number]
  dossierAssets: string
}) {
  return (
    <div className="photo-membre-equipe">
      {membre.id ? (
        <img
          src={`${dossierAssets}/equipe/equipe-${membre.id}.webp`}
          alt={membre.nom ? `${membre.nom}, ${membre.role}` : membre.role}
          loading="lazy"
        />
      ) : (
        /* Pas encore de photo exploitable pour cette personne (cas d'Aina, 2026-10-08 : le
           fichier transmis par le client n'est pas un portrait) — avatar à initiales en
           attendant, plutôt qu'une photo manquante cassée. */
        <span className="initiales-membre-equipe" aria-hidden="true">
          {initialesDe(membre.nom ?? membre.role)}
        </span>
      )}
    </div>
  )
}

/* Équipe pédagogique, un portrait par personne — demande client du 2026-10-06, sur le modèle
   d'une grille d'équipe classique (photo ronde, nom puis poste, chacun sur sa propre ligne) dont
   le client a fourni l'image de référence. Photos préparées dans public/etablissements/
   hari-online-course/equipe/ (voir le script de préparation, scratchpad de la session).

   Mise à jour du 2026-10-08 (demande client, capture annotée) :
   — l'ancienne 3ᵉ « Professeure d'anglais » (id 17) retirée : photo fournie par le client sous le
     nom explicite « A supprimer.jpg » dans son dossier Musique, et marquée d'une croix rouge sur
     la capture d'écran envoyée ;
   — id 12 (ex-« Rado », Formateur) renommé en Koloina, Community Manager — même photo, seul le
     nom et le rôle changent, confirmé photo pour photo avec le fichier « Koloina.jpg » du client ;
   — id 9 et id 14 nommées Pamella et Patricia (confirmé photo pour photo avec les fichiers
     « Pamella.jpg »/« Patricia.jpg » du client, malgré un ordre gauche/droite annoncé qui ne
     correspondait pas à l'identité réelle des photos — l'identité de chaque personne prime sur sa
     position à l'écran) ;
   — 4 nouvelles professeures/professeurs d'anglais ajoutés (Miangaly, Raissa, Aina, Rado), fournis
     par le client dans le même dossier. Slogans inventés (demande client explicite, même ton que
     les rôles déjà précisés) ; rôle genré selon la personne sur la photo. Le fichier transmis pour
     Aina n'est pas un portrait (icône de coffre-fort) : `id` reste absent pour elle (demande
     client du 2026-10-08 : l'afficher quand même, avec un avatar à initiales en attendant la
     vraie photo — voir le rendu conditionnel dans `VueProfesseurs`).

   Photo d'id 16 (Harinjo) remplacée le 2026-10-08 (demande 12 du document de retours) par le
   fichier « FONDATRICE.jpg » fourni par le client : recadrée en buste pour exclure le filigrane
   du photographe et l'ordinateur portable visibles sur la photo d'origine.

   `niveau` (demande 11 du document de retours + hiérarchie précisée par le client le 2026-10-08) :
   1 Harinjo, 2 Manda et Anael, 3 Koloina, 4 les formateurs. Les niveaux 1 à 3 forment l'équipe
   administrative, présentée en grandes cartes (photo, nom, fonction en étiquette, présentation,
   LinkedIn) ; le niveau 4 reste une grille compacte de portraits. `linkedin` n'est renseigné pour
   personne pour l'instant : les liens font partie de ce que HOC doit encore fournir — le bouton
   n'apparaît que sur les fiches qui en ont un. */
const EQUIPE_PEDAGOGIQUE: {
  id?: number
  nom?: string
  role: string
  slogan: string
  niveau: 1 | 2 | 3 | 4
  linkedin?: string
}[] = [
  {
    id: 16,
    nom: 'Harinjo',
    role: 'Fondatrice',
    niveau: 1,
    slogan: 'Elle a fondé Hari Online Club avec une conviction simple : aucune application ne remplace le regard d’un professeur qui croit en vous.',
    // Lien transmis par le client le 2026-10-08 (demande 11).
    linkedin: 'https://www.linkedin.com/in/harinjo-andriamahenina-2488721b3/',
  },
  {
    id: 15,
    nom: 'Manda',
    role: 'Ingénieur pédagogue',
    niveau: 2,
    slogan: 'Elle conçoit les parcours et les outils qui structurent chaque cours, pour que la pédagogie HOC reste cohérente du premier au dernier élève.',
  },
  {
    id: 11,
    nom: 'Anael',
    role: 'Assistante admin',
    niveau: 2,
    slogan: 'Souvent le premier contact de chaque élève, elle veille à ce que chaque dossier avance sans accroc, du premier message à la première séance.',
  },
  {
    id: 12,
    nom: 'Koloina',
    role: 'Community Manager',
    niveau: 3,
    slogan: 'Elle anime la communauté HOC au quotidien et veille à ce que chaque élève se sente attendu, suivi et entendu.',
  },
  {
    id: 9,
    nom: 'Pamella',
    role: 'Professeure d’anglais',
    niveau: 4,
    slogan: 'Patiente et exigeante à la fois, elle pousse chaque élève un peu plus loin sans jamais le brusquer.',
  },
  {
    id: 14,
    nom: 'Patricia',
    role: 'Professeure d’anglais',
    niveau: 4,
    slogan: 'Minutieuse et à l’écoute, elle construit avec chaque élève un parcours taillé pour son objectif réel.',
  },
  {
    id: 18,
    nom: 'Miangaly',
    role: 'Professeure d’anglais',
    niveau: 4,
    slogan: 'Souriante et rigoureuse, elle installe tout de suite un climat de confiance qui donne envie de prendre la parole.',
  },
  {
    id: 19,
    nom: 'Raissa',
    role: 'Professeure d’anglais',
    niveau: 4,
    slogan: 'À l’écoute et méthodique, elle avance pas à pas avec chaque élève pour consolider durablement ses acquis.',
  },
  {
    id: 20,
    nom: 'Rado',
    role: 'Professeur d’anglais',
    niveau: 4,
    slogan: 'Dynamique et bienveillant, il pousse chaque élève à oser parler, erreurs comprises, pour progresser plus vite.',
  },
  {
    nom: 'Aina',
    role: 'Professeure d’anglais',
    niveau: 4,
    slogan: 'Appliquée et chaleureuse, elle prend le temps de comprendre l’objectif de chaque élève avant de tracer son parcours.',
  },
]

function CadreVue({
  surtitre,
  titre,
  sousTitre,
  theme,
  children,
}: {
  /* Petit libellé doré au-dessus du titre : l'intitulé de l'onglet de navigation, rien de plus. */
  surtitre: string
  titre: string
  sousTitre: string
  theme: 'violet' | 'nuit'
  children: ReactNode
}) {
  return (
    <section className={`vue-secondaire vue-theme-${theme}`}>
      <header className="entete-vue">
        {theme === 'violet' && <span className="surtitre-vue">{surtitre}</span>}
        <h2 className="titre-vue">{titre}</h2>
        {theme === 'violet' && <span className="trait-vue" aria-hidden="true" />}
        <p className="soustitre-vue">{sousTitre}</p>
      </header>
      <div className="vue-secondaire-corps">{children}</div>
    </section>
  )
}
