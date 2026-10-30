import { useEffect, useState } from 'react'
import type { AccentPalette } from '../../lib/accent'
import type { Database, TypeProgrammeProspect } from '../../types/database.types'
import { ReserverAppel } from '../prospects/ReserverAppel'
import { TestPositionnement } from '../prospects/TestPositionnement'
import { IcoHX, type NomIcoHX } from './IconesHX'

type Tarif = Database['public']['Tables']['tarifs']['Row']

/* Cours & tarifs, d'après hoc-cours-tarifs.html. Les trois cartes ouvrent une fenêtre en trois
   étapes : Découvrir, Tarifs, Réserver.

   Deux endroits où la maquette laissait un trou à remplir, comblés par ce que l'application sait
   déjà faire :
   — les tarifs y étaient écrits en dur ; ils viennent ici de la table `tarifs`, que
     l'administration gère depuis son écran Tarifs ;
   — l'étape « Réserver » y était un agenda externe en iframe (Google Agenda ou Calendly) ; elle
     accueille ici les vrais modules de l'application, qui écrivent dans la base : créneaux réels
     de l'agenda de l'administration pour l'individuel et le duo, session de test oral suivie du
     quiz de positionnement pour le collectif.

   Les textes sont ceux de l'application, identiques à ceux de la maquette hormis quelques
   retouches que la fondatrice y a apportées depuis. Les trois courtes descriptions de
   `PROGRAMMES` ci-dessous sont celles du brief SEO du 2026-10-30 (point 5), qui nomment chacune
   l'intention de recherche de la formule qu'elles décrivent ; les textes longs plus bas, eux,
   restent ceux de la fondatrice. */

const PROGRAMMES: { type: TypeProgrammeProspect; badge: string; titre: string; texte: string }[] = [
  {
    type: 'individuel',
    badge: 'INDIVIDUEL',
    titre: 'Cours particuliers',
    texte:
      'Un accompagnement personnalisé avec un professeur dédié, adapté à votre niveau, vos objectifs et votre rythme d’apprentissage.',
  },
  {
    type: 'collectif',
    badge: 'COLLECTIF',
    titre: 'Cours en petit groupe',
    texte:
      'Progressez en petit groupe, échangez avec d’autres apprenants et développez votre aisance à l’oral dans un environnement stimulant.',
  },
  {
    type: 'duo',
    badge: 'DUO',
    titre: 'Cours en duo',
    texte:
      'Apprenez l’anglais à deux et développez vos compétences grâce à des séances interactives avec un professeur.',
  },
]

/* Photographies fournies par le client le 2026-10-29, en remplacement des illustrations
   dessinées du 2026-10-09. Elles sont recadrées en 4:3, le ratio exact de la zone image des
   cartes, et affichées en `object-fit: cover` : chacune est donc cadrée sur l'écran de visio,
   qui est le sujet, pour qu'un rognage latéral ne le coupe jamais. */
const PHOTOS: Record<TypeProgrammeProspect, { src: string; alt: string }> = {
  individuel: {
    src: '/programmes/individuel.webp',
    alt: 'Une élève de dos suivant un cours particulier en visioconférence, sa professeure seule à l’écran de son ordinateur portable',
  },
  duo: {
    src: '/programmes/duo.webp',
    alt: 'Un cours en duo en visioconférence, les deux participants côte à côte à l’écran d’un ordinateur portable',
  },
  collectif: {
    src: '/programmes/collectif.webp',
    alt: 'Un cours collectif en visioconférence, les participants affichés en mosaïque sur l’écran d’un ordinateur portable',
  },
}

/* Pastilles d'information du hero (maquette client du 2026-10-29) : ce que le visiteur cherche
   à savoir avant même de comparer les formules — comment il peut payer, et ce que les cours
   couvrent. Elles répètent volontairement des informations détaillées plus bas dans la page. */
const ATOUTS_COURS: { icone: NomIcoHX; libelle: string }[] = [
  { icone: 'mobile', libelle: 'Mvola, Orange Money ou virement' },
  { icone: 'coche', libelle: 'Paiement en 2 fois possible' },
  { icone: 'coche', libelle: 'Préparation TOEIC, TOEFL, IELTS' },
  { icone: 'avion', libelle: 'Projet de migration' },
]

