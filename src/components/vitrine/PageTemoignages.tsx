import { useCallback, useEffect, useState } from 'react'
import { IcoHX } from './IconesHX'
import { initialesDe } from './PageEquipe'
import { urlPhotoTemoignage, useTemoignagesPublies } from '../../hooks/useTemoignages'

/* Témoignages — carrousel en anneau 3D, d'après la maquette fournie par le client le
   2026-10-09 : les cartes tournent sur un cercle incliné, celle de devant en pleine lecture,
   les autres de profil et en retrait, le tout posé sur une orbite dorée semée d'étincelles et
   sur un socle de verre.

   Cette vue remplace le carrousel horizontal à aimantation de la maquette d'origine
   (hoc-temoignages.html). La piste défilante a disparu avec lui : la position ne se lit plus
   dans un `scrollLeft` mais dans un index, et c'est un décalage angulaire par rapport à cet
   index qui place chaque carte.

   Les témoignages viennent de la base depuis le 2026-10-13 (migration 0128) : les dix-huit
   d'origine y ont été repris mot pour mot, et s'y ajoutent les avis d'élèves une fois validés
   par l'admin dans « Gestion des avis ». La page n'affiche que ce qui est publié — c'est la RLS
   qui le garantit, pas ce composant. */



/* Six places sur l'anneau, à 60° l'une de l'autre : une devant, deux de chaque côté, une au
   fond. Les dix-huit témoignages se partagent ces six places — un témoignage dont le décalage
   sort de l'intervalle est simplement effacé. L'intervalle est volontairement asymétrique :
   +3 et -3 désignent le MÊME point de l'anneau (180° et -180°), garder les deux y empilerait
   deux cartes. */
const PAS_ANGULAIRE = 60
const DECALAGE_MIN = -2
const DECALAGE_MAX = 3

/* Rayon de l'anneau des cartes, en pixels. Repris tel quel dans la feuille de style
   (`--rayon-anneau`) : la valeur doit être la même des deux côtés, c'est elle qui décide de
   l'écart entre la carte de devant et ses voisines. */
const RAYON = 700

/* Inclinaison de l'anneau, en degrés. Elle aussi est écrite deux fois : `--inclinaison` dans
   la feuille de style la donne à l'anneau, et les cartes s'en servent ici pour l'annuler sur
   elles-mêmes (voir `transformationDe`). */
const INCLINAISON = 16

/* Fondu par la profondeur : une carte éloignée s'efface dans le violet du fond, comme sur la
   maquette. L'opacité est posée carte par carte en style en ligne plutôt qu'en CSS parce
   qu'elle dépend du décalage, qui change à chaque rotation. */
function opaciteDe(ecart: number, surAnneau: boolean) {
  if (!surAnneau) return 0
  if (ecart === 0) return 1
  if (Math.abs(ecart) === 1) return 0.86
  if (Math.abs(ecart) === 2) return 0.6
  return 0.48
}

/* Une carte qui suivrait la tangente du cercle montrerait son dos passé 90°, et celle du fond
   serait franchement retournée. Chaque place reçoit donc son propre angle de présentation :
   la carte est posée sur le cercle, puis redressée vers le spectateur de ce qu'il faut. De
   face et au fond elle est plate, de côté elle se présente de trois quarts. */
function orientationDe(ecart: number) {
  if (ecart === 1) return 32
  if (ecart === -1) return -32
  if (ecart === 2) return 30
  if (ecart === -2) return -30
  return 0
}

/* Place ET redresse une carte. Deux temps, qu'il faut lire de gauche à droite comme une
   trajectoire :

   1. `rotateY(angle) translateZ(R) rotateY(-angle)` — la carte part au point voulu du cercle,
      et le dernier quart de tour défait la rotation que le premier lui a imprimée : elle
      arrive donc là-bas sans avoir pivoté sur elle-même.
   2. `rotateX(inclinaison) rotateY(orientation)` — son orientation propre, choisie et non
      subie. Le `rotateX` annule exactement l'inclinaison que `.anneau` impose à toute sa
      descendance.

   Sans cette annulation (première version), toutes les cartes partageaient l'inclinaison de
   l'anneau : celle de devant arrivait penchée de 16° vers l'arrière, son texte rendu sur un
   plan oblique, donc rééchantillonné et flou — le client l'a signalé. Désormais les cartes se
   tiennent droites sur un plateau incliné : le cercle ne décide plus que de la position, et
   celle de devant est parfaitement de face. */
