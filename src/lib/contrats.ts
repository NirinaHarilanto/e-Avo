/* Substitution de variables `{{cle}}` dans un modèle de contrat — texte simple, pas de
   librairie de templating (cohérent avec l'absence de dépendances externes du projet). Une
   variable non renseignée reste affichée telle quelle (`{{cle}}`) plutôt que de disparaître
   silencieusement, pour que l'admin remarque l'oubli avant d'enregistrer le contrat généré. */
export function substituerVariables(gabarit: string, valeurs: Record<string, string>): string {
  return gabarit.replace(/\{\{(\w+)\}\}/g, (correspondance, cle: string) => valeurs[cle] ?? correspondance)
}

export function extraireVariables(gabarit: string): string[] {
  const trouvees = new Set<string>()
  for (const correspondance of gabarit.matchAll(/\{\{(\w+)\}\}/g)) {
    trouvees.add(correspondance[1])
  }
  return [...trouvees]
}
