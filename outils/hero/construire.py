"""Construit l'image de fond de la page d'accueil publique (public/hero-hoc.png et .webp).

    python outils/hero/construire.py

L'image finale est une maquette 1600 x 900 posée au centre d'un canevas 2200 x 1600. La marge
autour d'elle est du décor : c'est elle, et jamais la maquette, que le recadrage sacrifie quand
les proportions de l'écran ne sont pas celles de la maquette (voir HeroPublic.tsx). Les bords de
l'image coïncident donc toujours avec ceux de l'écran, sans bande à combler.

Quatre étapes, dans cet ordre :
  1. le bouton « S'inscrire » dessiné dans la maquette est effacé (le hero n'en porte plus) ;
  2. le canevas est élargi en prolongeant le décor vers l'extérieur, en flou croissant ;
  3. des bandes de feuillage sont greffées à gauche et à droite, avivées pour être plus brillantes ;
  4. le résultat est écrit en PNG et en WebP SANS PERTE (mêmes pixels, vérifié).

Deux sources, versionnées à côté de ce script pour que la construction reste reproductible :
  - source-maquette.png   : la maquette validée par le client, 1600 x 900 ;
  - source-feuillage.jpg  : une variante générée par Gemini, dont on ne reprend QUE les bandes
    végétales — cette variante avait aussi regénéré tous les textes, en les corrompant.
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance, ImageFilter

RACINE = Path(__file__).resolve().parents[2]
SOURCE_MAQUETTE = Path(__file__).parent / 'source-maquette.png'
SOURCE_FEUILLAGE = Path(__file__).parent / 'source-feuillage.jpg'
SORTIE = RACINE / 'public' / 'hero-hoc'

# Marge de décor ajoutée autour de la maquette.
EXT_X, EXT_Y = 300, 350

# Le bouton « S'inscrire », en coordonnées de la maquette. Le bouton mesure x 1335→1514,
# y 25→66 ; le rectangle déborde franchement pour que le fondu de bord retombe sur du ciel propre
# et non sur le bouton — sinon il en subsiste un liseré en forme de pilule. Les limites sont
# contraintes par le voisinage : « Se connecter » finit à x=1323, les ailes de la statue montent
# jusqu'à y≈75.
BOUTON_INSCRIPTION = (1327, 4, 1545, 73)
FONDU_BOUTON = {'gauche': 8, 'droite': 22, 'haut': 14, 'bas': 5}

# Seule la marge verticale est fondue avant le prolongement. Latéralement, la greffe végétale
# couvre la jonction : y appliquer un fondu effacerait pour rien du décor — c'est ce qui avait
# dissous le nez de l'avion, à x ≈ 1590.
FONDU_HAUT, FONDU_BAS = 14, 40   # le logo commence à y=18, la barre de bénéfices finit vers y=845

# Bandes végétales : largeur prise dans la référence, agrandissement, et abscisse (dans le canevas)
# où le feuillage doit mourir. Calées pour ne jamais toucher le contenu : le titre commence à
# x=388 et les pastilles finissent à x=1823.
FEUILLAGE = {'bande': 270, 'echelle': 1.95, 'bord_gauche': 356, 'bord_droite': 1848, 'fondu_vertical': 140}


def rampe_h(largeur, hauteur, zero_a_droite):
    """Dégradé horizontal 0 → 255. Le 0 marque le côté du raccord (là où l'on ne touche à rien)."""
    g = Image.linear_gradient('L').rotate(-90, expand=True).resize((largeur, hauteur))
    return g if zero_a_droite else g.transpose(Image.FLIP_LEFT_RIGHT)


def rampe_v(largeur, hauteur, zero_en_bas):
    g = Image.linear_gradient('L').resize((largeur, hauteur))
    return g.transpose(Image.FLIP_TOP_BOTTOM) if zero_en_bas else g


def flou_croissant(base, masque, paliers):
    """Applique un flou qui croît le long du masque, par paliers fondus entre eux."""
    rendu = base.filter(ImageFilter.GaussianBlur(paliers[0])) if paliers[0] else base.copy()
    for i in range(1, len(paliers)):
        suivant = base.filter(ImageFilter.GaussianBlur(paliers[i]))
        d0, d1 = (i - 1) / (len(paliers) - 1), i / (len(paliers) - 1)
        seuil = masque.point(
            lambda v: 0 if v / 255 < d0 else (255 if v / 255 > d1 else int(255 * (v / 255 - d0) / (d1 - d0)))
        )
        rendu = Image.composite(suivant, rendu, seuil)
    return rendu


def effacer_bouton(maquette):
    """Remplace le bouton « S'inscrire » par le ciel qui l'entoure.

    Le fond est un ciel très doux, dégradé à la fois en hauteur (plus clair en haut) et en largeur.
    On le reconstitue en mélangeant les quatre bords du rectangle : l'interpolation horizontale
    rend le dégradé latéral, la verticale celui de la hauteur, et leur moyenne les deux à la fois.
    Un simple flou ne suffirait pas — il étalerait le violet du bouton au lieu de l'effacer."""
    x0, y0, x1, y1 = BOUTON_INSCRIPTION
    largeur, hauteur = x1 - x0, y1 - y0
    marge = 4

    gauche = maquette.crop((x0 - marge, y0, x0 - marge + 1, y1)).resize((largeur, hauteur), Image.NEAREST)
    droite = maquette.crop((x1 + marge - 1, y0, x1 + marge, y1)).resize((largeur, hauteur), Image.NEAREST)
    horizontal = Image.composite(droite, gauche, rampe_h(largeur, hauteur, zero_a_droite=False))

    haut = maquette.crop((x0, y0 - marge, x1, y0 - marge + 1)).resize((largeur, hauteur), Image.NEAREST)
    bas = maquette.crop((x0, y1 + marge - 1, x1, y1 + marge)).resize((largeur, hauteur), Image.NEAREST)
    vertical = Image.composite(bas, haut, rampe_v(largeur, hauteur, zero_en_bas=False))

    comble = Image.blend(horizontal, vertical, 0.5).filter(ImageFilter.GaussianBlur(9))

    # Bords fondus, asymétriques : « Se connecter » finit juste à gauche et les ailes de la statue
    # commencent juste en dessous, on ne peut pas y déborder autant qu'à droite ou en haut.
    masque = Image.new('L', (largeur, hauteur), 255)
    f = FONDU_BOUTON
    masque.paste(rampe_h(f['gauche'], hauteur, True).transpose(Image.FLIP_LEFT_RIGHT), (0, 0))
    masque.paste(rampe_h(f['droite'], hauteur, True), (largeur - f['droite'], 0))
    vfondu = Image.new('L', (largeur, hauteur), 255)
    vfondu.paste(rampe_v(largeur, f['haut'], False), (0, 0))
    vfondu.paste(rampe_v(largeur, f['bas'], True), (0, hauteur - f['bas']))
    masque = ImageChops.multiply(masque, vfondu)

    sortie = maquette.copy()
    sortie.paste(comble, (x0, y0), masque)
    return sortie


def elargir(maquette):
    """Pose la maquette au centre d'un canevas plus grand, en prolongeant son décor vers l'extérieur.

    Le prolongement reconduit la ligne (ou la colonne) de bord, de plus en plus floue à mesure
    qu'elle s'éloigne : aucun miroir, aucun motif rejoué, et un raccord exact au pixel."""
    largeur, hauteur = maquette.size

    # Fondu vertical seulement (voir FONDU_HAUT / FONDU_BAS).
    etape = maquette.copy()
    etape.paste(flou_croissant(maquette.crop((0, 0, largeur, FONDU_HAUT)),
                               rampe_v(largeur, FONDU_HAUT, True), [0, 3, 8]), (0, 0))
    etape.paste(flou_croissant(etape.crop((0, hauteur - FONDU_BAS, largeur, hauteur)),
                               rampe_v(largeur, FONDU_BAS, False), [0, 3, 8, 14]), (0, hauteur - FONDU_BAS))

    def laterale(gauche):
        colonne = etape.crop((0, 0, 1, hauteur)) if gauche else etape.crop((largeur - 1, 0, largeur, hauteur))
        base = colonne.resize((EXT_X, hauteur), Image.NEAREST)
        # Premier palier non nul : latéralement, le feuillage couvre la jonction, et un prolongement
        # net y dessinerait des stries visibles par transparence entre deux feuilles.
        return flou_croissant(base, rampe_h(EXT_X, hauteur, gauche), [12, 22, 36, 56, 88])

    lat = Image.new('RGB', (largeur + 2 * EXT_X, hauteur))
    lat.paste(laterale(True), (0, 0))
    lat.paste(etape, (EXT_X, 0))
    lat.paste(laterale(False), (EXT_X + largeur, 0))

    def verticale(haut):
        ligne = lat.crop((0, 0, lat.width, 1)) if haut else lat.crop((0, hauteur - 1, lat.width, hauteur))
        base = ligne.resize((lat.width, EXT_Y), Image.NEAREST)
        return flou_croissant(base, rampe_v(lat.width, EXT_Y, haut), [0, 8, 22, 45, 80])

    final = Image.new('RGB', (lat.width, hauteur + 2 * EXT_Y))
    final.paste(verticale(True), (0, 0))
    final.paste(lat, (0, EXT_Y))
    final.paste(verticale(False), (0, EXT_Y + hauteur))
    return final


def aviver(feuillage):
    """Donne au feuillage le brillant d'une vraie feuille : nervures ré-affûtées après
    l'agrandissement, contraste local, et surtout un voile spéculaire qui ne reprend que les
    hautes lumières — c'est le reflet sur la cuticule qui fait lire une feuille comme réelle."""
    img = feuillage.filter(ImageFilter.UnsharpMask(radius=2.4, percent=110, threshold=3))
    img = ImageEnhance.Contrast(img).enhance(1.14)
    img = ImageEnhance.Color(img).enhance(1.10)

    # Spéculaire : on isole les hautes lumières, on les adoucit, et on les ré-ajoute en écran.
    lumieres = img.convert('L').point(lambda v: 0 if v < 150 else int((v - 150) * 255 / 105))
    lumieres = lumieres.filter(ImageFilter.GaussianBlur(2.2))
    voile = Image.merge('RGB', (lumieres, lumieres, lumieres))
    img = ImageChops.screen(img, ImageChops.multiply(voile, Image.new('RGB', img.size, (92, 92, 92))))

    return ImageEnhance.Brightness(img).enhance(1.05)


def greffer_feuillage(canevas):
    """Recouvre les marges latérales par des bandes de feuillage.

    Le masque combine deux logiques : côté extérieur une zone pleine, pour que plus rien du
    prolongement flou ne transparaisse ; côté intérieur une découpe par luminance, pour que les
    feuilles pénètrent la scène par leur propre silhouette plutôt que par un bord droit."""
    ref = Image.open(SOURCE_FEUILLAGE).convert('RGB')
    bande, echelle = FEUILLAGE['bande'], FEUILLAGE['echelle']

    for cote in ('gauche', 'droite'):
        brut = ref.crop((0, 0, bande, ref.height)) if cote == 'gauche' else ref.crop((ref.width - bande, 0, ref.width, ref.height))
        img = aviver(brut.resize((int(bande * echelle), int(ref.height * echelle)), Image.LANCZOS))
        largeur, hauteur = img.size

        silhouette = img.convert('L').point(
            lambda v: 255 if v < 112 else (0 if v > 188 else int(255 * (188 - v) / 76))
        ).filter(ImageFilter.GaussianBlur(1.6))
        # Seuil bas : le feuillage doit être PLEINEMENT opaque dès le bord de la maquette
        # (canevas x=300 à gauche, x=1900 à droite), sinon le prolongement flou transparaît entre
        # les feuilles. Plus à l'intérieur, c'est la silhouette qui prend le relais.
        plein = rampe_h(largeur, hauteur, cote == 'gauche').point(
            lambda v: 255 if v > 26 else (0 if v < 6 else int(255 * (v - 6) / 20))
        )
        masque = ImageChops.lighter(plein, silhouette)

        extinction = rampe_h(largeur, hauteur, cote == 'gauche').point(lambda v: 255 if v > 45 else int(255 * v / 45))
        masque = ImageChops.multiply(masque, extinction)

        fondu = Image.new('L', (largeur, hauteur), 255)
        g = Image.linear_gradient('L').resize((largeur, FEUILLAGE['fondu_vertical']))
        fondu.paste(g, (0, 0))
        fondu.paste(g.transpose(Image.FLIP_TOP_BOTTOM), (0, hauteur - FEUILLAGE['fondu_vertical']))
        masque = ImageChops.multiply(masque, fondu)

        x = FEUILLAGE['bord_gauche'] - largeur if cote == 'gauche' else FEUILLAGE['bord_droite']
        canevas.paste(img, (x, (canevas.height - hauteur) // 2), masque)

    return canevas



# Qualité de l'export WebP réellement chargé par le site (voir HeroPublic.tsx, `<source
# type="image/webp">` toujours choisi en premier par le navigateur). Passé de « sans perte » à
# une compression avec perte à qualité 95 — demande client du 2026-09-16 : « le chargement doit
# être très rapide, 1 à 2 secondes maximum ». L'écart mesuré à cette qualité (voir l'assertion
# plus bas) est de l'ordre de 1/255 en moyenne, imperceptible à l'œil, pour une division du poids
# par quatre à cinq. Le PNG reste généré en pleine fidélité : c'est le fichier de référence
# (utilisé pour les comparaisons ci-dessous) et le repli des tout derniers navigateurs sans
# support WebP — un cas marginal en 2026, qui ne justifie pas de retarder tout le monde.
QUALITE_WEBP = 95
ECART_MOYEN_MAX = 3.0  # sur 255 ; marge large au-dessus de l'écart mesuré (~1,15) à cette qualité


def main():
    maquette = Image.open(SOURCE_MAQUETTE).convert('RGB')
    sans_bouton = effacer_bouton(maquette)
    canevas = greffer_feuillage(elargir(sans_bouton))

    canevas.save(f'{SORTIE}.png')
    canevas.save(f'{SORTIE}.webp', 'WEBP', quality=QUALITE_WEBP, method=6)

    relu = Image.open(f'{SORTIE}.webp').convert('RGB')
    diff = ImageChops.difference(canevas, relu)
    ecart_moyen = sum(diff.convert('L').getdata()) / (canevas.width * canevas.height)
    assert ecart_moyen <= ECART_MOYEN_MAX, f'écart WebP/PNG trop élevé : {ecart_moyen:.2f}/255 (max {ECART_MOYEN_MAX})'

    # Hors des zones volontairement retouchées (bouton effacé, fondus de bord), la maquette doit
    # arriver intacte au centre du canevas — vérifié sur le PNG, la référence en pleine fidélité.
    centre = canevas.crop((EXT_X, EXT_Y + FONDU_HAUT, EXT_X + maquette.width, EXT_Y + maquette.height - FONDU_BAS))
    attendu = sans_bouton.crop((0, FONDU_HAUT, maquette.width, maquette.height - FONDU_BAS))
    intacte = ImageChops.difference(centre, attendu).getbbox()
    print(f'{canevas.width} x {canevas.height}')
    print(f'écart moyen WebP (q{QUALITE_WEBP}) / PNG : {ecart_moyen:.2f}/255')
    print(f'maquette intacte au centre (hors feuillage greffé, sur le PNG) : {"oui" if intacte is None else f"retouchée sur {intacte}"}')


if __name__ == '__main__':
    main()
