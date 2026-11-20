/* À quelle classe appartient une heure déjà consommée — la règle, en un seul endroit.
 *
 * Elle existait en SIX exemplaires le 2026-11-20, et cinq d'entre eux étaient faux. Le défaut
 * s'est vu sur la fiche de Larissa RAOELIMBOLOLONA : son dossier annonçait 32h/32 (forfait
 * terminé) quand la fenêtre « Déplacer un étudiant » la présentait à 4h sur 32, donc à
 * mi-parcours, et lui aurait offert 28 h gratuites si l'administration avait choisi de conserver
 * son compteur. Mesuré ensuite sur toute la base : 21 élèves sur 25 avaient un compteur faussé,
 * et 286 h auraient pu être offertes de cette façon.
 *
 * La cause tient en une ligne. Le grand livre des heures (`hour_ledger`) contient DEUX natures
 * d'écritures de débit :
 *
 *   — celles qui décomptent une SÉANCE, et qui portent son `session_id`. C'est le cas courant ;
 *   — celles qui reprennent les heures déjà suivies AVANT la mise en service (migration 0140).
 *     Elles n'ont aucune séance derrière elles — ces cours ont eu lieu avant que HOC n'existe —
 *     et se rattachent au forfait qu'elles entament, par `package_id`.
 *
 * Une jointure qui ne passe que par `session_id` ignore donc en silence toute l'antériorité d'un
 * élève repris à l'import. Et comme l'écriture de reprise est la plus GROSSE (28 h sur 32 pour la
 * promotion de septembre), ce n'est pas un écart de détail : l'élève paraît commencer son
 * parcours alors qu'il le termine.
 *
 * `useDossierEtudiant.ts` était le seul à poser les deux questions. Cette fonction est sa règle,
 * extraite pour que les autres ne puissent plus en diverger.
 */

/* Une écriture de débit, réduite à ce qui situe la classe à laquelle elle appartient. */
export interface DebitSituable {
  heures: number | string
  session_id?: string | null
  package_id?: string | null
}

/**
 * Les heures consommées DANS UNE CLASSE donnée (portée posée par 0146 : monter de niveau fait
 * repartir le compteur de zéro).
 *
 * Une écriture appartient à la classe si la séance qu'elle décompte est une séance de cette
 * classe, OU — à défaut de séance, cas des reprises d'antériorité — si le forfait qu'elle
 * alimente couvre cette classe.
 *
 * Une écriture qu'on ne sait rattacher à rien n'est jamais comptée : mieux vaut un compteur
 * prudent qu'un compteur qui gonfle avec les heures d'une autre classe.
 */
export function heuresDeLaClasse(
  debits: DebitSituable[],
  classeParSeance: Map<string, string | null>,
  classeParForfait: Map<string, string | null>,
  classeId: string,
): number {
  return debits.reduce((total, debit) => (classeDuDebit(debit, classeParSeance, classeParForfait) === classeId ? total + Number(debit.heures) : total), 0)
}

/** La classe à laquelle une écriture se rattache, ou `null` si rien ne permet de le dire. */
export function classeDuDebit(
  debit: DebitSituable,
  classeParSeance: Map<string, string | null>,
  classeParForfait: Map<string, string | null>,
): string | null {
  if (debit.session_id) return classeParSeance.get(debit.session_id) ?? null
  if (debit.package_id) return classeParForfait.get(debit.package_id) ?? null
  return null
}

/**
 * Les heures consommées dans une VAGUE entière — portée d'avant 0146, encore utilisée quand
 * l'élève n'est rattaché à aucune classe de niveau.
 *
 * Même règle en deux chemins, appliquée à l'ensemble des classes de la vague : une reprise
 * d'antériorité compte dès que le forfait qu'elle alimente relève d'une de ces classes. Un
 * forfait sans classe (souscrit avant 0146) est rattaché à la vague par défaut, faute de mieux —
 * l'ignorer effacerait l'antériorité des plus anciens dossiers, qui sont justement ceux qui en
 * ont.
 */
export function heuresDeLaVague(
  debits: DebitSituable[],
  seancesDeLaVague: Set<string>,
  forfaitsDeLaVague: Set<string>,
): number {
  return debits.reduce((total, debit) => {
    if (debit.session_id) return seancesDeLaVague.has(debit.session_id) ? total + Number(debit.heures) : total
    if (debit.package_id) return forfaitsDeLaVague.has(debit.package_id) ? total + Number(debit.heures) : total
    return total
  }, 0)
}
