/* Classes de niveau des cours collectifs (0074) : mapping pur entre le niveau CECRL estimé au
   quiz écrit (voir quiz.ts) et le niveau de classe (Beginner/Intermediate/Advanced) demandé par
   le client, et constantes de capacité d'une classe. Aucune requête, aucune horloge — testable
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

export const LABEL_CRENEAU_CLASSE: Record<CreneauClasse, string> = {
  matin: 'Matin',
  midi: 'Midi',
  soir: 'Soir',
}

/* En dessous de ce seuil, la classe ne doit pas démarrer ses cours (règle client) — un signal
   pour l'admin, pas un blocage d'inscription. */
export const CAPACITE_MIN_CLASSE = 3
/* Au-delà, l'inscription est bloquée par le trigger `cohort_enrollments_capacite_classe`
   (migration 0074) : il faut ouvrir une seconde classe du même niveau. */
export const CAPACITE_MAX_CLASSE = 7

/* Les cinq niveaux que rend le quiz écrit (`niveauEstime`, quiz.ts), dans l'ordre croissant.
   **Ce sont aussi les seules valeurs que `categorieDepuisNiveauEstime` sait traduire en classe**,
   d'où la liste partagée : le niveau final du test oral se choisit dans cette liste (demande
   client du 2026-10-11, « mets le niveau d'anglais en liste déroulante ») et non plus en texte
   libre. Une saisie libre laissait écrire « Intermédiaire », que le barème ci-dessous ne reconnaît
   pas — le candidat était alors converti sans classe, à affecter à la main. */
/* « A1 » tout court, et non « A1 (débutant) » — demande client du 2026-10-11, après un premier
   raccourcissement limité à l'affichage le même jour : c'est désormais la VALEUR elle-même qui
   change, en code comme en base (migration 0122). Un seul libellé partout évite d'avoir à
   traduire d'un côté ce qu'on compare de l'autre, et aligne ce barème sur celui du recrutement
   (recrutement.ts), qui écrivait déjà « A1 ». */
export const NIVEAUX_CECRL = ['A1', 'A2', 'B1', 'B2', 'C1'] as const

export type NiveauCecrl = (typeof NIVEAUX_CECRL)[number]

/* Barème convenu avec le client : le niveau CECRL du quiz écrit détermine automatiquement la
   classe de niveau, sans ressaisie. `null` quand le niveau n'est pas encore connu (candidat pas
   encore passé au quiz, ou test non concluant) — dans ce cas, aucune classe n'est proposée
   automatiquement, l'admin affecte à la main. */
export function categorieDepuisNiveauEstime(niveauEstime: string | null): NiveauClasse | null {
  switch (niveauEstime) {
    /* 'A1 (débutant)' reste accepté : c'est la valeur qu'ont portée les lignes écrites avant la
       migration 0122, et un dossier d'archive ne doit pas perdre sa classe parce que le libellé a
       changé. Plus rien ne l'écrit. */
    case 'A1':
    case 'A1 (débutant)':
    case 'A2':
      return 'beginner'
    case 'B1':
    case 'B2':
      return 'intermediate'
    case 'C1':
      return 'advanced'
    default:
      return null
  }
}

/* Le niveau qui fait foi pour un candidat au collectif : celui que l'admin arrête à l'issue du
   test ORAL, et seulement à défaut celui qu'a estimé le quiz écrit. L'ordre compte — le quiz
   n'est qu'indicatif, il le dit lui-même au candidat (« le niveau définitif est fixé à l'issue du
   test oral », quiz.ts). C'est ce niveau-là qui décide de la classe ET du montant des frais
   d'inscription, demande client du 2026-10-11. */
export function niveauRetenu(niveauFinal: string | null | undefined, niveauEstime: string | null | undefined): string | null {
  return niveauFinal?.trim() || niveauEstime?.trim() || null
}

/* Position d'un niveau CECRL dans l'échelle, pour trier une colonne « Niveau » du plus faible au
   plus avancé (tableau de suivi, 2026-10-11) — un tri alphabétique rangerait B1 avant B2 mais
   aussi avant A2, faux. `null` pour une valeur absente ou non reconnue (ex. un niveau saisi en
   texte libre avant l'introduction de la liste déroulante) : l'appelant décide où la ranger plutôt
   que de la mélanger arbitrairement avec un niveau réel. */
export function rangNiveauCecrl(niveau: string | null): number | null {
  const position = NIVEAUX_CECRL.indexOf((niveau ?? '') as NiveauCecrl)
  return position === -1 ? null : position
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
