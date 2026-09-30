/* Synthèse automatique des comptes rendus de séance d'un élève — demande client du 2026-09-30 :
   « un bouton brillant qui permet de résumer à tout moment tous les comptes rendus de tous les
   cours de séances faits par l'étudiant [...] En phase de production, il faut que l'admin puisse
   s'en servir parfaitement sans passer par l'intelligence artificielle de Claude en ligne ».

   D'où une synthèse CALCULÉE, pas générée par un modèle de langage : aucune clé d'API à souscrire,
   à facturer ni à renouveler, aucun appel réseau vers un tiers, aucune donnée pédagogique d'élève
   qui sort de l'établissement, et un résultat identique à chaque clic (deux admins qui regardent
   le même dossier lisent la même chose). Le prix de ce choix est assumé : la synthèse restitue et
   agrège ce que les professeurs ont écrit, elle ne le reformule pas en prose.

   Tout est ici, en fonctions pures, plutôt que dans le composant d'affichage : c'est la partie
   qu'on peut couvrir de tests (voir __tests__/syntheseComptesRendus.test.ts) et qui sert aussi à
   produire la version texte copiable. */

import { compteRenduRempli, libelleObjectif, libelleProgres, type CompteRenduValeurs } from './compteRendu'

export interface EntreeCompteRendu {
  rapport: CompteRenduValeurs
  /* Début de la séance (ISO) — l'ordre de la synthèse suit la chronologie des SÉANCES, pas celle
     de rédaction des comptes rendus : un professeur peut rattraper un compte rendu oublié après
     en avoir rédigé un plus récent. */
  debut: string
  dureeMinutes: number
  type: string
  professeur: string | null
  present: boolean | null
}

export type Tendance = 'hausse' | 'stable' | 'baisse'

export interface ExtraitDate {
  date: string
  texte: string
  professeur: string | null
}

export interface SyntheseComptesRendus {
  nbComptesRendus: number
  /* Séances clôturées de l'élève, comptes rendus vides ou absents compris : l'écart avec
     `nbComptesRendus` est l'information la plus utile à un admin (des séances facturées sans
     trace pédagogique), elle ne se déduit d'aucun autre écran. */
  nbSeancesTerminees: number
  periode: { premiere: string; derniere: string } | null
  heures: number
  professeurs: string[]
  presence: { presents: number; absents: number; renseignees: number }
  /* Compétences travaillées (les `objectifs` cochés), de la plus fréquente à la plus rare.
     `part` = pourcentage des comptes rendus qui la mentionnent — plusieurs compétences par séance,
     donc la somme des parts dépasse 100 %, c'est attendu. */
  competences: { libelle: string; nb: number; part: number }[]
  progres: { libelle: string; nb: number }[]
  dernierProgres: { libelle: string; date: string } | null
  tendance: Tendance | null
  themes: { mot: string; nb: number }[]
  aEteVu: ExtraitDate[]
  pointsAAmeliorer: ExtraitDate[]
  remarques: ExtraitDate[]
  /* Comptes rendus retenus (non vides), du plus récent au plus ancien — le fil détaillé affiché
     sous la synthèse, pour vérifier une affirmation à la source. */
  entrees: EntreeCompteRendu[]
}

/* Note de progrès convertie en score pour pouvoir dégager une tendance. Échelle de
   NIVEAUX_PROGRES (compteRendu.ts), du plus faible au plus fort. */
const SCORE_PROGRES: Record<string, number> = { faible: 1, modere: 2, bon: 3, important: 4 }

/* Écart de moyenne, entre la première et la seconde moitié du suivi, à partir duquel on parle
   d'évolution plutôt que de stabilité. 0,4 sur une échelle de 4 : moins de la moitié d'un cran,
   donc une tendance ne s'affiche pas sur un simple « bon » devenu « important » une seule fois. */
const SEUIL_TENDANCE = 0.4

/* Nombre minimum de notes de progrès pour oser une tendance : avec moins de quatre points, deux
   moitiés d'un ou deux comptes rendus ne décrivent rien. */
const MIN_NOTES_TENDANCE = 4

