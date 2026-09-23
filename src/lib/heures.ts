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
