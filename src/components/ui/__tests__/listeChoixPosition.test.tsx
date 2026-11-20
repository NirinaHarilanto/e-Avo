import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { ListeChoix } from '../ListeChoix'

/* Signalé par le client le 2026-11-20, capture à l'appui : « depuis quand une liste déroulante
 * est mal placée comme ça, il faut l'afficher de façon professionnelle ». Le panneau s'ouvrait
 * en haut à gauche de la fenêtre, loin de son champ.
 *
 * Mesuré en production : le champ était à 757 px de la gauche, le panneau posé à `left: 757px`
 * s'affichait à 560 px — 197 px trop à gauche et 105 px trop haut, et plus étroit que son champ.
 *
 * La cause : `body.echelle-connectee` porte `zoom: 0.74` (les espaces connectés affichent plus
 * d'informations sans réduire chaque taille à la main). Le panneau est monté dans `document.body`
 * par un portail, et hérite donc de ce zoom. Or `getBoundingClientRect()` rend des pixels ÉCRAN,
 * déjà multipliés par le zoom, tandis qu'une valeur écrite en CSS est REdivisée par lui au
 * rendu : recopier l'une dans l'autre rapproche le panneau de l'origine de 26 %.
 *
 * Ce test rejoue exactement ces mesures, parce que le défaut est invisible dans le DOM — les
 * valeurs CSS y paraissent justes — et ne se voit qu'en comparant les rectangles RENDUS. */

const ZOOM = 0.74
/* Les mesures relevées en production sur « Nouvelle vague », en pixels écran. */
const CHAMP = { left: 757, top: 380, bottom: 413, width: 386, height: 33, right: 1143 }

const vraiGetComputedStyle = window.getComputedStyle

function simulerEspaceZoome(zoom: number) {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element, pseudo?: string | null) => {
    const style = vraiGetComputedStyle(element, pseudo ?? undefined)
    if (element === document.body) return { ...style, zoom: String(zoom) } as CSSStyleDeclaration
    return style
  })
}

function simulerChamp() {
  /* jsdom ne fait aucune mise en page : chaque rectangle vaut zéro. On pose donc celui du
     déclencheur, seule mesure dont dépend le calcul. */
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this.getAttribute('aria-haspopup') === 'listbox') return { ...CHAMP, x: CHAMP.left, y: CHAMP.top, toJSON: () => ({}) } as DOMRect
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  }
}

const rectOriginal = Element.prototype.getBoundingClientRect

beforeEach(() => {
  simulerChamp()
  window.innerHeight = 900
})

afterEach(() => {
  Element.prototype.getBoundingClientRect = rectOriginal
  vi.restoreAllMocks()
})

function monterEtOuvrir() {
  render(
    <ListeChoix
      options={[
        { id: 'v1', libelle: 'Septembre · vague actuelle' },
        { id: 'v2', libelle: 'Novembre' },
      ]}
      valeur="v1"
      onChange={() => {}}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /Septembre/ }))
  return screen.getByRole('listbox') as HTMLElement
}

describe('ListeChoix — position du panneau dans un espace zoomé', () => {
  /* Le cœur du défaut : dans un espace à `zoom: 0.74`, les coordonnées CSS doivent valoir
     mesure ÷ 0,74 pour que le panneau s'affiche là où est le champ. */
  it('convertit les coordonnées écran dans le repère zoomé du portail', () => {
    simulerEspaceZoome(ZOOM)
    const panneau = monterEtOuvrir()

    // Le champ est à 757 px à l'écran : dans un repère réduit à 74 %, cela s'écrit 1023 px.
    expect(parseFloat(panneau.style.left)).toBeCloseTo(CHAMP.left / ZOOM, 1)
    // Juste sous le champ : 413 + 4 px d'écart, converti de même.
    expect(parseFloat(panneau.style.top)).toBeCloseTo((CHAMP.bottom + 4) / ZOOM, 1)
    // Et la largeur, sans quoi la liste est plus étroite que le champ qu'elle prolonge.
    expect(parseFloat(panneau.style.width)).toBeCloseTo(CHAMP.width / ZOOM, 1)
  })

  /* Une fois RENDUES — c'est-à-dire multipliées par le zoom — ces valeurs retombent exactement
     sur le champ. C'est la seule vérification qui dise vraiment « bien placée ». */
  it('replace le panneau exactement sous son champ, une fois le zoom appliqué', () => {
    simulerEspaceZoome(ZOOM)
    const panneau = monterEtOuvrir()

    expect(parseFloat(panneau.style.left) * ZOOM).toBeCloseTo(CHAMP.left, 1)
    expect(parseFloat(panneau.style.top) * ZOOM).toBeCloseTo(CHAMP.bottom + 4, 1)
    expect(parseFloat(panneau.style.width) * ZOOM).toBeCloseTo(CHAMP.width, 1)
  })

  /* Sans zoom — la vitrine publique, ou un espace qui n'en porte pas — rien ne doit changer :
     la conversion doit rester neutre, sans quoi on corrigerait un écran en en cassant un autre. */
  it('laisse les coordonnées inchangées là où aucun zoom ne s’applique', () => {
    simulerEspaceZoome(1)
    const panneau = monterEtOuvrir()

    expect(parseFloat(panneau.style.left)).toBeCloseTo(CHAMP.left, 1)
    expect(parseFloat(panneau.style.top)).toBeCloseTo(CHAMP.bottom + 4, 1)
    expect(parseFloat(panneau.style.width)).toBeCloseTo(CHAMP.width, 1)
  })

  /* Règle posée par le client le 2026-11-20 : « la liste déroulante devrait s'afficher juste en
     dessous de la zone concernée, c'est toujours comme cela que l'on a fait, il faut pas
     changer ». Une version précédente basculait vers le haut quand le bas de la fenêtre
     approchait — comportement imprévisible, et mal placé de surcroît, puisque poser la liste par
     le haut suppose de connaître sa hauteur avant de la dessiner. */
  it('reste sous le champ même lorsque la fenêtre est courte', () => {
    simulerEspaceZoome(ZOOM)
    window.innerHeight = 500
    const panneau = monterEtOuvrir()

    expect(parseFloat(panneau.style.top) * ZOOM).toBeCloseTo(CHAMP.bottom + 4, 1)
    // Et jamais ancrée par le bas : c'est ce qui la faisait remonter.
    expect(panneau.style.bottom).toBe('')
  })

  /* Le débordement se règle par la HAUTEUR, pas par un déplacement : la liste tient dans la
     place restante sous le champ, et défile à l'intérieur. */
  it('borne sa hauteur à la place restante sous le champ, et y défile', () => {
    simulerEspaceZoome(ZOOM)
    window.innerHeight = 500
    const panneau = monterEtOuvrir()

    // Place écran sous le champ : 500 − 413 − 4 (écart) − 8 (marge) = 75.
    expect(parseFloat(panneau.style.maxHeight) * ZOOM).toBeCloseTo(75, 0)
    expect(panneau.style.overflowY).toBe('auto')
  })

  /* Dans une fenêtre haute, la hauteur reste plafonnée pour qu'une longue liste ne couvre pas
     tout l'écran. */
  it('plafonne sa hauteur quand la place ne manque pas', () => {
    simulerEspaceZoome(ZOOM)
    window.innerHeight = 2000
    const panneau = monterEtOuvrir()

    expect(parseFloat(panneau.style.maxHeight) * ZOOM).toBeCloseTo(280, 0)
  })
})