/* Mots vides du français, plus le vocabulaire de remplissage propre aux comptes rendus de cours
   (« séance », « élève », « cours »…) qui apparaîtrait en tête de tous les thèmes sans rien
   apprendre. Écrits sans accent : la comparaison se fait sur la forme normalisée (voir
   `normaliser`). */
const MOTS_VIDES = new Set([
  'afin', 'ainsi', 'alors', 'apres', 'assez', 'aucun', 'aussi', 'autre', 'autres', 'avait', 'avant', 'avec', 'avoir',
  'beaucoup', 'bien', 'bonne', 'bonnes', 'cela', 'cependant', 'certains', 'ces', 'cet', 'cette', 'ceux', 'chaque',
  'chez', 'comme', 'comment', 'dans', 'deja', 'depuis', 'des', 'deux', 'doit', 'donc', 'dont', 'elle', 'elles',
  'encore', 'ensuite', 'entre', 'est', 'etait', 'etaient', 'etant', 'ete', 'etre', 'eux', 'fait', 'faire', 'faut',
  'fois', 'grace', 'jusqu', 'les', 'leur', 'leurs', 'lors', 'lui', 'mais', 'meme', 'mes', 'mieux', 'moins', 'nos',
  'notre', 'nous', 'ont', 'parce', 'pas', 'pendant', 'peu', 'peut', 'plus', 'plusieurs', 'pour', 'pourrait',
  'pouvoir', 'prochaine', 'puis', 'quand', 'que', 'quel', 'quelle', 'quelques', 'qui', 'quoi', 'reste', 'sans',
  'sera', 'seront', 'ses', 'son', 'sont', 'sous', 'suis', 'sur', 'tous', 'tout', 'toute', 'toutes', 'tres', 'trop',
  'une', 'vers', 'votre', 'vous',
  // Vocabulaire du contexte, toujours présent donc jamais discriminant.
  'cours', 'seance', 'seances', 'eleve', 'eleves', 'etudiant', 'etudiante', 'aujourd', 'hui', 'travail',
])

/* Longueur minimale d'un mot retenu comme thème : en dessous, ce sont des articles, des
   prépositions et des sigles trop courts pour être lisibles hors contexte. */
const LONGUEUR_MIN_THEME = 4

/* Nombre de comptes rendus DIFFÉRENTS dans lesquels un mot doit revenir pour être un thème : un
   mot vu une seule fois n'est pas récurrent, il est déjà lisible dans le fil des séances. */
const MIN_OCCURRENCES_THEME = 2

const MAX_THEMES = 8

