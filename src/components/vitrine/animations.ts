import { useEffect, useState, type RefObject } from 'react'

/* Les trois comportements que le script commun des maquettes (« HOC — animations communes »)
   installe sur chaque page, transposés en hooks React. Un seul endroit à retoucher, et le
   nettoyage se fait au démontage — là où le script d'origine, posé une fois pour toutes sur une
   page WordPress, n'en avait pas besoin. */

/* Apparition au défilement : la maquette observe `.rv` (fondu montant) et `.reveal` (conteneur
   dont les lignes de titre remontent), ajoute `.in` au franchissement de 15 % de visibilité, puis
   cesse d'observer — une apparition ne se rejoue jamais.

   `cle` relance l'observation quand le contenu change (passage d'une page à l'autre) : les
   nouveaux éléments arrivent avec `opacity: 0` et resteraient invisibles sans nouvelle passe. */
export function useApparitions(conteneur: RefObject<HTMLElement | null>, cle?: unknown) {
  useEffect(() => {
    const racine = conteneur.current
    if (!racine) return

    const elements = racine.querySelectorAll<HTMLElement>('.rv, .reveal')
    if (!('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('in'))
      return
    }

    const observateur = new IntersectionObserver(
      (entrees) => {
        entrees.forEach((entree) => {
          if (!entree.isIntersecting) return
          entree.target.classList.add('in')
          observateur.unobserve(entree.target)
        })
      },
      { threshold: 0.15 },
    )
    elements.forEach((element) => observateur.observe(element))
    return () => observateur.disconnect()
  }, [conteneur, cle])
}

/* Projecteur qui suit la souris sur les sections sombres. Les coordonnées sont écrites en
   variables CSS plutôt que dans l'état React : à chaque pixel parcouru, un rendu React coûterait
   bien plus cher que l'écriture directe que fait déjà la maquette.

   Ignoré sur les appareils sans survol réel : sur mobile, le projecteur resterait figé là où le
   doigt a touché l'écran. */
export function useProjecteur(conteneur: RefObject<HTMLElement | null>, cle?: unknown) {
  useEffect(() => {
    const racine = conteneur.current
    if (!racine || !matchMedia('(hover:hover)').matches) return

    const sections = Array.from(racine.querySelectorAll<HTMLElement>('.dark'))
    const suivre = (evenement: MouseEvent) => {
      const section = evenement.currentTarget as HTMLElement
      const boite = section.getBoundingClientRect()
      section.style.setProperty('--mx', `${evenement.clientX - boite.left}px`)
      section.style.setProperty('--my', `${evenement.clientY - boite.top}px`)
    }

    sections.forEach((section) => section.addEventListener('mousemove', suivre))
    return () => sections.forEach((section) => section.removeEventListener('mousemove', suivre))
  }, [conteneur, cle])
}

/* La barre de navigation devient opaque et floutée passé 30 px de défilement. L'état initial est
   calculé au montage : arriver sur la page déjà défilée (retour arrière du navigateur, ancre)
   doit donner une barre déjà solidifiée. */
export function useBarreSolidifiee() {
  const [solide, setSolide] = useState(() => (typeof window === 'undefined' ? false : window.scrollY > 30))

  useEffect(() => {
    const surDefilement = () => setSolide(window.scrollY > 30)
    surDefilement()
    window.addEventListener('scroll', surDefilement, { passive: true })
    return () => window.removeEventListener('scroll', surDefilement)
  }, [])

  return solide
}

/* Pose sur <body> la classe qui annule le `zoom: .9` global (les maquettes sont dessinées à
   l'échelle 1) et la couleur de fond de la page — violet sur les pages à hero sombre, blanc
   lavande sur les pages claires, exactement comme l'attribut `style` du <body> de chaque
   maquette. */
export function useFondVitrine(fond: string) {
  useEffect(() => {
    document.body.classList.add('vitrine-hx')
    document.body.style.setProperty('--hx-fond-page', fond)
    return () => {
      document.body.classList.remove('vitrine-hx')
      document.body.style.removeProperty('--hx-fond-page')
    }
  }, [fond])
}
