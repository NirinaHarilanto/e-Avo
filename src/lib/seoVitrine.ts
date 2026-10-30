/* Référencement des pages publiques — brief SEO du client du 2026-10-30.
 *
 * POURQUOI CE FICHIER EXISTE. La vitrine est une application d'une seule page : `index.html` est
 * servi tel quel pour les six adresses publiques, et c'est React qui remplace ensuite `#root`.
 * Résultat avant ce fichier : Google (et tout robot) recevait SIX pages portant le même
 * `<title>Hari Online Club</title>` et la même description, aucune ne contenant « cours
 * d'anglais » ni « Madagascar » — exactement ce que le brief demande de corriger.
 *
 * La correction se fait AU BUILD, pas à l'exécution : le plugin `seoPagesVitrine` (vite.config.ts)
 * écrit un fichier HTML par adresse, chacun avec ses propres balises, et `vercel.json` renvoie
 * chaque route vers le sien. Un robot qui n'exécute pas de JavaScript — les aperçus de lien de
 * WhatsApp, Facebook ou LinkedIn, entre autres — voit donc le bon titre sans rien exécuter.
 * Le CORPS de la page reste rendu par React : seul l'en-tête est pré-écrit.
 *
 * Aucune dépendance ici (ni React, ni navigateur) : ce module est importé par la configuration de
 * build qui tourne sous Node, et testé isolément comme quiz.ts ou classesCollectif.ts. */

export const SITE = 'https://www.harionlineclub.app'

/* Le nom officiel, tel que le brief l'impose : « "Hari Online Club" est le nom officiel de
   l'établissement. "CHILLY" n'est pas le nom officiel et ne doit pas être utilisé comme nom de
   marque dans les titres SEO ou les contenus de présentation. » */
export const NOM_ETABLISSEMENT = 'Hari Online Club'

/* Photo du hero : un élève en cours d'anglais en visioconférence. Sert d'aperçu quand un lien du
   site est partagé. Déjà présente et déjà optimisée (137 Ko), donc aucun nouvel actif à produire. */
export const IMAGE_PARTAGE = `${SITE}/hero-visio.webp`

export interface PageVitrine {
  /* Chemin servi, sans barre finale (sauf la racine). */
  chemin: string
  /* Nom du fichier écrit dans `dist/`. La racine garde `index.html`, que Vercel sert par défaut. */
  fichier: string
  titre: string
  description: string
}

/* Les titres reprennent les intentions de recherche listées au point 8 du brief (« cours
   d'anglais en ligne à Madagascar », « cours d'anglais individuel en ligne », « cours d'anglais en
   duo », « cours d'anglais collectif »), chacune sur la page qui y répond réellement — jamais la
   même sur deux pages, sans quoi elles se concurrenceraient entre elles.

   Le titre et la description de l'accueil sont repris MOT POUR MOT du brief (point 4.1) : ce sont
   les textes que le client a validés. Les autres pages suivent la même forme (« intention |
   marque »). Google reste libre de réécrire l'un ou l'autre selon la recherche, le brief le dit
   lui-même. */
export const PAGES_VITRINE: PageVitrine[] = [
  {
    chemin: '/',
    fichier: 'index.html',
    titre: `Cours d’anglais en ligne à Madagascar | ${NOM_ETABLISSEMENT}`,
    description:
      'Découvrez Hari Online Club : des cours d’anglais en ligne individuels, en duo ou en groupe. Développez votre expression orale et gagnez en confiance grâce à un apprentissage axé sur la pratique.',
  },
  {
    chemin: '/cours',
    fichier: 'cours.html',
    titre: `Cours d’anglais en ligne : formules et tarifs | ${NOM_ETABLISSEMENT}`,
    description:
      'Cours d’anglais individuel, en duo ou en petit groupe, en visioconférence. Comparez les formules, les rythmes et les tarifs, et réservez votre appel diagnostic.',
  },
  {
    chemin: '/professeurs',
    fichier: 'professeurs.html',
    titre: `Nos professeurs d’anglais certifiés | ${NOM_ETABLISSEMENT}`,
    description:
      'Rencontrez l’équipe de Hari Online Club : des professeurs d’anglais certifiés, choisis pour leur pédagogie et leur capacité à faire progresser chaque apprenant.',
  },
  {
    chemin: '/temoignages',
    fichier: 'temoignages.html',
    titre: `Témoignages de nos étudiants | ${NOM_ETABLISSEMENT}`,
    description:
      'Des parcours réels, racontés par celles et ceux qui les ont suivis : ce que nos étudiants retiennent de leurs cours d’anglais en ligne chez Hari Online Club.',
  },
  {
    chemin: '/events',
    fichier: 'events.html',
    titre: `Ateliers et rencontres en anglais | ${NOM_ETABLISSEMENT}`,
    description:
      'Ateliers, rencontres et sessions de conversation en anglais : retrouvez les temps forts de la vie du Hari Online Club et les prochains rendez-vous.',
  },
  {
    chemin: '/a-propos',
    fichier: 'a-propos.html',
    titre: `L’histoire de ${NOM_ETABLISSEMENT} | Cours d’anglais en ligne`,
    description:
      'Né en 2022 d’une conviction : une langue s’apprend en la pratiquant. Découvrez l’histoire, la mission et l’approche pédagogique de Hari Online Club.',
  },
  {
    chemin: '/rejoignez-nous',
    fichier: 'rejoignez-nous.html',
    titre: `Devenir professeur d’anglais | ${NOM_ETABLISSEMENT}`,
    description:
      'Vous enseignez l’anglais et souhaitez rejoindre une équipe qui mise sur la pratique et l’interaction ? Déposez votre candidature auprès de Hari Online Club.',
  },
  {
    chemin: '/confidentialite',
    fichier: 'confidentialite.html',
    titre: `Politique de confidentialité | ${NOM_ETABLISSEMENT}`,
    description: 'Comment Hari Online Club collecte, utilise et protège les données personnelles de ses apprenants.',
  },
  {
    chemin: '/conditions-utilisation',
    fichier: 'conditions-utilisation.html',
    titre: `Conditions d’utilisation | ${NOM_ETABLISSEMENT}`,
    description: 'Les conditions d’utilisation de la plateforme et des cours proposés par Hari Online Club.',
  },
]

