import { useEffect, useState } from 'react'
import type { AccentPalette } from '../../lib/accent'
import type { Database, TypeProgrammeProspect } from '../../types/database.types'
import { ReserverAppel } from '../prospects/ReserverAppel'
import { TestPositionnement } from '../prospects/TestPositionnement'
import { IcoHX } from './IconesHX'

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
   retouches que la fondatrice y a apportées depuis. */

const PROGRAMMES: { type: TypeProgrammeProspect; badge: string; titre: string; texte: string; miseEnAvant?: boolean }[] = [
  {
    type: 'individuel',
    badge: 'INDIVIDUEL',
    titre: 'Cours particuliers',
    texte:
      'Sur mesure : vous choisissez votre rythme et le sujet de chaque séance, avec un professeur rien que pour vous, calé sur votre objectif réel.',
  },
  {
    type: 'collectif',
    badge: 'COLLECTIF',
    titre: 'Cours en petit groupe',
    texte:
      'Par vague, sur un planning établi par l’établissement, avec des groupes de niveaux différents pour progresser ensemble au bon rythme.',
    miseEnAvant: true,
  },
  {
    type: 'duo',
    badge: 'DUO',
    titre: 'Cours en duo',
    texte:
      'En couple ou entre amis, apprenez à deux sur un même créneau : un accompagnement pensé pour vos deux objectifs, à la fois complice et exigeant.',
  },
]

const PHOTOS: Record<TypeProgrammeProspect, { src: string; alt: string }> = {
  individuel: {
    src: '/programmes/individuel.webp',
    alt: 'Illustration aquarelle d’un élève en appel vidéo avec son professeur sur son ordinateur portable',
  },
  duo: {
    src: '/programmes/duo.webp',
    alt: 'Illustration aquarelle de deux élèves côte à côte en appel vidéo avec leur professeur',
  },
  collectif: {
    src: '/programmes/collectif.webp',
    alt: 'Illustration aquarelle d’un petit groupe d’élèves qui échange autour d’un appel vidéo collectif',
  },
}

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
    etapes: [
      'Réservez une session de test oral rattachée à la prochaine vague qui vous intéresse.',
      'Répondez d’abord à un court questionnaire écrit de positionnement, qui situe un premier niveau indicatif.',
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
  etablissementSlug,
  etablissementNom,
  accent,
  typeOuvertInitial,
}: {
  tarifs: Tarif[]
  prochaineVague: string | null
  etablissementSlug: string
  etablissementNom: string
  accent: AccentPalette
  typeOuvertInitial?: TypeProgrammeProspect | null
}) {
  const [ouvert, setOuvert] = useState<TypeProgrammeProspect | null>(typeOuvertInitial ?? null)

  return (
    <>
      <section className="dark phero">
        <div className="glow g1" />
        <div className="glow g2" />
        <div className="spot" />
        <div className="grain" />
        <div className="wrap reveal">
          <div className="eyebrow">Cours &amp; tarifs</div>
          <h1 className="h-xl">
            <span className="line">
              <span>Trois façons d’apprendre, un seul cap :</span>
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
      </section>

      <section className="light offers">
        <div className="wrap overlap">
          <div className="grid">
            {PROGRAMMES.map((programme, index) => (
              <button
                key={programme.type}
                type="button"
                className={`offer rv${programme.miseEnAvant ? ' feat' : ''}`}
                style={{ transitionDelay: `${index * 0.12}s` }}
                onClick={() => setOuvert(programme.type)}
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
  tarifs,
  etablissementSlug,
  etablissementNom,
  accent,
  onFermer,
}: {
  type: TypeProgrammeProspect
  tarifs: Tarif[]
  etablissementSlug: string
  etablissementNom: string
  accent: AccentPalette
  onFermer: () => void
}) {
  const [etape, setEtape] = useState(0)
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

        <div className="content">
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
                <p className="rtitle">Test de positionnement</p>
                <p>Choisissez votre session de test oral, puis répondez au questionnaire pour valider votre place.</p>
                <div className="note">
                  <b>À savoir :</b> votre demande n’est validée qu’une fois le questionnaire terminé. Après avoir choisi
                  ce créneau, vous répondez à un court quiz écrit — sans lui, la place n’est pas réservée.
                </div>
                <div className="agenda">
                  <TestPositionnement
                    etablissementSlug={etablissementSlug}
                    etablissementNom={etablissementNom}
                    accent={accent}
                    onConfirme={() => {}}
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
