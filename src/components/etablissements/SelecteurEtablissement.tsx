import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'

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
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', padding: '48px 32px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
        <header style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
          <h1 className="brand-font" style={{ fontSize: 36, color: 'var(--accent-blue-deep)', margin: 0 }}>
            Où apprenez-vous&nbsp;?
          </h1>
          <p style={{ color: 'var(--muted)', maxWidth: 520 }}>
            e-Avo héberge les parcours de plusieurs établissements partenaires. Choisissez le vôtre pour
            retrouver vos cours, votre professeur et vos heures.
          </p>
        </header>

        {loading && <p style={{ textAlign: 'center', color: 'var(--muted)' }}>Chargement des établissements…</p>}
        {erreur && (
          <p style={{ textAlign: 'center', color: 'var(--danger)' }}>
            Impossible de charger les établissements ({erreur}).
          </p>
        )}
        {!loading && !erreur && etablissements.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucun établissement disponible pour le moment.</p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18 }}>
          {etablissements.map((etablissement) => (
            <a
              key={etablissement.id}
              href={`/e/${etablissement.slug}`}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                padding: 22,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <span
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: etablissement.couleur_accent ?? 'var(--accent-gradient)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 700,
                  fontFamily: "'Playfair Display', Georgia, serif",
                }}
              >
                {etablissement.nom.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <h2 style={{ fontSize: 18, margin: 0, color: 'var(--ink)' }}>{etablissement.nom}</h2>
                {etablissement.specialite && (
                  <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>{etablissement.specialite}</p>
                )}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
