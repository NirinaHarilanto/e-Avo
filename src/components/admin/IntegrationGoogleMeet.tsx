import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { Section } from '../ui/Section'
import { LigneInfo } from '../ui/Champ'
import { MessageErreur, MessageInfo, MessageSucces, EtatChargement } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'

type StatutGoogle = Database['public']['Views']['google_integration_statut']['Row']

/* Connexion du compte Google de l'établissement, d'où sortiront tous les liens Meet des séances.
   Un seul compte pour tout l'établissement : les professeurs et les élèves n'ont rien à
   autoriser, ils reçoivent l'invitation et le lien.

   Le jeton lui-même n'est jamais exposé ici : cette page lit une vue qui n'expose que l'e-mail
   connecté et la date (voir migration 0040). */
export function IntegrationGoogleMeet() {
  const { profile, session } = useProfileContext()
  const [parametresUrl, setParametresUrl] = useSearchParams()
  const [statut, setStatut] = useState<StatutGoogle | null>(null)
  const [loading, setLoading] = useState(true)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const retourGoogle = parametresUrl.get('google')
  const messageRetour = parametresUrl.get('message')

  const charger = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase.from('google_integration_statut').select('*').maybeSingle()
    setStatut(data)
    setLoading(false)
  }, [profile])

  useEffect(() => {
    charger()
  }, [charger])

  async function connecter() {
    if (!session) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/google-oauth-demarrer', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const corps = await reponse.json().catch(() => null)
    if (!reponse.ok || !corps?.url) {
      setEnCours(false)
      setErreur(corps?.error ?? 'Impossible de démarrer la connexion Google.')
      return
    }
    // Navigation plein écran plutôt qu'une fenêtre surgissante : Google refuse d'afficher son
    // écran de consentement dans une iframe, et les bloqueurs de pop-up cassent le parcours.
    window.location.href = corps.url
  }

  async function deconnecter() {
    if (!session) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/google-deconnecter', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'La déconnexion a échoué.')
      return
    }
    setStatut(null)
  }

  function effacerRetour() {
    parametresUrl.delete('google')
    parametresUrl.delete('message')
    setParametresUrl(parametresUrl, { replace: true })
  }

  if (loading) return <EtatChargement lignes={1} hauteur={180} />

  return (
    <Section
      titre="Visioconférence Google Meet"
      description="Connectez le compte Google de l'établissement : chaque séance planifiée recevra alors automatiquement son lien Meet, sans aucune manipulation de votre part ni de celle des professeurs."
      style={{ maxWidth: 680 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {retourGoogle === 'ok' && (
          <div onClick={effacerRetour}>
            <MessageSucces>Compte Google connecté. Les prochaines séances auront leur lien Meet.</MessageSucces>
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
                Dernier incident signalé par Google : {statut.derniere_erreur}. Reconnectez le compte si les liens Meet
                ne se créent plus.
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
              Aucun compte Google n’est connecté. Les séances continuent d’être planifiées normalement, avec un lien de
              visioconférence interne à la place d’un lien Meet.
            </p>
            <button type="button" onClick={connecter} disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, alignSelf: 'flex-start' }}>
              {enCours ? 'Ouverture de Google…' : 'Connecter Google Calendar'}
            </button>
          </>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.65, borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
          <p style={{ margin: 0 }}>
            Chaque séance planifiée crée un événement dans l’agenda Google de ce compte, avec une réunion Meet. Le
            professeur et les élèves sont ajoutés comme invités : ils reçoivent l’invitation par e-mail et retrouvent
            le lien dans leur espace e-Avo.
          </p>
          <p style={{ margin: 0 }}>
            Une séance reprogrammée déplace l’événement Google sans changer le lien ; une séance annulée supprime
            l’événement et prévient les invités.
          </p>
          <MessageInfo>
            Sur un compte Gmail gratuit, une réunion Meet réunissant 3 personnes ou plus est coupée au bout de 60
            minutes. Un cours individuel (professeur + 1 élève) n’a aucune limite de durée. Pour des cours collectifs de
            plus d’une heure sans coupure, il faut un compte Google Workspace payant, qui se connecte exactement de la
            même façon.
          </MessageInfo>
        </div>
      </div>
    </Section>
  )
}
