import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useTarifs } from '../../hooks/useTarifs'
import type { Database } from '../../types/database.types'
import { MessageErreur, MessageSucces } from '../ui/Etats'
import { champStyle } from '../ui/Champ'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { formaterHeures } from '../../lib/heures'

type Package = Database['public']['Tables']['packages']['Row']

/* Décision à prendre après la séance d'essai (0057, revue le 2026-09-29, prolongation le
   2026-10-11). L'essai (1 à 3 h) est facturé à part : poursuivre crée le forfait COMPLET choisi —
   celui retenu au départ ou un autre, l'élève pouvant changer d'avis — sans rien en déduire ;
   s'arrêter ne facture rien de plus ; prolonger allonge CET essai de X heures supplémentaires, au
   même tarif horaire, sans trancher — l'admin pourra encore décider (ou reprolonger) une fois ces
   heures-là aussi consommées. Tout vit côté serveur (api/admin/decider-essai.ts). */
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
  const [tarifId, setTarifId] = useState<string>('')
  const [enCours, setEnCours] = useState<'poursuivi' | 'arrete' | 'prolonge' | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [prolongationOuverte, setProlongationOuverte] = useState(false)
  const [heuresProlongation, setHeuresProlongation] = useState(1)

  const forfaitsProposables = tarifs.filter((t) => t.type_programme === essai.type_programme && t.heures != null && t.heures > 1)
  const tarifRetenu = tarifId || essai.tarif_vise_id || ''
  const tarifChoisi = forfaitsProposables.find((t) => t.id === tarifRetenu) ?? null
  const essaiTermine = heuresConsommees >= essai.total_heures
  // Même tarif que celui utilisé pour chiffrer l'essai initial (voir PipelineCRM.tsx) : aperçu du
  // montant affiché avant même d'envoyer la demande au serveur, qui refait le même calcul.
  const tarifUneHeure = tarifs.find((t) => t.type_programme === essai.type_programme && t.heures === 1) ?? null
  const montantProlongation = tarifUneHeure ? heuresProlongation * Number(tarifUneHeure.prix) : null

  async function decider(decision: 'poursuivi' | 'arrete') {
    if (!session) return
    setEnCours(decision)
    setErreur(null)
    setMessage(null)
    const reponse = await fetch('/api/admin/decider-essai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ packageId: essai.id, decision, tarifId: decision === 'poursuivi' ? tarifChoisi?.id : undefined }),
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
        ? 'Forfait créé : il apparaît maintenant comme forfait en cours.'
        : 'Essai clôturé. Seule la séance d’essai reste due, rien de plus ne sera facturé.',
    )
    onDecide()
  }

  /* Décision distincte de `decider()` : elle ne fige rien (pas de `message` qui masquerait les
     boutons) — une fois les heures ajoutées, l'admin doit pouvoir continuer à décider (ou
     reprolonger) avec le panneau toujours actif. */
  async function prolonger() {
    if (!session || heuresProlongation <= 0) return
    setEnCours('prolonge')
    setErreur(null)
    const reponse = await fetch('/api/admin/decider-essai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ packageId: essai.id, decision: 'prolonge', heuresSupplementaires: heuresProlongation }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
    setEnCours(null)
    if (reponse.error) {
      setErreur(reponse.error)
      return
    }
    setProlongationOuverte(false)
    setHeuresProlongation(1)
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
        {essaiTermine ? 'Séance d’essai terminée — décision à enregistrer' : `Séance d’essai en cours (${formaterHeures(essai.total_heures)})`}
      </span>

      <p style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 }}>
        L’essai ({formaterHeures(essai.total_heures)}, {Number(essai.montant ?? 0).toLocaleString('fr-FR')} Ar) est facturé à part. S’il poursuit,
        l’élève paie le forfait complet choisi ci-dessous ; s’il s’arrête, il n’aura payé que l’essai ; s’il a besoin de plus de temps avant de
        trancher, l’essai peut être prolongé de quelques heures au même tarif horaire.
        {!essaiTermine && ' La décision peut être prise dès maintenant ou une fois l’essai terminé.'}
      </p>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11.5, color: 'var(--muted)' }}>
        Forfait de suite (modifiable par rapport au choix initial)
        <select value={tarifRetenu} onChange={(e) => setTarifId(e.target.value)} style={champStyle}>
          <option value="">Choisir un forfait…</option>
          {forfaitsProposables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.titre} · {t.heures} h · {Number(t.prix).toLocaleString('fr-FR')} Ar{t.id === essai.tarif_vise_id ? ' (choix initial)' : ''}
            </option>
          ))}
        </select>
      </label>

      {message && <MessageSucces>{message}</MessageSucces>}
      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {!message && prolongationOuverte && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 10, border: '1px solid rgba(233,207,148,.3)', padding: '10px 12px' }}>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            Heures d’essai supplémentaires, au même tarif horaire{tarifUneHeure ? ` (${Number(tarifUneHeure.prix).toLocaleString('fr-FR')} Ar/h)` : ''} :
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {[1, 2, 3].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHeuresProlongation(h)}
                style={{
                  ...boutonNeutreStyle,
                  padding: '6px 12px',
                  fontSize: 12,
                  ...(heuresProlongation === h ? { background: 'var(--accent-gradient)', color: '#1b1510', fontWeight: 800 } : {}),
                }}
              >
                {h} h
              </button>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--muted)' }}>
              ou
              <input
                type="number"
                min={1}
                step={1}
                value={heuresProlongation}
                onChange={(e) => setHeuresProlongation(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                style={{ ...champStyle, width: 64, padding: '6px 8px' }}
              />
              h
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={prolonger}
              disabled={enCours !== null || !tarifUneHeure}
              className="btn-shine"
              style={{ ...boutonPrimaireStyle, fontSize: 12.5, padding: '8px 16px', opacity: enCours || !tarifUneHeure ? 0.6 : 1 }}
            >
              {enCours === 'prolonge'
                ? 'Enregistrement…'
                : montantProlongation != null
                  ? `Confirmer · ${montantProlongation.toLocaleString('fr-FR')} Ar`
                  : 'Confirmer'}
            </button>
            <button type="button" onClick={() => setProlongationOuverte(false)} disabled={enCours !== null} style={{ ...boutonNeutreStyle, fontSize: 12.5, padding: '8px 14px' }}>
              Annuler
            </button>
            {!tarifUneHeure && (
              <span style={{ fontSize: 11, color: 'var(--danger)' }}>Aucun tarif horaire configuré pour ce programme.</span>
            )}
          </div>
        </div>
      )}

      {!message && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => decider('arrete')} disabled={enCours !== null} style={{ ...boutonNeutreStyle, flexGrow: 1, opacity: enCours ? 0.6 : 1 }}>
            {enCours === 'arrete' ? 'Enregistrement…' : 'S’arrête après l’essai'}
          </button>
          {!prolongationOuverte && (
            <button
              type="button"
              onClick={() => setProlongationOuverte(true)}
              disabled={enCours !== null}
              style={{ ...boutonNeutreStyle, flexGrow: 1, opacity: enCours ? 0.6 : 1 }}
            >
              Prolonger la séance d’essai
            </button>
          )}
          <button
            onClick={() => decider('poursuivi')}
            disabled={enCours !== null || !tarifChoisi}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours || !tarifChoisi ? 0.6 : 1 }}
          >
            {enCours === 'poursuivi' ? 'Création…' : tarifChoisi ? `Poursuit avec ${tarifChoisi.titre}` : 'Poursuit avec un forfait'}
          </button>
        </div>
      )}
    </div>
  )
}
