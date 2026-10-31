import { SLUG_ETABLISSEMENT_PRINCIPAL } from '../../lib/etablissement'
import { IcoHX } from './IconesHX'

/* Deux briques de réassurance introduites par les maquettes du client du 2026-10-29 : une
   rangée de visages de l'équipe et un avis d'élève. Elles apparaissent à deux endroits très
   différents — le hero de la page Professeurs et le panneau gauche de la connexion — et sont
   donc écrites une seule fois ici, pour que les deux ne puissent pas diverger.

   Les visages sont ceux des professeurs réels de l'établissement, pris dans les mêmes fichiers
   que les cartes de la page Professeurs (voir PageEquipe.tsx). La citation est un témoignage
   réellement publié, repris mot pour mot de la base (migration 0128) : la maquette y laissait
   un texte entre crochets à remplir. Elle est écrite ici en dur et non lue dans `temoignages` —
   il s'agit d'une phrase courte choisie pour tenir dans un encart de quelques lignes, alors que
   les avis de la base font tous un paragraphe, et l'écran de connexion doit s'afficher sans
   dépendre d'une requête réseau. */

const DOSSIER_ASSETS = `/etablissements/${SLUG_ETABLISSEMENT_PRINCIPAL}`

/* Quatre professeurs, comme sur les deux maquettes. Mêmes identifiants que dans PageEquipe.
   Pamella retirée le 2026-10-30 (demande client), remplacée par Miangaly pour garder les quatre
   visages prévus par la maquette. */
const VISAGES: { id: number; nom: string }[] = [
  { id: 18, nom: 'Miangaly' },
  { id: 14, nom: 'Patricia' },
  { id: 20, nom: 'Rado' },
  { id: 21, nom: 'Ashley' },
]

export function AvatarsProfesseurs({ mention }: { mention: string }) {
  return (
    <div className="avatars-profs">
      <div className="visages">
        {VISAGES.map((visage) => (
          <img key={visage.id} src={`${DOSSIER_ASSETS}/equipe/equipe-${visage.id}.webp`} alt={visage.nom} loading="lazy" />
        ))}
      </div>
      <span className="mention">{mention}</span>
    </div>
  )
}

/* Citation courte d'un avis publié. `citation` reprend une phrase du témoignage, jamais une
   reformulation : c'est la parole de l'élève. Les étoiles ne figurent que sur la maquette de la
   connexion, d'où la prop plutôt qu'une présence systématique. */
export function CarteAvis({
  citation,
  auteur,
  detail,
  etoiles = false,
}: {
  citation: string
  auteur: string
  detail: string
  etoiles?: boolean
}) {
  return (
    <figure className="carte-avis">
      {/* Étoiles en SVG et non en glyphe « ★ » : un caractère d'étoile peut être rendu par une
          police emoji couleur, qui ignore `color` et sortirait du doré de la charte. */}
      {etoiles && (
        <span className="etoiles" role="img" aria-label="5 étoiles sur 5">
          {[0, 1, 2, 3, 4].map((rang) => (
            <IcoHX key={rang} nom="etoile" />
          ))}
        </span>
      )}
      <span className="guillemet" aria-hidden="true">
        ”
      </span>
      <blockquote>{citation}</blockquote>
      <figcaption>
        <i aria-hidden="true" />
        <span>
          <b>{auteur}</b>
          {detail}
        </span>
      </figcaption>
    </figure>
  )
}

/* Les deux chiffres clés des maquettes du 2026-10-29, présents à l'identique sur le hero
   « Professeurs » et sur le panneau de connexion. La pastille dorée ne marque que le premier,
   comme sur les maquettes. */
export function ChiffresCles() {
  return (
    <div className="chiffres-cles">
      <span className="c">
        <b>
          <i aria-hidden="true" />
          {/* L'échelle des maquettes du 2026-10-29 était le CECRL ; HOC n'en emploie plus qu'une
              depuis le 2026-10-31, celle de ses classes. Le visiteur lit donc les mêmes mots que
              l'élève retrouvera ensuite sur son dossier. */}
          Beginner → Advanced
        </b>
        tous les niveaux
      </span>
      <span className="c">
        <b>+ de 500</b>
        apprenants accompagnés
      </span>
    </div>
  )
}

/* L'avis retenu par le client sur la maquette de la page de connexion : Cynthia Raobelina,
   témoignage publié de 2025. */
export const AVIS_CONNEXION = {
  citation: 'Your lessons have truly helped me improve my language skills.',
  auteur: 'Cynthia Raobelina',
  detail: ', apprenante · 2025',
}

/* L'avis du hero « Professeurs » parle du professeur lui-même, ce qui est le sujet de la page.
   Témoignage publié de Fara, 2026. */
export const AVIS_PROFESSEURS = {
  citation: 'I really enjoyed learning English with Manda. She is very kind, always willing to help.',
  auteur: 'Fara',
  detail: ', apprenante · 2026',
}
