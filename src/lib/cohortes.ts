/* Tri des vagues de cours collectifs (CohortesAdmin.tsx) — demande client du 2026-10-10 :
   « afficher la liste des vagues par ordre chronologique de date ». La première lecture retenue
   alors prenait « chronologique » au sens de la PROXIMITÉ à aujourd'hui (le plus proche en tête,
   passé ou futur) : posée devant de vraies vagues le 2026-10-29, elle plaçait une vague À VENIR
   avant une vague DÉJÀ EN COURS dès que son démarrage tombait plus près du jour présent que le
   début, déjà passé, de la vague en cours — correct au sens de la distance, mais qui ne se lit
   pas comme « chronologique » à l'écran. Le mot est repris ici au sens simple : la date de début
   la plus ancienne en tête, comme un calendrier.

   Aucune requête, aucune horloge — testable isolément, comme heures.ts/classesCollectif.ts. */

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

/* La date de début la plus ancienne en tête ; à égalité (rare, mais possible : deux promotions
   lancées le même jour), celle qui se termine le plus tôt, pour un ordre stable plutôt
   qu'arbitraire. */
export function trierVaguesChronologiquement<T extends VagueDatee>(vagues: T[]): T[] {
  return [...vagues].sort((a, b) => {
    const debut = new Date(a.date_debut).getTime() - new Date(b.date_debut).getTime()
    if (debut !== 0) return debut
    return new Date(a.date_fin).getTime() - new Date(b.date_fin).getTime()
  })
}
