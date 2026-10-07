import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { Logo } from '../shared/Logo'
import { ChampMotDePasse } from '../shared/ChampMotDePasse'
import { Icone } from '../ui/Icones'

type Etape = 'email' | 'inconnu' | 'sans_mot_de_passe' | 'lien_envoye' | 'mot_de_passe'

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* Les deux seules façons d'entrer chez HOC quand on n'a pas de compte : suivre un cours, ou en
   donner. `principal` les empile en pleine largeur — sur l'écran « aucun compte » ce sont les
   actions attendues ; dans l'encart au-dessus du formulaire, elles restent côte à côte et
   discrètes, pour ne pas prendre le pas sur le bouton de connexion lui-même. */
function PortesDEntree({ principal = false }: { principal?: boolean }) {
  const commun = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    textDecoration: 'none',
    fontWeight: 700,
    textAlign: 'center' as const,
    whiteSpace: 'nowrap' as const,
    flex: '1 1 0',
    padding: principal ? '13px 10px' : '9px 6px',
    fontSize: principal ? 14 : 12,
  }
  return (
    <div style={{ display: 'flex', flexDirection: principal ? 'column' : 'row', gap: 9 }}>
      <a
        href="/?vue=programmes"
        className={principal ? 'btn-shine' : undefined}
        style={
          principal
            ? { ...commun, background: 'var(--accent-blue-gradient)', color: '#fff' }
            : { ...commun, border: '1px solid var(--border)', color: 'var(--ink)' }
        }
      >
        Découvrir nos cours
      </a>
      <a
        href="/rejoignez-nous"
        style={{ ...commun, border: '1px solid var(--border)', color: principal ? 'var(--ink)' : 'var(--ink-2)' }}
      >
        Devenir formateur
      </a>
    </div>
  )
}

