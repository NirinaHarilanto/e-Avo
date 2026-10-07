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
    /* Le paragraphe de détail (anglais général/affaires, personnalisation) a été retiré ici
       (demande client du 2026-09-29) : à texte égal avec les deux autres cartes, les photos —
       calées en bas comme leur texte (voir .grille-cours dans index.css) — s'alignent
       naturellement, sans perdre l'espace qu'un texte plus long leur aurait pris. */
    texte:
      'Sur mesure : vous choisissez votre rythme et le sujet de chaque séance, avec un professeur rien que pour vous, calé sur votre objectif réel.',
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

/* Description marketing + déroulé réel, formule par formule — demande client du 2026-10-06 :
   « une description marketing du cours et une explication du process [...] par rapport aux
   différents process définis dans HOC ». Chaque étape reprend un mécanisme qui existe vraiment
   dans l'application (appel diagnostic, forfait/rythme, professeur attitré, compte rendu et
   enquête de satisfaction après chaque séance pour l'individuel/duo ; quiz écrit puis test oral,
   conversion automatique et rattachement à une classe de niveau pour le collectif) — jamais une
   promesse que l'outil ne tient pas. */
const DETAIL_PROGRAMMES: Record<TypeProgrammeProspect, { accroche: string; description: string; etapes: string[] }> = {
  individuel: {
    accroche: 'Un accompagnement sur-mesure, de la première minute à votre objectif',
    description:
      'Le cours individuel va droit au but : vous seul·e face à votre professeur, sur le rythme et les sujets qui comptent vraiment pour vous — préparation d’un entretien, anglais des affaires, remise à niveau avant un départ à l’étranger, ou simplement le plaisir de progresser sans contrainte de groupe. Chaque séance s’ajuste à ce qui s’est passé à la précédente : votre professeur suit votre progression de près et adapte le contenu en conséquence.',
    etapes: [
      'Réservez un appel diagnostic gratuit et sans engagement : nous évaluons votre niveau réel et clarifions votre objectif.',
      'Choisissez votre forfait d’heures et votre rythme hebdomadaire — vous gardez la main sur votre planning.',
      'Un professeur vous est attribué et devient votre interlocuteur unique pour toute la durée du forfait.',
      'Chaque séance se déroule en visioconférence, avec un compte rendu rédigé par votre professeur juste après.',
      'Votre progression est suivie séance après séance, avec une enquête de satisfaction à chaque fin de cours.',
    ],
  },
  duo: {
    accroche: 'Progressez à deux, sur un seul et même créneau',
    description:
      'Le cours en duo reprend exactement le fonctionnement du cours individuel — même professeur attitré, même suivi personnalisé — mais partagé entre deux personnes qui avancent ensemble : conjoints, amis, collègues ou membres d’une même famille. L’émulation du binôme garde la motivation intacte, sans jamais sacrifier l’attention portée à chacun : votre professeur veille à ce que les deux objectifs, même différents, soient servis à chaque séance.',
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
    etapes: [
      'Réservez une session de test oral rattachée à la prochaine vague qui vous intéresse.',
      'Répondez d’abord à un court questionnaire écrit de positionnement, qui situe un premier niveau indicatif.',
      'Passez le test oral en visioconférence : c’est lui qui confirme votre niveau définitif avec l’équipe pédagogique.',
      'Votre niveau validé, vous êtes automatiquement rattaché·e à la classe correspondante au sein de la vague.',
      'Les cours démarrent sur le planning de la vague, avec le même suivi — comptes rendus et enquêtes de satisfaction — que les autres formules.',
    ],
  },
}

export function VueProgrammes({
  onReserver,
}: {
  accent: AccentPalette
  onReserver: (type: TypeProgrammeProspect) => void
}) {
  const [detailOuvert, setDetailOuvert] = useState<TypeProgrammeProspect | null>(null)

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
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
                <button type="button" onClick={() => onReserver(programme.type)} className="btn-shine bouton-or" style={{ marginTop: 0 }}>
                  {programme.type === 'collectif' ? 'Réserver mon test →' : 'Réserver mon appel →'}
                </button>
                <button type="button" onClick={() => setDetailOuvert(programme.type)} className="bouton-savoir-plus">
                  En savoir plus
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {detailOuvert && (
        <ModaleDetailProgramme
          type={detailOuvert}
          onFermer={() => setDetailOuvert(null)}
          onReserver={() => {
            setDetailOuvert(null)
            onReserver(detailOuvert)
          }}
        />
      )}
    </CadreVue>
  )
}

