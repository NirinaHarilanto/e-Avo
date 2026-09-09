import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { deriveAccent } from '../../lib/accent'
import { HeroDecor } from '../shared/HeroDecor'
import { Logo } from '../shared/Logo'
import { FormulaireProspect } from '../prospects/FormulaireProspect'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

const ETAPES = [
  {
    titre: "Vous réservez l'appel diagnostic",
    texte: 'Vingt minutes en visio, gratuites et sans engagement, pour situer votre niveau réel et votre objectif.',
  },
  {
    titre: 'On vous attribue un professeur',
    texte: 'Votre niveau est posé et votre dossier ouvert. Le professeur choisi correspond à votre objectif.',
  },
  {
    titre: 'Vous suivez vos cours en visio',
    texte: "Un créneau fixe chaque semaine, un bouton pour rejoindre, et votre compteur d'heures toujours visible.",
  },
]

export function LandingEtablissement() {
  const { slug } = useParams<{ slug: string }>()
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null)
  const [loading, setLoading] = useState(true)
  const [introuvable, setIntrouvable] = useState(false)

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

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 40px',
          borderBottom: '1px solid var(--border-soft)',
          background: 'rgba(6,12,26,.82)',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a href="/connexion" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)' }}>
            Espace élève
          </a>
          <a href="#reserver" className="btn-shine" style={{ background: accent.accentGrad, color: accent.accentInk, boxShadow: `0 4px 14px ${accent.accentGlow}` }}>
            Réserver mon appel
          </a>
        </div>
      </header>

      <section style={{ position: 'relative', padding: '64px 40px 40px', overflow: 'hidden' }}>
        <HeroDecor accent={accent.accent} />
        <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
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
          <h1 className="arrive-text brand-font" style={{ fontSize: 44, lineHeight: 1.15, color: '#ffffff', animationDelay: '.1s' }}>
            Apprenez avec un professeur, pas avec une application.
          </h1>
          <p className="arrive-text" style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--ink-2)', maxWidth: 560, animationDelay: '.2s' }}>
            Vingt minutes d'appel pour situer votre niveau et votre objectif. Ensuite, un professeur attitré
            chez {etablissement.nom} et des cours en visio à votre rythme.
          </p>
          <a href="#reserver" className="btn-shine arrive" style={{ fontSize: 15, padding: '16px 28px', background: accent.accentGrad, color: accent.accentInk, boxShadow: `0 6px 24px ${accent.accentGlow}`, animationDelay: '.3s' }}>
            Réserver mon appel diagnostic
          </a>
        </div>
      </section>

      <section style={{ padding: '20px 40px 70px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 30, color: '#ffffff', marginBottom: 30 }}>
          Trois étapes, et vous êtes en cours la semaine suivante.
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {ETAPES.map((etape, index) => (
            <div key={etape.titre} className="card card-lift arrive" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, animationDelay: `${index * 0.1}s` }}>
              <span className="brand-font" style={{ fontSize: 36, color: 'rgba(255,255,255,.08)' }}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 style={{ fontSize: 18, color: 'var(--ink)' }}>{etape.titre}</h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--muted)' }}>{etape.texte}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="reserver" style={{ padding: '0 40px 70px', maxWidth: 640, margin: '0 auto' }}>
        <FormulaireProspect etablissementId={etablissement.id} accent={accent} />
      </section>

      <footer style={{ borderTop: '1px solid var(--border-soft)', padding: '26px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>© 2026 {etablissement.nom}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 12, color: 'var(--muted-2)' }}>
          Propulsé par <Logo size={14} />
        </span>
      </footer>
    </div>
  )
}
