import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { Logo } from '../shared/Logo'
import { ChampMotDePasse } from '../shared/ChampMotDePasse'

const LONGUEUR_MIN = 8

/**
 * Page d'atterrissage du lien envoyé par /api/auth/mot-de-passe-oublie (première connexion ou
 * mot de passe oublié). Supabase détecte automatiquement le jeton de recovery présent dans
 * l'URL (`detectSessionInUrl`, activé par défaut) et ouvre une session avant même que ce
 * composant ne s'affiche — la présence de `session` ici EST la preuve que le lien est valide,
 * il n'y a rien d'autre à vérifier.
 */
export function ReinitialiserMotDePasse() {
  const { session, loading } = useProfileContext()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next')

  const [motDePasse, setMotDePasse] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  async function definirMotDePasse(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    if (motDePasse.length < LONGUEUR_MIN) {
      setErreur(`Le mot de passe doit contenir au moins ${LONGUEUR_MIN} caractères.`)
      return
    }
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne correspondent pas.')
      return
    }

    setEnvoi(true)
    const { error: erreurMaj } = await supabase.auth.updateUser({ password: motDePasse })
    if (erreurMaj) {
      setEnvoi(false)
      setErreur("Le mot de passe n'a pas pu être enregistré. Redemandez un lien depuis la page de connexion.")
      return
    }

    if (session) {
      // Colonne non privilégiée (voir migration 0043) : la policy `profiles_self_update`
      // autorise déjà ce compte à la modifier lui-même, pas besoin d'un endpoint dédié.
      await supabase.from('profiles').update({ mot_de_passe_defini: true }).eq('id', session.user.id)
    }

    setEnvoi(false)
    navigate(next ?? '/connexion', { replace: true })
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: 24 }}>
      <a href="/">
        <Logo />
      </a>
      <div className="card" style={{ width: '100%', maxWidth: 380, padding: 30, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading ? (
          <p style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>Vérification du lien…</p>
        ) : !session ? (
          <>
            <h1 style={{ fontSize: 22, color: 'var(--ink)' }}>Lien invalide ou expiré</h1>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
              Ce lien de réinitialisation n'est plus valable. Redemandez-en un depuis la page de connexion.
            </p>
            <a
              href="/connexion"
              className="btn-shine"
              style={{ background: 'var(--accent-blue-gradient)', color: '#fff', padding: '14px', fontSize: 14.5, textAlign: 'center', borderRadius: 10, textDecoration: 'none' }}
            >
              Retour à la connexion
            </a>
          </>
        ) : (
          <form onSubmit={definirMotDePasse} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h1 style={{ fontSize: 22, color: 'var(--ink)' }}>Choisissez votre mot de passe</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Nouveau mot de passe</label>
              <ChampMotDePasse
                required
                autoFocus
                autoComplete="new-password"
                valeur={motDePasse}
                onValeurChange={setMotDePasse}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Confirmer le mot de passe</label>
              <ChampMotDePasse
                required
                autoComplete="new-password"
                valeur={confirmation}
                onValeurChange={setConfirmation}
              />
            </div>
            {erreur && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{erreur}</p>}
            <button
              type="submit"
              disabled={envoi}
              className="btn-shine"
              style={{ background: 'var(--accent-blue-gradient)', color: '#fff', padding: '14px', fontSize: 14.5, opacity: envoi ? 0.7 : 1 }}
            >
              {envoi ? 'Enregistrement…' : 'Enregistrer et me connecter'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
