import type { CSSProperties } from 'react'
import { Icone, type NomIcone } from '../ui/Icones'

/* Hero de la page publique, repris de la maquette fournie par le client le 2026-09-15.
   L'illustration est le seul élément image : tout le reste (titre, boutons, pastilles, barre
   d'atouts) est reconstruit en HTML pour rester net à toutes les tailles, sélectionnable,
   traduisible et accessible — la maquette d'origine était une image unique où même le texte
   était dessiné. */

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

export function HeroPublic({
  nomEtablissement,
  lienReservation,
}: {
  nomEtablissement: string
  lienReservation: { href: string; target?: string; rel?: string }
}) {
  return (
    <section style={{ position: 'relative', padding: '46px 40px 0', overflow: 'hidden' }}>
      <div
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 1fr) minmax(320px, 1.05fr)',
          gap: 40,
          alignItems: 'center',
        }}
        className="grille-hero"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <span
            className="arrive-text"
            style={{
              alignSelf: 'flex-start',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 999,
              background: 'rgba(109,59,209,.10)',
              border: '1px solid rgba(109,59,209,.24)',
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: '#5a2fb5',
            }}
          >
            Appels diagnostic ouverts cette semaine
          </span>

          <p className="mention-manuscrite arrive-text" style={{ fontSize: 30, margin: 0 }}>
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

          <p className="arrive-text" style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--ink-2)', maxWidth: 460, margin: 0 }}>
            Des cours interactifs, des professeurs passionnés et une expérience d’apprentissage unique.
            Rejoignez {nomEtablissement} dès aujourd’hui !
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <a
              {...lienReservation}
              className="btn-shine arrive"
              style={{
                fontSize: 15,
                padding: '15px 28px',
                background: 'var(--accent-blue-gradient)',
                color: '#fff',
              }}
            >
              Commencer maintenant →
            </a>
          </div>

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {GARANTIES.map((garantie) => (
              <span key={garantie} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--muted)' }}>
                <span
                  aria-hidden
                  style={{
                    width: 17,
                    height: 17,
                    borderRadius: 5,
                    border: '1.5px solid rgba(109,59,209,.45)',
                    color: '#6d3bd1',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  ✓
                </span>
                {garantie}
              </span>
            ))}
          </div>

          <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 10, listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
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

        <div style={{ position: 'relative', minWidth: 0 }}>
          <picture>
            <source srcSet="/hero-illustration.webp" type="image/webp" />
            <img
              src="/hero-illustration.jpg"
              alt={`Deux élèves de ${nomEtablissement} en cours d’anglais en visioconférence`}
              className="illustration-hero arrive"
              width={1445}
              height={944}
              /* Visuel principal de la page : chargé en priorité, jamais différé. */
              fetchPriority="high"
            />
          </picture>
        </div>
      </div>

      <div
        style={{
          maxWidth: 1140,
          margin: '30px auto 0',
          background: 'var(--surface)',
          border: '1px solid var(--border-soft)',
          borderRadius: 20,
          boxShadow: 'var(--shadow-card)',
          padding: '18px 26px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 18,
        }}
      >
        {ATOUTS.map((atout) => (
          <div key={atout.titre} style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span
              aria-hidden
              style={{
                width: 38,
                height: 38,
                borderRadius: 999,
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(109,59,209,.10)',
                color: '#6d3bd1',
              }}
            >
              <Icone nom={atout.icone} taille={18} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{atout.titre}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{atout.detail}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

/* Exporté pour que la page puisse réutiliser exactement le même style de bouton ailleurs. */
export const styleBoutonViolet: CSSProperties = {
  background: 'var(--accent-blue-gradient)',
  color: '#ffffff',
}
