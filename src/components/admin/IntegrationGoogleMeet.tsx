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

/* Connexion du compte Google de l'établissement : il porte l'agenda des séances et envoie les
   invitations. Depuis la bascule vers Jitsi (2026-10-07) il ne fournit plus le lien de
   visioconférence — voir src/lib/visio.ts. Un seul compte pour tout l'établissement : les
   professeurs et les élèves n'ont rien à autoriser, ils reçoivent l'invitation et le lien.

   Le jeton lui-même n'est jamais exposé ici : cette page lit une vue qui n'expose que l'e-mail
   connecté et la date (voir migration 0040). */
export function IntegrationGoogleMeet() {
  const { profile, session } = useProfileContext()
  const [parametresUrl, setParametresUrl] = useSearchParams()
  const [statut, setStatut] = useState<StatutGoogle | null>(null)
  const [loading, setLoading] = useState(true)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [bascule, setBascule] = useState<{ enCours: boolean; resultat: string | null }>({ enCours: false, resultat: null })

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

  /* Rattrapage des réunions à venir créées avant la bascule vers Jitsi : elles portent encore un
     lien meet.google.com, fermé aux élèves sans compte Google. Déclenché à la main plutôt
     qu'automatiquement, parce que l'opération renvoie une invitation à jour à chaque participant
     concerné — ce n'est pas quelque chose qui doit partir sans que personne l'ait décidé. */
  async function basculerVersJitsi() {
    if (!session) return
    setBascule({ enCours: true, resultat: null })
    const reponse = await fetch('/api/admin/basculer-visio-jitsi', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const corps = await reponse.json().catch(() => null)
    if (!reponse.ok) {
      setBascule({ enCours: false, resultat: null })
      setErreur(corps?.error ?? 'La bascule a échoué.')
      return
    }
    const nb = corps?.basculees ?? 0
    const nonSync = (corps?.rapport ?? []).filter((r: { calendrier: string }) => r.calendrier !== 'mis a jour').length
    setBascule({
      enCours: false,
      resultat:
        nb === 0
          ? 'Aucune réunion à venir ne portait encore un lien Google Meet : tout est déjà à jour.'
          : `${nb} réunion${nb > 1 ? 's' : ''} basculée${nb > 1 ? 's' : ''} vers Jitsi.` +
            (nonSync > 0
              ? ` ${nonSync} n’${nonSync > 1 ? 'ont' : 'a'} pas pu être mise${nonSync > 1 ? 's' : ''} à jour dans l’agenda Google : prévenez ces participants du nouveau lien.`
              : ' Les participants reçoivent l’invitation à jour par e-mail.'),
    })
  }

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
      titre="Agenda Google et invitations"
      description="Connectez le compte Google de l'établissement : chaque séance planifiée est alors inscrite à son agenda, et Google envoie lui-même l'invitation aux participants. Le lien de visioconférence, lui, est fourni par Jitsi — il s'ouvre sans aucun compte, y compris pour les élèves qui n'en ont pas chez Google."
      style={{ maxWidth: 680 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {retourGoogle === 'ok' && (
          <div onClick={effacerRetour}>
            <MessageSucces>Compte Google connecté. Les prochaines séances seront inscrites à l'agenda, avec invitation aux participants.</MessageSucces>
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
                Dernier incident signalé par Google : {statut.derniere_erreur}. Reconnectez le compte si les séances cessent d'apparaître dans l'agenda.
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

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--ink)' }}>Réunions créées avant le passage à Jitsi.</strong> Celles qui
                restent à venir portent encore un lien Google Meet, inaccessible aux élèves sans compte Google. Ce
                bouton leur donne un lien Jitsi et renvoie l’invitation à jour à leurs participants.
              </p>
              {bascule.resultat && <MessageSucces>{bascule.resultat}</MessageSucces>}
              <button
                type="button"
                onClick={basculerVersJitsi}
                disabled={bascule.enCours}
                style={{ ...boutonNeutreStyle, alignSelf: 'flex-start' }}
              >
                {bascule.enCours ? 'Bascule en cours…' : 'Basculer les réunions à venir vers Jitsi'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.6 }}>
              Aucun compte Google n’est connecté. Les séances continuent d’être planifiées normalement, mais elles ne
              sont inscrites à aucun agenda et aucune invitation n’est envoyée aux participants.
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
            le lien dans leur espace Hari Online Club.
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
