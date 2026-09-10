import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { deriveAccent } from '../../lib/accent'
import { HeroDecor } from '../shared/HeroDecor'
import { Logo } from '../shared/Logo'
import { FormulaireProspect } from '../prospects/FormulaireProspect'
import type { TypeProgrammeProspect } from '../../types/database.types'
import { useTarifs } from '../../hooks/useTarifs'

const PROGRAMME_LABEL: Record<TypeProgrammeProspect, string> = {
  individuel: 'Individuel',
  duo: 'Duo',
  collectif: 'Collectif',
}

type Etablissement = Database['public']['Tables']['etablissements']['Row']

const PROGRAMMES: { type: TypeProgrammeProspect; tag: string; titre: string; texte: string }[] = [
  {
    type: 'individuel',
    tag: 'Individuel',
    titre: 'Cours particuliers',
    texte: 'Sur mesure : vous choisissez votre rythme et le sujet de chaque séance, avec un professeur rien que pour vous, calé sur votre objectif réel.',
  },
  {
    type: 'collectif',
    tag: 'Collectif',
    titre: 'Cours en petit groupe',
    texte: 'Par vague, sur un planning établi par l’établissement, avec des groupes de niveaux différents pour progresser ensemble au bon rythme.',
  },
  {
    type: 'duo',
    tag: 'Duo',
    titre: 'Cours en duo',
    texte: 'En couple ou entre amis, apprenez à deux sur un même créneau : un accompagnement pensé pour vos deux objectifs, à la fois complice et exigeant.',
  },
]

const TEMOIGNAGES = [
  { initiales: 'AL', nom: 'A. L.', texte: 'Un vrai suivi, un professeur qui connaît mes objectifs semaine après semaine.' },
  { initiales: 'MK', nom: 'M. K.', texte: 'Les cours en petit groupe m’ont redonné confiance pour parler sans hésiter.' },
  { initiales: 'SB', nom: 'S. B.', texte: 'L’appel diagnostic a tout de suite posé un cap clair pour mes cours.' },
]

/* Cadre orné (double liseré + 4 coins en L) piloté par currentColor — voir .cadre-orne dans
   index.css. Composant plutôt que balisage répété : utilisé au hero et aux sections
   fondatrice/équipe. */
function CadreOrne({ accent, children, style }: { accent: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="cadre-orne" style={{ color: accent, borderRadius: 4, padding: 28, ...style }}>
      <span className="coin" style={{ top: -9, left: -9, borderWidth: '2px 0 0 2px' }} />
      <span className="coin" style={{ top: -9, right: -9, borderWidth: '2px 2px 0 0' }} />
      <span className="coin" style={{ bottom: -9, left: -9, borderWidth: '0 0 2px 2px' }} />
      <span className="coin" style={{ bottom: -9, right: -9, borderWidth: '0 2px 2px 0' }} />
      <div style={{ position: 'relative', color: 'var(--ink)' }}>{children}</div>
    </div>
  )
}

