import { useState, type ReactNode } from 'react'
import type { Database, TypeProgrammeProspect } from '../../types/database.types'
import type { AccentPalette } from '../../lib/accent'

/* Les vues atteintes depuis la barre de navigation. Chacune remplace l'écran d'accueil au lieu de
   s'empiler dessous : la page publique tient désormais dans une seule vue, sans défilement
   (demande client du 2026-09-15). Seul le contenu d'une vue peut défiler à l'intérieur de son
   propre cadre quand il est dense — les tarifs, typiquement — pour qu'aucune information ne soit
   perdue au passage.

   Ambiance sombre brillant doré (demande client du 2026-09-22, qui annule le thème glassmorphism
   néon violet posé le 2026-09-15) : les quatre vues (Programme, Tarifs, Professeurs, Avis)
   reprennent l'habillage déjà en place partout ailleurs dans l'application — fond marine
   (`.vue-sombre`, avec l'image du Hero en filigrane, posé par CadreVue), cartes opaques (`.card`)
   au liseré doré tournant au survol (`.carte-vue`, même mécanique que `.card-lift`) et pastilles
   de catégorie à la couleur d'accent de l'établissement (`.etiquette-programme`). Aucun décor
   flottant animé : seules les données et boutons de chaque vue restent, inchangés. */

type Tarif = Database['public']['Tables']['tarifs']['Row']

/* Repris de l'ancien pied de page de la landing, désormais atteignable depuis son propre onglet
   plutôt que noyé en bas de l'écran d'accueil. */
export const TEMOIGNAGES = [
  { initiales: 'AL', nom: 'A. L.', texte: 'Un vrai suivi, un professeur qui connaît mes objectifs semaine après semaine.' },
  { initiales: 'MK', nom: 'M. K.', texte: 'Les cours en petit groupe m’ont redonné confiance pour parler sans hésiter.' },
  { initiales: 'SB', nom: 'S. B.', texte: 'L’appel diagnostic a tout de suite posé un cap clair pour mes cours.' },
]

export function VueAvis() {
  return (
    <CadreVue
      titre="Ce qu’en disent nos élèves"
      sousTitre="Exemples d’avis — à remplacer par de vrais témoignages avant mise en ligne."
    >
      <div className="grille-vue">
        {TEMOIGNAGES.map((temoignage) => (
          <article key={temoignage.nom} className="card carte-vue carte-avis">
            <span aria-hidden style={{ fontSize: 14, letterSpacing: 2, color: '#6d3bd1' }}>★★★★★</span>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)', fontStyle: 'italic', margin: 0 }}>
              « {temoignage.texte} »
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #8b5cf6, #6d3bd1)',
                  color: '#fff',
                }}
              >
                {temoignage.initiales}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>{temoignage.nom}</span>
            </div>
          </article>
        ))}
      </div>
    </CadreVue>
  )
}

const PROGRAMMES: { type: TypeProgrammeProspect; tag: string; titre: string; texte: string; detail?: string }[] = [
  {
    type: 'individuel',
    tag: 'Individuel',
    titre: 'Cours particuliers',
    texte:
      'Sur mesure : vous choisissez votre rythme et le sujet de chaque séance, avec un professeur rien que pour vous, calé sur votre objectif réel.',
    detail:
      'Anglais général, focus oral, compréhension ou grammaire — ou anglais des affaires (meetings, présentations, négociation). Contenu 100 % personnalisable sur demande.',
  },
  {
    type: 'collectif',
    tag: 'Collectif',
    titre: 'Cours en petit groupe',
    texte:
      'Par vague, sur un planning établi par l’établissement, avec des groupes de niveaux différents pour progresser ensemble au bon rythme.',
  },
  {
    type: 'duo',
    tag: 'Duo',
    titre: 'Cours en duo',
    texte:
      'En couple ou entre amis, apprenez à deux sur un même créneau : un accompagnement pensé pour vos deux objectifs, à la fois complice et exigeant.',
  },
]

const PROGRAMME_LABEL: Record<TypeProgrammeProspect, string> = {
  individuel: 'Individuel',
  duo: 'Duo',
  collectif: 'Collectif',
}