function transformationDe(ecart: number) {
  const angle = ecart * PAS_ANGULAIRE
  return [
    `rotateY(${angle}deg)`,
    `translateZ(${RAYON}px)`,
    `rotateY(${-angle}deg)`,
    `rotateX(${INCLINAISON}deg)`,
    `rotateY(${orientationDe(ecart)}deg)`,
  ].join(' ')
}

/* Poussière dorée autour de l'orbite. Tirage pseudo-aléatoire à graine fixe plutôt que
   `Math.random` : le semis doit être le même à chaque chargement, sans quoi la page change
   d'aspect à chaque visite — et il serait impossible de comparer deux captures d'écran. */
function semis(graine: number, nombre: number) {
  let etat = graine
  const suivant = () => {
    etat = (etat * 1664525 + 1013904223) % 4294967296
    return etat / 4294967296
  }
  return Array.from({ length: nombre }, (_, i) => ({
    cle: i,
    angle: suivant() * 360,
    rayon: 700 + suivant() * 240,
    hauteur: 40 + suivant() * 230,
    taille: 2 + suivant() * 3.4,
    delai: suivant() * 4.6,
  }))
}
const ETINCELLES = semis(20261009, 44)

export function PageTemoignages({ dossierAssets }: { dossierAssets: string }) {
  const { temoignages: TEMOIGNAGES, loading } = useTemoignagesPublies()
  /* Le deuxième témoignage est mis en avant à l'ouverture (demande client du 2026-10-09) :
     sur le premier, rien n'indiquerait qu'on peut aussi reculer. */
  const [courant, setCourant] = useState(1)
  const total = TEMOIGNAGES.length

  /* Décalage signé par rapport à la carte de devant, ramené dans [-9, 8] : au-delà de la
     demi-liste, il est plus court de faire le tour par l'autre côté, et c'est ce chemin-là que
     l'anneau doit prendre. */
  const decalageDe = useCallback(
    (index: number) => {
      let ecart = index - courant
      if (ecart > total / 2) ecart -= total
      if (ecart < -total / 2) ecart += total
      return ecart
    },
    [courant, total],
  )

  const tourner = useCallback(
    (pas: number) => {
      // Les témoignages arrivent de la base : tant qu'ils ne sont pas là, il n'y a rien à faire
      // tourner — et `% 0` rendrait NaN, dont l'anneau ne se remettrait jamais.
      if (total === 0) return
      setCourant((position) => (position + pas + total) % total)
    },
    [total],
  )

  /* Flèches du clavier : l'anneau est annoncé comme un groupe focalisable, il doit se
     manœuvrer sans souris. */
  useEffect(() => {
    const auClavier = (evenement: KeyboardEvent) => {
      if (evenement.key === 'ArrowLeft') tourner(-1)
      if (evenement.key === 'ArrowRight') tourner(1)
    }
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  }, [tourner])

  return (
    <section className="dark testi">
      <div className="glow g1" />
      <div className="glow g2" />
      <div className="spot" />
      <div className="grain" />

      <div className="wrap head reveal">
        <div className="eyebrow">Témoignages</div>
        <h1 className="h-xl">
          <span className="line">
            <span>Ce que disent</span>
          </span>
          <span className="line">
            <span className="it" style={{ transitionDelay: '.12s' }}>
              nos étudiants
            </span>
          </span>
        </h1>
        <p className="sub rv" style={{ transitionDelay: '.3s' }}>
          Des parcours réels, racontés par celles et ceux qui les ont suivis.
        </p>
      </div>

      {/* Les témoignages viennent de la base (0128) : le temps de l'aller-retour, l'anneau serait
          vide et muet. Un mot le dit, plutôt que de laisser un socle qui tourne à vide. */}
      {(loading || total === 0) && (
        <p className="sub rv" style={{ textAlign: 'center', opacity: 0.75 }}>
          {loading ? 'Chargement des témoignages…' : 'Les premiers témoignages arrivent bientôt.'}
        </p>
      )}

      {/* `rv` (apparition au défilement) est posé sur l'enveloppe et non sur `.scene` : il
          anime `transform`, qui sert déjà à poser la perspective. */}
      <div className="enveloppe-3d rv">
        <div className="scene">
          <div className="anneau">
            {/* Dans l'anneau et non dans la scène : le plateau est couché dans l'espace 3D de
                l'anneau, c'est de lui qu'il tient sa perspective et son rang en profondeur. */}
            <div className="socle" aria-hidden="true">
              <span className="dessus" />
            </div>
            <div className="lueur-orbite" />
            <div className="orbite" />
            {ETINCELLES.map((etincelle) => (
              <span
                key={etincelle.cle}
                className="etincelle"
                aria-hidden="true"
                style={{
                  width: `${etincelle.taille}px`,
                  height: `${etincelle.taille}px`,
                  transform: `rotateY(${etincelle.angle}deg) translateZ(${etincelle.rayon}px) translateY(${etincelle.hauteur}px)`,
                  animationDelay: `${etincelle.delai}s`,
                }}
              />
            ))}

            {TEMOIGNAGES.map((temoignage, index) => {
              const ecart = decalageDe(index)
              const surAnneau = ecart >= DECALAGE_MIN && ecart <= DECALAGE_MAX
              return (
                <article
                  key={temoignage.id}
                  className={`carte3d${ecart === 0 ? ' devant' : ''}${surAnneau ? '' : ' hors-anneau'}`}
                  style={{
                    transform: transformationDe(ecart),
                    opacity: opaciteDe(ecart, surAnneau),
                  }}
                >
                  <span className="q" aria-hidden="true">
                    “
                  </span>
                  <div className="meta">
                    <span className="stars" aria-label="5 étoiles sur 5">
                      ★★★★★
                    </span>
                    <span className="yr">{temoignage.annee}</span>
                  </div>
                  <p>« {temoignage.texte} »</p>
                  <div className="who">
                    <div className="av">
                      {urlPhotoTemoignage(temoignage, dossierAssets) ? (
                        <img src={urlPhotoTemoignage(temoignage, dossierAssets) as string} alt={temoignage.nom_affiche} loading="lazy" />
                      ) : (
                        initialesDe(temoignage.nom_affiche)
                      )}
                    </div>
                    <b>{temoignage.nom_affiche}</b>
                  </div>
                  {/* Une carte de côté s'amène au premier plan d'un clic. Le bouton couvre la
                      carte plutôt que d'en faire une : un `<button>` n'accepte pas de `<p>`,
                      et le témoignage doit rester un bloc de texte structuré. Il n'existe que
                      pour les cartes visibles — sinon la tabulation traverserait dix-huit
                      boutons invisibles. */}
                  {surAnneau && ecart !== 0 && (
                    <button
                      type="button"
                      className="amener"
                      onClick={() => tourner(ecart)}
                      aria-label={`Lire le témoignage de ${temoignage.nom_affiche}`}
                    />
                  )}
                </article>
              )
            })}
          </div>

          {/* Chevrons dorés : trois par côté, qui s'allument l'un après l'autre dans le sens du
              défilement (demande client du 2026-10-09, repositionnés le 2026-10-09 pour
              flanquer la carte de devant au lieu de passer sous la scène). Hors de `.anneau`,
              sinon leur `position: absolute` les ferait hériter de son `transform-style:
              preserve-3d` : eux-mêmes sans transform 3D propre, ils partiraient quand même
              inclinés avec le reste de l'anneau au lieu de rester un repère plat face au
              visiteur. Dans `.scene` et non à côté : seul le placement change ici, pas le
              texte — en étant du même conteneur que l'anneau, les chevrons suivent la mise à
              l'échelle `--facteur` qui réduit la scène sous 1340px, et restent alignés sur la
              carte quelle que soit la taille. Le décalage de chaque chevron est posé en style
              en ligne parce qu'il dépend du rang et s'inverse d'un côté à l'autre — à gauche,
              la vague part du chevron le plus proche du centre et file vers l'extérieur. */}
          <div className="nav-chevrons">
            <button type="button" className="chev prev" aria-label="Témoignage précédent" onClick={() => tourner(-1)}>
              {[0, 1, 2].map((rang) => (
                <span key={rang} style={{ animationDelay: `${(2 - rang) * 0.16}s` }} aria-hidden="true">
                  <IcoHX nom="chevron-gauche" />
                </span>
              ))}
            </button>
            <button type="button" className="chev next" aria-label="Témoignage suivant" onClick={() => tourner(1)}>
              {[0, 1, 2].map((rang) => (
                <span key={rang} style={{ animationDelay: `${rang * 0.16}s` }} aria-hidden="true">
                  <IcoHX nom="chevron-droite" />
                </span>
              ))}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
