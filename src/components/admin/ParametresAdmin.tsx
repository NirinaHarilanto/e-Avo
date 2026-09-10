import { useEffect, useState, type FormEvent } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

const champStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '12px 14px',
  fontSize: 14,
  color: 'var(--ink)',
  background: 'rgba(0,0,0,.22)',
  width: '100%',
  fontFamily: 'inherit',
}

export function ParametresAdmin() {
  const { profile } = useProfileContext()
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null)
  const [loading, setLoading] = useState(true)
  const [calendlyUrl, setCalendlyUrl] = useState('')
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enregistre, setEnregistre] = useState(false)

  useEffect(() => {
    if (!profile) return
    supabase
      .from('etablissements')
      .select('*')
      .eq('id', profile.etablissement_id)
      .maybeSingle()
      .then(({ data }) => {
        setEtablissement(data)
        setCalendlyUrl(data?.calendly_url ?? '')
        setLoading(false)
      })
  }, [profile])

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    if (!etablissement) return
    setEnregistrement(true)
    setErreur(null)
    setEnregistre(false)
    const { error } = await supabase
      .from('etablissements')
      .update({ calendly_url: calendlyUrl.trim() || null })
      .eq('id', etablissement.id)
    setEnregistrement(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setEnregistre(true)
  }

  return (
    <AdminLayout actif="Paramètres">
      <h1 style={{ fontSize: 28, color: '#fff', marginBottom: 6 }}>Paramètres</h1>
      <p style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 22 }}>
        Réglages propres à votre établissement.
      </p>

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : (
        <form onSubmit={enregistrer} className="card" style={{ maxWidth: 520, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ fontSize: 17, color: 'var(--ink)', margin: 0 }}>Réservation des appels</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Lien Calendly</label>
            <input
              type="url"
              placeholder="https://calendly.com/votre-etablissement/appel-diagnostic"
              value={calendlyUrl}
              onChange={(e) => setCalendlyUrl(e.target.value)}
              style={champStyle}
            />
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
              Si renseigné, un visiteur qui valide le formulaire de réservation de la landing est
              d'abord enregistré comme prospect, puis redirigé vers ce lien pour choisir son
              créneau directement sur votre Calendly.
            </p>
          </div>

          {erreur && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{erreur}</p>}
          {enregistre && <p style={{ color: 'var(--success)', fontSize: 13 }}>Enregistré.</p>}

          <button
            type="submit"
            disabled={enregistrement}
            className="btn-shine"
            style={{ alignSelf: 'flex-start', background: 'var(--accent-gradient)', color: '#1b1510', fontSize: 13.5, padding: '11px 20px', opacity: enregistrement ? 0.7 : 1 }}
          >
            {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}
    </AdminLayout>
  )
}