export function VueProgrammes({
  accent,
  onReserver,
}: {
  accent: AccentPalette
  onReserver: (type: TypeProgrammeProspect) => void
}) {
  return (
    <CadreVue
      titre="Trois façons d’apprendre, un seul cap : votre objectif."
      sousTitre="Choisissez la formule qui correspond à votre rythme et à votre budget."
    >
      <div className="grille-vue">
        {PROGRAMMES.map((programme) => (
          <article key={programme.titre} className="card carte-vue">
            <span className="etiquette-programme" style={{ color: accent.accent, borderColor: accent.accentBorder, background: accent.accentSoft }}>
              {programme.tag}
            </span>
            <h3 style={{ fontSize: 19, margin: 0, color: 'var(--ink)' }}>{programme.titre}</h3>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--muted)', margin: 0 }}>{programme.texte}</p>
            {programme.detail && (
              <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted-2)', margin: 0 }}>{programme.detail}</p>
            )}
            <button
              type="button"
              onClick={() => onReserver(programme.type)}
              className="btn-shine"
              style={{
                marginTop: 'auto',
                alignSelf: 'flex-start',
                fontSize: 12.5,
                padding: '10px 18px',
                background: accent.accentGrad,
                color: accent.accentInk,
                border: 'none',
                boxShadow: `0 8px 22px ${accent.accentGlow}`,
              }}
            >
              {programme.type === 'collectif' ? 'Réserver mon test →' : 'Réserver mon appel →'}
            </button>
          </article>
        ))}
      </div>
    </CadreVue>
  )
}

const LIMITE_TARIFS_VISIBLES = 4

export function VueTarifs({
  tarifs,
  accent,
  onReserver,
}: {
  tarifs: Tarif[]
  accent: AccentPalette
  onReserver: (type: TypeProgrammeProspect) => void
}) {
  return (
    <CadreVue
      titre="Tarifs"
      sousTitre="Des formules claires, sans frais cachés. Le premier appel est toujours gratuit."
      pastille
    >
      {tarifs.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>Les tarifs seront publiés très prochainement.</p>
      ) : (
        <div className="grille-vue">
          {(['individuel', 'duo', 'collectif'] as const).map((type) => {
            const lignes = tarifs.filter((t) => t.type_programme === type)
            if (lignes.length === 0) return null
            return <BlocTarif key={type} type={type} lignes={lignes} accent={accent} onReserver={onReserver} />
          })}
        </div>
      )}
    </CadreVue>
  )
}

