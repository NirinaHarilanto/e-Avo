import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { Logo } from '../shared/Logo'
import { ChampMotDePasse } from '../shared/ChampMotDePasse'

const LONGUEUR_MIN = 8
const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Page d'atterrissage du lien envoyé par /api/auth/mot-de-passe-oublie (première connexion ou
 * mot de passe oublié). Supabase détecte automatiquement le jeton de recovery présent dans
 * l'URL (`detectSessionInUrl`, activé par défaut) et ouvre une session avant même que ce
 * composant ne s'affiche — la présence de `session` ici EST la preuve que le lien est valide.
 */
export function ReinitialiserMotDePasse() {
  const { session, profile, loading, platformAdmin, platformAdminLoading } = useProfileContext()
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
      /* Le message était auparavant toujours « redemandez un lien », ce qui envoyait l'utilisateur
         refaire un tour complet alors que le lien était parfaitement valide et que seul le mot de
         passe posait problème. On distingue donc les cas que Supabase sait nommer. */
      setErreur(messageErreurMotDePasse(erreurMaj))
      return
    }

    if (session) {
      // Colonne non privilégiée (voir migration 0043) : la policy `profiles_self_update`
      // autorise déjà ce compte à la modifier lui-même, pas besoin d'un endpoint dédié.
      const { error: erreurProfil } = await supabase
        .from('profiles')
        .update({ mot_de_passe_defini: true })
        .eq('id', session.user.id)
      /* Sans ce garde-fou, un échec ici laissait l'utilisateur dans une boucle : son mot de passe
         était bien changé, mais l'écran de connexion continuait de le traiter en « première
         connexion » et le renvoyait indéfiniment vers la réinitialisation. */
      if (erreurProfil) {
        setEnvoi(false)
        setErreur(
          'Votre mot de passe est enregistré, mais votre compte n’a pas pu être marqué comme actif. ' +
            'Connectez-vous normalement ; si l’écran vous propose encore une première connexion, ' +
            'signalez-le à contact@harionlineclub.app.',
        )
        return
      }
    }

    setEnvoi(false)
    // L'utilisateur est déjà authentifié par le lien : le renvoyer vers /connexion lui ferait
    // ressaisir le mot de passe qu'il vient de choisir. On l'emmène directement dans son espace —
    // ou, pour un admin plateforme, vers l'écran de choix des 3 espaces (voir ChoixEspace).
    navigate(next ?? destinationSelonRole(profile?.role, !!platformAdmin), { replace: true })
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: 24 }}>
      <a href="/">
        <Logo />
      </a>
      <div className="card" style={{ width: '100%', maxWidth: 380, padding: 30, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading || platformAdminLoading ? (
          <p style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>Vérification du lien…</p>
        ) : !session ? (
          <LienMort />
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
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{LONGUEUR_MIN} caractères minimum.</span>
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
            {erreur && <p style={{ color: 'var(--danger)', fontSize: 13, lineHeight: 1.5 }}>{erreur}</p>}
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

/* Un lien de réinitialisation ne sert qu'une fois et expire vite ; certains filtres anti-hameçonnage
   (Outlook, notamment) le consomment même en pré-visualisant l'e-mail. L'écran doit donc permettre
   d'en redemander un sur place : renvoyer vers la page de connexion, comme avant, obligeait à
   refaire toute la saisie pour un incident aussi banal. */
function LienMort() {
  const [email, setEmail] = useState('')
  const [etat, setEtat] = useState<'saisie' | 'envoi' | 'envoye'>('saisie')
  const [erreur, setErreur] = useState<string | null>(null)

  async function redemander(e: FormEvent) {
    e.preventDefault()
    const adresse = email.trim().toLowerCase()
    if (!EMAIL_VALIDE.test(adresse)) {
      setErreur('Adresse e-mail invalide.')
      return
    }
    setEtat('envoi')
    setErreur(null)
    const reponse = await fetch('/api/auth/mot-de-passe-oublie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adresse }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: "L'envoi a échoué. Réessayez dans un instant." }))

    if (!reponse?.ok) {
      setEtat('saisie')
      setErreur(reponse?.error ?? "L'envoi a échoué. Réessayez dans un instant.")
      return
    }
    setEtat('envoye')
  }

  if (etat === 'envoye') {
    return (
      <>
        <h1 style={{ fontSize: 22, color: 'var(--ink)' }}>Nouveau lien envoyé</h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
          Un nouveau lien vient d’être envoyé à <strong>{email.trim().toLowerCase()}</strong>. Ouvrez-le depuis cet
          appareil, et de préférence dans les minutes qui suivent.
        </p>
      </>
    )
  }

  return (
    <form onSubmit={redemander} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 22, color: 'var(--ink)' }}>Lien expiré</h1>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
        Ce lien a déjà servi ou n’est plus valable. Indiquez votre adresse pour en recevoir un nouveau.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>E-mail</label>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
        />
      </div>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 13, lineHeight: 1.5 }}>{erreur}</p>}
      <button
        type="submit"
        disabled={etat === 'envoi'}
        className="btn-shine"
        style={{ background: 'var(--accent-blue-gradient)', color: '#fff', padding: '14px', fontSize: 14.5, opacity: etat === 'envoi' ? 0.7 : 1 }}
      >
        {etat === 'envoi' ? 'Envoi…' : 'Recevoir un nouveau lien'}
      </button>
      <a href="/connexion" style={{ color: 'var(--ink-2)', fontSize: 13, textAlign: 'center' }}>
        Retour à la connexion
      </a>
    </form>
  )
}

/* Supabase nomme ses refus (`code`), mais sa réponse brute est en anglais : on les traduit en
   consignes actionnables, plutôt que de renvoyer l'utilisateur redemander un lien pour un motif
   qui n'a rien à voir avec le lien. */
function messageErreurMotDePasse(erreur: { code?: string; message?: string }): string {
  if (erreur.code === 'same_password') {
    return 'Ce mot de passe est identique à l’actuel. Choisissez-en un autre.'
  }
  if (erreur.code === 'weak_password') {
    return 'Ce mot de passe est trop simple. Ajoutez des chiffres, des majuscules ou des caractères spéciaux.'
  }
  if (erreur.code === 'session_not_found' || erreur.message?.includes('session')) {
    return 'Votre lien a expiré pendant la saisie. Rechargez la page pour en redemander un.'
  }
  return `Le mot de passe n’a pas pu être enregistré${erreur.message ? ` (${erreur.message})` : ''}.`
}

function destinationSelonRole(role: string | undefined, estPlatformAdmin: boolean): string {
  if (estPlatformAdmin) return '/mon-espace'
  return role === 'admin_etablissement' ? '/admin/prospects' : '/mon-espace'
}
