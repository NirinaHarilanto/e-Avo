import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { useStatutGoogleCalendarPersonnel } from '../../hooks/useGoogleCalendarPersonnel'
import { useDemandeAgendaGoogle } from '../../hooks/useDemandeAgendaGoogle'
import { useRepriseReunionsGoogle } from '../../hooks/useRepriseReunionsGoogle'
import { ConfirmerAdresseGoogleModale } from './ConfirmerAdresseGoogleModale'
import { Section } from '../ui/Section'
import { Modale } from '../ui/Modale'
import { Champ, champStyle, LigneInfo } from '../ui/Champ'
import { MessageAvertissement, MessageErreur, MessageInfo, MessageSucces, EtatChargement } from '../ui/Etats'
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

   Deux règles ajoutées le 2026-10-10 (0112), à la demande du client :
     - l'adresse à connecter est CONFIRMÉE dans un pop-up avant le départ vers Google, puis
       vérifiée au retour (voir ConfirmerAdresseGoogleModale) ;
     - un professeur est libre de sa PREMIÈRE connexion, mais tout CHANGEMENT d'adresse passe par
       l'accord de l'administration — il en fait la demande ici, l'admin seul la tranche.

   Montée uniquement dans MonProfil.tsx, pour admin et professeur — jamais pour un étudiant, à qui
   la demande ne s'adresse pas. */
