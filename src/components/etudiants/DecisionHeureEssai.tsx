import { useState } from 'react'
import { jetonAcces } from '../../lib/jetonAcces'
import { useProfileContext } from '../../context/ProfileContext'
import { useTarifs } from '../../hooks/useTarifs'
import type { Database } from '../../types/database.types'
import { MessageErreur, MessageSucces } from '../ui/Etats'
import { champStyle, Champ } from '../ui/Champ'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { formaterHeures } from '../../lib/heures'
import { Modale } from '../ui/Modale'
import { SelectMoyenPaiement } from '../paiements/SelectMoyenPaiement'

type Package = Database['public']['Tables']['packages']['Row']

/* Pop-up de paiement commune à « poursuivi » et « prolonge » — demande client du 2026-10-11 :
   « avant de confirmer [...] il faut enregistrer le paiement [...] à partir d'un pop-up [...].
   Quand le paiement est validé [...] alors [la décision] sera validée automatiquement », étendue
   par le client au forfait complet (« idem quand l'utilisateur décide de prendre un forfait »).
   Même principe que l'ajout de forfait (AjouterForfaitModale.tsx, 0061) : le paiement est
   enregistré dans LE MÊME geste que la décision côté serveur (api/admin/decider-essai.ts), jamais
   après coup — une seule validation pour l'admin, pas d'aller-retour entre deux écrans. */
function PaiementEssaiModale({
  titre,
  montantSuggere,
  enCours,
  erreur,
  onFermer,
  onValider,
}: {
  titre: string
  montantSuggere: number
  enCours: boolean
  erreur: string | null
  onFermer: () => void
  onValider: (paiement: { montant: number; motif: string; moyenPaiement: string; reference: string }) => void
}) {
  const [montant, setMontant] = useState(String(montantSuggere))
  const [motif, setMotif] = useState('')
  const [moyenPaiement, setMoyenPaiement] = useState('')
  const [moyenValide, setMoyenValide] = useState(true)
  const [reference, setReference] = useState('')
  const pret = !!montant && Number(montant) > 0 && !!motif.trim() && moyenValide

  return (
    <Modale titre={titre} onFermer={onFermer} largeurMax={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--muted)', margin: 0 }}>
          Le paiement doit être enregistré avant que la décision ne soit appliquée.
        </p>
        <Champ label="Montant réglé (Ar)" obligatoire>
          <input type="number" min={0} step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} style={champStyle} />
        </Champ>
        <Champ label="Motif" obligatoire aide="Ex. règlement du forfait de 30h en espèces.">
          <input value={motif} onChange={(e) => setMotif(e.target.value)} style={champStyle} />
        </Champ>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Champ label="Moyen (facultatif)">
            <SelectMoyenPaiement valeur={moyenPaiement} onChange={(v, valide) => { setMoyenPaiement(v); setMoyenValide(valide) }} />
          </Champ>
          <Champ label="Référence (facultatif)">
            <input value={reference} onChange={(e) => setReference(e.target.value)} style={champStyle} />
          </Champ>
        </div>

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onFermer} disabled={enCours} style={{ ...boutonNeutreStyle, flexGrow: 1 }}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onValider({ montant: Number(montant), motif: motif.trim(), moyenPaiement, reference })}
            disabled={enCours || !pret}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours || !pret ? 0.6 : 1 }}
          >
            {enCours ? 'Enregistrement…' : 'Enregistrer le paiement et valider'}
          </button>
        </div>
      </div>
    </Modale>
  )
}

/* Décision à prendre après la séance d'essai (0057, revue le 2026-09-29, prolongation et paiement
   obligatoire le 2026-10-11). L'essai (1 à 3 h) est facturé à part : poursuivre crée le forfait
   COMPLET choisi — celui retenu au départ ou un autre, l'élève pouvant changer d'avis — sans rien
   en déduire ; s'arrêter ne facture rien de plus (aucun paiement à enregistrer pour cette
   décision-là) ; prolonger allonge CET essai de X heures supplémentaires, au même tarif horaire,
   sans trancher — l'admin pourra encore décider (ou reprolonger) une fois ces heures-là aussi
   consommées. « Poursuivre » et « prolonger » passent toutes deux par PaiementEssaiModale avant
   d'atteindre le serveur (api/admin/decider-essai.ts), qui revérifie que le paiement est fourni. */
