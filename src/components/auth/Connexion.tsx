import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { Logo } from '../shared/Logo'

export function Connexion() {
  const { session, profile, loading, seConnecter } = useProfileContext()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    if (loading || !session) return
    if (profile?.role === 'admin_etablissement') {
      navigate('/admin/prospects', { replace: true })
    } else if (profile) {
      navigate('/mon-espace', { replace: true })
    }
  }, [session, profile, loading, navigate])

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    setErreur(null)
    const { error } = await seConnecter(email, motDePasse)
    setEnvoi(false)
    if (error) {
      setErreur('E-mail ou mot de passe incorrect.')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: 24 }}>
      <a href="/">
        <Logo />
      </a>
      <form onSubmit={envoyer} className="card" style={{ width: '100%', maxWidth: 380, padding: 30, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 22, color: 'var(--ink)' }}>Se connecter</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>E-mail</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Mot de passe</label>
          <input
            type="password"
            required
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
          />
        </div>
        {erreur && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{erreur}</p>}
        <button
          type="submit"
          disabled={envoi}
          className="btn-shine"
          style={{ background: 'var(--accent-blue-gradient)', color: '#fff', padding: '14px', fontSize: 14.5, opacity: envoi ? 0.7 : 1 }}
        >
          {envoi ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  )
}