/* Données structurées de l'établissement, posées sur TOUTES les pages publiques : c'est ce qui
   permet à Google de rattacher le site à une entité nommée plutôt qu'à une suite de mots. Le type
   `EducationalOrganization` décrit l'établissement lui-même ; `areaServed` dit explicitement
   Madagascar, l'une des intentions de recherche du brief.

   `sameAs` (profils sociaux) est volontairement absent : le brief signale que des profils
   apparaissent en recherche de marque, mais ne donne aucune adresse. Les y déclarer de mémoire
   enverrait Google vers de mauvaises pages — à compléter quand le client fournira les liens. */
export function donneesStructureesEtablissement(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: NOM_ETABLISSEMENT,
    alternateName: 'HOC',
    url: `${SITE}/`,
    logo: `${SITE}/logo-hoc.png`,
    image: IMAGE_PARTAGE,
    description:
      'Hari Online Club propose des cours d’anglais en ligne, en individuel, en duo ou en petit groupe, avec des professeurs certifiés et une approche centrée sur la pratique orale.',
    foundingDate: '2022',
    areaServed: { '@type': 'Country', name: 'Madagascar' },
    knowsLanguage: ['fr', 'en'],
  }
}

/* Les trois formats, décrits comme des cours au sens de Schema.org — uniquement sur la page qui
   les présente réellement (`/cours`). `Course` est le vocabulaire que Google attend pour une offre
   de formation ; le déclarer ailleurs que sur la page correspondante serait trompeur. */
export function donneesStructureesCours(): Record<string, unknown> {
  const formats = [
    {
      nom: 'Cours d’anglais individuel en ligne',
      description:
        'Un accompagnement personnalisé avec un professeur dédié, adapté à votre niveau, vos objectifs et votre rythme d’apprentissage.',
    },
    {
      nom: 'Cours d’anglais en duo en ligne',
      description:
        'Apprenez l’anglais à deux et développez vos compétences grâce à des séances interactives avec un professeur.',
    },
    {
      nom: 'Cours d’anglais collectif en ligne',
      description:
        'Progressez en petit groupe, échangez avec d’autres apprenants et développez votre aisance à l’oral dans un environnement stimulant.',
    },
  ]
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: formats.map((f, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Course',
        name: f.nom,
        description: f.description,
        inLanguage: 'fr',
        teaches: 'Anglais',
        provider: { '@type': 'EducationalOrganization', name: NOM_ETABLISSEMENT, url: `${SITE}/` },
      },
    })),
  }
}

/* Plan du site : les neuf adresses publiques, et elles seules. Les espaces connectés n'y figurent
   pas (ils sont derrière authentification, et robots.txt les exclut déjà), pas plus que la route
   `/e/:slug`, qui affiche la même page que la racine. */
export function planDuSite(jour = new Date().toISOString().slice(0, 10)): string {
  const urls = PAGES_VITRINE.map((page) => {
    const url = page.chemin === '/' ? `${SITE}/` : `${SITE}${page.chemin}`
    /* La racine et la page des cours sont les deux portes d'entrée du site : elles portent la
       priorité la plus haute. Les pages légales, la plus basse — elles doivent rester trouvables,
       pas être mises en avant. */
    const legale = page.chemin === '/confidentialite' || page.chemin === '/conditions-utilisation'
    const priorite = page.chemin === '/' ? '1.0' : page.chemin === '/cours' ? '0.9' : legale ? '0.3' : '0.7'
    return `  <url>\n    <loc>${url}</loc>\n    <lastmod>${jour}</lastmod>\n    <priority>${priorite}</priority>\n  </url>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}

function echapper(texte: string): string {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/* L'en-tête complet d'une page : titre, description, adresse canonique, balises de partage et
   données structurées. Rendu sous forme de chaîne parce qu'il est injecté dans le `index.html`
   DÉJÀ construit par Vite — réécrire ce fichier après coup évite de toucher à la chaîne de build. */
export function baliseSeo(page: PageVitrine): string {
  const url = page.chemin === '/' ? `${SITE}/` : `${SITE}${page.chemin}`
  const jsonLd = [donneesStructureesEtablissement()]
  if (page.chemin === '/cours') jsonLd.push(donneesStructureesCours())

  return [
    `<title>${echapper(page.titre)}</title>`,
    `<meta name="description" content="${echapper(page.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${echapper(NOM_ETABLISSEMENT)}" />`,
    `<meta property="og:locale" content="fr_FR" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${echapper(page.titre)}" />`,
    `<meta property="og:description" content="${echapper(page.description)}" />`,
    `<meta property="og:image" content="${IMAGE_PARTAGE}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${echapper(page.titre)}" />`,
    `<meta name="twitter:description" content="${echapper(page.description)}" />`,
    `<meta name="twitter:image" content="${IMAGE_PARTAGE}" />`,
    ...jsonLd.map((bloc) => `<script type="application/ld+json">${JSON.stringify(bloc)}</script>`),
  ].join('\n    ')
}
