import { useEffect, useRef } from 'react'

/* Canevas du décor 3D du Hero. three.js n'est chargé qu'ici, par `import()`, une fois le Hero
   affiché : le texte et l'illustration apparaissent immédiatement, le décor 3D se pose ensuite par
   un fondu. Sans WebGL (vieux navigateur, accélération désactivée), le canevas reste simplement
   vide — le Hero est complet sans lui. */
export function Scene3DHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let annule = false
    let detruire: (() => void) | undefined

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

    return () => {
      annule = true
      detruire?.()
    }
  }, [])

  return <canvas ref={canvasRef} className="hero-3d" aria-hidden="true" />
}