export function Connexion() {
  const { session, profile, loading, platformAdmin, platformAdminLoading, seConnecter } = useProfileContext()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next')

  const [etape, setEtape] = useState<Etape>('email')
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    // `platformAdminLoading` fait partie de la garde, sinon course perdue d'avance : le profil
    // arrive avant le statut d'admin plateforme (deux requêtes distinctes), et cette redirection
    // tranchait alors sur le seul `profile.role` — un admin plateforme dont le rôle vaut
    // 'admin_etablissement' partait directement vers /admin/prospects une fraction de seconde
    // avant que son statut n'arrive, sans jamais voir l'écran de choix des 3 espaces.
    if (loading || platformAdminLoading || !session) return
    // `next` permet à un point d'entrée transverse aux rôles (ex. /plateforme/*) de retrouver
    // sa destination après connexion — sans lui, la redirection ci-dessous ne connaît que les
    // espaces liés à profiles.role et n'y renverrait jamais un admin plateforme.
    if (next) {
      navigate(next, { replace: true })
      return
    }
    /* Un admin plateforme cumule les 3 espaces (voir ChoixEspace, migration 0022/0023) : on le
       fait TOUJOURS atterrir sur /mon-espace, qui affiche cet écran de choix — demande client du
       2026-09-16, « après chaque connexion réussie, il faut lui demander s'il veut se connecter
       en mode étudiant, professeur ou admin ». Sans ce cas, `profile.role` (une valeur unique,
       ici 'admin_etablissement') l'aurait envoyé tout droit vers /admin/prospects, sans jamais
       lui proposer le choix. */
    if (platformAdmin) {
      navigate('/mon-espace', { replace: true })
    } else if (profile?.role === 'admin_etablissement') {
      navigate('/admin/prospects', { replace: true })
    } else if (profile) {
      navigate('/mon-espace', { replace: true })
    }
  }, [session, profile, loading, platformAdmin, platformAdminLoading, next, navigate])

  async function verifierEmail(e: FormEvent) {
    e.preventDefault()
    const adresse = email.trim().toLowerCase()
    if (!EMAIL_VALIDE.test(adresse)) {
      setErreur('Adresse e-mail invalide.')
      return
    }
    setEnvoi(true)
    setErreur(null)
    const { statut, error } = await fetch('/api/auth/verifier-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adresse }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Vérification impossible. Réessayez dans un instant.' }))
    setEnvoi(false)

    if (error) {
      setErreur(error)
      return
    }
    if (statut === 'inconnu') {
      setEtape('inconnu')
    } else if (statut === 'sans_mot_de_passe') {
      setEtape('sans_mot_de_passe')
    } else {
      setEtape('mot_de_passe')
    }
  }

  async function envoyerLienReinitialisation() {
    setEnvoi(true)
    setErreur(null)
    const { ok, error } = await fetch('/api/auth/mot-de-passe-oublie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: "L'envoi a échoué. Réessayez dans un instant." }))
    setEnvoi(false)

    if (!ok) {
      setErreur(error ?? "L'envoi a échoué. Réessayez dans un instant.")
      return
    }
    setEtape('lien_envoye')
  }

  async function seConnecterAvecMotDePasse(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    setErreur(null)
    const { error } = await seConnecter(email.trim().toLowerCase(), motDePasse)
    setEnvoi(false)
    if (error) {
      setErreur('E-mail ou mot de passe incorrect.')
    }
  }

  function revenirALEmail() {
    setEtape('email')
    setMotDePasse('')
    setErreur(null)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: 24 }}>
      <a href="/">
        <Logo />
      </a>
      <div className="card" style={{ width: '100%', maxWidth: 380, padding: 30, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Demande client du 2026-09-16 : un moyen de revenir à la page Hero sans passer par le
            bouton retour du navigateur — visible à toutes les étapes, pas seulement la première,
            pour qu'une erreur (adresse inconnue, lien expiré) n'enferme jamais l'utilisateur. */}
        <a
          href="/"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', textDecoration: 'none', alignSelf: 'flex-start' }}
        >
          <span aria-hidden style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
            <Icone nom="chevron" taille={13} />
          </span>
          Retour à l’accueil
        </a>

        {etape === 'email' && (
          <form onSubmit={verifierEmail} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h1 style={{ fontSize: 22, color: 'var(--ink)' }}>Se connecter</h1>
            {/* Demande client du 2026-10-07 : dire d'emblée à qui cette page s'adresse. Le message
                existait, mais seulement après la saisie d'une adresse inconnue — un visiteur sans
                compte perdait un aller-retour avant de l'apprendre. */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: '13px 15px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'rgba(0,0,0,.16)',
              }}
            >
              <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-2)', margin: 0 }}>
                <strong style={{ color: 'var(--ink)' }}>Espace réservé aux membres de Hari Online Club.</strong> La
                connexion est destinée à nos élèves et à nos formateurs. Pas encore inscrit&#8239;?
              </p>
              <PortesDEntree />
            </div>
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
            {erreur && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{erreur}</p>}
            <button
              type="submit"
              disabled={envoi}
              className="btn-shine"
              style={{ background: 'var(--accent-blue-gradient)', color: '#fff', padding: '14px', fontSize: 14.5, opacity: envoi ? 0.7 : 1 }}
            >
              {envoi ? 'Vérification…' : 'Continuer'}
            </button>
          </form>
        )}

        {etape === 'inconnu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h1 style={{ fontSize: 22, color: 'var(--ink)' }}>Aucun compte associé à cette adresse</h1>
            {/* Demande client du 2026-10-05 : un visiteur non inscrit qui tombe sur l'écran de
                connexion doit être guidé vers la vitrine plutôt que vers un e-mail de contact —
                « se connecter » n'est pas la bonne porte d'entrée pour quelqu'un qui n'a pas
                encore de compte. */}
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
              L’adresse <strong>{email}</strong> n’est rattachée à aucun compte. L’accès à cet espace est réservé aux
              élèves et aux formateurs de Hari Online Club. Pour nous rejoindre, choisissez la voie qui vous
              correspond :
            </p>
            <PortesDEntree principal />
            <button
              type="button"
              onClick={revenirALEmail}
              style={{ background: 'none', border: 'none', color: 'var(--ink-2)', fontSize: 13, cursor: 'pointer' }}
            >
              Essayer une autre adresse
            </button>
          </div>
        )}

        {etape === 'sans_mot_de_passe' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h1 style={{ fontSize: 22, color: 'var(--ink)' }}>Première connexion</h1>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
              Vous n'avez pas encore défini de mot de passe pour <strong>{email}</strong>. Cliquez ci-dessous pour en
              recevoir un lien par e-mail.
            </p>
            {erreur && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{erreur}</p>}
            <button
              type="button"
              onClick={envoyerLienReinitialisation}
              disabled={envoi}
              className="btn-shine"
              style={{ background: 'var(--accent-blue-gradient)', color: '#fff', padding: '14px', fontSize: 14.5, opacity: envoi ? 0.7 : 1 }}
            >
              {envoi ? 'Envoi…' : 'Réinitialiser mon mot de passe'}
            </button>
            <button
              type="button"
              onClick={revenirALEmail}
              style={{ background: 'none', border: 'none', color: 'var(--ink-2)', fontSize: 13, cursor: 'pointer' }}
            >
              Retour
            </button>
          </div>
        )}

        {etape === 'lien_envoye' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h1 style={{ fontSize: 22, color: 'var(--ink)' }}>E-mail envoyé</h1>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
              Un lien pour définir votre mot de passe vient d'être envoyé à <strong>{email}</strong>. Vérifiez votre
              boîte de réception (et vos spams).
            </p>
            <button
              type="button"
              onClick={revenirALEmail}
              style={{ background: 'none', border: 'none', color: 'var(--ink-2)', fontSize: 13, cursor: 'pointer' }}
            >
              Retour à la connexion
            </button>
          </div>
        )}

        {etape === 'mot_de_passe' && (
          <form onSubmit={seConnecterAvecMotDePasse} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h1 style={{ fontSize: 22, color: 'var(--ink)' }}>Se connecter</h1>
            <p style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: -8 }}>{email}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Mot de passe</label>
              <ChampMotDePasse
                required
                autoFocus
                autoComplete="current-password"
                valeur={motDePasse}
                onValeurChange={setMotDePasse}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <button
                type="button"
                onClick={revenirALEmail}
                style={{ background: 'none', border: 'none', color: 'var(--ink-2)', fontSize: 13, cursor: 'pointer', padding: 0 }}
              >
                Changer d'adresse
              </button>
              <button
                type="button"
                onClick={envoyerLienReinitialisation}
                disabled={envoi}
                style={{ background: 'none', border: 'none', color: 'var(--ink-2)', fontSize: 13, cursor: 'pointer', padding: 0 }}
              >
                Mot de passe oublié ?
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
