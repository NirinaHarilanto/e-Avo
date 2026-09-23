import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { ModaleConfirmation } from '../ui/ModaleConfirmation'
import { boutonDangerStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

interface ProspectASupprimer {
  id: string
  prenom: string
  nom: string
}

interface SupprimerProspectProps {
  /* Un ou deux prospects (binôme DUO, traité d'un bloc comme partout ailleurs dans le pipeline
     — voir CarteDuo.tsx) : les deux dossiers disparaissent ensemble, jamais un seul. */
  prospects: [ProspectASupprimer] | [ProspectASupprimer, ProspectASupprimer]
  onSupprime: () => void
}

/* Bouton + pop-up de confirmation pour supprimer un prospect depuis le pipeline — n'importe
   quelle colonne (« à chaque étape », demande client du 2026-09-23). Contrairement à un compte
   étudiant/professeur, un prospect n'est jamais gardé en soft-delete : la suppression réelle
   (api/admin/supprimer-prospect.ts) échoue seulement s'il a déjà un paiement de forfait
   enregistré, seule trace qu'il ne faut jamais perdre en silence à ce stade. */
export function SupprimerProspect({ prospects, onSupprime }: SupprimerProspectProps) {
  const { session } = useProfileContext()
  const [ouverte, setOuverte] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const estDuo = prospects.length === 2
  const noms = prospects.map((p) => `${p.prenom} ${p.nom}`).join(' et ')

  async function confirmer() {
    if (!session) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/supprimer-prospect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ prospectIds: prospects.map((p) => p.id) }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'La suppression a échoué. Réessayez dans un instant.' }))
    setEnCours(false)
    if (reponse.error) {
      setErreur(reponse.error)
      return
    }
    setOuverte(false)
    onSupprime()
  }

  return (
    <>
      <button type="button" onClick={() => setOuverte(true)} style={boutonDangerStyle}>
        <Icone nom="supprimer" taille={13} />
        {estDuo ? 'Supprimer le duo' : 'Supprimer'}
      </button>

      {ouverte && (
        <ModaleConfirmation
          titre={`Supprimer ${noms} ?`}
          description={
            <>
              {estDuo ? 'Ces deux dossiers disparaîtront' : 'Ce dossier disparaîtra'} définitivement du pipeline, avec
              son historique de diagnostic. Cette action ne peut pas être annulée depuis l’application.
              {estDuo ? ' Les deux membres du duo sont toujours supprimés ensemble.' : ''}
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