const DETAILS: Record<
  TypeProgrammeProspect,
  { accroche: string; description: string; complement?: string; etapes: string[] }
> = {
  individuel: {
    accroche: 'Un accompagnement sur-mesure, de la première minute à votre objectif',
    description:
      'Le cours individuel, c’est vous et votre professeur ou professeure dédié·e, sur le rythme et les sujets qui comptent vraiment pour vous. Nous construisons votre parcours selon vos attentes et vos objectifs : préparer un entretien, développer votre anglais professionnel, préparer un projet de voyage ou d’immigration, réussir une certification (TOEIC, TOEFL, IELTS…) ou renforcer l’anglais de vos enfants. Chaque séance s’ajuste à la précédente : votre professeur ou professeure suit votre progression et adapte le contenu en conséquence.',
    etapes: [
      'Réservez un appel diagnostic gratuit et sans engagement : nous évaluons votre niveau réel et clarifions votre objectif.',
      'Choisissez votre forfait d’heures et votre rythme hebdomadaire — vous gardez la main sur votre planning.',
      'Un professeur vous est attribué et devient votre interlocuteur unique pour toute la durée du forfait.',
      'Chaque séance se déroule en visioconférence, avec un compte rendu rédigé par votre professeur juste après.',
      'Votre progression est suivie séance après séance. À la fin de votre parcours, nous vous demandons de répondre à une enquête de satisfaction.',
    ],
  },
  duo: {
    accroche: 'Progressez à deux, sur un seul et même créneau',
    description:
      'Le cours en duo, c’est un professeur attitré et un suivi personnalisé, partagés entre deux personnes qui avancent ensemble : conjoints, amis, collègues ou membres d’une même famille. L’émulation du binôme entretient la motivation, sans jamais sacrifier l’attention portée à chacun : votre professeur veille à ce que les deux objectifs, même différents, soient servis à chaque séance. Les deux membres du duo doivent avoir le même niveau, ou des niveaux proches : nous les évaluons lors de l’appel diagnostic.',
    etapes: [
      'Réservez un appel diagnostic à deux : nous évaluons le niveau et l’objectif de chacun des deux membres du duo.',
      'Choisissez ensemble votre forfait d’heures et votre rythme hebdomadaire.',
      'Un seul professeur accompagne le binôme sur toute la durée du forfait, pour une vraie cohérence pédagogique.',
      'Les séances se déroulent en visioconférence, les deux membres du duo toujours réunis au même moment.',
      'Un compte rendu et un suivi de progression sont tenus pour le binôme à chaque séance.',
    ],
  },
  collectif: {
    accroche: 'Apprendre ensemble, au bon niveau, sur un planning établi',
    description:
      'Le cours collectif réunit un petit groupe d’élèves de niveau comparable au sein d’une même vague, sur un planning fixé à l’avance par l’établissement. C’est la formule la plus accessible pour qui aime apprendre au contact des autres, dans une dynamique de groupe qui pousse à parler, se corriger et progresser ensemble — sans jamais perdre en exigence pédagogique.',
    complement:
      'Un cycle de cours collectifs dure 2 mois, à raison de 32 séances d’une heure. Nos cours collectifs n’ont rien d’élémentaire : nous avons développé une méthode interactive et communicative. Ici, pas de textes à trous pendant la séance. Les exercices se font en dehors du cours et sont remis à l’équipe pédagogique, pour que la séance en ligne reste un espace d’échange où chacun participe à des activités interactives.',
    /* Questionnaire écrit annoncé avant la réservation du test oral (demande client du
       2026-10-29, « inverser les informations des bullets points 1 et 2 »). */
    etapes: [
      'Répondez d’abord à un court questionnaire écrit de positionnement, qui situe un premier niveau indicatif.',
      'Réservez une session de test oral rattachée à la prochaine vague qui vous intéresse.',
      'Passez le test oral en visioconférence : c’est lui qui confirme votre niveau définitif avec l’équipe pédagogique.',
      'Votre niveau validé, vous êtes automatiquement rattaché·e à la classe correspondante au sein de la vague.',
      'Les cours démarrent sur le planning de la vague. À la fin de chaque niveau, un test valide votre passage au niveau suivant. Un certificat vous est remis à la fin du niveau Advanced.',
    ],
  },
}

