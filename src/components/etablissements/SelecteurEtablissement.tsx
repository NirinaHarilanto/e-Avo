import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { HeroDecor } from '../shared/HeroDecor'
import { Logo } from '../shared/Logo'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

export function SelecteurEtablissement() {
  const [etablissements, setEtablissements] = useState<Etablissement[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let annule = false
    supabase
      .from('etablissements')
      .select('*')
      .order('nom')
      .then(({ data, error }) => {
        if (annule) return
        if (error) {
          setErreur(error.message)
        } else {
          setEtablissements(data ?? [])
        }
        setLoading(false)
      })
    return () => {
      annule = true
    }
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <section style={{ position: 'relative', overflow: 'hidden', paddingBottom: 48 }}>
        <HeroDecor />

        <header
          style={{
            position: 'relative',
            zIndex: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '22px 40px',
          }}
        >
          <Logo />
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <a href="/plateforme/etablissements" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted-2)' }}>
              Admin plateforme
            </a>
            <a href="/connexion" className="btn-shine" style={{ background: 'var(--accent-blue-gradient)', color: '#fff', fontSize: 13 }}>
              Se connecter
            </a>
          </div>
        </header>

        <div
          style={{
            position: 'relative',
            zIndex: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '40px 32px 0',
          }}
        >
          <h1
            className="arrive-text brand-font"
            style={{
              fontSize: 48,
              letterSpacing: 1,
              background: 'linear-gradient(120deg, #ffffff 12%, #9fd8ff 42%, #3ea0f0 72%, #ffffff 100%)',
              backgroundSize: '220% auto',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              filter: 'drop-shadow(0 0 18px rgba(94,179,255,.45))',
              animation: 'textArrive .9s cubic-bezier(.22,1,.36,1) .1s both, logoShift 6s ease-in-out 1.3s infinite',
            }}
          >
            Où apprenez-vous&nbsp;?
          </h1>
          <p className="arrive-text" style={{ marginTop: 16, maxWidth: 560, fontSize: 15.5, lineHeight: 1.65, color: 'var(--ink-2)', animationDelay: '.22s' }}>
            e-Avo héberge les parcours de plusieurs établissements partenaires. Choisissez le vôtre pour
            retrouver vos cours, votre professeur et vos heures.
          </p>
        </div>
      </section>

      <section style={{ position: 'relative', zIndex: 3, padding: '8px 40px 0', maxWidth: 1200, margin: '0 auto' }}>
        {loading && <p style={{ textAlign: 'center', color: 'var(--muted)' }}>Chargement des établissements…</p>}
        {erreur && (
          <p style={{ textAlign: 'center', color: 'var(--danger)' }}>
            Impossible de charger les établissements ({erreur}).
          </p>
        )}
        {!loading && !erreur && etablissements.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucun établissement disponible pour le moment.</p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
          {etablissements.map((etablissement, index) => (
            <a
              key={etablissement.id}
              href={`/e/${etablissement.slug}`}
              className="card card-lift arrive"
              style={{
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                padding: 22,
                textDecoration: 'none',
                color: 'inherit',
                animationDelay: `${0.4 + index * 0.08}s`,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: -40,
                  right: -40,
                  width: 180,
                  height: 140,
                  background: `radial-gradient(closest-side, ${etablissement.couleur_accent ?? '#e9cf94'}30, transparent)`,
                  pointerEvents: 'none',
                }}
              />
              <span
                className="brand-font"
                style={{
                  position: 'relative',
                  width: 56,
                  height: 56,
                  borderRadius: 17,
                  background: etablissement.couleur_accent ?? 'var(--accent-gradient)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#1b1510',
                  fontWeight: 700,
                  fontSize: 21,
                  boxShadow: '0 0 0 1px rgba(255,255,255,.24) inset, 0 6px 22px rgba(0,0,0,.35)',
                }}
              >
                {etablissement.nom.slice(0, 2).toUpperCase()}
              </span>
              <div style={{ position: 'relative' }}>
                <h2 style={{ fontSize: 19, margin: 0, color: 'var(--ink)' }}>{etablissement.nom}</h2>
                {etablissement.specialite && (
                  <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '6px 0 0' }}>{etablissement.specialite}</p>
                )}
              </div>
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}