export function IntegrationGoogleCalendarPersonnel() {
  const { session, profile, platformAdmin } = useProfileContext()
  /* L'administrateur voit déjà l'agenda de l'établissement superposé quand il n'a rien connecté
     ici (voir api/google-personnel/evenements.ts) : le dire, sans quoi il croit son agenda muet
     alors qu'il fonctionne. */
  const estAdmin = profile?.role === 'admin_etablissement' || !!platformAdmin
  const { statut, peutEcrire, loading, recharger } = useStatutGoogleCalendarPersonnel()
  const { demande, derniereRefusee, recharger: rechargerDemande } = useDemandeAgendaGoogle()
  const { etat: reprise, reprendre } = useRepriseReunionsGoogle()
  const [parametresUrl, setParametresUrl] = useSearchParams()
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [confirmationOuverte, setConfirmationOuverte] = useState(false)
  const [demandeOuverte, setDemandeOuverte] = useState(false)

  const retourGoogle = parametresUrl.get('google')
  const messageRetour = parametresUrl.get('message')

  /* Un changement d'adresse est autorisé et pas encore utilisé : la connexion se relance
     librement, mais seulement vers l'adresse approuvée (le serveur le revérifie). */
  const changementAutorise = demande?.statut === 'approuvee' ? demande : null

  /* « Reconnecter mon agenda » grisé dès que l'intégration est pleinement en ordre — demande
     client du 2026-10-10 : rien ne justifie de relancer l'écran de consentement Google quand tout
     fonctionne déjà, et un clic malheureux (mauvais compte choisi, deuxième consentement du même
     compte) resterait un risque gratuit tant que l'application n'a pas la validation officielle de
     Google (chaque compte distinct qui passe cet écran coûte une place définitive du quota).
     Réactivé automatiquement à la déconnexion, puisque `statut` devient alors null et fait basculer
     vers l'autre branche du rendu (bouton « Connecter mon agenda Google », jamais désactivé ici).

     Volontairement PAS désactivé en lecture seule ni en incident (`derniere_erreur`) : dans ces
     deux cas, cliquer CE MÊME bouton pour reconnecter la MÊME adresse est le geste de réparation
     explicitement indiqué par les messages ci-dessous — le seul chemin sans validation
     administrative pour un professeur, puisque se déconnecter d'abord lui serait refusé (0112). Le
     désactiver aussi dans ces cas couperait la seule façon de réparer une synchronisation cassée. */
  const integrationPleinementEnOrdre = !!statut && peutEcrire && !statut.derniere_erreur && !changementAutorise

  const connecter = useCallback(
    async (adresseAttendue: string) => {
      if (!session) return
      setEnCours(true)
      setErreur(null)
      const reponse = await fetch('/api/google-personnel/demarrer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ adresseAttendue }),
      })
      const corps = await reponse.json().catch(() => null)
      if (!reponse.ok || !corps?.url) {
        setEnCours(false)
        setErreur(corps?.error ?? 'Impossible de démarrer la connexion Google.')
        /* Un refus pour défaut d'autorisation renvoie vers le bon geste au lieu de laisser le
           professeur buter sur le même bouton : la fenêtre de demande s'ouvre d'elle-même. */
        if (corps?.changementARequerir) {
          setConfirmationOuverte(false)
          setDemandeOuverte(true)
        }
        return
      }
      // Même choix que l'intégration d'établissement : navigation plein écran, pas de pop-up
      // (Google refuse son écran de consentement en iframe, et les bloqueurs de pop-up cassent le
      // parcours).
      window.location.href = corps.url
    },
    [session],
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
    /* « complet » : au sortir d'une connexion, on vérifie aussi que les réunions déjà à son nom
       existent encore chez Google — le seul moment où ce coût se justifie. */
    reprendre('complet')
  }, [estAdmin, retourGoogle, session, reprendre])

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
      if (corps?.changementARequerir) setDemandeOuverte(true)
      return
    }
    recharger()
    rechargerDemande()
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
        {retourGoogle === 'erreur' && (
          <div onClick={effacerRetour}>
            <MessageErreur>{messageRetour ?? 'La connexion Google a échoué.'}</MessageErreur>
          </div>
        )}
        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        {/* Compte rendu de la reprise lancée juste après la connexion (voir
            useRepriseReunionsGoogle) : sans lui, le professeur n'aurait aucun moyen de savoir que
            ses cours déjà planifiés sont passés sous son nom — ni qu'ils ne l'ont pas été. */}
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
                Cliquez « Reconnecter mon agenda » ci-dessous et, sur l’écran Google, cochez la permission de{' '}
                <strong>modification des événements de vos agendas</strong>.
              </MessageErreur>
            )}
            {statut.derniere_erreur && (
              <MessageErreur>
                Dernier incident signalé par Google : {statut.derniere_erreur}. Reconnectez votre compte si votre agenda
                personnel ne s’affiche plus.
              </MessageErreur>
            )}

            {/* État de la demande de changement, côté professeur (0112). */}
            {!estAdmin && demande?.statut === 'en_attente' && (
              <MessageInfo>
                Votre demande de passage à <strong>{demande.google_email_souhaite}</strong> est en attente de validation
                par l’administration. Vous serez prévenu dès qu’elle aura répondu.
              </MessageInfo>
            )}
            {!estAdmin && changementAutorise && (
              <MessageSucces>
                L’administration a autorisé le passage à <strong>{changementAutorise.google_email_souhaite}</strong>.
                Cliquez « Connecter l’adresse autorisée » ci-dessous : l’autorisation ne vaut que pour cette adresse, et
                pour une seule connexion.
              </MessageSucces>
            )}
            {!estAdmin && !demande && derniereRefusee && (
              <MessageAvertissement>
                Votre demande de passage à {derniereRefusee.google_email_souhaite} a été refusée par l’administration.
                {derniereRefusee.motif_refus ? ` Motif : ${derniereRefusee.motif_refus}` : ''}
              </MessageAvertissement>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setConfirmationOuverte(true)}
                disabled={enCours || integrationPleinementEnOrdre}
                title={integrationPleinementEnOrdre ? 'Votre agenda est déjà synchronisé : rien à reconnecter.' : undefined}
                className="btn-shine"
                style={{ ...boutonPrimaireStyle, opacity: integrationPleinementEnOrdre ? 0.45 : 1, cursor: integrationPleinementEnOrdre ? 'not-allowed' : 'pointer' }}
              >
                {changementAutorise ? 'Connecter l’adresse autorisée' : 'Reconnecter mon agenda'}
              </button>
              {/* Un professeur ne change pas d'adresse seul (0112) : le bouton devient une demande.
                  L'admin, autorité de validation, garde la reconnexion libre d'un autre compte. */}
              {!estAdmin && !changementAutorise && demande?.statut !== 'en_attente' && (
                <button type="button" onClick={() => setDemandeOuverte(true)} disabled={enCours} style={boutonSecondaireStyle}>
                  Demander un changement d’adresse
                </button>
              )}
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
            <button
              type="button"
              onClick={() => setConfirmationOuverte(true)}
              disabled={enCours}
              className="btn-shine"
              style={{ ...boutonPrimaireStyle, alignSelf: 'flex-start' }}
            >
              Connecter mon agenda Google
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

        {/* Instruction affichée dans les deux espaces personnels (demande client du 2026-10-10,
            raccourcie le même jour) : le motif détaillé (quota Google) reste réservé à l'écran
            Paramètres de l'admin (AgendasProfesseursAdmin.tsx), qui a le contexte pour s'y
            attarder ; ici, seule la règle de comportement est annoncée. */}
        <MessageAvertissement>
          <strong>Une adresse par personne, choisie une fois pour toutes.</strong> L’adresse est confirmée avant
          chaque connexion, et un changement d’adresse demande l’accord de l’administration.
        </MessageAvertissement>
      </div>

      {confirmationOuverte && (
        <ConfirmerAdresseGoogleModale
          adresseSuggeree={changementAutorise?.google_email_souhaite ?? profile?.email}
          adresseActuelle={changementAutorise ? null : (statut?.google_email ?? null)}
          enCours={enCours}
          erreur={erreur}
          onConfirmer={connecter}
          onFermer={() => {
            setConfirmationOuverte(false)
            setErreur(null)
          }}
        />
      )}

      {demandeOuverte && (
        <DemanderChangementModale
          adresseActuelle={statut?.google_email ?? null}
          onFermer={() => setDemandeOuverte(false)}
          onEnvoye={() => {
            setDemandeOuverte(false)
            setErreur(null)
            rechargerDemande()
          }}
        />
      )}
    </Section>
  )
}

