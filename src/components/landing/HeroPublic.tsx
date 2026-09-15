import { Icone, type NomIcone } from '../ui/Icones'

/* Vue d'accueil, tenant dans un seul écran : aucune barre de défilement, l'illustration couvre
   toute la moitié droite jusqu'aux bords, comme sur la maquette fournie par le client. Le texte
   de la maquette n'est pas repris en image mais reconstruit en HTML — sans quoi il serait
   impossible d'en changer un mot (« Réserve ton appel gratuitement » remplace « Commencer
   maintenant ») ni de le rendre lisible par un moteur de recherche. */

const COMPETENCES: { libelle: string; fond: string }[] = [
  { libelle: 'Speaking', fond: 'linear-gradient(135deg, #8b5cf6, #6d3bd1)' },
  { libelle: 'Listening', fond: 'linear-gradient(135deg, #7c6cf0, #4f46e5)' },
  { libelle: 'Reading', fond: 'linear-gradient(135deg, #4f7fe5, #2563c9)' },
  { libelle: 'Writing', fond: 'linear-gradient(135deg, #2ea88a, #16816a)' },
]

const ATOUTS: { icone: NomIcone; titre: string; detail: string }[] = [
  { icone: 'seances', titre: 'Cours interactifs', detail: 'et pratiques' },
  { icone: 'professeurs', titre: 'Professeurs natifs', detail: 'et expérimentés' },
  { icone: 'dossier', titre: 'Un suivi personnalisé', detail: 'pour progresser vite' },
  { icone: 'etudiants', titre: 'Une communauté', detail: 'motivée et bienveillante' },
]

const GARANTIES = ['100 % en ligne', 'Professeurs certifiés', 'Accès 24/7']

export const TEMOIGNAGES = [
  { initiales: 'AL', nom: 'A. L.', texte: 'Un vrai suivi, un professeur qui connaît mes objectifs semaine après semaine.' },
  { initiales: 'MK', nom: 'M. K.', texte: 'Les cours en petit groupe m’ont redonné confiance pour parler sans hésiter.' },
  { initiales: 'SB', nom: 'S. B.', texte: 'L’appel diagnostic a tout de suite posé un cap clair pour mes cours.' },
]

export function HeroPublic({
  nomEtablissement,
  onReserver,
}: {
  nomEtablissement: string
  onReserver: () => void
}) {
  return (
    <div className="vue-hero">
      {/* L'illustration est posée en fond de la moitié droite plutôt que dans une carte : c'est
          ce qui la fait « couvrir » l'écran comme sur la maquette. Le dégradé par-dessus fond son
          bord gauche dans le lavande de la page, sans détourage. */}
      <div className="hero-visuel" aria-hidden>
        <picture>
          <source srcSet="/hero-illustration.webp" type="image/webp" />
          <img src="/hero-illustration.jpg" alt="" fetchPriority="high" />
        </picture>
        <span className="hero-voile" />
      </div>

      <div className="hero-contenu">
        <span className="hero-badge arrive-text">Appels diagnostic ouverts cette semaine</span>

        <p className="mention-manuscrite arrive-text" style={{ fontSize: 26, margin: 0 }}>
          Your English,
          <br />
          Your Future
        </p>

        <h1 className="titre-hero arrive-text">
          Apprenez l’anglais
          <br />
          <span className="fragment-indigo">à votre </span>
          <span className="fragment-violet">rythme</span>
        </h1>

        <p className="arrive-text hero-accroche">
          Des cours interactifs, des professeurs passionnés et une expérience d’apprentissage unique.
          Rejoignez {nomEtablissement} dès aujourd’hui !
        </p>

        <button type="button" onClick={onReserver} className="btn-shine arrive" style={{ alignSelf: 'flex-start', fontSize: 15, padding: '15px 28px', background: 'var(--accent-blue-gradient)', color: '#fff', border: 'none' }}>
          Réserve ton appel gratuitement →
        </button>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {GARANTIES.map((garantie) => (
            <span key={garantie} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
              <span aria-hidden className="coche-garantie">✓</span>
              {garantie}
            </span>
          ))}
        </div>

        <ul className="liste-competences">
          {COMPETENCES.map((competence, index) => (
            <li
              key={competence.libelle}
              className="pastille-competence arrive"
              style={{ background: competence.fond, animationDelay: `${0.3 + index * 0.07}s` }}
            >
              {competence.libelle}
            </li>
          ))}
        </ul>
      </div>

      <div className="hero-bandeau">
        <div className="hero-atouts">
          {ATOUTS.map((atout) => (
            <div key={atout.titre} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span aria-hidden className="puce-atout">
                <Icone nom={atout.icone} taille={16} />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{atout.titre}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{atout.detail}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Avis conservés sur l'écran d'accueil, en version condensée : ils rassurent au moment
            du choix, et n'ont plus de section à eux depuis le passage en vue unique. */}
        <div className="hero-avis">
          {TEMOIGNAGES.map((temoignage) => (
            <div key={temoignage.nom} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <span aria-hidden style={{ fontSize: 10, letterSpacing: 1.5, color: '#6d3bd1' }}>★★★★★</span>
              <span className="avis-texte">« {temoignage.texte} »</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted-2)' }}>{temoignage.nom}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
