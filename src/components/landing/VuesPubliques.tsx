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

const LIMITE_TEMOIGNAGES_VISIBLES = 7

function initialesDe(nom: string) {
  return nom
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase())
    .join('')
}

export function VueAvis({ dossierAssets }: { dossierAssets: string }) {
  const [etendu, setEtendu] = useState(false)
  const visibles = etendu ? TEMOIGNAGES : TEMOIGNAGES.slice(0, LIMITE_TEMOIGNAGES_VISIBLES)
  const masques = TEMOIGNAGES.length - LIMITE_TEMOIGNAGES_VISIBLES

  return (
    <CadreVue
      surtitre="À propos"
      titre="Ce qu’en disent nos élèves"
      sousTitre="Des retours authentiques, recueillis depuis 2024 auprès de nos élèves."
      theme="violet"
    >
      <div className="grille-vue">
        {visibles.map((temoignage) => (
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

      {masques > 0 && (
        <button type="button" onClick={() => setEtendu((v) => !v)} className="lien-deplier lien-deplier--centre">
          {etendu ? 'Réduire ↑' : `Voir tous les témoignages (+${masques}) ↓`}
        </button>
      )}
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

const PROGRAMME_LABEL: Record<TypeProgrammeProspect, string> = {
  individuel: 'Individuel',
  duo: 'Duo',
  collectif: 'Collectif',
}

/* Description marketing + déroulé réel, formule par formule — demande client du 2026-10-06 :
   « une description marketing du cours et une explication du process [...] par rapport aux
   différents process définis dans HOC ». Chaque étape reprend un mécanisme qui existe vraiment
   dans l'application (appel diagnostic, forfait/rythme, professeur attitré, compte rendu et
   enquête de satisfaction après chaque séance pour l'individuel/duo ; quiz écrit puis test oral,
   conversion automatique et rattachement à une classe de niveau pour le collectif) — jamais une
   promesse que l'outil ne tient pas. */
const DETAIL_PROGRAMMES: Record<TypeProgrammeProspect, { accroche: string; description: string; etapes: string[] }> = {
  individuel: {
    accroche: 'Un accompagnement sur-mesure, de la première minute à votre objectif',
    description:
      'Le cours individuel va droit au but : vous seul·e face à votre professeur, sur le rythme et les sujets qui comptent vraiment pour vous — préparation d’un entretien, anglais des affaires, remise à niveau avant un départ à l’étranger, ou simplement le plaisir de progresser sans contrainte de groupe. Chaque séance s’ajuste à ce qui s’est passé à la précédente : votre professeur suit votre progression de près et adapte le contenu en conséquence.',
    etapes: [
      'Réservez un appel diagnostic gratuit et sans engagement : nous évaluons votre niveau réel et clarifions votre objectif.',
      'Choisissez votre forfait d’heures et votre rythme hebdomadaire — vous gardez la main sur votre planning.',
      'Un professeur vous est attribué et devient votre interlocuteur unique pour toute la durée du forfait.',
      'Chaque séance se déroule en visioconférence, avec un compte rendu rédigé par votre professeur juste après.',
      'Votre progression est suivie séance après séance, avec une enquête de satisfaction à chaque fin de cours.',
    ],
  },
  duo: {
    accroche: 'Progressez à deux, sur un seul et même créneau',
    description:
      'Le cours en duo reprend exactement le fonctionnement du cours individuel — même professeur attitré, même suivi personnalisé — mais partagé entre deux personnes qui avancent ensemble : conjoints, amis, collègues ou membres d’une même famille. L’émulation du binôme garde la motivation intacte, sans jamais sacrifier l’attention portée à chacun : votre professeur veille à ce que les deux objectifs, même différents, soient servis à chaque séance.',
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
    etapes: [
      'Réservez une session de test oral rattachée à la prochaine vague qui vous intéresse.',
      'Répondez d’abord à un court questionnaire écrit de positionnement, qui situe un premier niveau indicatif.',
      'Passez le test oral en visioconférence : c’est lui qui confirme votre niveau définitif avec l’équipe pédagogique.',
      'Votre niveau validé, vous êtes automatiquement rattaché·e à la classe correspondante au sein de la vague.',
      'Les cours démarrent sur le planning de la vague, avec le même suivi — comptes rendus et enquêtes de satisfaction — que les autres formules.',
    ],
  },
}

export function VueProgrammes({
  onReserver,
}: {
  accent: AccentPalette
  onReserver: (type: TypeProgrammeProspect) => void
}) {
  const [detailOuvert, setDetailOuvert] = useState<TypeProgrammeProspect | null>(null)

  return (
    <CadreVue
      surtitre="Cours"
      titre="Trois façons d’apprendre, un seul cap : votre objectif."
      sousTitre="Choisissez la formule qui correspond à votre rythme et à votre budget."
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
            </div>
            <div className="carte-cours-corps">
              <h3 className="titre-carte-hoc">{programme.titre}</h3>
              <p className="texte-carte-hoc">{programme.texte}</p>
              {programme.detail && <p className="detail-carte-hoc">{programme.detail}</p>}
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

/* Photos Unsplash (licence Unsplash : usage commercial libre, sans attribution obligatoire),
   réduites à 960 px et converties en WebP dans public/programmes :
   — individuel : Julio Lopez, unsplash.com/photos/Imz-pn2LMbg
   — duo : Chidera Faustina Okeke, unsplash.com/photos/2FDdgn0-W_o
   — collectif : Vitaly Gariev, unsplash.com/photos/-X4Qx4_4iMU */
const PHOTOS_FORMULE: Record<TypeProgrammeProspect, { src: string; alt: string }> = {
  individuel: { src: '/programmes/individuel.webp', alt: 'Une élève étudie seule avec son casque, devant son ordinateur' },
  duo: { src: '/programmes/duo.webp', alt: 'Deux amies suivent ensemble un cours en ligne sur un ordinateur portable' },
  collectif: { src: '/programmes/collectif.webp', alt: 'Un groupe d’élèves souriants suit un cours en ligne autour d’un ordinateur' },
}

const LIMITE_TARIFS_VISIBLES = 4

export function VueTarifs({
  tarifs,
  onReserver,
}: {
  tarifs: Tarif[]
  accent: AccentPalette
  onReserver: (type: TypeProgrammeProspect) => void
}) {
  return (
    <CadreVue
      surtitre="Tarifs"
      titre="Tarifs"
      sousTitre="Des formules claires, sans frais cachés. Le premier appel est toujours gratuit."
      theme="violet"
    >
      {tarifs.length === 0 ? (
        <p className="texte-carte-hoc" style={{ textAlign: 'center' }}>
          Les tarifs seront publiés très prochainement.
        </p>
      ) : (
        <div className="grille-vue">
          {(['individuel', 'duo', 'collectif'] as const).map((type) => {
            const lignes = tarifs.filter((t) => t.type_programme === type)
            if (lignes.length === 0) return null
            return <BlocTarif key={type} type={type} lignes={lignes} onReserver={onReserver} />
          })}
        </div>
      )}
    </CadreVue>
  )
}

function BlocTarif({
  type,
  lignes,
  onReserver,
}: {
  type: TypeProgrammeProspect
  lignes: Tarif[]
  onReserver: (type: TypeProgrammeProspect) => void
}) {
  const [etendu, setEtendu] = useState(false)
  const visibles = etendu ? lignes : lignes.slice(0, LIMITE_TARIFS_VISIBLES)
  const masquees = lignes.length - visibles.length

  return (
    <article className="carte-hoc carte-tarif">
      <span className="etiquette-programme">{PROGRAMME_LABEL[type]}</span>
      <h3 className="titre-carte-hoc">
        {type === 'individuel' ? 'Cours particuliers' : type === 'duo' ? 'Cours en duo' : 'Cours en petit groupe'}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
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
      </div>

      {lignes.length > LIMITE_TARIFS_VISIBLES && (
        <button type="button" onClick={() => setEtendu((v) => !v)} className="lien-deplier">
          {etendu ? 'Réduire ↑' : `Voir tous les tarifs (+${masquees}) ↓`}
        </button>
      )}

      <button type="button" onClick={() => onReserver(type)} className="btn-shine bouton-or">
        Réserver →
      </button>
    </article>
  )
}

/* Toute l'équipe sur une seule grille de portraits. Les deux cartes éditoriales « Notre
   directrice »/« Notre équipe » qui occupaient cette vue ont été retirées le 2026-10-07 : elles se
   chevauchaient avec la grille (elles réclamaient toute la hauteur disponible et l'écrasaient), et
   le client a demandé de n'en garder que les portraits. */
export function VueProfesseurs({
  dossierAssets,
  onReserver,
}: {
  dossierAssets: string
  accent: AccentPalette
  onReserver: () => void
}) {
  return (
    <CadreVue
      surtitre="Professeurs"
      titre="Notre équipe"
      sousTitre="Des professeurs choisis pour leur pédagogie autant que pour leur passion des langues."
      theme="violet"
    >
      <div className="grille-equipe-pedagogique">
        {EQUIPE_PEDAGOGIQUE.map((membre) => (
          <article key={membre.id ?? membre.nom} className="carte-membre-equipe">
            <div className="photo-membre-equipe">
              {membre.id ? (
                <img
                  src={`${dossierAssets}/equipe/equipe-${membre.id}.webp`}
                  alt={membre.nom ? `${membre.nom}, ${membre.role}` : membre.role}
                  loading="lazy"
                />
              ) : (
                /* Pas encore de photo exploitable pour cette personne (cas d'Aina, 2026-10-08 :
                   le fichier transmis par le client n'est pas un portrait) — avatar à initiales
                   en attendant, plutôt qu'une photo manquante cassée. */
                <span className="initiales-membre-equipe" aria-hidden="true">
                  {initialesDe(membre.nom ?? membre.role)}
                </span>
              )}
            </div>
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
     vraie photo — voir le rendu conditionnel dans `VueProfesseurs`). */
const EQUIPE_PEDAGOGIQUE: { id?: number; nom?: string; role: string; slogan: string }[] = [
  {
    id: 16,
    nom: 'Harinjo',
    role: 'Fondatrice',
    slogan: 'Elle a fondé Hari Online Club avec une conviction simple : aucune application ne remplace le regard d’un professeur qui croit en vous.',
  },
  {
    id: 15,
    nom: 'Manda',
    role: 'Ingénieur pédagogue',
    slogan: 'Elle conçoit les parcours et les outils qui structurent chaque cours, pour que la pédagogie HOC reste cohérente du premier au dernier élève.',
  },
  {
    id: 11,
    nom: 'Anael',
    role: 'Assistante admin',
    slogan: 'Souvent le premier contact de chaque élève, elle veille à ce que chaque dossier avance sans accroc, du premier message à la première séance.',
  },
  {
    id: 12,
    nom: 'Koloina',
    role: 'Community Manager',
    slogan: 'Elle anime la communauté HOC au quotidien et veille à ce que chaque élève se sente attendu, suivi et entendu.',
  },
  {
    id: 9,
    nom: 'Pamella',
    role: 'Professeure d’anglais',
    slogan: 'Patiente et exigeante à la fois, elle pousse chaque élève un peu plus loin sans jamais le brusquer.',
  },
  {
    id: 14,
    nom: 'Patricia',
    role: 'Professeure d’anglais',
    slogan: 'Minutieuse et à l’écoute, elle construit avec chaque élève un parcours taillé pour son objectif réel.',
  },
  {
    id: 18,
    nom: 'Miangaly',
    role: 'Professeure d’anglais',
    slogan: 'Souriante et rigoureuse, elle installe tout de suite un climat de confiance qui donne envie de prendre la parole.',
  },
  {
    id: 19,
    nom: 'Raissa',
    role: 'Professeure d’anglais',
    slogan: 'À l’écoute et méthodique, elle avance pas à pas avec chaque élève pour consolider durablement ses acquis.',
  },
  {
    id: 20,
    nom: 'Rado',
    role: 'Professeur d’anglais',
    slogan: 'Dynamique et bienveillant, il pousse chaque élève à oser parler, erreurs comprises, pour progresser plus vite.',
  },
  {
    nom: 'Aina',
    role: 'Professeure d’anglais',
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
