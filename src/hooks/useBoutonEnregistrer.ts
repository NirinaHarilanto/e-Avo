import { useState } from 'react'

/* État d'un bouton « Enregistrer » qui reflète honnêtement si ce qui est AFFICHÉ à l'écran est
   bien ce qui est enregistré en base — demande client du 2026-10-10 : un clic réussi doit se voir
   sur le bouton lui-même (« Enregistré », vert), et toute modification ultérieure doit le faire
   revenir à son état initial, sans qu'il reste vert alors que l'écran a changé depuis.

   Approche DÉRIVÉE plutôt qu'un simple drapeau « a été cliqué » : au lieu de suivre un booléen
   qu'il faudrait remettre à `false` manuellement depuis CHAQUE `onChange` de CHAQUE champ suivi
   (fragile — un seul champ oublié laisserait « Enregistré » affiché à tort), on retient
   l'empreinte des valeurs au moment du dernier succès et on la compare, à chaque rendu, à
   l'empreinte des valeurs actuelles. Tant qu'elles sont égales, rien n'a changé depuis
   l'enregistrement ; dès qu'elles diffèrent, c'est automatique, aucun point d'appel à retrouver.

   L'empreinte est fournie par l'appelant (en général `JSON.stringify({...})` des champs que CE
   bouton enregistre) : ce hook ne connaît rien de la forme des données, il ne fait que comparer
   deux chaînes. */
export function useBoutonEnregistrer() {
  const [dernierInstantane, setDernierInstantane] = useState<string | null>(null)

  /** À appeler juste après un enregistrement réussi, avec l'empreinte des valeurs ENVOYÉES. */
  function marquerEnregistre(instantane: string) {
    setDernierInstantane(instantane)
  }

  /** `true` si `instantaneActuel` est exactement celui du dernier succès — rien n'a changé depuis. */
  function estEnregistre(instantaneActuel: string): boolean {
    return dernierInstantane !== null && dernierInstantane === instantaneActuel
  }

  return { marquerEnregistre, estEnregistre }
}
