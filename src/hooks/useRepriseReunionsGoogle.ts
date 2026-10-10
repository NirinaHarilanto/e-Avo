import { useCallback, useEffect, useRef, useState } from 'react'
import { useProfileContext } from '../context/ProfileContext'

/* Reprise, dans l'agenda Google du professeur, des réunions à venir encore hébergées par le compte
   de l'établissement (api/google-personnel/adopter-seances.ts).

   Exigence client du 2026-10-10 : « est-ce possible d'avoir la synchronisation des rendez-vous à
   venir et passés instantanément DIRECTEMENT, SANS devoir appuyer manuellement sur un autre bouton
   "Reprendre mes réunions à venir" ». D'où les deux déclencheurs ci-dessous, et un bouton réduit au
   rôle de secours après un incident.

   Pourquoi ce n'est pas instantané par nature : une réunion vit dans l'agenda du compte qui l'a
   créée, et seul ce compte peut y toucher. Déménager un cours veut donc dire le RECRÉER chez le
   professeur puis supprimer l'ancien — plusieurs appels à Google par séance, impossibles à faire au
   moment où l'agenda s'affiche. La reprise tourne donc en arrière-plan, et l'agenda se rafraîchit
   quand elle a fini. */

export type EtatReprise = 'en_cours' | { adoptees: number } | { erreur: string } | null

/* Un seul passage automatique par chargement de l'application : le professeur navigue plusieurs
   fois vers son agenda dans la même session, et il n'y a rien à reprendre au deuxième passage. Pas
   dans un state React — React Router démonte la page à chaque navigation, l'information doit
   survivre au démontage. */
let repriseAutomatiqueFaite = false

export function useRepriseReunionsGoogle() {
  const { session } = useProfileContext()
  const [etat, setEtat] = useState<EtatReprise>(null)

  /* Rappelée tant que le serveur signale du travail restant : la route est bornée par le temps
     d'exécution d'une fonction edge (~25 s), pas par le nombre de réunions. La borne de 10 passages
     évite une boucle infinie si le serveur renvoyait indéfiniment le même reste. */
  const reprendre = useCallback(
    async (mode: 'rapide' | 'complet', silencieux = false): Promise<number> => {
      if (!session) return 0
      if (!silencieux) setEtat('en_cours')
      let total = 0
      for (let passage = 0; passage < 10; passage += 1) {
        const reponse = await fetch('/api/google-personnel/adopter-seances', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ mode }),
        }).catch(() => null)
        const corps = (await reponse?.json().catch(() => null)) as
          | { adoptees?: number; restant?: number; error?: string }
          | null
        if (!reponse?.ok) {
          /* Un passage silencieux ne dit rien à l'écran : il n'a pas été demandé, et un agenda
             Google jamais connecté répond 409 — ce qui est l'état normal, pas un incident. */
          if (!silencieux) setEtat({ erreur: corps?.error ?? 'La reprise de vos réunions à venir a échoué.' })
          return total
        }
        total += corps?.adoptees ?? 0
        if (!corps?.restant) break
      }
      if (!silencieux) setEtat({ adoptees: total })
      return total
    },
    [session],
  )

  return { etat, reprendre }
}

/**
 * Lance la reprise en arrière-plan à l'ouverture de l'agenda du professeur, une seule fois par
 * chargement de l'application, et appelle `onTermine` si quelque chose a bougé — pour que la grille
 * affiche les nouvelles réunions sans rechargement.
 *
 * En mode « rapide » : la route se fie à `video_sessions.organisateur_email`, donc ne coûte qu'une
 * requête Postgres quand tout est déjà en ordre, ce qui est le cas courant. C'est ce qui permet de
 * la déclencher à chaque ouverture sans peser sur l'affichage.
 */
export function useRepriseAutomatiqueReunions(actif: boolean, onTermine: () => void) {
  const { reprendre } = useRepriseReunionsGoogle()
  const onTermineRef = useRef(onTermine)
  useEffect(() => {
    onTermineRef.current = onTermine
  })

  useEffect(() => {
    if (!actif || repriseAutomatiqueFaite) return
    repriseAutomatiqueFaite = true
    let vivant = true
    reprendre('rapide', true).then((adoptees) => {
      if (vivant && adoptees > 0) onTermineRef.current()
    })
    return () => {
      vivant = false
    }
  }, [actif, reprendre])
}