function BlocTarif({
  type,
  lignes,
  accent,
  onReserver,
}: {
  type: TypeProgrammeProspect
  lignes: Tarif[]
  accent: AccentPalette
  onReserver: (type: TypeProgrammeProspect) => void
}) {
  const [etendu, setEtendu] = useState(false)
  const visibles = etendu ? lignes : lignes.slice(0, LIMITE_TARIFS_VISIBLES)
  const masquees = lignes.length - visibles.length

  return (
    <article className="card carte-vue">
      <span className="etiquette-programme" style={{ color: accent.accent, borderColor: accent.accentBorder, background: accent.accentSoft }}>
        {PROGRAMME_LABEL[type]}
      </span>
      <h3 style={{ fontSize: 18, margin: 0, color: 'var(--ink)' }}>
        {type === 'individuel' ? 'Cours particuliers' : type === 'duo' ? 'Cours en duo' : 'Cours en petit groupe'}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {visibles.map((ligne, index) => (
          <div
            key={ligne.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              padding: '8px 10px',
              borderRadius: 8,
              background: index % 2 === 0 ? accent.accentSoft : 'transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>{ligne.titre}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: accent.accent, whiteSpace: 'nowrap' }}>
                {ligne.prix.toLocaleString('fr-FR')} {ligne.unite}
              </span>
            </div>
            {ligne.description && <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{ligne.description}</span>}
          </div>
        ))}
      </div>

      {lignes.length > LIMITE_TARIFS_VISIBLES && (
        <button
          type="button"
          onClick={() => setEtendu((v) => !v)}
          style={{ alignSelf: 'flex-start', fontSize: 11.5, fontWeight: 700, color: accent.accent, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {etendu ? 'Réduire ↑' : `Voir tous les tarifs (+${masquees}) ↓`}
        </button>
      )}

      <button
        type="button"
        onClick={() => onReserver(type)}
        className="btn-shine"
        style={{
          marginTop: 'auto',
          alignSelf: 'flex-start',
          fontSize: 12.5,
          padding: '10px 18px',
          background: accent.accentGrad,
          color: accent.accentInk,
          border: 'none',
          boxShadow: `0 8px 22px ${accent.accentGlow}`,
        }}
      >
        Réserver →
      </button>
    </article>
  )
}

/* Directrice et équipe réunies : l'ancienne page leur donnait deux sections séparées, le client a
   demandé le 2026-09-15 qu'elles vivent toutes les deux derrière l'entrée « Professeurs ». */
export function VueProfesseurs({
  nomEtablissement,
  dossierAssets,
  accent,
  onReserver,
}: {
  nomEtablissement: string
  dossierAssets: string
  accent: AccentPalette
  onReserver: () => void
}) {
  return (
    <CadreVue
      titre="Notre équipe"
      sousTitre="Des professeurs choisis pour leur pédagogie autant que pour leur passion des langues."
    >
      <div className="grille-professeurs">
        <article className="card carte-vue" style={{ gap: 14 }}>
          <div className="panneau-photo">
            <img
              src={`${dossierAssets}/Directrice.jpg`}
              alt={`Directrice de ${nomEtablissement}`}
              onError={(e) => {
                ;(e.currentTarget.parentElement as HTMLDivElement).style.display = 'none'
              }}
            />
          </div>
          <span className="etiquette-programme" style={{ color: accent.accent, borderColor: accent.accentBorder, background: accent.accentSoft }}>
            Notre directrice
          </span>
          <h3 style={{ fontSize: 18, margin: 0, color: 'var(--ink)' }}>Une pédagogie pensée pour des résultats réels</h3>
          <p style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--muted)', margin: 0 }}>
            Persuadée qu’aucune application ne remplace le regard d’un professeur qui croit en vous, notre directrice
            a fondé {nomEtablissement} pour redonner sa juste place à la relation humaine dans l’apprentissage des
            langues. Son exigence : un accompagnement sur-mesure, taillé pour votre objectif, votre rythme et votre
            vie. Chaque élève qui progresse ici en est la preuve vivante.
          </p>
        </article>

        <article className="card carte-vue" style={{ gap: 14 }}>
          <div className="panneau-photo">
            <img
              src={`${dossierAssets}/equipe.jpg`}
              alt={`L’équipe de ${nomEtablissement}`}
              onError={(e) => {
                ;(e.currentTarget.parentElement as HTMLDivElement).style.display = 'none'
              }}
            />
          </div>
          <span className="etiquette-programme" style={{ color: accent.accent, borderColor: accent.accentBorder, background: accent.accentSoft }}>
            Notre équipe
          </span>
          <h3 style={{ fontSize: 18, margin: 0, color: 'var(--ink)' }}>Des professeurs choisis pour votre objectif</h3>
          <p style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--muted)', margin: 0 }}>
            Une équipe soudée, choisie pour sa pédagogie autant que pour sa passion des langues — la même exigence
            bienveillante à chaque cours, quel que soit le professeur qui vous accompagne.
          </p>
          <button
            type="button"
            onClick={onReserver}
            className="btn-shine"
            style={{
              marginTop: 'auto',
              alignSelf: 'flex-start',
              fontSize: 12.5,
              padding: '10px 18px',
              background: accent.accentGrad,
              color: accent.accentInk,
              border: 'none',
              boxShadow: `0 8px 22px ${accent.accentGlow}`,
            }}
          >
            Rencontrer un professeur →
          </button>
        </article>
      </div>
    </CadreVue>
  )
}

function CadreVue({
  titre,
  sousTitre,
  pastille = false,
  children,
}: {
  titre: string
  sousTitre: string
  /* Titre encapsulé dans une pastille claire — seule la vue Tarifs en a une dans la maquette
     fournie, les trois autres gardent un titre nu directement sur le fond sombre. */
  pastille?: boolean
  children: ReactNode
}) {
  return (
    <section className="vue-secondaire vue-sombre">
      <header className="entete-vue" style={{ textAlign: 'center', marginBottom: 20 }}>
        {pastille ? (
          <div className="titre-pastille">
            <h2 style={{ fontSize: 28, margin: 0, color: 'var(--ink)' }}>{titre}</h2>
            <p style={{ fontSize: 13.5, margin: 0, color: 'var(--muted)' }}>{sousTitre}</p>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 30, margin: '0 0 8px', color: 'var(--ink)', textShadow: '0 2px 20px rgba(233, 207, 148, 0.35)' }}>
              {titre}
            </h2>
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>{sousTitre}</p>
          </>
        )}
      </header>
      <div className="vue-secondaire-corps">{children}</div>
    </section>
  )
}