export function DecisionHeureEssai({
  essai,
  heuresConsommees,
  heuresEssaiCumulees,
  montantEssaiCumule,
  onDecide,
}: {
  essai: Package
  heuresConsommees: number
  /* Toutes les heures d'essai souscrites, tranches de prolongation comprises (0115) : depuis
     qu'une prolongation crée son propre forfait, `essai.total_heures` ne porte plus que la
     DERNIÈRE tranche. Comparer la consommation — qui est, elle, un cumul du dossier — à cette
     seule tranche déclarait l'essai terminé trop tôt : à 2 h consommées sur 1 h + 2 h. */
  heuresEssaiCumulees: number
  /* Idem pour le montant : ce que l'essai a coûté EN TOUT, toutes tranches confondues. */
  montantEssaiCumule: number
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
  /* Laquelle des deux décisions payantes attend sa confirmation de paiement dans la pop-up. */
  const [paiementPour, setPaiementPour] = useState<'poursuivi' | 'prolonge' | null>(null)
  const [erreurPaiement, setErreurPaiement] = useState<string | null>(null)

  const forfaitsProposables = tarifs.filter((t) => t.type_programme === essai.type_programme && t.heures != null && t.heures > 1)
  const tarifRetenu = tarifId || essai.tarif_vise_id || ''
  const tarifChoisi = forfaitsProposables.find((t) => t.id === tarifRetenu) ?? null
  const essaiTermine = heuresConsommees >= heuresEssaiCumulees
  // Même tarif que celui utilisé pour chiffrer l'essai initial (voir PipelineCRM.tsx) : aperçu du
  // montant affiché avant même d'envoyer la demande au serveur, qui refait le même calcul.
  const tarifUneHeure = tarifs.find((t) => t.type_programme === essai.type_programme && t.heures === 1) ?? null
  const montantProlongation = tarifUneHeure ? heuresProlongation * Number(tarifUneHeure.prix) : null

  async function decider(decision: 'poursuivi' | 'arrete', paiement?: { montant: number; motif: string; moyenPaiement: string; reference: string }) {
    if (!session) return
    setEnCours(decision)
    setErreur(null)
    setErreurPaiement(null)
    setMessage(null)
    const reponse = await fetch('/api/admin/decider-essai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonAcces()}` },
      body: JSON.stringify({
        packageId: essai.id,
        decision,
        tarifId: decision === 'poursuivi' ? tarifChoisi?.id : undefined,
        montantPaiement: paiement?.montant,
        motifPaiement: paiement?.motif,
        moyenPaiement: paiement?.moyenPaiement || undefined,
        referencePaiement: paiement?.reference || undefined,
      }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
    setEnCours(null)
    if (reponse.error) {
      if (decision === 'poursuivi') setErreurPaiement(reponse.error)
      else setErreur(reponse.error)
      return
    }
    setPaiementPour(null)
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
  async function prolonger(paiement: { montant: number; motif: string; moyenPaiement: string; reference: string }) {
    if (!session || heuresProlongation <= 0) return
    setEnCours('prolonge')
    setErreur(null)
    setErreurPaiement(null)
    const reponse = await fetch('/api/admin/decider-essai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonAcces()}` },
      body: JSON.stringify({
        packageId: essai.id,
        decision: 'prolonge',
        heuresSupplementaires: heuresProlongation,
        montantPaiement: paiement.montant,
        motifPaiement: paiement.motif,
        moyenPaiement: paiement.moyenPaiement || undefined,
        referencePaiement: paiement.reference || undefined,
      }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
    setEnCours(null)
    if (reponse.error) {
      setErreurPaiement(reponse.error)
      return
    }
    setPaiementPour(null)
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
        {essaiTermine ? 'Séance d’essai terminée — décision à enregistrer' : `Séance d’essai en cours (${formaterHeures(heuresEssaiCumulees)})`}
      </span>

      <p style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 }}>
        L’essai ({formaterHeures(heuresEssaiCumulees)}, {montantEssaiCumule.toLocaleString('fr-FR')} Ar) est facturé à part. S’il poursuit,
        l’élève paie le forfait complet choisi ci-dessous ; s’il s’arrête, il n’aura payé que l’essai ; s’il a besoin de plus de temps avant de
        trancher, l’essai peut être prolongé de quelques heures au même tarif horaire. Poursuivre et prolonger demandent chacun
        l’enregistrement d’un paiement avant d’être appliqués.
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
              onClick={() => setPaiementPour('prolonge')}
              disabled={enCours !== null || !tarifUneHeure}
              className="btn-shine"
              style={{ ...boutonPrimaireStyle, fontSize: 12.5, padding: '8px 16px', opacity: enCours || !tarifUneHeure ? 0.6 : 1 }}
            >
              {montantProlongation != null ? `Confirmer · ${montantProlongation.toLocaleString('fr-FR')} Ar` : 'Confirmer'}
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
            onClick={() => setPaiementPour('poursuivi')}
            disabled={enCours !== null || !tarifChoisi}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours || !tarifChoisi ? 0.6 : 1 }}
          >
            {tarifChoisi ? `Poursuit avec ${tarifChoisi.titre}` : 'Poursuit avec un forfait'}
          </button>
        </div>
      )}

      {paiementPour === 'poursuivi' && tarifChoisi && (
        <PaiementEssaiModale
          titre={`Paiement — poursuite avec ${tarifChoisi.titre}`}
          montantSuggere={Number(tarifChoisi.prix)}
          enCours={enCours === 'poursuivi'}
          erreur={erreurPaiement}
          onFermer={() => setPaiementPour(null)}
          onValider={(paiement) => decider('poursuivi', paiement)}
        />
      )}

      {paiementPour === 'prolonge' && montantProlongation != null && (
        <PaiementEssaiModale
          titre={`Paiement — prolongation de ${heuresProlongation} h`}
          montantSuggere={montantProlongation}
          enCours={enCours === 'prolonge'}
          erreur={erreurPaiement}
          onFermer={() => setPaiementPour(null)}
          onValider={prolonger}
        />
      )}
    </div>
  )
}
