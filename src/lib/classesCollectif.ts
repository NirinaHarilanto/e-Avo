/* Classes de niveau des cours collectifs (0074) : échelle de niveau de HOC, mapping pur entre
   le niveau estimé au quiz écrit (voir quiz.ts) et la classe correspondante, et constantes de
   capacité d'une classe. Depuis l'uniformisation du 2026-10-31, les deux portent le même mot —
   Beginner, Intermediate, Advanced — à la casse près. Aucune requête, aucune horloge — testable
   isolément, comme quiz.ts. */

import type { NiveauClasse, CreneauClasse } from '../types/database.types.js'

/* L'ordre des clés est celui de l'échelle, du plus faible au plus avancé : c'est lui que suit
   la liste déroulante de création d'une classe (CohortesAdmin). « Pre-Advanced » (migration
   0139, 2026-10-29) a été fusionné dans « Advanced » le 2026-10-30, à la demande du client :
   les deux désignaient en pratique le même niveau. L'enum Postgres `niveau_classe` conserve la
   valeur `pre_advanced` (Postgres ne permet pas de retirer une valeur d'enum), mais plus rien ne
   l'écrit ni ne la propose (migration 0141 reclasse les classes existantes en `advanced`). */
export const LABEL_NIVEAU_CLASSE: Record<NiveauClasse, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

/* Un créneau horaire de classe, tel que l'administration le tient depuis l'écran Paramètres
   (0150). Les trois d'origine — matin, midi, soir — ne sont plus qu'un point de départ. */
export interface CreneauClasseDefini {
  cle: string
  libelle: string
  heure: string
  actif: boolean
}

/* Libellés des trois créneaux historiques, conservés comme REPLI seulement : un écran qui n'a
   pas (encore) chargé la liste, ou une classe rattachée à un créneau supprimé depuis, doit
   continuer d'afficher quelque chose de lisible plutôt qu'une case vide. */
const LABEL_CRENEAU_HISTORIQUE: Record<string, string> = {
  matin: 'Matin',
  midi: 'Midi',
  soir: 'Soir',
}

/* Libellé d'un créneau à partir de la liste de l'établissement. L'ordre des replis va du plus
   exact au plus approximatif : le libellé choisi par l'administration, puis celui des trois
   créneaux d'origine, puis la clé elle-même — jamais rien. */
export function libelleCreneau(creneaux: CreneauClasseDefini[], cle: CreneauClasse): string {
  return creneaux.find((c) => c.cle === cle)?.libelle ?? LABEL_CRENEAU_HISTORIQUE[cle] ?? cle
}

/* Code couleur des niveaux de classe — demande client du 2026-10-30, capture à l'appui : « mets
   un code couleur bien visible sur les intitulés [...] beginner, advance et intermediate ». Les
   trois variables de thème choisies sont déjà redéfinies par `body.espace-clair` (seul thème que
   rendent désormais les espaces connectés) en trois teintes bien distinctes l'une de l'autre —
   contrairement à `--accent-blue`/`--accent-violet`, identiques en thème clair. Une seule source
   ici pour que CohortesAdmin (admin) et CoursCollectifsProfesseur (professeur) ne divergent pas. */
export const COULEUR_NIVEAU_CLASSE: Record<NiveauClasse, string> = {
  beginner: 'var(--accent-teal)',
  intermediate: 'var(--accent-blue)',
  advanced: 'var(--accent-orange)',
}

/* Période de cours d'UNE classe de niveau (0143, demande client du 2026-10-30 : « chaque classe
   a sa propre période de cours [...] la période s'affichera à côté de l'intitulé Niveau »),
   distincte de celle de la vague entière. Les deux dates sont optionnelles et indépendantes l'une
   de l'autre (une classe peut n'avoir qu'une date de fin encore inconnue, par exemple) : `null`
   quand rien n'est renseigné, pour que l'appelant décide de ne rien afficher dans ce cas plutôt
   que d'écrire une phrase vide. */
export function periodeClasse(classe: { date_debut: string | null; date_fin: string | null }): string | null {
  const debut = classe.date_debut ? new Date(classe.date_debut).toLocaleDateString('fr-FR') : null
  const fin = classe.date_fin ? new Date(classe.date_fin).toLocaleDateString('fr-FR') : null
  if (debut && fin) return `${debut} → ${fin}`
  if (debut) return `à partir du ${debut}`
  if (fin) return `jusqu'au ${fin}`
  return null
}