function ModaleDetailProgramme({
  type,
  onFermer,
  onReserver,
}: {
  type: TypeProgrammeProspect
  onFermer: () => void
  onReserver: () => void
}) {
  const detail = DETAIL_PROGRAMMES[type]
  const programme = PROGRAMMES.find((p) => p.type === type)

  return (
    <div className="voile-modale" onClick={onFermer}>
      <div role="dialog" aria-modal="true" aria-label={programme?.titre} className="card fenetre-reservation" onClick={(e) => e.stopPropagation()}>
        <header className="entete-reservation">
          <div style={{ minWidth: 0 }}>
            <span className="etiquette-programme" style={{ marginBottom: 8, display: 'inline-block' }}>
              {programme?.tag}
            </span>
            <h2 style={{ fontSize: 20, margin: '0 0 4px', color: 'var(--ink)' }}>{programme?.titre}</h2>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, fontStyle: 'italic' }}>{detail.accroche}</p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="fermer-modale">
            ×
          </button>
        </header>

        <div className="corps-reservation" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--ink-2)', margin: 0 }}>{detail.description}</p>

          <div>
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', margin: '0 0 10px' }}>
              Comment ça se déroule
            </h3>
            <ol style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: 0, padding: 0, listStyle: 'none' }}>
              {detail.etapes.map((etape, index) => (
                <li key={index} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span
                    style={{
                      flexShrink: 0,
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 800,
                      color: '#2a1646',
                      background: 'var(--hoc-or)',
                    }}
                  >
                    {index + 1}
                  </span>
                  <span style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)' }}>{etape}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <button type="button" onClick={onReserver} className="btn-shine bouton-or" style={{ alignSelf: 'flex-start', marginTop: 0 }}>
          {type === 'collectif' ? 'Réserver mon test →' : 'Réserver mon appel →'}
        </button>
      </div>
    </div>
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

/* Toute l'équipe sur une seule grille de portraits. Les deux cartes éditoriales « Notre
   directrice »/« Notre équipe » qui occupaient cette vue ont été retirées le 2026-10-07 : elles se
   chevauchaient avec la grille (elles réclamaient toute la hauteur disponible et l'écrasaient), et
   le client a demandé de n'en garder que les portraits. */
export function VueProfesseurs({
  dossierAssets,
  onReserver,
}: {
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
      <div className="grille-equipe-pedagogique">
        {EQUIPE_PEDAGOGIQUE.map((membre) => (
          <article key={membre.id} className="carte-membre-equipe">
            <div className="photo-membre-equipe">
              <img
                src={`${dossierAssets}/equipe/equipe-${membre.id}.webp`}
                alt={membre.nom ? `${membre.nom}, ${membre.role}` : membre.role}
                loading="lazy"
              />
            </div>
            {/* Les 3 professeures d'anglais pas encore nommées (demande client du 2026-10-07 :
                « pour le reste, ne mets pas de nom pour l'instant ») n'affichent pas de ligne de
                nom plutôt qu'une ligne vide ou un espace réservé — le rôle suffit à les présenter
                en attendant. */}
            {membre.nom && <span className="nom-professeur">{membre.nom}</span>}
            <h3 className="role-professeur">{membre.role}</h3>
            <p className="slogan-membre-equipe">{membre.slogan}</p>
          </article>
        ))}
      </div>

      <div className="pied-equipe-pedagogique">
        <button type="button" onClick={onReserver} className="btn-shine bouton-or bouton-or--pilule">
          Rencontrer un professeur →
        </button>
      </div>
    </CadreVue>
  )
}

/* Équipe pédagogique, un portrait par personne — demande client du 2026-10-06, sur le modèle
   d'une grille d'équipe classique (photo ronde, nom puis poste, chacun sur sa propre ligne) dont
   le client a fourni l'image de référence. Les 7 photos (dossier « Musique » du client, toutes
   issues de la même séance du studio Mim'SARY) sont préparées dans public/etablissements/
   hari-online-course/equipe/ (voir le script de préparation, scratchpad de la session).

   Noms et rôles communiqués par le client le 2026-10-07 pour 4 des 7 personnes ; les 3 dernières
   restent volontairement sans nom pour l'instant (demande explicite : « pour le reste, ne mets
   pas de nom pour l'instant, on le fera plus tard »), avec pour seul rôle « Professeure
   d'anglais ». `id` reste le numéro d'origine de la photo (IMG-Hari-<id>.jpg), pour s'y retrouver
   le jour où ces 3 noms arrivent. Slogans inventés (demande client explicite), réécrits pour
   chaque rôle précisé plutôt que laissés tels quels écrits pour « Professeure d'anglais ». */
const EQUIPE_PEDAGOGIQUE: { id: number; nom?: string; role: string; slogan: string }[] = [
  {
    id: 16,
    nom: 'Harinjo',
    role: 'Fondatrice',
    slogan: 'Elle a fondé Hari Online Club avec une conviction simple : aucune application ne remplace le regard d’un professeur qui croit en vous.',
  },
  {
    id: 15,
    nom: 'Manda',
    role: 'Ingénieur pédagogue',
    slogan: 'Elle conçoit les parcours et les outils qui structurent chaque cours, pour que la pédagogie HOC reste cohérente du premier au dernier élève.',
  },
  {
    id: 11,
    nom: 'Anael',
    role: 'Assistante admin',
    slogan: 'Souvent le premier contact de chaque élève, elle veille à ce que chaque dossier avance sans accroc, du premier message à la première séance.',
  },
  {
    id: 12,
    nom: 'Rado',
    role: 'Formateur',
    slogan: 'Engagé et exigeant, il mise sur des mises en situation concrètes pour faire décoller l’aisance à l’oral de chaque élève.',
  },
  {
    id: 9,
    role: 'Professeure d’anglais',
    slogan: 'Patiente et exigeante à la fois, elle pousse chaque élève un peu plus loin sans jamais le brusquer.',
  },
  {
    id: 14,
    role: 'Professeure d’anglais',
    slogan: 'Minutieuse et à l’écoute, elle construit avec chaque élève un parcours taillé pour son objectif réel.',
  },
  {
    id: 17,
    role: 'Professeure d’anglais',
    slogan: 'Créative et moderne, elle construit des cours vivants qui collent aux usages réels de l’anglais d’aujourd’hui.',
  },
]

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