export function LandingEtablissement() {
  const { slug } = useParams<{ slug: string }>()
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null)
  const [loading, setLoading] = useState(true)
  const [introuvable, setIntrouvable] = useState(false)
  const [programmeChoisi, setProgrammeChoisi] = useState<TypeProgrammeProspect>('individuel')
  const { tarifs } = useTarifs(etablissement?.id)

  useEffect(() => {
    if (!slug) return
    let annule = false
    supabase
      .from('etablissements')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (annule) return
        if (error || !data) {
          setIntrouvable(true)
        } else {
          setEtablissement(data)
        }
        setLoading(false)
      })
    return () => {
      annule = true
    }
  }, [slug])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
        Chargement…
      </div>
    )
  }

  if (introuvable || !etablissement) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--ink)' }}>
        <p style={{ color: 'var(--danger)' }}>Établissement introuvable.</p>
        <a href="/" className="btn-shine" style={{ background: 'var(--accent-blue-gradient)', color: '#fff' }}>
          Retour à la sélection
        </a>
      </div>
    )
  }

  const accent = deriveAccent(etablissement.couleur_accent)
  const initiales = etablissement.nom.slice(0, 2).toUpperCase()
  const dossierAssets = `/etablissements/${etablissement.slug}`

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          display: 'flex',
          flexWrap: 'wrap',
          rowGap: 10,
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 40px',
          borderBottom: '1px solid var(--border-soft)',
          background: 'rgba(6,12,26,.86)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <span
            className="brand-font"
            style={{
              width: 40,
              height: 40,
              borderRadius: 13,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 15,
              background: accent.accentGrad,
              color: accent.accentInk,
              boxShadow: `0 0 0 1px rgba(255,255,255,.24) inset, 0 6px 20px ${accent.accentGlow}`,
            }}
          >
            {initiales}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span className="logo-glow brand-font" style={{ fontWeight: 700, fontSize: 18, letterSpacing: 1.5 }}>
              {etablissement.nom}
            </span>
            {etablissement.specialite && (
              <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.6, color: 'var(--muted-2)', textTransform: 'uppercase' }}>
                {etablissement.specialite}
              </span>
            )}
          </div>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <a href="#programmes" className="nav-link-glow" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
            Programmes
          </a>
          <a href="#tarifs" className="nav-link-glow" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
            Tarifs
          </a>
          <a href="#fondatrice" className="nav-link-glow" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
            Fondatrice
          </a>
          <a href="#equipe" className="nav-link-glow" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
            Équipe
          </a>
          <a href="#avis" className="nav-link-glow" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
            Avis
          </a>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a href="/connexion" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)' }}>
            Espace personnel
          </a>
          <a href="#reserver" className="btn-shine" style={{ background: accent.accentGrad, color: accent.accentInk, boxShadow: `0 4px 14px ${accent.accentGlow}` }}>
            Réserver mon appel
          </a>
        </div>
      </header>

      <section style={{ position: 'relative', padding: '70px 40px 50px', overflow: 'hidden' }}>
        <HeroDecor accent={accent.accent} />
        <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>
          <CadreOrne accent={accent.accent} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, padding: '46px 36px' }}>
            <span
              className="arrive-text"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 9,
                padding: '6px 15px',
                borderRadius: 999,
                border: `1px solid ${accent.accentBorder}`,
                background: accent.accentSoft,
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                color: accent.accent,
              }}
            >
              Appels diagnostic ouverts cette semaine
            </span>
            <h1 className="arrive-text brand-font" style={{ fontSize: 42, lineHeight: 1.18, color: '#ffffff', animationDelay: '.1s' }}>
              Apprenez avec un professeur qui vous accompagne jusqu'à la réussite
            </h1>
            <span aria-hidden style={{ width: 60, height: 1, background: accent.accent, opacity: 0.6 }} />
            <p className="arrive-text" style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--ink-2)', maxWidth: 560, animationDelay: '.2s' }}>
              Quinze minutes d'appel pour situer votre niveau et votre objectif. Ensuite, un professeur attitré
              chez {etablissement.nom} et des cours en visio à votre rythme.
            </p>
            <a href="#reserver" className="btn-shine arrive" style={{ fontSize: 15, padding: '16px 28px', background: accent.accentGrad, color: accent.accentInk, boxShadow: `0 6px 24px ${accent.accentGlow}`, animationDelay: '.3s' }}>
              Réserver mon appel diagnostic
            </a>
          </CadreOrne>
        </div>
      </section>

      <section id="programmes" style={{ padding: '20px 40px 70px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 30, color: '#ffffff', marginBottom: 30 }}>
          Trois façons d'apprendre, un seul cap : votre objectif.
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {PROGRAMMES.map((programme, index) => (
            <div
              key={programme.titre}
              className="card card-lift card-programme arrive"
              style={{
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                animationDelay: `${index * 0.1}s`,
                '--card-accent-soft': accent.accentSoft,
                '--card-accent-border': accent.accentBorder,
                '--card-accent-glow': accent.accentGlow,
              } as CSSProperties}
            >
              <span
                style={{
                  alignSelf: 'flex-start',
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  color: accent.accent,
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: `1px solid ${accent.accentBorder}`,
                  background: accent.accentSoft,
                }}
              >
                {programme.tag}
              </span>
              <h3 style={{ fontSize: 18, color: 'var(--ink)' }}>{programme.titre}</h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--muted)' }}>{programme.texte}</p>
              <a
                href="#reserver"
                onClick={() => setProgrammeChoisi(programme.type)}
                style={{ fontSize: 12.5, fontWeight: 700, color: accent.accent, marginTop: 4 }}
              >
                {programme.type === 'collectif' ? 'Réserver mon test →' : 'Réserver mon appel →'}
              </a>
            </div>
          ))}
        </div>
      </section>

      {tarifs.length > 0 && (
        <section id="tarifs" style={{ padding: '20px 40px 70px', maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 30, color: '#ffffff', marginBottom: 30 }}>Tarifs</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'start' }}>
            {(['individuel', 'duo', 'collectif'] as const).map((type) => {
              const lignes = tarifs.filter((t) => t.type_programme === type)
              if (lignes.length === 0) return null
              return (
                <CadreOrne key={type} accent={accent.accent} style={{ padding: 0 }}>
                  <div className="arrive" style={{ padding: '26px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span
                        style={{
                          alignSelf: 'flex-start',
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                          color: accent.accent,
                          padding: '4px 10px',
                          borderRadius: 999,
                          border: `1px solid ${accent.accentBorder}`,
                          background: accent.accentSoft,
                        }}
                      >
                        {PROGRAMME_LABEL[type]}
                      </span>
                      <h3 className="brand-font" style={{ fontSize: 19, color: '#ffffff', margin: 0 }}>
                        {type === 'individuel' ? 'Cours particuliers' : type === 'duo' ? 'Cours en duo' : 'Cours en petit groupe'}
                      </h3>
                      {type === 'individuel' && (
                        <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--muted)', margin: 0 }}>
                          Anglais général, focus oral, compréhension ou grammaire — ou anglais des affaires
                          (meetings, présentations, négociation). Contenu 100 % personnalisable sur demande.
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {lignes.map((ligne, index) => (
                        <div
                          key={ligne.id}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                            padding: '10px 10px',
                            borderRadius: 8,
                            background: index % 2 === 0 ? accent.accentSoft : 'transparent',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)' }}>{ligne.titre}</span>
                            <span className="brand-font" style={{ fontSize: 15, color: accent.accent, whiteSpace: 'nowrap' }}>
                              {ligne.prix.toLocaleString('fr-FR')} {ligne.unite}
                            </span>
                          </div>
                          {ligne.description && (
                            <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>{ligne.description}</span>
                          )}
                        </div>
                      ))}
                    </div>

                    <a
                      href="#reserver"
                      onClick={() => setProgrammeChoisi(type)}
                      className="btn-shine"
                      style={{ alignSelf: 'flex-start', fontSize: 12.5, padding: '10px 18px', background: accent.accentGrad, color: accent.accentInk, boxShadow: `0 4px 14px ${accent.accentGlow}` }}
                    >
                      Réserver →
                    </a>
                  </div>
                </CadreOrne>
              )
            })}
          </div>
        </section>
      )}

      <section id="fondatrice" style={{ padding: '10px 40px 70px', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 320px) 1fr', gap: 40, alignItems: 'center' }}>
          <CadreOrne accent={accent.accent} style={{ padding: 10 }}>
            <img
              src={`${dossierAssets}/Directrice.jpg`}
              alt={`Directrice de ${etablissement.nom}`}
              style={{ width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', objectPosition: 'top', display: 'block', borderRadius: 2 }}
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
              }}
            />
          </CadreOrne>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: accent.accent }}>
              Notre directrice
            </span>
            <h2 className="brand-font" style={{ fontSize: 28, color: '#ffffff', margin: 0 }}>
              Une pédagogie pensée pour des résultats réels
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--ink-2)' }}>
              Persuadée qu'aucune application ne remplace le regard d'un professeur qui croit en vous, notre
              directrice a fondé {etablissement.nom} pour redonner sa juste place à la relation humaine dans
              l'apprentissage des langues. Son exigence : un accompagnement sur-mesure, taillé pour votre
              objectif, votre rythme et votre vie. Chaque élève qui progresse ici en est la preuve vivante.
            </p>
          </div>
        </div>
      </section>

      <section id="equipe" style={{ padding: '10px 40px 70px', maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: accent.accent }}>
          Notre équipe
        </span>
        <h2 className="brand-font" style={{ fontSize: 28, color: '#ffffff', margin: '10px 0 24px' }}>
          Des professeurs choisis pour votre objectif
        </h2>
        <CadreOrne accent={accent.accent} style={{ padding: 10, maxWidth: 720, margin: '0 auto' }}>
          <img
            src={`${dossierAssets}/equipe.jpg`}
            alt={`L'équipe de ${etablissement.nom}`}
            style={{ width: '100%', objectFit: 'cover', display: 'block', borderRadius: 2 }}
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
            }}
          />
        </CadreOrne>
        <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--muted)', maxWidth: 560, margin: '22px auto 0' }}>
          Une équipe soudée, choisie pour sa pédagogie autant que pour sa passion des langues — la même
          exigence bienveillante à chaque cours, quel que soit le professeur qui vous accompagne.
        </p>
        <a href="#reserver" className="btn-shine" style={{ marginTop: 26, display: 'inline-flex', background: accent.accentGrad, color: accent.accentInk, boxShadow: `0 4px 14px ${accent.accentGlow}` }}>
          Découvrir l'équipe
        </a>
      </section>

      <section
        style={{
          margin: '0 40px 70px',
          maxWidth: 1020,
          marginLeft: 'auto',
          marginRight: 'auto',
          padding: '40px 36px',
          borderRadius: 18,
          textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(15,26,50,.9), rgba(9,15,30,.95))',
          border: `1px solid ${accent.accentBorder}`,
          boxShadow: `0 0 40px ${accent.accentGlow}`,
        }}
      >
        <h2 className="brand-font" style={{ fontSize: 26, color: '#ffffff', margin: '0 0 10px' }}>
          Un appel, quinze minutes, zéro engagement.
        </h2>
        <p style={{ fontSize: 14, color: 'var(--ink-2)', maxWidth: 520, margin: '0 auto 22px' }}>
          Le point de départ de chaque parcours chez {etablissement.nom} : on situe votre niveau, on cadre
          votre objectif, et on vous propose le bon format de cours.
        </p>
        <a href="#reserver" className="btn-shine" style={{ background: accent.accentGrad, color: accent.accentInk, boxShadow: `0 4px 14px ${accent.accentGlow}` }}>
          Réserver mon appel diagnostic
        </a>
      </section>

      <section id="avis" style={{ padding: '0 40px 70px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 30, color: '#ffffff', marginBottom: 8 }}>
          Ce qu'en disent nos élèves
        </h2>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted-2)', marginBottom: 30 }}>
          Exemples d'avis — à remplacer par de vrais témoignages avant mise en ligne.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {TEMOIGNAGES.map((temoignage, index) => (
            <div key={temoignage.nom} className="card card-lift arrive" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, animationDelay: `${index * 0.1}s` }}>
              <span aria-hidden style={{ fontSize: 13, letterSpacing: 2, color: accent.accent }}>
                ★★★★★
              </span>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)', fontStyle: 'italic' }}>
                « {temoignage.texte} »
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <span
                  className="brand-font"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    background: accent.accentGrad,
                    color: accent.accentInk,
                  }}
                >
                  {temoignage.initiales}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>{temoignage.nom}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="reserver" style={{ padding: '0 40px 70px', maxWidth: 640, margin: '0 auto' }}>
        <FormulaireProspect
          etablissementId={etablissement.id}
          etablissementNom={etablissement.nom}
          accent={accent}
          typeInitial={programmeChoisi}
          calendlyUrl={etablissement.calendly_url}
        />
      </section>

      <footer
        style={{
          padding: '48px 40px 30px',
          background: `linear-gradient(160deg, rgba(9,13,24,1) 0%, #2a1a12 55%, #3d0f1a 100%)`,
          borderTop: `1px solid ${accent.accentBorder}`,
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 32,
            paddingBottom: 30,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="logo-glow brand-font" style={{ fontWeight: 700, fontSize: 17 }}>
              {etablissement.nom}
            </span>
            {etablissement.specialite && (
              <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>{etablissement.specialite}</span>
            )}
            <span aria-hidden style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 15, color: accent.accent }}>
              <span>●</span>
              <span>●</span>
              <span>●</span>
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted-2)' }}>
              Navigation
            </span>
            <a href="#programmes" style={{ fontSize: 13, color: 'var(--ink-2)' }}>Programmes</a>
            <a href="#fondatrice" style={{ fontSize: 13, color: 'var(--ink-2)' }}>Fondatrice</a>
            <a href="#equipe" style={{ fontSize: 13, color: 'var(--ink-2)' }}>Équipe</a>
            <a href="#avis" style={{ fontSize: 13, color: 'var(--ink-2)' }}>Avis</a>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted-2)' }}>
              Espaces
            </span>
            <a href="/connexion" style={{ fontSize: 13, color: 'var(--ink-2)' }}>Espace personnel</a>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted-2)' }}>
              Réserver
            </span>
            <a href="#reserver" className="btn-shine" style={{ alignSelf: 'flex-start', background: accent.accentGrad, color: accent.accentInk, fontSize: 12.5 }}>
              Appel diagnostic
            </a>
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: '0 auto', paddingTop: 20, borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>© 2026 {etablissement.nom}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 12, color: 'var(--muted-2)' }}>
            Propulsé par <Logo size={14} />
          </span>
        </div>
      </footer>
    </div>
  )
}
