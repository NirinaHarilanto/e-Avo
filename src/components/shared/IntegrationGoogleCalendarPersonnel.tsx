import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { useStatutGoogleCalendarPersonnel } from '../../hooks/useGoogleCalendarPersonnel'
import { Section } from '../ui/Section'
import { LigneInfo } from '../ui/Champ'
import { MessageErreur, MessageInfo, MessageSucces, EtatChargement } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'

/* Connexion du Google Calendar PERSONNEL de la personne connectée (0098, demande client du
   2026-10-05) : « chaque professeur et admin [...] connecté[s] [...] avec son propre agenda dans
   leurs espaces personnels ». Choix retenu parmi plusieurs proposés au client : affichage en
   SUPERPOSITION dans l'agenda HOC, lecture seule — rien ne part de HOC vers Google ici (voir
   IntegrationGoogleMeet.tsx pour l'intégration d'établissement, qui elle crée des liens Meet).

   Montée uniquement dans MonProfil.tsx, pour admin et professeur — jamais pour un étudiant, à qui
   la demande ne s'adresse pas. */
export function IntegrationGoogleCalendarPersonnel() {
  const { session } = useProfileContext()
  const { statut, loading, recharger } = useStatutGoogleCalendarPersonnel()
  const [parametresUrl, setParametresUrl] = useSearchParams()
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const retourGoogle = parametresUrl.get('google')
  const messageRetour = parametresUrl.get('message')

  const connecter = useCallback(async () => {
    if (!session) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/google-personnel/demarrer', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const corps = await reponse.json().catch(() => null)
    if (!reponse.ok || !corps?.url) {
      setEnCours(false)
      setErreur(corps?.error ?? 'Impossible de démarrer la connexion Google.')
      return
    }
    // Même choix que l'intégration d'établissement : navigation plein écran, pas de pop-up
    // (Google refuse son écran de consentement en iframe, et les bloqueurs de pop-up cassent le
    // parcours).
    window.location.href = corps.url
  }, [session])

  async function deconnecter() {
    if (!session) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/google-personnel/deconnecter', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'La déconnexion a échoué.')
      return
    }
    recharger()
  }

  function effacerRetour() {
    parametresUrl.delete('google')
    parametresUrl.delete('message')
    setParametresUrl(parametresUrl, { replace: true })
    recharger()
  }

  if (loading) return <EtatChargement lignes={1} hauteur={140} />

  return (
    <Section
      titre="Mon agenda Google personnel"
      description="Connectez votre propre compte Gmail : vos événements personnels Google apparaissent alors en superposition, en lecture seule, dans votre agenda Hari Online Club — rien n'est modifié ni créé de votre côté sur Google."
      style={{ maxWidth: 680 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {retourGoogle === 'ok' && (
          <div onClick={effacerRetour}>
            <MessageSucces>Compte Google connecté. Votre agenda personnel apparaît désormais dans votre calendrier.</MessageSucces>
          </div>
        )}
        {retourGoogle === 'erreur' && (
          <div onClick={effacerRetour}>
            <MessageErreur>{messageRetour ?? 'La connexion Google a échoué.'}</MessageErreur>
          </div>
        )}
        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        {statut ? (
          <>
            <LigneInfo label="Compte connecté" valeur={statut.google_email} />
            <LigneInfo label="Connecté le" valeur={new Date(statut.connecte_le).toLocaleDateString('fr-FR', { dateStyle: 'long' })} />
            {statut.derniere_erreur && (
              <MessageErreur>
                Dernier incident signalé par Google : {statut.derniere_erreur}. Reconnectez votre compte si votre agenda
                personnel ne s’affiche plus.
              </MessageErreur>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={connecter} disabled={enCours} className="btn-shine" style={boutonPrimaireStyle}>
                Reconnecter un autre compte
              </button>
              <button type="button" onClick={deconnecter} disabled={enCours} style={{ ...boutonNeutreStyle, color: 'var(--danger)' }}>
                Déconnecter
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.6 }}>
              Aucun compte Google personnel n’est connecté. Votre agenda Hari Online Club ne montre que vos séances et
              rendez-vous HOC.
            </p>
            <button type="button" onClick={connecter} disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, alignSelf: 'flex-start' }}>
              {enCours ? 'Ouverture de Google…' : 'Connecter mon agenda Google'}
            </button>
          </>
        )}

        <MessageInfo>
          Lecture seule : rien n’est jamais créé, modifié ni supprimé sur votre compte Google. Seuls vous voyez vos
          propres événements personnels — ni vos collègues, ni vos élèves n’y ont accès.
        </MessageInfo>
      </div>
    </Section>
  )
}
