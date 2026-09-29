import { useState, type ReactNode } from 'react'
import type { Database, TypeProgrammeProspect } from '../../types/database.types'
import type { AccentPalette } from '../../lib/accent'

/* Les vues atteintes depuis la barre de navigation. Chacune remplace l'écran d'accueil au lieu de
   s'empiler dessous : la page publique tient désormais dans une seule vue, sans défilement
   (demande client du 2026-09-15). Seul le contenu d'une vue peut défiler à l'intérieur de son
   propre cadre quand il est dense — les tarifs, typiquement — pour qu'aucune information ne soit
   perdue au passage.

   Refonte visuelle du 2026-09-29, d'après les visuels de référence fournis par le client (qui
   remplace l'ambiance marine et or du 2026-09-22) :
   — Cours, Tarifs et À propos (thème « violet ») : fond violet profond, cartes violettes, titres
     et boutons jaune doré, trait doré sous le titre ;
   — Professeurs (thème « nuit ») : fond bleu nuit sarcelle, photos cerclées d'or, titre blanc et
     sous-titre doré en italique.
   Aucune donnée ni aucun mécanisme ne change (forfaits, programmes, extension de la liste des
   tarifs, réservation) : seuls les classes et les styles de présentation sont neufs. */

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
      surtitre="À propos"
      titre="Ce qu’en disent nos élèves"
      sousTitre="Exemples d’avis — à remplacer par de vrais témoignages avant mise en ligne."
      theme="violet"
    >
      <div className="grille-vue">
        {TEMOIGNAGES.map((temoignage) => (
          <article key={temoignage.nom} className="carte-hoc carte-avis">
            <span aria-hidden className="etoiles-avis">
              ★★★★★
            </span>
            <p className="citation-avis">« {temoignage.texte} »</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto' }}>
              <span className="avatar-avis">{temoignage.initiales}</span>
              <span className="nom-avis">{temoignage.nom}</span>
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
  onReserver,
}: {
  accent: AccentPalette
  onReserver: (type: TypeProgrammeProspect) => void
}) {
  return (
    <CadreVue
      surtitre="Cours"
      titre="Trois façons d’apprendre, un seul cap : votre objectif."
      sousTitre="Choisissez la formule qui correspond à votre rythme et à votre budget."
      theme="violet"
    >
      <div className="grille-vue grille-cours">
        {PROGRAMMES.map((programme) => (
          <article key={programme.titre} className="carte-hoc carte-cours">
            {/* Photo en tête de carte, comme sur le visuel de référence (demande client du
                2026-09-29) : une personne seule, un duo en ligne, un groupe. */}
            <div className={`carte-cours-visuel carte-cours-visuel--${programme.type}`}>
              <img src={PHOTOS_FORMULE[programme.type].src} alt={PHOTOS_FORMULE[programme.type].alt} loading="lazy" />
              <span className="etiquette-programme">{programme.tag}</span>
            </div>
            <div className="carte-cours-corps">
              <h3 className="titre-carte-hoc">{programme.titre}</h3>
              <p className="texte-carte-hoc">{programme.texte}</p>
              {programme.detail && <p className="detail-carte-hoc">{programme.detail}</p>}
              <button type="button" onClick={() => onReserver(programme.type)} className="btn-shine bouton-or">
                {programme.type === 'collectif' ? 'Réserver mon test →' : 'Réserver mon appel →'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </CadreVue>
  )
}

/* Photos Unsplash (licence Unsplash : usage commercial libre, sans attribution obligatoire),
   réduites à 960 px et converties en WebP dans public/programmes :
   — individuel : Julio Lopez, unsplash.com/photos/Imz-pn2LMbg
   — duo : Chidera Faustina Okeke, unsplash.com/photos/2FDdgn0-W_o
   — collectif : Vitaly Gariev, unsplash.com/photos/-X4Qx4_4iMU */
const PHOTOS_FORMULE: Record<TypeProgrammeProspect, { src: string; alt: string }> = {
  individuel: { src: '/programmes/individuel.webp', alt: 'Une élève étudie seule avec son casque, devant son ordinateur' },
  duo: { src: '/programmes/duo.webp', alt: 'Deux amies suivent ensemble un cours en ligne sur un ordinateur portable' },
  collectif: { src: '/programmes/collectif.webp', alt: 'Un groupe d’élèves souriants suit un cours en ligne autour d’un ordinateur' },
}

const LIMITE_TARIFS_VISIBLES = 4

export function VueTarifs({
  tarifs,
  onReserver,
}: {
  tarifs: Tarif[]
  accent: AccentPalette
  onReserver: (type: TypeProgrammeProspect) => void
}) {
  return (
    <CadreVue
      surtitre="Tarifs"
      titre="Tarifs"
      sousTitre="Des formules claires, sans frais cachés. Le premier appel est toujours gratuit."
      theme="violet"
    >
      {tarifs.length === 0 ? (
        <p className="texte-carte-hoc" style={{ textAlign: 'center' }}>
          Les tarifs seront publiés très prochainement.
        </p>
      ) : (
        <div className="grille-vue">
          {(['individuel', 'duo', 'collectif'] as const).map((type) => {
            const lignes = tarifs.filter((t) => t.type_programme === type)
            if (lignes.length === 0) return null
            return <BlocTarif key={type} type={type} lignes={lignes} onReserver={onReserver} />
          })}
        </div>
      )}
    </CadreVue>
  )
}

function BlocTarif({
  type,
  lignes,
  onReserver,
}: {
  type: TypeProgrammeProspect
  lignes: Tarif[]
  onReserver: (type: TypeProgrammeProspect) => void
}) {
  const [etendu, setEtendu] = useState(false)
  const visibles = etendu ? lignes : lignes.slice(0, LIMITE_TARIFS_VISIBLES)
  const masquees = lignes.length - visibles.length

  return (
    <article className="carte-hoc carte-tarif">
      <span className="etiquette-programme">{PROGRAMME_LABEL[type]}</span>
      <h3 className="titre-carte-hoc">
        {type === 'individuel' ? 'Cours particuliers' : type === 'duo' ? 'Cours en duo' : 'Cours en petit groupe'}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {visibles.map((ligne) => (
          <div key={ligne.id} className="ligne-tarif">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span className="ligne-tarif-titre">{ligne.titre}</span>
              <span className="ligne-tarif-prix">
                {ligne.prix.toLocaleString('fr-FR')} {ligne.unite}
              </span>
            </div>
            {ligne.description && <span className="ligne-tarif-description">{ligne.description}</span>}
          </div>
        ))}
      </div>

      {lignes.length > LIMITE_TARIFS_VISIBLES && (
        <button type="button" onClick={() => setEtendu((v) => !v)} className="lien-deplier">
          {etendu ? 'Réduire ↑' : `Voir tous les tarifs (+${masquees}) ↓`}
        </button>
      )}

      <button type="button" onClick={() => onReserver(type)} className="btn-shine bouton-or">
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
  onReserver,
}: {
  nomEtablissement: string
  dossierAssets: string
  accent: AccentPalette
  onReserver: () => void
}) {
  return (
    <CadreVue
      surtitre="Professeurs"
      titre="Notre équipe"
      sousTitre="Des professeurs choisis pour leur pédagogie autant que pour leur passion des langues."
      theme="nuit"
    >
      <div className="grille-professeurs">
        <article className="carte-professeur">
          <div className="panneau-photo">
            <img
              src={`${dossierAssets}/Directrice.jpg`}
              alt={`Directrice de ${nomEtablissement}`}
              onError={(e) => {
                ;(e.currentTarget.parentElement as HTMLDivElement).style.display = 'none'
              }}
            />
          </div>
          <span className="nom-professeur">Notre directrice</span>
          <h3 className="role-professeur">Une pédagogie pensée pour des résultats réels</h3>
          <p className="texte-professeur">
            Persuadée qu’aucune application ne remplace le regard d’un professeur qui croit en vous, notre directrice
            a fondé {nomEtablissement} pour redonner sa juste place à la relation humaine dans l’apprentissage des
            langues. Son exigence : un accompagnement sur-mesure, taillé pour votre objectif, votre rythme et votre
            vie. Chaque élève qui progresse ici en est la preuve vivante.
          </p>
        </article>

        <article className="carte-professeur">
          <div className="panneau-photo">
            <img
              src={`${dossierAssets}/equipe.jpg`}
              alt={`L’équipe de ${nomEtablissement}`}
              onError={(e) => {
                ;(e.currentTarget.parentElement as HTMLDivElement).style.display = 'none'
              }}
            />
          </div>
          <span className="nom-professeur">Notre équipe</span>
          <h3 className="role-professeur">Des professeurs choisis pour votre objectif</h3>
          <p className="texte-professeur">
            Une équipe soudée, choisie pour sa pédagogie autant que pour sa passion des langues — la même exigence
            bienveillante à chaque cours, quel que soit le professeur qui vous accompagne.
          </p>
          <button type="button" onClick={onReserver} className="btn-shine bouton-or bouton-or--pilule">
            Rencontrer un professeur →
          </button>
        </article>
      </div>
    </CadreVue>
  )
}

function CadreVue({
  surtitre,
  titre,
  sousTitre,
  theme,
  children,
}: {
  /* Petit libellé doré au-dessus du titre : l'intitulé de l'onglet de navigation, rien de plus. */
  surtitre: string
  titre: string
  sousTitre: string
  theme: 'violet' | 'nuit'
  children: ReactNode
}) {
  return (
    <section className={`vue-secondaire vue-theme-${theme}`}>
      <header className="entete-vue">
        {theme === 'violet' && <span className="surtitre-vue">{surtitre}</span>}
        <h2 className="titre-vue">{titre}</h2>
        {theme === 'violet' && <span className="trait-vue" aria-hidden="true" />}
        <p className="soustitre-vue">{sousTitre}</p>
      </header>
      <div className="vue-secondaire-corps">{children}</div>
    </section>
  )
}
