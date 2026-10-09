import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { Section } from '../ui/Section'
import { MessageSucces } from '../ui/Etats'
import { boutonNeutreStyle } from '../ui/Boutons'
import { ModaleConfirmation } from '../ui/ModaleConfirmation'

/* Retrait des séances individuelles/duo d'un professeur de l'agenda Google de l'établissement
   (0107, demande client du 2026-10-10) — voir api/admin/detacher-visio-etablissement.ts pour la
   règle complète. N'apparaît que lorsqu'il y a effectivement quelque chose à détacher : un
   professeur qui a déjà connecté son propre agenda, ou qui n'a aucune séance à venir, ne doit pas
   voir ce bloc. */
export function DetacherVisioEtablissement({
  teacherId,
  nombreSeances,
  onDetache,
}: {
  teacherId: string
  nombreSeances: number
  onDetache: () => void
}) {
  const { session } = useProfileContext()
  const [confirmationOuverte, setConfirmationOuverte] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [resultat, setResultat] = useState<string | null>(null)

  if (nombreSeances === 0) return null

  /* Boucle d'appels jusqu'à épuisement, même mécanique que « Mettre à jour les réunions à venir »
     (IntegrationGoogleMeet.tsx) : la route est bornée par un budget de temps, pas par le nombre de
     séances, donc un grand nombre de réunions peut demander plusieurs allers-retours. */
  async function detacher() {
    if (!session) return
    setEnCours(true)
    setErreur(null)

    let total = 0
    let restant = 0

    for (let tour = 0; tour < 30; tour += 1) {
      const reponse = await fetch('/api/admin/detacher-visio-etablissement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ teacherId }),
      }).catch(() => null)
      const corps = (await reponse?.json().catch(() => null)) as { error?: string; detachees?: number; restant?: number } | null

      if (!reponse?.ok) {
        setEnCours(false)
        setErreur(
          corps?.error ??
            (total > 0
              ? `${total} réunion(s) détachée(s), puis la connexion a été interrompue. Relancez pour continuer.`
              : "Le détachement a échoué."),
        )
        return
      }

      const traitees = corps?.detachees ?? 0
      total += traitees
      restant = corps?.restant ?? 0
      if (restant === 0 || traitees === 0) break
    }

    setEnCours(false)
    setConfirmationOuverte(false)
    setResultat(
      restant > 0
        ? `${total} réunion(s) détachée(s) de votre agenda Google. ${restant} restante(s) : relancez pour continuer.`
        : `${total} réunion(s) détachée(s) de votre agenda Google. Chacune garde sa séance dans Hari Online Club, avec un nouveau lien Jitsi.`,
    )
    onDetache()
  }

  return (
    <Section
      titre="Agenda Google de l’administration"
      description="Tant que ce professeur n'a pas connecté son propre compte Google, ses cours sont organisés depuis celui de l'établissement : vous en recevez les invitations dans votre vraie boîte Gmail, alors qu'elles ne vous sont pas obligatoires."
      padding={22}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {resultat && <MessageSucces>{resultat}</MessageSucces>}
        <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--ink)' }}>{nombreSeances}</strong> réunion{nombreSeances > 1 ? 's' : ''} à venir de
          ce professeur {nombreSeances > 1 ? 'figurent' : 'figure'} encore dans votre agenda Google. La solution durable
          est de lui demander de connecter son propre agenda depuis « Mon profil », puis de cliquer « Mettre à jour les
          réunions à venir » dans Paramètres : ses cours basculeront proprement sur son compte. En attendant, vous pouvez
          les retirer de votre agenda dès maintenant.
        </p>
        <button type="button" onClick={() => setConfirmationOuverte(true)} style={{ ...boutonNeutreStyle, alignSelf: 'flex-start' }}>
          Retirer ces réunions de mon agenda Google
        </button>
      </div>

      {confirmationOuverte && (
        <ModaleConfirmation
          titre="Retirer ces réunions de votre agenda Google ?"
          description={
            <>
              Les {nombreSeances} réunion{nombreSeances > 1 ? 's' : ''} seront annulées dans Google Agenda : le
              professeur et l’élève concernés reçoivent une notification d’annulation de Google. Chaque séance reste
              inchangée dans Hari Online Club et reçoit aussitôt un nouveau lien Jitsi, qui ne demande aucun compte —
              ni le professeur ni l’élève ne perdent leur cours, seul le lien de connexion change.
            </>
          }
          libelleConfirmer="Retirer de mon agenda"
          libelleEnCours="Détachement…"
          enCours={enCours}
          erreur={erreur}
          onConfirmer={detacher}
          onFermer={() => setConfirmationOuverte(false)}
        />
      )}
    </Section>
  )
}