/* Demande d'autorisation de changer l'adresse Gmail reliée — « le professeur pourra faire une
   demande à l'admin depuis son espace personnel professeur, mais la validation sera faite
   uniquement par l'admin » (0112). Passe par une route serveur, qui prévient les administrateurs :
   une demande que personne ne voit ne serait jamais traitée. */
function DemanderChangementModale({
  adresseActuelle,
  onFermer,
  onEnvoye,
}: {
  adresseActuelle: string | null
  onFermer: () => void
  onEnvoye: () => void
}) {
  const { session } = useProfileContext()
  const [adresse, setAdresse] = useState('')
  const [motif, setMotif] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const valide = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresse.trim())

  async function envoyer() {
    if (!session || !valide) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/google-personnel/demander-changement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ googleEmailSouhaite: adresse.trim(), motif: motif.trim() || undefined }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'L’envoi de la demande a échoué.')
      return
    }
    onEnvoye()
  }

  return (
    <Modale titre="Demander un changement d’adresse" onFermer={onFermer} largeurMax={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <MessageInfo>
          L’adresse reliée à votre agenda est celle qui organise vos cours et invite vos élèves : elle ne peut être
          remplacée qu’avec l’accord de l’administration. Décrivez votre demande ci-dessous — vous serez prévenu dès
          qu’elle aura répondu, et vous pourrez alors lancer la connexion vous-même.
        </MessageInfo>

        {adresseActuelle && <LigneInfo label="Adresse actuelle" valeur={adresseActuelle} />}

        <Champ label="Nouvelle adresse Gmail souhaitée">
          <input
            autoFocus
            type="email"
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            placeholder="prenom.nom@gmail.com"
            style={champStyle}
          />
        </Champ>

        <Champ label="Raison du changement (facultatif)">
          <textarea
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            rows={3}
            placeholder="Ex. je n’ai plus accès à mon ancienne adresse"
            style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Champ>

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onFermer} disabled={enCours} style={boutonNeutreStyle}>
            Annuler
          </button>
          <button
            type="button"
            onClick={envoyer}
            disabled={!valide || enCours}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, opacity: !valide || enCours ? 0.6 : 1 }}
          >
            {enCours ? 'Envoi…' : 'Envoyer la demande'}
          </button>
        </div>
      </div>
    </Modale>
  )
}
