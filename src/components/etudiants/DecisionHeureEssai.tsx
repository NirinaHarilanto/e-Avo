import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useTarifs } from '../../hooks/useTarifs'
import type { Database } from '../../types/database.types'
import { MessageErreur, MessageSucces } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'

type Package = Database['public']['Tables']['packages']['Row']

/* Décision à prendre après l'heure d'essai (0057) — demande client du 2026-09-21.
   Poursuivre crée le forfait complémentaire (heures restantes, prix du forfait visé moins
   l'heure déjà facturée) ; s'arrêter ne facture rien de plus. Le calcul du complément vit côté
   serveur (api/admin/decider-essai.ts), ce panneau ne fait que l'annoncer et le déclencher. */
export function DecisionHeureEssai({
  essai,
  heuresConsommees,
  onDecide,
}: {
  essai: Package
  heuresConsommees: number
  onDecide: () => void
}) {
  const { session } = useProfileContext()
  const { tarifs } = useTarifs(essai.etablissement_id)
  const [enCours, setEnCours] = useState<'poursuivi' | 'arrete' | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const tarifVise = tarifs.find((t) => t.id === essai.tarif_vise_id) ?? null
  const heureConsommee = heuresConsommees >= essai.total_heures
  const complement = tarifVise ? Math.max(0, Number(tarifVise.prix) - Number(essai.montant ?? 0)) : null
  const heuresRestantes = tarifVise?.heures != null ? tarifVise.heures - essai.total_heures : null

  async function decider(decision: 'poursuivi' | 'arrete') {
    if (!session) return
    setEnCours(decision)
    setErreur(null)
    setMessage(null)
    const reponse = await fetch('/api/admin/decider-essai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ packageId: essai.id, decision }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
    setEnCours(null)
    if (reponse.error) {
      setErreur(reponse.error)
      return
    }
    setMessage(
      decision === 'poursuivi'
        ? 'Forfait complémentaire créé : il apparaît maintenant comme forfait en cours.'
        : 'Essai clôturé. Seule l’heure d’essai reste due, rien de plus ne sera facturé.',
    )
    onDecide()
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        borderRadius: 12,
        border: '1px solid rgba(233,207,148,.35)',
        background: 'rgba(233,207,148,.08)',
        padding: '13px 15px',
      }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)' }}>
        {heureConsommee ? 'Heure d’essai terminée — décision à enregistrer' : 'Heure d’essai en cours'}
      </span>

      <p style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 }}>
        {heureConsommee
          ? 'L’élève a consommé son heure d’essai. Enregistrez sa décision : il n’aura payé que cette heure s’il s’arrête, ou le prix complet du forfait retenu s’il poursuit.'
          : 'L’élève démarre par une heure d’essai. La décision se prendra une fois cette heure donnée.'}
      </p>

      {tarifVise ? (
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          Forfait visé : <strong>{tarifVise.titre}</strong>
          {heuresRestantes != null && complement != null
            ? ` · en poursuivant, ${heuresRestantes} h supplémentaires seront facturées ${complement.toLocaleString('fr-FR')} Ar`
            : ' · volume d’heures non fixe, le complément sera à créer à la main'}
        </span>
      ) : (
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          Aucun forfait visé n’est enregistré sur cet essai : seul l’arrêt est possible ici, un
          nouveau forfait se crée alors normalement.
        </span>
      )}

      {message && <MessageSucces>{message}</MessageSucces>}
      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {heureConsommee && !message && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => decider('arrete')}
            disabled={enCours !== null}
            style={{ ...boutonNeutreStyle, flexGrow: 1, opacity: enCours ? 0.6 : 1 }}
          >
            {enCours === 'arrete' ? 'Enregistrement…' : 'S’arrête après l’essai'}
          </button>
          <button
            onClick={() => decider('poursuivi')}
            disabled={enCours !== null || !tarifVise || heuresRestantes == null || heuresRestantes <= 0}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours ? 0.6 : 1 }}
          >
            {enCours === 'poursuivi' ? 'Création…' : 'Poursuit avec le forfait'}
          </button>
        </div>
      )}
    </div>
  )
}