/* Séances restantes sur le forfait d'une classe collective (0074/0140, demande client du
   2026-10-30 : « il faudrait afficher les séances restantes pour les cours collectifs »), posée
   ici pour être lue identiquement aux deux endroits qui en ont besoin — le pop-up planning
   (PanneauPlanningClasse.tsx) et la ligne de classe de l'espace professeur
   (CoursCollectifsProfesseur.tsx) — sans dupliquer le calcul.

   Une « planifiee » (à venir) ou une « terminee » (déjà donnée) consomme une séance du forfait —
   c'est la même paire de statuts qui écrit des heures à la clôture
   (api/professeur/cloturer-seance.ts). Une « annulée » n'a jamais eu lieu, et une « reportée »
   (clôturée sans compter d'heures, absence constatée) non plus : aucune des deux n'est décomptée
   ici, exactement comme côté heures. Un professeur de classe collective enseigne par séances
   d'une heure (convention de l'établissement) : le compte de séances se lit donc directement sur
   le même forfait en HEURES que `heuresForfait`, sans conversion. Jamais négatif. */
export function seancesRestantesClasse(seancesDeLaClasse: { statut: string }[], heuresForfait: number): number {
  const utilisees = seancesDeLaClasse.filter((s) => s.statut === 'planifiee' || s.statut === 'terminee').length
  return Math.max(0, heuresForfait - utilisees)
}

/* En dessous de ce seuil, la classe ne doit pas démarrer ses cours (règle client) — un signal
   pour l'admin, pas un blocage d'inscription. */
export const CAPACITE_MIN_CLASSE = 3
/* Au-delà, l'inscription est bloquée par le trigger `cohort_enrollments_capacite_classe`
   (migration 0074) : il faut ouvrir une seconde classe du même niveau. */
export const CAPACITE_MAX_CLASSE = 7

/* Les TROIS niveaux d'anglais de HOC, dans l'ordre croissant — demande client du 2026-10-31 :
   « il faudrait uniformiser les niveaux dans toute l'application HOC : Beginner, Intermediate,
   Advanced ».

   Avant cette date, deux échelles cohabitaient pour désigner LA MÊME CHOSE, le niveau d'un
   apprenant : le CECRL (A1 → C1) pour le quiz écrit, le niveau évalué et le test oral, et
   Beginner/Intermediate/Advanced pour les classes de niveau (0074). Le client voyait donc
   « A1 » sur un dossier et « Intermediate » sur un autre, pour un même champ « Niveau évalué » —
   constaté en base le 2026-10-31 : 20 dossiers en CECRL, 54 dans l'échelle anglaise.

   C'est l'échelle ANGLAISE qui l'emporte, parce que c'est elle que porte déjà la classe de
   niveau, qu'elle est celle du vocabulaire du client, et qu'elle a la majorité des dossiers.
   Les valeurs sont EXACTEMENT les libellés de `LABEL_NIVEAU_CLASSE` : un niveau évalué se lit
   désormais tel quel comme une classe, sans traduction.

   Les anciennes valeurs CECRL restent reconnues en lecture (voir `categorieDepuisNiveauEstime`)
   le temps que la migration 0153 ait converti l'existant, et pour qu'un dossier d'archive ne
   perde jamais sa classe. Plus rien ne les écrit. */
export const NIVEAUX_ANGLAIS = ['Beginner', 'Intermediate', 'Advanced'] as const

export type NiveauAnglais = (typeof NIVEAUX_ANGLAIS)[number]

/* Correspondance CECRL → échelle HOC, telle que le client l'a fixée le 2026-10-11 et que ce
   fichier l'appliquait déjà pour choisir une classe. Conservée pour relire les dossiers écrits
   avant l'uniformisation, jamais pour en écrire de nouveaux. */
const NIVEAU_DEPUIS_CECRL: Record<string, NiveauAnglais> = {
  A1: 'Beginner',
  /* Valeur portée par les lignes écrites avant la migration 0122. */
  'A1 (débutant)': 'Beginner',
  A2: 'Beginner',
  B1: 'Intermediate',
  B2: 'Intermediate',
  C1: 'Advanced',
  /* Le recrutement allait jusqu'à C2 (recrutement.ts) : même sommet d'échelle. */
  C2: 'Advanced',
  /* Niveau de classe introduit par 0139 puis fusionné dans « Advanced » par 0141, à la demande
     du client — il désignait en pratique le même niveau. Des dossiers le portent encore. */
  'Pre advanced': 'Advanced',
  'Pre-Advanced': 'Advanced',
}

/* Ramène n'importe quelle valeur de niveau déjà écrite à l'échelle en vigueur. Rend `null` pour
   une valeur inconnue (un niveau saisi en texte libre avant l'introduction de la liste
   déroulante) plutôt que de deviner : l'appelant décide quoi en faire. */
export function niveauNormalise(niveau: string | null | undefined): NiveauAnglais | null {
  const valeur = niveau?.trim()
  if (!valeur) return null
  const direct = NIVEAUX_ANGLAIS.find((n) => n.toLowerCase() === valeur.toLowerCase())
  if (direct) return direct
  return NIVEAU_DEPUIS_CECRL[valeur] ?? null
}

