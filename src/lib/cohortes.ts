/* Tri des vagues de cours collectifs (CohortesAdmin.tsx) — demande client du 2026-10-10 :
   « afficher la liste des vagues par ordre chronologique de date : le plus proche d'abord sur la
   première ligne, ensuite les moins proches ».

   Pas un simple tri chronologique ascendant : une vague liste mélange des dates PASSÉES (vagues
   terminées) et FUTURES (vagues à venir), donc la date la plus ANCIENNE n'est pas forcément la
   plus « proche » d'aujourd'hui — une vague qui a démarré il y a six mois est plus éloignée
   qu'une vague qui démarre la semaine prochaine, par exemple. Le critère est la distance absolue
   à aujourd'hui, pas le sens chronologique.

   Aucune requête, aucune horloge implicite (l'heure de référence est un paramètre, jamais lue
   directement) — testable isolément, comme heures.ts/classesCollectif.ts. */

export interface VagueDatee {
  date_debut: string
  date_fin: string
}

/* Les admins nomment leurs vagues en incluant le mot : « Vague Novembre », « Vague de Décembre »
   (les deux seuls noms en base au 2026-10-11). Les écrans, eux, préfixaient le nom par le mot
   « vague » à l'affichage — d'où « (vague Vague Novembre) » dans le pop-up de confirmation du
   test de positionnement, signalé par le client le 2026-10-11.

   Supprimer le mot des écrans ne suffit pas : rien n'oblige un admin à le mettre dans le nom,
   et une vague nommée « Novembre » tout court s'afficherait alors sans dire ce qu'elle est.
   Symétriquement, retirer systématiquement le préfixe du nom casserait les phrases où le mot
   n'est pas une étiquette mais un morceau de grammaire (« Séance de la vague « … » »).

   D'où deux fonctions, à choisir selon la place du mot dans la phrase affichée. Les deux
   convergent vers une seule occurrence du mot, quel que soit le nom saisi. */

/* `\b` après le mot pour ne pas mordre sur un nom comme « Vaguemestre » ; « de/du/d' » absorbés
   avec lui, sans quoi « Vague de Décembre » laisserait un « de » orphelin. */
const PREFIXE_VAGUE = /^vagues?\b\s*(?:de\s+|du\s+|d[’']\s*)?/i

/* Le nom seul, pour une phrase qui porte déjà le mot : « Séance de la vague « Novembre » »,
   « Vague : Novembre ». Un nom réduit au seul mot « Vague » est rendu tel quel — le retrait ne
   laisserait rien à afficher. */
export function nomVagueSeul(nom: string | null | undefined): string {
  const propre = (nom ?? '').trim()
  return propre.replace(PREFIXE_VAGUE, '').trim() || propre
}

/* Le libellé complet, pour un affichage autonome : « Vague Novembre · 3 élèves ». Le mot n'est
   ajouté que s'il manque au nom. */
export function libelleVague(nom: string | null | undefined): string {
  const propre = (nom ?? '').trim()
  if (!propre) return ''
  return PREFIXE_VAGUE.test(propre) ? propre : `Vague ${propre}`
}

/* `date_debut` est une colonne Postgres `date` (AAAA-MM-JJ, sans heure) : `new Date(...)` la lit
   comme minuit UTC. En reformatant `aujourdHui` au même format avant de le reparser, les deux
   valeurs comparées sont deux minuits UTC — sans ce passage, comparer un minuit UTC à l'heure
   locale précise de l'instant présent introduirait un décalage artificiel selon le fuseau horaire
   du navigateur et l'heure de la journée. */
function minuitUtcDuJour(date: Date): number {
  const anneeMoisJour = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return new Date(anneeMoisJour).getTime()
}

/* Les vagues les plus proches d'AUJOURD'HUI d'abord, dans un sens comme dans l'autre.
   `aujourdHui` est un paramètre (par défaut l'instant d'appel) : le passer explicitement dans les
   tests fige le résultat, qui dépendrait sinon de la date du jour où ils tournent. */
export function trierVaguesParProximite<T extends VagueDatee>(vagues: T[], aujourdHui: Date = new Date()): T[] {
  const reference = minuitUtcDuJour(aujourdHui)
  return [...vagues].sort((a, b) => {
    const ecartA = Math.abs(new Date(a.date_debut).getTime() - reference)
    const ecartB = Math.abs(new Date(b.date_debut).getTime() - reference)
    if (ecartA !== ecartB) return ecartA - ecartB
    // Égalité de date de début (rare, mais possible : deux promotions lancées le même jour) —
    // celle qui se termine le plus tôt d'abord, pour un ordre stable plutôt qu'arbitraire.
    return new Date(a.date_fin).getTime() - new Date(b.date_fin).getTime()
  })
}
