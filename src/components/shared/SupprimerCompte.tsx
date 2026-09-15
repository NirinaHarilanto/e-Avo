import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { ModaleConfirmation } from '../ui/ModaleConfirmation'
import { boutonDangerStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'
import type { Database } from '../../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

interface SupprimerCompteProps {
  personne: Pick<Profile, 'id' | 'nom' | 'prenom' | 'role'>
  onSupprime: () => void
}

/* Bouton + pop-up de confirmation pour supprimer un étudiant ou un professeur depuis l'espace
   admin — partagé entre `DossierEtudiantVue` et `ProfesseurDetailAdmin`. La suppression réelle
   se fait côté serveur (api/admin/supprimer-utilisateur.ts) : un vrai DELETE échouerait dès que
   la personne a la moindre séance/facture/contrat (aucune de ces tables ne cascade sur
   `profiles`, volontairement, pour garder l'historique) — voir le commentaire de cet endpoint. */
export function SupprimerCompte({ personne, onSupprime }: SupprimerCompteProps) {
  const { session } = useProfileContext()
  const [ouverte, setOuverte] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function confirmer() {
    if (!session) return
    setEnCours(true)
    setErreur(null)
    const { ok, error } = await fetch('/api/admin/supprimer-utilisateur', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ profileId: personne.id }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'La suppression a échoué. Réessayez dans un instant.' }))
    setEnCours(false)

    if (!ok) {
      setErreur(error ?? 'La suppression a échoué. Réessayez dans un instant.')
      return
    }
    setOuverte(false)
    onSupprime()
  }

  const libelleRole = personne.role === 'professeur' ? 'le professeur' : "l'étudiant"

  return (
    <>
      <button type="button" onClick={() => setOuverte(true)} style={boutonDangerStyle}>
        <Icone nom="supprimer" taille={13} />
        Supprimer
      </button>

      {ouverte && (
        <ModaleConfirmation
          titre={`Supprimer ${personne.prenom} ${personne.nom} ?`}
          description={
            <>
              {personne.prenom} {personne.nom} perdra immédiatement l'accès à la plateforme et n'apparaîtra plus dans
              vos listes. Son historique (séances, heures, paiements, factures, contrats) reste conservé pour vos
              archives. Cette action ne peut pas être annulée depuis l'application — contactez le support pour
              rétablir {libelleRole} si besoin.
            </>
          }
          libelleConfirmer="Supprimer"
          enCours={enCours}
          erreur={erreur}
          onConfirmer={confirmer}
          onFermer={() => setOuverte(false)}
        />
      )}
    </>
  )
}