function libelleReservation(type: TypeProgrammeProspect) {
  return type === 'collectif' ? 'Réserver mon test' : 'Réserver mon appel'
}

export function PageCours({
  tarifs,
  prochaineVague,
  prochaineVagueCourte,
  etablissementSlug,
  etablissementNom,
  accent,
  typeOuvertInitial,
}: {
  tarifs: Tarif[]
  prochaineVague: string | null
  prochaineVagueCourte: string | null
  etablissementSlug: string
  etablissementNom: string
  accent: AccentPalette
  typeOuvertInitial?: TypeProgrammeProspect | null
}) {
  const [ouvert, setOuvert] = useState<TypeProgrammeProspect | null>(null)
  /* Onglet sur lequel la fenêtre s'ouvre. « Passer le test de niveau » (hero) et `?reserver=1`
     mènent directement à la réservation : un visiteur qui clique sur une date de rentrée ou sur
     « Réserver mon appel diagnostic » sait déjà ce qu'il vient faire, lui faire traverser
     « Découvrir » puis « Tarifs » serait un détour. */
  const [etapeInitiale, setEtapeInitiale] = useState(0)

  function ouvrirFormule(type: TypeProgrammeProspect, etape = 0) {
    setEtapeInitiale(etape)
    setOuvert(type)
  }

  /* En effet et non en valeur initiale d'état : `typeOuvertInitial` n'arrive qu'au rendu
     SUIVANT le montage, parce que la page parente ne lit `?reserver=1` que dans un effet, qui
     s'exécute après celui-ci. Un `useState(typeOuvertInitial)` restait donc à `null` pour de
     bon — la fenêtre ne s'ouvrait que si la page Cours était montée après coup (défaut
     préexistant, visible en arrivant directement sur `/cours?reserver=1`). */
  useEffect(() => {
    if (!typeOuvertInitial) return
    setEtapeInitiale(2)
    setOuvert(typeOuvertInitial)
  }, [typeOuvertInitial])

  return (
    <>
      <section className="dark phero">
        <div className="glow g1" />
        <div className="glow g2" />
        <div className="spot" />
        <div className="grain" />
        <div className="wrap reveal">
          <div className="tete-cours">
            <div className="texte">
              <div className="eyebrow">Cours &amp; tarifs</div>
              <h1 className="h-xl">
                <span className="line">
                  {/* Espace insécable avant le « : » (typographie française) : sans elle, un grand
                      écran peut couper la ligne juste avant le signe et l'isoler sur sa propre
                      ligne (signalé par le client le 2026-10-09). */}
                  <span>Trois façons d’apprendre, un seul cap&nbsp;:</span>
                </span>
                <span className="line">
                  <span className="it" style={{ transitionDelay: '.12s' }}>
                    votre objectif.
                  </span>
                </span>
              </h1>
              <p className="sub rv" style={{ transitionDelay: '.3s' }}>
                Choisissez la formule qui correspond à votre rythme et à votre budget — prix compris.
              </p>
            </div>

            {/* Carte de la prochaine rentrée collective (maquette client du 2026-10-29). La date
                est celle des vagues que l'administration gère déjà, par la même source que le
                ruban de la carte Collectif plus bas : aucune date n'est écrite ici. Sans vague
                programmée, la carte disparaît et le titre reprend toute la largeur, plutôt que
                d'annoncer une rentrée qui n'existe pas. */}
            {/* `surgit` et non `rv` : la date arrive d'un appel à la base, donc APRÈS que
                l'observateur d'apparitions a recensé les éléments de la page (il ne repasse qu'au
                changement de page). Un `.rv` posé ici ne recevait jamais sa classe `.in` et la
                carte restait à `opacity: 0` — invisible en production, alors qu'un rechargement à
                chaud la faisait apparaître pendant le développement. `surgit` ne dépend d'aucun
                observateur : c'est une animation CSS qui se joue au montage. */}
            {prochaineVagueCourte && (
              <aside className="carte-vague surgit">
                <div className="t">
                  <span className="tag">Cours collectifs</span>
                  <span className="etat">
                    <i aria-hidden="true" />
                    Nouvelle vague
                  </span>
                </div>
                <div className="d">
                  <span className="l">Rentrée le</span>
                  <span className="j">{prochaineVagueCourte}</span>
                  <span className="trait" aria-hidden="true" />
                </div>
                <button type="button" className="go" onClick={() => ouvrirFormule('collectif', 2)}>
                  Passer le test de niveau
                  <IcoHX nom="fleche-droite" />
                </button>
              </aside>
            )}
          </div>

          <div className="atouts-cours rv" style={{ transitionDelay: '.42s' }}>
            {ATOUTS_COURS.map((atout) => (
              <span key={atout.libelle} className="a">
                <IcoHX nom={atout.icone} />
                {atout.libelle}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="light offers">
        <div className="wrap overlap">
          <div className="grid">
            {PROGRAMMES.map((programme, index) => (
              <button
                key={programme.type}
                type="button"
                className="offer rv"
                style={{ transitionDelay: `${index * 0.12}s` }}
                onClick={() => ouvrirFormule(programme.type)}
              >
                <div className="img">
                  <img src={PHOTOS[programme.type].src} alt={PHOTOS[programme.type].alt} loading="lazy" />
                  <span className="badge">{programme.badge}</span>
                  {/* Date de la prochaine vague, lue dans les vagues que l'administration gère
                      déjà. Rien ne s'affiche tant qu'aucune vague n'est programmée, plutôt
                      qu'une date fausse. */}
                  {programme.type === 'collectif' && prochaineVague && (
                    <span className="ribbon">Prochaine vague : {prochaineVague}</span>
                  )}
                </div>
                <div className="body">
                  <h3 className="h-m">{programme.titre}</h3>
                  <p>{programme.texte}</p>
                  <span className="more">
                    En savoir plus
                    <span className="ar">
                      <IcoHX nom="fleche-diagonale" />
                    </span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {ouvert && (
        <FenetreFormule
          type={ouvert}
          etapeInitiale={etapeInitiale}
          tarifs={tarifs.filter((tarif) => tarif.type_programme === ouvert)}
          etablissementSlug={etablissementSlug}
          etablissementNom={etablissementNom}
          accent={accent}
          onFermer={() => setOuvert(null)}
        />
      )}
    </>
  )
}

function FenetreFormule({
  type,
  etapeInitiale,
  tarifs,
  etablissementSlug,
  etablissementNom,
  accent,
  onFermer,
}: {
  type: TypeProgrammeProspect
  etapeInitiale: number
  tarifs: Tarif[]
  etablissementSlug: string
  etablissementNom: string
  accent: AccentPalette
  onFermer: () => void
}) {
  const [etape, setEtape] = useState(etapeInitiale)
  /* Étape atteinte DANS le module de test de positionnement (créneau / coordonnées / quiz), pour
     dégager la place autour de lui quand le questionnaire démarre. */
  const [etapeTest, setEtapeTest] = useState<string>('creneau')
  const programme = PROGRAMMES.find((p) => p.type === type)!
  const detail = DETAILS[type]

  useEffect(() => {
    document.documentElement.style.overflow = 'hidden'
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') onFermer()
    }
    document.addEventListener('keydown', surTouche)
    return () => {
      document.documentElement.style.overflow = ''
      document.removeEventListener('keydown', surTouche)
    }
  }, [onFermer])

  const ONGLETS = ['Découvrir', 'Tarifs', 'Réserver']

  return (
    <div className="hx-modal open" role="dialog" aria-modal="true" aria-label={programme.titre} onClick={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="box">
        <div className="top">
          <span className="tag">{programme.badge}</span>
          <h3>{programme.titre}</h3>
          <div className="tagline">{detail.accroche}</div>
          <button type="button" className="x" aria-label="Fermer" onClick={onFermer}>
            ×
          </button>
          <div className="steps">
            {ONGLETS.map((onglet, index) => (
              <button
                key={onglet}
                type="button"
                className={index === etape ? 'on' : index < etape ? 'done' : undefined}
                aria-current={index === etape ? 'step' : undefined}
                onClick={() => setEtape(index)}
              >
                <b>{index + 1}</b>
                <span>{onglet}</span>
              </button>
            ))}
          </div>
        </div>

        {/* `quiz-actif` (demande client du 2026-10-13) : pendant le questionnaire, la fenêtre
            cesse de défiler d'un seul bloc. Sur un écran court, la question se retrouvait coupée
            en haut ET le bouton de validation coupé en bas, en même temps. Le CSS associé fait
            tenir en-tête et boutons à l'écran, et ne laisse défiler que les propositions. */}
        <div className={etapeTest === 'quiz' && etape === 2 ? 'content quiz-actif' : 'content'}>
          <div className={etape === 0 ? 'pane on' : 'pane'}>
            <p>{detail.description}</p>
            {detail.complement && <p>{detail.complement}</p>}
            <h4>Comment ça se déroule</h4>
            <ol>
              {detail.etapes.map((texte) => (
                <li key={texte}>{texte}</li>
              ))}
            </ol>
          </div>

          <div className={etape === 1 ? 'pane on' : 'pane'}>
            <GrilleTarifs tarifs={tarifs} parNiveaux={type === 'collectif'} />
          </div>

          <div className={etape === 2 ? 'pane on' : 'pane'}>
            {type === 'collectif' ? (
              <>
                {/* Titre, phrase d'introduction et encadré d'avertissement s'effacent une fois le
                    questionnaire commencé (demande client du 2026-10-13) : ils ont déjà été lus,
                    et la hauteur qu'ils occupaient permet d'afficher une question entière sans
                    défilement dans cette fenêtre. */}
                {/* L'encadré « À savoir » qui vivait ici est passé dans le module lui-même, sur
                    son premier écran (2026-10-29) : l'ordre des étapes ayant été inversé, il
                    aurait répété mot pour mot celui que le module affiche juste en dessous. */}
                {etapeTest !== 'quiz' && (
                  <>
                    <p className="rtitle">Test de positionnement</p>
                    <p>
                      Répondez au questionnaire écrit de positionnement, puis choisissez votre session de test oral pour
                      valider votre place.
                    </p>
                  </>
                )}
                <div className="agenda">
                  <TestPositionnement
                    etablissementSlug={etablissementSlug}
                    etablissementNom={etablissementNom}
                    accent={accent}
                    onConfirme={() => {}}
                    onEtapeChange={setEtapeTest}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="rtitle">Appel diagnostic</p>
                <p>Gratuit et sans engagement, avec {etablissementNom}.</p>
                <div className="agenda">
                  <ReserverAppel
                    etablissementSlug={etablissementSlug}
                    etablissementNom={etablissementNom}
                    accent={accent}
                    typeInitial={type}
                    onConfirme={() => {}}
                    sansCadre
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="foot">
          <button type="button" className="b ghost back" hidden={etape === 0} onClick={() => setEtape((e) => e - 1)}>
            ← Retour
          </button>
          <button type="button" className="b gold next" hidden={etape === 2} onClick={() => setEtape((e) => e + 1)}>
            <span className="lbl">{etape === 0 ? 'Voir les tarifs' : libelleReservation(type)}</span>
            <i>↗</i>
          </button>
        </div>
      </div>
    </div>
  )
}

/* La maquette distingue deux présentations : une grille de pastilles pour les forfaits horaires
   (individuel, duo) et une liste d'une colonne pour les niveaux du collectif, où chaque ligne
   porte en plus son rythme. Les deux lisent les mêmes colonnes de la table `tarifs`. */
function GrilleTarifs({ tarifs, parNiveaux }: { tarifs: Tarif[]; parNiveaux: boolean }) {
  if (tarifs.length === 0) {
    return <p>Tarifs communiqués lors de l’appel diagnostic.</p>
  }

  return (
    <div className={parNiveaux ? 'prices levels' : 'prices'}>
      {tarifs.map((tarif) => (
        <div key={tarif.id} className="price">
          <div className="h">{tarif.titre}</div>
          <div className="v">
            {tarif.prix.toLocaleString('fr-FR')} {tarif.unite}
          </div>
          {tarif.description && <div className="d">{tarif.description}</div>}
        </div>
      ))}
    </div>
  )
}
