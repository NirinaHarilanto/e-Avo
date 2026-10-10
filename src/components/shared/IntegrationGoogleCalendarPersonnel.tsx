import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { useStatutGoogleCalendarPersonnel } from '../../hooks/useGoogleCalendarPersonnel'
import { Section } from '../ui/Section'
import { LigneInfo } from '../ui/Champ'
import { MessageErreur, MessageInfo, MessageSucces, EtatChargement } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'

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
  /* Reprise des réunions déjà planifiées vers le compte qui vient d'être connecté : « en cours »,
     puis le compte rendu affiché à l'écran. Voir `reprendreReunions`. */
  const [reprise, setReprise] = useState<'en_cours' | { adoptees: number } | { erreur: string } | null>(null)

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

  /* Fait passer dans le compte qui vient d'être connecté les réunions à venir encore hébergées par
     celui de l'établissement (api/google-personnel/adopter-seances.ts).

     Appelée AUTOMATIQUEMENT au retour de l'écran Google — exigence client du 2026-10-10 : « pour
     les futurs professeurs il faut que cela s'affiche du premier coup et la synchronisation se
     fasse efficacement et rapidement, sans intervention de l'équipe de développement ». Avant, un
     professeur qui connectait son agenda voyait bien ses événements Google, mais ses cours déjà
     planifiés continuaient de partir de l'adresse de l'administration jusqu'à ce qu'un admin pense
     à cliquer « Mettre à jour les réunions à venir » dans Paramètres.

     Rappelée tant que le serveur signale du travail restant : la route est bornée par le temps
     d'exécution d'une fonction edge, pas par le nombre de réunions. */
  const reprendreReunions = useCallback(
    async (jeton: string): Promise<void> => {
      setReprise('en_cours')
      let total = 0
      for (let passage = 0; passage < 10; passage += 1) {
        const reponse = await fetch('/api/google-personnel/adopter-seances', {
          method: 'POST',
          headers: { Authorization: `Bearer ${jeton}` },
        }).catch(() => null)
        const corps = (await reponse?.json().catch(() => null)) as
          | { adoptees?: number; restant?: number; error?: string }
          | null
        if (!reponse?.ok) {
          setReprise({ erreur: corps?.error ?? 'La reprise de vos réunions à venir a échoué.' })
          return
        }
        total += corps?.adoptees ?? 0
        if (!corps?.restant) break
      }
      setReprise({ adoptees: total })
    },
    [],
  )

  /* Un seul déclenchement par retour Google, même si le composant se remonte (React StrictMode
     monte deux fois en développement, et une navigation peut le reconstruire) : sans ce verrou,
     deux reprises simultanées recréeraient le même événement deux fois dans l'agenda. */
  const repriseLancee = useRef(false)
  useEffect(() => {
    /* Rien à reprendre pour un administrateur : il n'est le professeur d'aucune séance, et
       l'agenda de l'établissement est déjà le sien. Lui annoncer une reprise sans objet ne ferait
       qu'ajouter du bruit à son écran. */
    if (estAdmin || retourGoogle !== 'ok' || !session || repriseLancee.current) return
    repriseLancee.current = true
    reprendreReunions(session.access_token)
  }, [estAdmin, retourGoogle, session, reprendreReunions])

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
          ? "Connectez votre propre compte Gmail : son agenda et celui de Hari Online Club n’en font plus qu’un, en lecture comme en écriture."
          : "Connectez votre compte Gmail : son agenda et celui de Hari Online Club n’en font plus qu’un. Vous y créez, modifiez et supprimez vos événements indifféremment d’un côté ou de l’autre, et c’est depuis ce compte que partent les réunions de vos cours et les invitations à vos élèves."
      }
      style={{ maxWidth: 680 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {retourGoogle === 'ok' && (
          <div onClick={effacerRetour}>
            <MessageSucces>
              Compte Google connecté. Votre agenda apparaît désormais dans votre agenda Hari Online Club, et ce
              que vous y modifiez part aussitôt sur Google.
            </MessageSucces>
          </div>
        )}

        {/* Compte rendu de la reprise lancée juste après la connexion (voir `reprendreReunions`) :
            sans lui, le professeur n'aurait aucun moyen de savoir que ses cours déjà planifiés sont
            passés sous son nom — ni qu'ils ne l'ont pas été. */}
        {reprise === 'en_cours' && (
          <MessageInfo>Reprise de vos réunions à venir dans votre agenda… Laissez cette page ouverte un instant.</MessageInfo>
        )}
        {reprise && reprise !== 'en_cours' && 'adoptees' in reprise && (
          <MessageSucces>
            {reprise.adoptees === 0
              ? 'Vos réunions à venir étaient déjà organisées depuis votre compte : rien à reprendre.'
              : `${reprise.adoptees} réunion${reprise.adoptees > 1 ? 's' : ''} à venir ${reprise.adoptees > 1 ? 'sont désormais organisées' : 'est désormais organisée'} depuis votre compte. Vos participants ont reçu l’invitation à jour de votre part.`}
          </MessageSucces>
        )}
        {reprise && reprise !== 'en_cours' && 'erreur' in reprise && <MessageErreur>{reprise.erreur}</MessageErreur>}
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
              {/* Même geste que celui lancé automatiquement à la connexion, laissé à portée de
                  main : un incident Google passager ne doit pas obliger à se déconnecter puis se
                  reconnecter pour réessayer, ni à solliciter l'administration. */}
              {peutEcrire && !estAdmin && (
                <button
                  type="button"
                  onClick={() => session && reprendreReunions(session.access_token)}
                  disabled={enCours || reprise === 'en_cours'}
                  style={boutonSecondaireStyle}
                >
                  {reprise === 'en_cours' ? 'Reprise en cours…' : 'Reprendre mes réunions à venir'}
                </button>
              )}
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
          Les deux agendas n’en font plus qu’un : <strong>tous</strong> vos événements Google apparaissent dans votre
          agenda Hari Online Club, y compris ceux que vous avez créés depuis Gmail, et vous pouvez les y{' '}
          <strong>ouvrir, modifier, déplacer et supprimer</strong> — séries récurrentes comprises. Chaque changement part
          aussitôt sur Google, dans les deux sens. Seuls les cours et rendez-vous nés dans HOC gardent leur propre fiche,
          parce qu’elle commande aussi les heures, les présences et les notifications de vos élèves.
          {' '}Votre agenda ne reste visible que de vous : ni vos collègues, ni vos élèves n’y ont accès.
        </MessageInfo>
      </div>
    </Section>
  )
}
