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
   leurs espaces personnels ».

   Lecture seule à l'origine ; devenue lecture ET écriture le 2026-10-09 (0107) sur demande du
   client : « chaque professeur doit synchroniser son agenda gmail avec son agenda de l'application
   HOC : mode écriture et read, avec une synchronisation instantanée et complète ». C'est
   désormais depuis le compte du professeur que partent les réunions de ses cours, et non plus
   depuis celui de l'établissement (voir IntegrationGoogleMeet.tsx, qui reste l'intégration de
   l'établissement pour les rendez-vous de l'administration).

   Montée uniquement dans MonProfil.tsx, pour admin et professeur — jamais pour un étudiant, à qui
   la demande ne s'adresse pas. */
export function IntegrationGoogleCalendarPersonnel() {
  const { session, profile, platformAdmin } = useProfileContext()
  /* L'administrateur voit déjà l'agenda de l'établissement superposé quand il n'a rien connecté
     ici (voir api/google-personnel/evenements.ts) : le dire, sans quoi il croit son agenda muet
     alors qu'il fonctionne. */
  const estAdmin = profile?.role === 'admin_etablissement' || !!platformAdmin
  const { statut, peutEcrire, loading, recharger } = useStatutGoogleCalendarPersonnel()
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
      titre="Mon agenda Google"
      description={
        estAdmin
          ? "Connectez votre propre compte Gmail : son agenda et celui de Hari Online Club restent synchronisés dans les deux sens, en lecture comme en écriture."
          : "Connectez votre compte Gmail professionnel : votre agenda Google et celui de Hari Online Club restent synchronisés dans les deux sens. C’est depuis ce compte que seront créées les réunions de vos cours et envoyées les invitations à vos élèves."
      }
      style={{ maxWidth: 680 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {retourGoogle === 'ok' && (
          <div onClick={effacerRetour}>
            <MessageSucces>
              Compte Google connecté. Votre agenda apparaît désormais dans votre calendrier Hari Online Club, et ce
              que vous y modifiez part aussitôt sur Google.
            </MessageSucces>
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
            <LigneInfo
              label="Synchronisation"
              valeur={peutEcrire ? 'Lecture et écriture' : 'Lecture seule'}
            />
            {/* Un compte branché avant le 2026-10-09 n'a que la lecture, et Google n'élargit pas
                un scope déjà accordé : il faut repasser par son écran de consentement. Dit
                explicitement, sinon le professeur croit la synchronisation complète alors que ses
                cours continuent d'être créés par le compte de l'établissement. */}
            {!peutEcrire && (
              <MessageErreur>
                Ce compte a été connecté en <strong>lecture seule</strong> : Hari Online Club peut afficher votre agenda,
                mais pas y écrire. {estAdmin ? '' : 'Les réunions de vos cours partent donc encore du compte de l’établissement. '}
                Cliquez « Reconnecter un autre compte » ci-dessous et, sur l’écran Google, cochez la permission de{' '}
                <strong>modification des événements de vos agendas</strong>.
              </MessageErreur>
            )}
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
              {estAdmin
                ? 'Aucun compte Google personnel n’est connecté. Votre agenda Hari Online Club affiche donc, en plus de vos séances et rendez-vous, les événements de l’agenda Google de l’établissement. Connectez un compte ci-dessous uniquement si vous voulez y superposer un AUTRE agenda que celui-là.'
                : 'Aucun compte Google n’est connecté. Votre agenda Hari Online Club ne montre que vos séances et rendez-vous HOC, et les réunions de vos cours sont créées par le compte de l’établissement — vos élèves reçoivent donc leurs invitations de sa part, pas de la vôtre.'}
            </p>
            <button type="button" onClick={connecter} disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, alignSelf: 'flex-start' }}>
              {enCours ? 'Ouverture de Google…' : 'Connecter mon agenda Google'}
            </button>
          </>
        )}

        <MessageInfo>
          Hari Online Club n’écrit dans votre agenda que ce que vous y faites depuis l’application : les réunions des
          cours que vous planifiez, et les événements que vous créez ou modifiez depuis votre agenda HOC. Vos autres
          événements Google sont affichés sans jamais être touchés, et vous seul les voyez — ni vos collègues, ni vos
          élèves n’y ont accès.
        </MessageInfo>
      </div>
    </Section>
  )
}