function normaliser(mot: string): string {
  return mot
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/* Mots porteurs de sens d'un texte libre, dédoublonnés : le comptage se fait ensuite par compte
   rendu (fréquence documentaire), pour qu'un mot martelé dix fois dans un seul compte rendu ne
   passe pas devant un mot qui revient de séance en séance. */
function motsSignificatifs(texte: string): Map<string, string> {
  const parForme = new Map<string, string>()
  for (const brut of texte.split(/[^\p{L}\p{N}'’-]+/u)) {
    const mot = brut.replace(/^[-'’]+|[-'’]+$/g, '')
    if (mot.length < LONGUEUR_MIN_THEME) continue
    const cle = normaliser(mot)
    if (cle.length < LONGUEUR_MIN_THEME || MOTS_VIDES.has(cle)) continue
    // Forme affichée : la première rencontrée (l'ordre des comptes rendus est chronologique, donc
    // stable), toujours en minuscules. Garder la casse d'origine reviendrait à afficher
    // « Prononciation » dès que le mot ouvre une phrase — distinguer ce cas d'un vrai nom propre
    // demanderait une analyse de phrase qui n'a pas sa place dans un comptage de mots.
    if (!parForme.has(cle)) parForme.set(cle, mot.toLowerCase())
  }
  return parForme
}

function extraits(entrees: EntreeCompteRendu[], champ: keyof CompteRenduValeurs): ExtraitDate[] {
  return entrees
    .map((e) => ({ date: e.debut, texte: ((e.rapport[champ] as string | null) ?? '').trim(), professeur: e.professeur }))
    .filter((x) => x.texte.length > 0)
}

function tendanceDesProgres(chronologique: EntreeCompteRendu[]): Tendance | null {
  const scores = chronologique.map((e) => SCORE_PROGRES[e.rapport.progres ?? '']).filter((s): s is number => !!s)
  if (scores.length < MIN_NOTES_TENDANCE) return null
  const milieu = Math.floor(scores.length / 2)
  const moyenne = (liste: number[]) => liste.reduce((t, s) => t + s, 0) / liste.length
  const ecart = moyenne(scores.slice(milieu)) - moyenne(scores.slice(0, milieu))
  if (ecart > SEUIL_TENDANCE) return 'hausse'
  if (ecart < -SEUIL_TENDANCE) return 'baisse'
  return 'stable'
}

/* Construit la synthèse à partir des comptes rendus VISIBLES par l'appelant : la RLS de
   `session_reports` (0033) a déjà filtré en amont — un admin voit tout son établissement, un
   professeur uniquement les comptes rendus dont il est l'auteur. Rien n'est donc à re-filtrer ici,
   mais l'appelant doit dire ce que la synthèse couvre (voir le sous-titre de la fenêtre). */
export function construireSynthese(entreesBrutes: EntreeCompteRendu[], nbSeancesTerminees: number): SyntheseComptesRendus {
  // Un compte rendu ouvert puis enregistré sans rien remplir ne compte pas comme un compte rendu :
  // il gonflerait les totaux sans rien apporter à la lecture.
  const chronologique = entreesBrutes
    .filter((e) => compteRenduRempli(e.rapport))
    .sort((a, b) => a.debut.localeCompare(b.debut))
  const entrees = [...chronologique].reverse()

  const parCompetence = new Map<string, number>()
  const parProgres = new Map<string, number>()
  const parTheme = new Map<string, { nb: number; forme: string }>()
  let presents = 0
  let absents = 0

  for (const entree of chronologique) {
    for (const objectif of entree.rapport.objectifs) {
      parCompetence.set(objectif, (parCompetence.get(objectif) ?? 0) + 1)
    }
    if (entree.rapport.progres) parProgres.set(entree.rapport.progres, (parProgres.get(entree.rapport.progres) ?? 0) + 1)
    if (entree.present === true) presents += 1
    else if (entree.present === false) absents += 1

    // Thèmes cherchés dans ce que le professeur décrit du contenu et des difficultés, pas dans les
    // remarques (souvent logistiques : retard, connexion, matériel) ni dans les devoirs.
    const texte = [entree.rapport.contenu_cours, entree.rapport.points_a_ameliorer, entree.rapport.lecons_abordees, entree.rapport.nouveau_vocabulaire]
      .filter(Boolean)
      .join(' ')
    for (const [cle, forme] of motsSignificatifs(texte)) {
      const deja = parTheme.get(cle)
      parTheme.set(cle, { nb: (deja?.nb ?? 0) + 1, forme: deja?.forme ?? forme })
    }
  }

  const nbComptesRendus = chronologique.length
  const dernierAvecProgres = [...chronologique].reverse().find((e) => !!e.rapport.progres)

  return {
    nbComptesRendus,
    nbSeancesTerminees,
    periode: nbComptesRendus > 0 ? { premiere: chronologique[0].debut, derniere: chronologique[nbComptesRendus - 1].debut } : null,
    heures: chronologique.reduce((total, e) => total + e.dureeMinutes / 60, 0),
    professeurs: [...new Set(chronologique.map((e) => e.professeur).filter((p): p is string => !!p))],
    presence: { presents, absents, renseignees: presents + absents },
    competences: [...parCompetence.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([valeur, nb]) => ({ libelle: libelleObjectif(valeur), nb, part: Math.round((nb / nbComptesRendus) * 100) })),
    progres: [...parProgres.entries()]
      .sort((a, b) => (SCORE_PROGRES[b[0]] ?? 0) - (SCORE_PROGRES[a[0]] ?? 0))
      .map(([valeur, nb]) => ({ libelle: libelleProgres(valeur) ?? valeur, nb })),
    dernierProgres: dernierAvecProgres
      ? { libelle: libelleProgres(dernierAvecProgres.rapport.progres) ?? '—', date: dernierAvecProgres.debut }
      : null,
    tendance: tendanceDesProgres(chronologique),
    themes: [...parTheme.entries()]
      .filter(([, v]) => v.nb >= MIN_OCCURRENCES_THEME)
      .sort((a, b) => b[1].nb - a[1].nb || a[0].localeCompare(b[0]))
      .slice(0, MAX_THEMES)
      .map(([, v]) => ({ mot: v.forme, nb: v.nb })),
    aEteVu: extraits(entrees, 'contenu_cours'),
    pointsAAmeliorer: extraits(entrees, 'points_a_ameliorer'),
    remarques: extraits(entrees, 'remarques'),
    entrees,
  }
}

export const LIBELLE_TENDANCE: Record<Tendance, string> = {
  hausse: 'Progression en hausse',
  stable: 'Progression stable',
  baisse: 'Progression en baisse',
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* Version texte de la même synthèse, pour le bouton « Copier » — l'admin la colle telle quelle
   dans un mail au parent ou au professeur suivant, sans avoir à retaper l'écran. Volontairement en
   texte brut et non en Markdown : la destination la plus fréquente est un corps de mail. */
export function syntheseEnTexte(synthese: SyntheseComptesRendus, nomEleve: string, portee: string): string {
  const lignes: string[] = [`Synthèse des comptes rendus — ${nomEleve}`, portee, '']

  if (synthese.nbComptesRendus === 0) {
    lignes.push('Aucun compte rendu de séance à résumer pour le moment.')
    return lignes.join('\n')
  }

  const p = synthese.periode
  lignes.push(
    `${synthese.nbComptesRendus} compte${synthese.nbComptesRendus > 1 ? 's' : ''} rendu${synthese.nbComptesRendus > 1 ? 's' : ''}` +
      (p ? ` du ${dateCourte(p.premiere)} au ${dateCourte(p.derniere)}` : '') +
      ` · ${synthese.heures.toFixed(1).replace('.', ',')} h de cours` +
      (synthese.professeurs.length ? ` · ${synthese.professeurs.join(', ')}` : ''),
  )
  if (synthese.nbSeancesTerminees > synthese.nbComptesRendus) {
    const manquants = synthese.nbSeancesTerminees - synthese.nbComptesRendus
    lignes.push(`${manquants} séance${manquants > 1 ? 's' : ''} clôturée${manquants > 1 ? 's' : ''} sans compte rendu rempli.`)
  }
  if (synthese.presence.renseignees > 0) {
    lignes.push(`Présence : ${synthese.presence.presents} présent(s), ${synthese.presence.absents} absent(s).`)
  }

  if (synthese.competences.length > 0) {
    lignes.push('', 'Compétences travaillées :')
    for (const c of synthese.competences) lignes.push(`- ${c.libelle} : ${c.nb} séance(s), ${c.part} %`)
  }

  if (synthese.dernierProgres) {
    lignes.push(
      '',
      `Progrès : dernière évaluation « ${synthese.dernierProgres.libelle} » (${dateCourte(synthese.dernierProgres.date)})` +
        (synthese.tendance ? ` — ${LIBELLE_TENDANCE[synthese.tendance].toLowerCase()}` : ''),
    )
  }

  if (synthese.themes.length > 0) {
    lignes.push('', `Thèmes récurrents : ${synthese.themes.map((t) => `${t.mot} (${t.nb})`).join(', ')}`)
  }

  if (synthese.pointsAAmeliorer.length > 0) {
    lignes.push('', 'Points à améliorer, du plus récent au plus ancien :')
    for (const x of synthese.pointsAAmeliorer) lignes.push(`- ${dateCourte(x.date)} : ${x.texte}`)
  }

  if (synthese.aEteVu.length > 0) {
    lignes.push('', 'Contenu des séances, du plus récent au plus ancien :')
    for (const x of synthese.aEteVu) lignes.push(`- ${dateCourte(x.date)} : ${x.texte}`)
  }

  if (synthese.remarques.length > 0) {
    lignes.push('', 'Remarques des professeurs :')
    for (const x of synthese.remarques) lignes.push(`- ${dateCourte(x.date)} : ${x.texte}`)
  }

  return lignes.join('\n')
}
