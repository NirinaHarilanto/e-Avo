import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { ChampMotDePasse } from '../shared/ChampMotDePasse'
import { useFondVitrine } from '../vitrine/animations'
import { FlecheBouton } from '../vitrine/IconesHX'

type Etape = 'email' | 'inconnu' | 'sans_mot_de_passe' | 'lien_envoye' | 'mot_de_passe'

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* Connexion, d'après hoc-connexion.html : panneau violet à gauche, formulaire sur fond blanc
   lavande à droite.

   La maquette ne dessine que la première étape, un champ e-mail et un bouton « Continuer ». Le
   parcours réel en compte cinq (adresse inconnue, première connexion sans mot de passe, lien
   envoyé, saisie du mot de passe) : toutes vivent dans la colonne de droite, le panneau de
   gauche ne bougeant jamais.

   L'encart « Espace réservé aux membres » passe sous le formulaire, à la place que lui donne la
   maquette — il était au-dessus du titre depuis le 2026-10-07. */

/* ChampMotDePasse est écrit pour le thème sombre des espaces connectés et pose ses couleurs en
   style inline, qu'aucune règle CSS ne peut reprendre. On lui passe donc ici l'habillage clair
   de la maquette ; la pastille de l'œil, elle, est rattrapée en CSS (voir vitrine-hx.css). */
const CHAMP_CLAIR: CSSProperties = {
  width: '100%',
  margin: '8px 0 0',
  border: '1.5px solid #E5DAF8',
  borderRadius: 16,
  padding: '15px 48px 15px 18px',
  fontSize: 15,
  fontWeight: 500,
  color: '#49306A',
  background: '#FEFFFA',
  fontFamily: 'inherit',
}

/* Les deux seules façons d'entrer chez HOC quand on n'a pas de compte : suivre un cours, ou en
   donner. Mêmes pastilles que la maquette (`.a1` pleine, `.a2` contournée). */
function PortesDEntree() {
  return (
    <div className="btns">
      <a className="a1" href="/cours">
        Découvrir nos cours
      </a>
      <a className="a2" href="/rejoignez-nous">
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

  useFondVitrine('#F7F4FF')

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
    <div className="hx">
      <div className="ecran-connexion">
        <aside className="dark side">
          <div className="glow g1" />
          <div className="glow g2" />
          <div className="spot" />
          <div className="grain" />
          <a className="logo" href="/">
            <img src="/logo-hoc-blanc.png" alt="Hari Online Club" />
          </a>
          <p className="big reveal in">
            <span className="line">
              <span>Your English,</span>
            </span>
            <span className="line">
              <span className="it" style={{ transitionDelay: '.12s' }}>
                your future
              </span>
            </span>
          </p>
        </aside>

        <main className="main">
          <div className="carte-connexion rv in">
            {/* Visible à toutes les étapes, pas seulement la première : une erreur (adresse
                inconnue, lien expiré) ne doit jamais enfermer le visiteur sur cet écran. */}
            <a className="back" href="/">
              <i>←</i>Retour à l’accueil
            </a>

            {etape === 'email' && (
              <>
                <h1 className="h-xl">Se connecter</h1>
                <form onSubmit={verifierEmail}>
                  <label className="f">
                    E-mail
                    <input type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </label>
                  {erreur && <p className="err show">{erreur}</p>}
                  <button type="submit" className="btn btn-gold go" disabled={envoi}>
                    {envoi ? 'Vérification…' : 'Continuer'} <FlecheBouton />
                  </button>
                </form>
                <div className="note">
                  <p>
                    <b>Espace réservé aux membres de Hari Online Club.</b> La connexion est destinée à nos élèves et à
                    nos formateurs. Pas encore inscrit&#8239;?
                  </p>
                  <PortesDEntree />
                </div>
              </>
            )}

            {etape === 'inconnu' && (
              <>
                <h1 className="h-xl">Aucun compte associé à cette adresse</h1>
                <p>
                  L’adresse <b>{email}</b> n’est rattachée à aucun compte. L’accès à cet espace est réservé aux élèves
                  et aux formateurs de Hari Online Club. Pour nous rejoindre, choisissez la voie qui vous correspond :
                </p>
                <div className="note">
                  <PortesDEntree />
                </div>
                <div className="liens-secondaires">
                  <button type="button" className="lien-discret" onClick={revenirALEmail}>
                    Essayer une autre adresse
                  </button>
                </div>
              </>
            )}

            {etape === 'sans_mot_de_passe' && (
              <>
                <h1 className="h-xl">Première connexion</h1>
                <p>
                  Vous n’avez pas encore défini de mot de passe pour <b>{email}</b>. Cliquez ci-dessous pour en recevoir
                  un lien par e-mail.
                </p>
                {erreur && <p className="err show">{erreur}</p>}
                <button type="button" className="btn btn-gold go" disabled={envoi} onClick={envoyerLienReinitialisation}>
                  {envoi ? 'Envoi…' : 'Réinitialiser mon mot de passe'} <FlecheBouton />
                </button>
                <div className="liens-secondaires">
                  <button type="button" className="lien-discret" onClick={revenirALEmail}>
                    Retour
                  </button>
                </div>
              </>
            )}

            {etape === 'lien_envoye' && (
              <>
                <h1 className="h-xl">E-mail envoyé</h1>
                <p>
                  Un lien pour définir votre mot de passe vient d’être envoyé à <b>{email}</b>. Vérifiez votre boîte de
                  réception (et vos spams).
                </p>
                <div className="liens-secondaires">
                  <button type="button" className="lien-discret" onClick={revenirALEmail}>
                    Retour à la connexion
                  </button>
                </div>
              </>
            )}

            {etape === 'mot_de_passe' && (
              <>
                <h1 className="h-xl">Se connecter</h1>
                <p style={{ marginTop: -18 }}>{email}</p>
                <form onSubmit={seConnecterAvecMotDePasse}>
                  <label className="f">
                    Mot de passe
                    <ChampMotDePasse
                      required
                      autoFocus
                      autoComplete="current-password"
                      valeur={motDePasse}
                      onValeurChange={setMotDePasse}
                      style={CHAMP_CLAIR}
                    />
                  </label>
                  {erreur && <p className="err show">{erreur}</p>}
                  <button type="submit" className="btn btn-gold go" disabled={envoi}>
                    {envoi ? 'Connexion…' : 'Se connecter'} <FlecheBouton />
                  </button>
                </form>
                <div className="liens-secondaires">
                  <button type="button" className="lien-discret" onClick={revenirALEmail}>
                    Changer d’adresse
                  </button>
                  <button type="button" className="lien-discret" disabled={envoi} onClick={envoyerLienReinitialisation}>
                    Mot de passe oublié ?
                  </button>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
