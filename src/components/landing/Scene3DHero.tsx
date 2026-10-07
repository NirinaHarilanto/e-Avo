import { useEffect, useRef } from 'react'

/* Canevas du décor 3D du Hero. three.js n'est chargé qu'ici, par `import()` : le texte et
   l'illustration apparaissent immédiatement, le décor 3D se pose ensuite par un fondu. Sans WebGL
   (vieux navigateur, accélération désactivée), le canevas reste simplement vide — le Hero est
   complet sans lui.

   Ce décor pèse à lui seul 136 ko compressés, soit près de la moitié du JavaScript de la page
   d'accueil, pour un apport purement ornemental. D'où deux précautions prises ici :

   1. il n'est PAS demandé du tout là où il coûterait plus qu'il n'apporte — mode économie de
      données, connexion 2G/3G lente, machine à faible parallélisme, ou petit écran où il est de
      toute façon masqué par la mise en page ;
   2. quand il l'est, le téléchargement attend que le navigateur ait fini le travail utile
      (`requestIdleCallback`), pour ne pas disputer la bande passante au contenu que le visiteur
      est venu lire.

   `prefers-reduced-motion` ne figure volontairement PAS dans ces critères : ce réglage demande
   moins de MOUVEMENT, pas moins d'images. Le décor reste donc affiché, simplement immobile, comme
   avant — le supprimer changerait l'apparence de la page pour ces personnes. */
function decorSouhaitable(): boolean {
  // Sous 900 px, le décor est hors cadre ou quasi invisible : autant ne pas le télécharger.
  if (window.matchMedia('(max-width: 900px)').matches) return false
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) {
    return false
  }
  const connexion = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (connexion?.saveData) return false
  if (connexion?.effectiveType && /(^|-)(2g|slow-2g|3g)$/.test(connexion.effectiveType)) return false
  return true
}

function quandDisponible(callback: () => void): () => void {
  const planifier = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback
  if (planifier) {
    const id = planifier(callback, { timeout: 2500 })
    const annuler = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
    return () => annuler?.(id)
  }
  // Safari n'a pas `requestIdleCallback` : un délai court suffit à laisser passer le premier rendu.
  const minuterie = setTimeout(callback, 400)
  return () => clearTimeout(minuterie)
}

export function Scene3DHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !decorSouhaitable()) return
    let annule = false
    let detruire: (() => void) | undefined

    const annulerPlanification = quandDisponible(() => {
      if (annule) return
      import('./sceneHero3d')
        .then(({ creerSceneHero }) => {
          if (annule) return
          const mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches
          detruire = creerSceneHero(canvas, { mouvementReduit }).detruire
          canvas.classList.add('hero-3d--pret')
        })
        .catch(() => {
          /* WebGL indisponible : le Hero reste complet sans son décor. */
        })
    })

    return () => {
      annule = true
      annulerPlanification()
      detruire?.()
    }
  }, [])

  return <canvas ref={canvasRef} className="hero-3d" aria-hidden="true" />
}
