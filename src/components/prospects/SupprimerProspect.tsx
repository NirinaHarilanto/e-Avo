import { useState } from 'react'
import { jetonAcces } from '../../lib/jetonAcces'
import { useProfileContext } from '../../context/ProfileContext'
import { ModaleConfirmation } from '../ui/ModaleConfirmation'
import { boutonDangerStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'
import { formaterMontant } from '../../lib/paiements'

interface ProspectASupprimer {
  id: string
  prenom: string
  nom: string
}

/* Encaissements encore actifs que la suppression va effacer, tels que la route les renvoie dans
   son premier refus (api/admin/supprimer-prospect.ts). */
interface LigneFinanciere {
  id: string
  montant: number
  montantRegle: number
  devise: string
  libelle: string | null
}

interface SupprimerProspectProps {
  /* Un ou deux prospects (binôme DUO, traité d'un bloc comme partout ailleurs dans le pipeline
     — voir CarteDuo.tsx) : les deux dossiers disparaissent ensemble, jamais un seul. */
  prospects: [ProspectASupprimer] | [ProspectASupprimer, ProspectASupprimer]
  onSupprime: () => void
}

/* Bouton + pop-up de confirmation pour supprimer un prospect depuis le pipeline — n'importe
   quelle colonne (« à chaque étape », demande client du 2026-09-23) et depuis la fiche d'un
   candidat collectif. Contrairement à un compte étudiant/professeur, un prospect n'est jamais
   gardé en soft-delete : tout part, y compris ses encaissements de frais (0056).

   Ces encaissements ne partent pourtant jamais à l'aveugle (décision client du 2026-10-19) : la
   route refuse une première fois en renvoyant les montants concernés, et cette pop-up les affiche
   avant de redemander. C'est la deuxième confirmation qui autorise l'effacement. Avant, le refus
   renvoyait l'admin vers une autre section sans jamais lui dire de combien il s'agissait — et la
   ligne y était même invisible tant que le candidat n'était pas converti, ce qui rendait la
   suppression impossible en pratique. */
export function SupprimerProspect({ prospects, onSupprime }: SupprimerProspectProps) {
  const { session } = useProfileContext()
  const [ouverte, setOuverte] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [aConfirmer, setAConfirmer] = useState<LigneFinanciere[] | null>(null)

  const estDuo = prospects.length === 2
  const noms = prospects.map((p) => `${p.prenom} ${p.nom}`).join(' et ')

  function fermer() {
    setOuverte(false)
    setAConfirmer(null)
    setErreur(null)
  }

  async function confirmer() {
    if (!session) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/supprimer-prospect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonAcces()}` },
      body: JSON.stringify({
        prospectIds: prospects.map((p) => p.id),
        /* Envoyé seulement au deuxième passage, celui qui suit l'affichage des montants. */
        confirmerSuppressionFinanciere: aConfirmer !== null,
      }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'La suppression a échoué. Réessayez dans un instant.' }))
    setEnCours(false)
    if (reponse.error) {
      /* Encaissements à montrer : on passe au deuxième écran plutôt que d'afficher un refus. */
      if (Array.isArray(reponse.lignesFinancieres) && reponse.lignesFinancieres.length > 0) {
        setAConfirmer(reponse.lignesFinancieres as LigneFinanciere[])
        return
      }
      setErreur(reponse.error)
      return
    }
    fermer()
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
          titre={aConfirmer ? `Effacer aussi l’argent encaissé ?` : `Supprimer ${noms} ?`}
          description={
            aConfirmer ? (
              <>
                {aConfirmer.length === 1 ? 'Un encaissement est' : `${aConfirmer.length} encaissements sont`} encore
                rattaché{aConfirmer.length === 1 ? '' : 's'} à {noms}. En continuant,{' '}
                {aConfirmer.length === 1 ? 'il sera effacé' : 'ils seront effacés'} définitivement avec le dossier, sans
                rien laisser dans l’historique financier.
                <ul style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {aConfirmer.map((l) => (
                    <li key={l.id}>
                      <strong>{formaterMontant(l.montant, l.devise)}</strong>
                      {l.montantRegle > 0 && l.montantRegle < l.montant
                        ? ` (dont ${formaterMontant(l.montantRegle, l.devise)} déjà réglés)`
                        : l.montantRegle >= l.montant
                          ? ' (réglé)'
                          : ''}
                      {l.libelle ? ` · ${l.libelle}` : ''}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                {estDuo ? 'Ces deux dossiers disparaîtront' : 'Ce dossier disparaîtra'} définitivement du pipeline, avec
                son historique de diagnostic. Cette action ne peut pas être annulée depuis l’application.
                {estDuo ? ' Les deux membres du duo sont toujours supprimés ensemble.' : ''}
              </>
            )
          }
          libelleConfirmer={
            aConfirmer ? (aConfirmer.length === 1 ? 'Effacer le dossier et l’encaissement' : 'Effacer le dossier et les encaissements') : 'Supprimer'
          }
          enCours={enCours}
          erreur={erreur}
          onConfirmer={confirmer}
          onFermer={fermer}
        />
      )}
    </>
  )
}
