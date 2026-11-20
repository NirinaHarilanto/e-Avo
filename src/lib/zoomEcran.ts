/* Conversion entre pixels ÉCRAN et pixels du repère d'un élément zoomé.
 *
 * Les espaces connectés de HOC sont rendus à `zoom: 0.74` (`body.echelle-connectee`) : on y
 * affiche plus d'informations sans réduire chaque taille à la main. La contrepartie est un piège
 * discret, qui a coûté deux incidents :
 *
 *   `getBoundingClientRect()` rend des coordonnées ÉCRAN — déjà multipliées par le zoom — tandis
 *   qu'une valeur écrite en CSS (`top`, `left`, `width`) est interprétée dans le repère de
 *   l'élément, donc REDIVISÉE par le zoom au moment du rendu.
 *
 * Recopier telle quelle une coordonnée mesurée dans une propriété CSS d'un élément zoomé la
 * rapproche donc de l'origine d'un facteur 0,74. Mesuré en production le 2026-11-20 sur la liste
 * déroulante « Nouvelle vague » : champ à 757 px de la gauche, panneau posé à `left: 757px`,
 * panneau affiché à 560 px — soit 197 px trop à gauche, et 105 px trop haut. Le client l'a vu
 * avant la mesure : « depuis quand une liste déroulante est mal placée comme ça ».
 *
 * Le piège ne se voit pas en développement si l'on regarde le DOM : les valeurs CSS semblent
 * justes. Il faut comparer le rectangle MESURÉ du panneau à celui de son déclencheur.
 */

/** Le zoom cumulé appliqué à un élément par lui-même et tous ses ancêtres (1 s'il n'y en a pas). */
export function zoomCumule(element: Element | null | undefined): number {
  let facteur = 1
  for (let noeud = element ?? null; noeud; noeud = noeud.parentElement) {
    /* `zoom` vaut « normal » ou « 1 » sans zoom selon les navigateurs : `parseFloat` rend alors
       NaN ou 1, et les deux sont ignorés. */
    const valeur = parseFloat(window.getComputedStyle(noeud).zoom)
    if (Number.isFinite(valeur) && valeur > 0 && valeur !== 1) facteur *= valeur
  }
  return facteur || 1
}

/**
 * Convertit une longueur mesurée À L'ÉCRAN en la valeur CSS à écrire sur un élément placé dans
 * `conteneur` pour qu'elle s'y affiche à cette taille-là.
 *
 * Sans zoom, rend la valeur inchangée — l'appel reste donc sûr partout.
 */
export function versReperede(longueurEcran: number, conteneur: Element | null | undefined): number {
  return longueurEcran / zoomCumule(conteneur)
}