/* Le niveau d'un apprenant détermine automatiquement sa classe de niveau, sans ressaisie. Depuis
   l'uniformisation du 2026-10-31 les deux portent le même mot, à la casse près : la clé de l'enum
   Postgres reste en minuscules (`beginner`), le niveau affiché en capitale initiale
   (`Beginner`). `null` quand le niveau n'est pas encore connu — aucune classe n'est alors
   proposée, l'admin affecte à la main. */
export function categorieDepuisNiveauEstime(niveauEstime: string | null): NiveauClasse | null {
  const niveau = niveauNormalise(niveauEstime)
  if (!niveau) return null
  return niveau.toLowerCase() as NiveauClasse
}

/* Le niveau qui fait foi pour un candidat au collectif : celui que l'admin arrête à l'issue du
   test ORAL, et seulement à défaut celui qu'a estimé le quiz écrit. L'ordre compte — le quiz
   n'est qu'indicatif, il le dit lui-même au candidat (« le niveau définitif est fixé à l'issue du
   test oral », quiz.ts). C'est ce niveau-là qui décide de la classe ET du montant des frais
   d'inscription, demande client du 2026-10-11. */
export function niveauRetenu(niveauFinal: string | null | undefined, niveauEstime: string | null | undefined): string | null {
  return niveauFinal?.trim() || niveauEstime?.trim() || null
}

/* Position d'un niveau dans l'échelle, pour trier une colonne « Niveau » du plus faible au plus
   avancé (tableau de suivi, 2026-10-11) — un tri alphabétique rangerait « Advanced » avant
   « Beginner ». Les anciennes valeurs CECRL sont ramenées à l'échelle en vigueur avant d'être
   classées, pour qu'un dossier non encore converti se range au bon endroit et non à la fin.
   `null` pour une valeur absente ou non reconnue : l'appelant décide où la ranger plutôt que de
   la mélanger arbitrairement avec un niveau réel. */
export function rangNiveau(niveau: string | null): number | null {
  const normalise = niveauNormalise(niveau)
  if (!normalise) return null
  return NIVEAUX_ANGLAIS.indexOf(normalise)
}

/* Fin de parcours d'une vague — demande client du 2026-10-11 : « à la fin de chaque parcours
   collectif d'une classe, chaque étudiant [...] sera réévalué [...] quand toutes les heures
   seront consommées et que le parcours se termine, un bouton évaluer l'étudiant apparaîtra ».

   `heuresForfait` vient de la vague (`cohorts.heures_forfait`, ou le défaut de l'établissement) :
   `null` tant qu'aucun forfait n'est défini, auquel cas aucun parcours ne peut jamais être déclaré
   terminé — mieux vaut ne rien proposer qu'une réévaluation prématurée sur une donnée absente. */
export function parcoursCollectifTermine(heuresConsommees: number, heuresForfait: number | null): boolean {
  return heuresForfait != null && heuresForfait > 0 && heuresConsommees >= heuresForfait
}

export interface TarifCollectif {
  type_programme: string
  titre: string
  prix: number | string
}

/* Frais d'inscription au collectif — demande client du 2026-10-11 : « enregistrer un paiement
   équivalent à ses frais d'inscription, selon son niveau déterminé par l'admin et les frais
   d'inscription qui sont déjà défini dans HOC ». Montant arrêté avec le client : **le prix de la
   grille `tarifs` pour sa classe de niveau**, repris tel quel (150 000 Ar pour les trois niveaux
   au 2026-10-11) — pas un multiple de la durée du programme. Changer un prix dans la page Tarifs
   change donc aussitôt le montant proposé, sans retoucher ce code.

   Le rapprochement se fait sur le TITRE du tarif (« Beginner », « Intermediate », « Advanced »),
   seul lien existant entre la grille publique et `cohort_classes.niveau` : un tarif collectif n'a
   pas de volume d'heures (`heures` est null) et rien d'autre ne le relie à une classe. Insensible
   à la casse et aux espaces, le titre étant saisi à la main par l'admin. `null` quand le niveau
   est inconnu ou qu'aucun tarif ne lui correspond : l'admin saisit alors le montant lui-même
   plutôt que de se voir proposer un 0 trompeur. */
export function fraisInscriptionCollectif(tarifs: TarifCollectif[], niveau: string | null): number | null {
  const categorie = categorieDepuisNiveauEstime(niveau)
  if (!categorie) return null
  const attendu = LABEL_NIVEAU_CLASSE[categorie].toLowerCase()
  const tarif = tarifs.find((t) => t.type_programme === 'collectif' && t.titre.trim().toLowerCase() === attendu)
  if (!tarif) return null
  const prix = Number(tarif.prix)
  return Number.isFinite(prix) && prix > 0 ? prix : null
}
