/* Les compteurs d'heures (suivies, enseignées, restantes) sont stockés en heures décimales.
   Affichées telles quelles, « 1.5 h » ou « 7.25 h » se lisent mal — demande client du
   2026-09-23 : les présenter en heures et minutes, « 1h 30m ». Les minutes sont omises quand
   elles sont nulles (« 2h »), et les heures quand il n'y en a pas (« 45m »). */
export function formaterHeures(heuresDecimales: number | null | undefined): string {
  const total = Math.round((heuresDecimales ?? 0) * 60)
  if (total <= 0) return '0h'
  const heures = Math.floor(total / 60)
  const minutes = total % 60
  if (heures === 0) return `${minutes}m`
  if (minutes === 0) return `${heures}h`
  return `${heures}h ${minutes}m`
}

export function formaterMinutes(minutes: number | null | undefined): string {
  return formaterHeures((minutes ?? 0) / 60)
}

/* Heures totales d'un élève, TOUS forfaits cumulés — `packages` reste un historique de
   souscriptions successives, jamais un total qu'on réécrit (demande client du 2026-09-22) : un
   forfait ajouté en prolongation d'un précédent s'additionne, il ne le remplace pas. Centralisé
   ici le 2026-10-10 : deux copies de ce calcul avaient divergé — l'une l'utilisait déjà
   (DossierEtudiantVue.tsx pour les heures restantes), l'autre non (le même fichier pour la jauge
   « Heures suivies », qui ne regardait que le DERNIER forfait souscrit — « 18 / 10 h » plutôt que
   « 18 / 30 h » pour un élève ayant consommé 18 h sur 20 puis prolongé de 10 h). */
export function totalHeuresCumulees(packages: { total_heures: number }[]): number {
  return packages.reduce((somme, p) => somme + p.total_heures, 0)
}

export function heuresRestantes(packages: { total_heures: number }[], heuresConsommees: number): number {
  return Math.max(0, totalHeuresCumulees(packages) - heuresConsommees)
}
