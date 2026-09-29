import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/* Décor 3D du Hero (demande client du 2026-09-29 : « un aspect dynamique en 3D élégant, jeune et
   professionnel »). Purement décoratif : aucun texte, aucun lien, rien que le lecteur d'écran ait à
   annoncer — le canevas est `aria-hidden` côté composant.

   Ce module n'est JAMAIS importé statiquement : Scene3DHero.tsx le charge par `import()` une fois
   la page affichée, pour que three.js (~150 Ko compressés) ne retarde pas le premier rendu du Hero.

   Chaque objet est placé en coordonnées NORMALISÉES du canevas (x, y ∈ [-1, 1], de gauche à droite
   et de bas en haut) puis reconverti en unités du monde à chaque redimensionnement : la
   composition garde ainsi la même allure quelles que soient les proportions de l'écran. */

const VIOLET = new THREE.Color('#6c4df5')
const VIOLET_CLAIR = new THREE.Color('#b9a6ff')
const OR = new THREE.Color('#f2b83d')

type Flottant = {
  objet: THREE.Object3D
  ancre: [number, number, number]
  echelle: number
  amplitude: number
  vitesse: number
  phase: number
  rotation: [number, number, number]
  delai: number
}

export type SceneHero = { detruire: () => void }

export function creerSceneHero(canvas: HTMLCanvasElement, options: { mouvementReduit: boolean }): SceneHero {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environnement = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = environnement

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
  camera.position.set(0, 0, 16)

  scene.add(new THREE.AmbientLight('#ffffff', 0.5))
  const cle = new THREE.DirectionalLight('#fff4e0', 1.6)
  cle.position.set(5, 6, 8)
  scene.add(cle)
  const contre = new THREE.PointLight('#8b6cff', 30, 30)
  contre.position.set(-6, -2, 4)
  scene.add(contre)

  /* Tout le décor pivote d'un bloc sous la souris (parallaxe) : un seul groupe à incliner. */
  const racine = new THREE.Group()
  scene.add(racine)

  const aJeter: { dispose: () => void }[] = [environnement, pmrem]
  const suivre = <T extends { dispose: () => void }>(ressource: T) => {
    aJeter.push(ressource)
    return ressource
  }

  /* ── Globe de points : l'« avenir global » de la maquette, en volume ──────────────────────── */
  const globe = new THREE.Group()
  racine.add(globe)

  const NB_POINTS = 1500
  const positions = new Float32Array(NB_POINTS * 3)
  const couleurs = new Float32Array(NB_POINTS * 3)
  const orAngle = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < NB_POINTS; i++) {
    const y = 1 - (i / (NB_POINTS - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const theta = orAngle * i
    positions.set([Math.cos(theta) * r, y, Math.sin(theta) * r], i * 3)
    const teinte = Math.random() < 0.07 ? OR : VIOLET.clone().lerp(VIOLET_CLAIR, Math.random() * 0.8)
    couleurs.set([teinte.r, teinte.g, teinte.b], i * 3)
  }
  const geoPoints = suivre(new THREE.BufferGeometry())
  geoPoints.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geoPoints.setAttribute('color', new THREE.BufferAttribute(couleurs, 3))

  /* Points ronds plutôt que carrés : une petite texture de disque adouci, dessinée à la volée. */
  const disque = document.createElement('canvas')
  disque.width = disque.height = 64
  const ctx = disque.getContext('2d')!
  const halo = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  halo.addColorStop(0, 'rgba(255,255,255,1)')
  halo.addColorStop(0.45, 'rgba(255,255,255,0.9)')
  halo.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, 64, 64)
  const texDisque = suivre(new THREE.CanvasTexture(disque))

  const matPoints = suivre(
    new THREE.PointsMaterial({
      size: 0.11,
      map: texDisque,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  )
  globe.add(new THREE.Points(geoPoints, matPoints))

  /* Voile intérieur très léger : donne au globe un volume sans masquer ce qui passe derrière. */
  const matCoeur = suivre(
    new THREE.MeshBasicMaterial({ color: '#efeaff', transparent: true, opacity: 0, depthWrite: false }),
  )
  globe.add(new THREE.Mesh(suivre(new THREE.SphereGeometry(0.97, 48, 48)), matCoeur))

  /* Arcs dorés entre deux points du globe : des liaisons qui se tracent puis s'effacent. */
  const arcs: { ligne: THREE.Line; total: number; phase: number }[] = []
  const matArc = suivre(new THREE.LineBasicMaterial({ color: OR, transparent: true, opacity: 0.9 }))
  const pointSurGlobe = (lat: number, lon: number) =>
    new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon))
  const LIAISONS: [number, number, number, number][] = [
    [0.3, 0.2, 0.9, 1.6],
    [-0.4, 2.1, 0.5, 3.4],
    [0.7, 4.0, -0.2, 5.2],
    [-0.1, 0.9, -0.8, 2.6],
    [0.2, 3.0, 0.8, 4.6],
  ]
  LIAISONS.forEach(([la1, lo1, la2, lo2], i) => {
    const a = pointSurGlobe(la1, lo1)
    const b = pointSurGlobe(la2, lo2)
    const milieu = a.clone().add(b).normalize().multiplyScalar(1.45)
    const courbe = new THREE.QuadraticBezierCurve3(a, milieu, b)
    const geo = suivre(new THREE.BufferGeometry().setFromPoints(courbe.getPoints(64)))
    const ligne = new THREE.Line(geo, matArc)
    geo.setDrawRange(0, 0)
    globe.add(ligne)
    arcs.push({ ligne, total: 65, phase: i * 1.3 })
  })

  /* ── Anneaux d'orbite (or et violet) et leurs satellites ─────────────────────────────────── */
  const matOr = suivre(new THREE.MeshPhysicalMaterial({ color: OR, metalness: 1, roughness: 0.22, clearcoat: 0.6 }))
  const matVioletBrillant = suivre(
    new THREE.MeshPhysicalMaterial({ color: '#7a5cff', metalness: 0.25, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }),
  )
  const matLavande = suivre(
    new THREE.MeshPhysicalMaterial({ color: '#e9e2ff', metalness: 0, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
  )
  const matNuit = suivre(new THREE.MeshPhysicalMaterial({ color: '#2d1b5e', metalness: 0.35, roughness: 0.35, clearcoat: 0.8 }))

  const orbites = new THREE.Group()
  globe.add(orbites)
  const satellites: { objet: THREE.Object3D; rayon: number; vitesse: number; plan: THREE.Object3D }[] = []
  ;[
    { rayon: 1.22, tube: 0.008, mat: matOr, rot: [1.15, 0.2, 0.35], vitesse: 0.45 },
    { rayon: 1.36, tube: 0.006, mat: matVioletBrillant, rot: [1.9, -0.5, -0.4], vitesse: -0.3 },
  ].forEach(({ rayon, tube, mat, rot, vitesse }) => {
    const plan = new THREE.Group()
    plan.rotation.set(rot[0], rot[1], rot[2])
    plan.add(new THREE.Mesh(suivre(new THREE.TorusGeometry(rayon, tube, 8, 160)), mat))
    const satellite = new THREE.Mesh(suivre(new THREE.SphereGeometry(0.06, 24, 24)), mat === matOr ? matOr : matLavande)
    plan.add(satellite)
    orbites.add(plan)
    satellites.push({ objet: satellite, rayon, vitesse, plan })
  })

  /* ── Objets flottants ─────────────────────────────────────────────────────────────────── */

  /* Toque de diplômé : plateau, calotte, bouton et gland dorés. */
  const toque = new THREE.Group()
  const plateau = new THREE.Mesh(suivre(new THREE.BoxGeometry(1.6, 0.09, 1.6)), matNuit)
  plateau.position.y = 0.32
  const calotte = new THREE.Mesh(suivre(new THREE.CylinderGeometry(0.6, 0.66, 0.5, 48, 1, true)), matNuit)
  calotte.position.y = 0.04
  const fond = new THREE.Mesh(suivre(new THREE.CircleGeometry(0.66, 48)), matNuit)
  fond.rotation.x = Math.PI / 2
  fond.position.y = -0.21
  const bouton = new THREE.Mesh(suivre(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 24)), matOr)
  bouton.position.y = 0.39
  /* Le cordon court du bouton central jusqu'à un coin du plateau (diagonale horizontale), puis
     retombe à la verticale jusqu'au gland. */
  const cordon = new THREE.Mesh(suivre(new THREE.CylinderGeometry(0.018, 0.018, 1.13, 8)), matOr)
  cordon.position.set(0.4, 0.38, 0.4)
  cordon.rotation.set(0, -Math.PI / 4, Math.PI / 2)
  const pendant = new THREE.Mesh(suivre(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 8)), matOr)
  pendant.position.set(0.8, 0.13, 0.8)
  const gland = new THREE.Mesh(suivre(new THREE.CylinderGeometry(0.05, 0.1, 0.26, 16)), matOr)
  gland.position.set(0.8, -0.24, 0.8)
  toque.add(plateau, calotte, fond, bouton, cordon, pendant, gland)
  toque.rotation.set(0.35, 0.6, -0.12)

  /* Bulle de dialogue : l'oral, cœur de l'apprentissage d'une langue. */
  const bulle = new THREE.Group()
  const corpsBulle = new THREE.Mesh(suivre(new THREE.SphereGeometry(1, 48, 48)), matLavande)
  corpsBulle.scale.set(1.05, 0.72, 0.42)
  const queue = new THREE.Mesh(suivre(new THREE.ConeGeometry(0.22, 0.5, 24)), matLavande)
  queue.position.set(-0.55, -0.62, 0)
  queue.rotation.z = -0.7
  bulle.add(corpsBulle, queue)
  const geoPastille = suivre(new THREE.SphereGeometry(0.11, 24, 24))
  ;[-0.34, 0, 0.34].forEach((x) => {
    const pastille = new THREE.Mesh(geoPastille, matVioletBrillant)
    pastille.position.set(x, 0, 0.4)
    bulle.add(pastille)
  })

  const anneauOr = new THREE.Mesh(suivre(new THREE.TorusGeometry(0.42, 0.15, 32, 96)), matOr)
  const cristal = new THREE.Mesh(suivre(new THREE.IcosahedronGeometry(0.5, 0)), matVioletBrillant)
  const geoPerle = suivre(new THREE.SphereGeometry(0.2, 32, 32))

  const flottants: Flottant[] = [
    { objet: toque, ancre: [-0.8, 0.66, 1], echelle: 0.95, amplitude: 0.18, vitesse: 0.8, phase: 0, rotation: [0, 0.35, 0], delai: 0.15 },
    { objet: bulle, ancre: [-0.9, -0.28, 0.6], echelle: 0.62, amplitude: 0.15, vitesse: 1, phase: 1.4, rotation: [0, 0.25, 0.04], delai: 0.3 },
    { objet: anneauOr, ancre: [0.86, -0.74, 1], echelle: 0.9, amplitude: 0.14, vitesse: 1.1, phase: 2.2, rotation: [0.5, 0.7, 0], delai: 0.45 },
    { objet: cristal, ancre: [0.9, 0.78, 0], echelle: 0.85, amplitude: 0.2, vitesse: 0.9, phase: 0.8, rotation: [0.3, 0.5, 0.1], delai: 0.6 },
    { objet: new THREE.Mesh(geoPerle, matLavande), ancre: [-0.28, 0.93, -1], echelle: 1, amplitude: 0.1, vitesse: 1.3, phase: 3, rotation: [0, 0, 0], delai: 0.7 },
    { objet: new THREE.Mesh(geoPerle, matOr), ancre: [0.98, 0.08, 0.5], echelle: 0.7, amplitude: 0.12, vitesse: 1.5, phase: 1.1, rotation: [0, 0, 0], delai: 0.8 },
    { objet: new THREE.Mesh(geoPerle, matVioletBrillant), ancre: [0.05, -0.95, 0.8], echelle: 0.8, amplitude: 0.1, vitesse: 1.2, phase: 2.6, rotation: [0, 0, 0], delai: 0.9 },
  ]
  flottants.forEach((f) => racine.add(f.objet))

  /* ── Mise à l'échelle : coordonnées normalisées → monde ──────────────────────────────────── */
  let demiLargeur = 1
  let demiHauteur = 1
  function redimensionner() {
    const { clientWidth: largeur, clientHeight: hauteur } = canvas
    if (!largeur || !hauteur) return
    renderer.setSize(largeur, hauteur, false)
    camera.aspect = largeur / hauteur
    camera.updateProjectionMatrix()
    demiHauteur = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z
    demiLargeur = demiHauteur * camera.aspect
    /* Le globe déborde du cadre de l'illustration en haut à droite : assez grand pour qu'on le
       voie tourner autour, assez loin derrière (z négatif) pour rester un fond. */
    const rayonGlobe = Math.min(demiHauteur * 0.66, demiLargeur * 0.62)
    globe.scale.setScalar(rayonGlobe)
    globe.position.set(demiLargeur * 0.4, demiHauteur * 0.2, -2)
  }
  const observateur = new ResizeObserver(() => {
    redimensionner()
    if (options.mouvementReduit) rendre(6)
  })
  observateur.observe(canvas)
  redimensionner()

  /* ── Souris : cible de parallaxe, lissée à chaque image ──────────────────────────────────── */
  const cible = { x: 0, y: 0 }
  const courant = { x: 0, y: 0 }
  function suivreSouris(evenement: PointerEvent) {
    cible.x = (evenement.clientX / window.innerWidth) * 2 - 1
    cible.y = (evenement.clientY / window.innerHeight) * 2 - 1
  }
  if (!options.mouvementReduit) window.addEventListener('pointermove', suivreSouris, { passive: true })

  const easeOutBack = (t: number) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  }

  function rendre(t: number) {
    courant.x += (cible.x - courant.x) * 0.05
    courant.y += (cible.y - courant.y) * 0.05
    racine.rotation.y = courant.x * 0.12
    racine.rotation.x = courant.y * 0.08

    const apparition = Math.min(1, t / 1.4)
    matPoints.opacity = 0.9 * apparition
    matCoeur.opacity = 0.25 * apparition

    globe.rotation.y = t * 0.12
    globe.rotation.x = 0.35

    arcs.forEach(({ ligne, total, phase }) => {
      const cycle = ((t * 0.35 + phase) % 3) / 3
      const debut = cycle < 0.5 ? 0 : Math.floor(((cycle - 0.5) / 0.5) * total)
      const fin = cycle < 0.5 ? Math.floor((cycle / 0.5) * total) : total
      ligne.geometry.setDrawRange(debut, Math.max(0, fin - debut))
    })

    satellites.forEach(({ objet, rayon, vitesse }) => {
      const angle = t * vitesse
      objet.position.set(Math.cos(angle) * rayon, Math.sin(angle) * rayon, 0)
    })

    flottants.forEach((f) => {
      const progression = THREE.MathUtils.clamp((t - f.delai) / 0.9, 0, 1)
      const taille = Math.min(demiHauteur, demiLargeur) * 0.16 * f.echelle * easeOutBack(progression)
      f.objet.scale.setScalar(Math.max(taille, 0.0001))
      f.objet.position.set(
        f.ancre[0] * demiLargeur * 0.92,
        f.ancre[1] * demiHauteur * 0.9 + Math.sin(t * f.vitesse + f.phase) * f.amplitude * demiHauteur * 0.2,
        f.ancre[2],
      )
      f.objet.rotation.x += f.rotation[0] * 0.01
      f.objet.rotation.y += f.rotation[1] * 0.01
      f.objet.rotation.z = Math.sin(t * 0.6 + f.phase) * 0.15 + f.rotation[2]
    })

    renderer.render(scene, camera)
  }

  /* ── Boucle : suspendue quand l'onglet est caché, absente si l'utilisateur réduit les
     animations (une seule image fixe, déjà composée). ─────────────────────────────────────── */
  let idAnimation = 0
  const horloge = new THREE.Timer()
  function boucle(horodatage: number) {
    horloge.update(horodatage)
    rendre(horloge.getElapsed())
    idAnimation = requestAnimationFrame(boucle)
  }
  function surVisibilite() {
    if (document.hidden) cancelAnimationFrame(idAnimation)
    else if (!options.mouvementReduit) idAnimation = requestAnimationFrame(boucle)
  }

  if (options.mouvementReduit) {
    flottants.forEach((f) => (f.delai = -10))
    rendre(6)
  } else {
    idAnimation = requestAnimationFrame(boucle)
    document.addEventListener('visibilitychange', surVisibilite)
  }

  return {
    detruire() {
      cancelAnimationFrame(idAnimation)
      observateur.disconnect()
      window.removeEventListener('pointermove', suivreSouris)
      document.removeEventListener('visibilitychange', surVisibilite)
      horloge.dispose()
      aJeter.forEach((ressource) => ressource.dispose())
      renderer.dispose()
    },
  }
}
