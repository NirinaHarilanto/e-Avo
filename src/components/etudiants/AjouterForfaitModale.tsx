import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { Modale } from '../ui/Modale'
import { Champ, champStyle, LigneInfo } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'

/* Ajout d'un forfait à un élève qui en a déjà un — demande client du 2026-09-22 : les heures se
   cumulent (nouveau forfait, jamais une correction du précédent, voir HistoriqueForfaits). La
   validation finale reste bloquée tant que le paiement n'a pas été enregistré, avec un motif
   obligatoire : deux étapes dans la même fenêtre plutôt que deux pop-up séparées qui obligeraient
   à faire des allers-retours — le principe demandé (paiement confirmé AVANT la validation) est
   respecté sans complexité supplémentaire pour l'admin. */
export function AjouterForfaitModale({
  studentId,
  nomEtudiant,
  demandeId,
  heuresSuggerees,
  onFermer,
  onAjoute,
}: {
  studentId: string
  nomEtudiant: string
  /* Présent quand cet ajout vient valider une demande de l'élève (0061). */
  demandeId?: string
  heuresSuggerees?: number
  onFermer: () => void
  onAjoute: () => void
}) {
  const { session } = useProfileContext()
  const [heures, setHeures] = useState(heuresSuggerees ? String(heuresSuggerees) : '')
  const [echeance, setEcheance] = useState('')
  const [paiementOuvert, setPaiementOuvert] = useState(false)
  const [paiementConfirme, setPaiementConfirme] = useState(false)
  const [montant, setMontant] = useState('')
  const [motif, setMotif] = useState('')
  const [moyenPaiement, setMoyenPaiement] = useState('')
  const [reference, setReference] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  function confirmerPaiement() {
    if (!montant || Number(montant) <= 0 || !motif.trim()) return
    setPaiementConfirme(true)
    setPaiementOuvert(false)
  }

  async function valider() {
    if (!session || !heures || Number(heures) <= 0 || !paiementConfirme) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/ajouter-forfait', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        studentId,
        heures: Number(heures),
        echeance: echeance || undefined,
        montantPaiement: Number(montant),
        motifPaiement: motif,
        moyenPaiement: moyenPaiement || undefined,
        referencePaiement: reference || undefined,
        demandeId,
      }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
    setEnCours(false)
    if (reponse.error) {
      setErreur(reponse.error)
      return
    }
    onAjoute()
  }

  return (
    <Modale titre={`Ajouter un forfait · ${nomEtudiant}`} onFermer={onFermer} largeurMax={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)', margin: 0 }}>
          Ce forfait s’ajoute au précédent : les heures se cumulent, rien n’est remplacé.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Champ label="Heures à ajouter" obligatoire>
            <input type="number" min={0.5} step="0.5" value={heures} onChange={(e) => setHeures(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="Échéance (facultatif)">
            <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} style={champStyle} />
          </Champ>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 12,
            border: `1px solid ${paiementConfirme ? 'rgba(111,227,192,.35)' : 'var(--border)'}`,
            background: paiementConfirme ? 'rgba(111,227,192,.08)' : 'var(--surface-alt)',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Paiement
          </span>

          {paiementConfirme ? (
            <>
              <LigneInfo label="Montant enregistré" valeur={`${Number(montant).toLocaleString('fr-FR')} Ar`} />
              <LigneInfo label="Motif" valeur={motif} />
              <button type="button" onClick={() => setPaiementOuvert(true)} style={{ ...boutonSecondaireStyle, alignSelf: 'flex-start' }}>
                Modifier le paiement
              </button>
            </>
          ) : paiementOuvert ? (
            <>
              <Champ label="Montant réglé (Ar)" obligatoire>
                <input type="number" min={0} step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} style={champStyle} />
              </Champ>
              <Champ label="Motif" obligatoire aide="Ex. règlement du forfait supplémentaire de 10h en espèces.">
                <input value={motif} onChange={(e) => setMotif(e.target.value)} style={champStyle} />
              </Champ>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Champ label="Moyen (facultatif)">
                  <input value={moyenPaiement} onChange={(e) => setMoyenPaiement(e.target.value)} style={champStyle} />
                </Champ>
                <Champ label="Référence (facultatif)">
                  <input value={reference} onChange={(e) => setReference(e.target.value)} style={champStyle} />
                </Champ>
              </div>
              <button
                type="button"
                onClick={confirmerPaiement}
                disabled={!montant || Number(montant) <= 0 || !motif.trim()}
                className="btn-shine btn-secondary"
                style={{ alignSelf: 'flex-start', opacity: !montant || !motif.trim() ? 0.6 : 1 }}
              >
                Confirmer le paiement
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
                Aucun paiement enregistré pour ce forfait. La validation reste bloquée tant qu’il ne
                l’est pas.
              </p>
              <button type="button" onClick={() => setPaiementOuvert(true)} className="btn-shine btn-secondary" style={{ alignSelf: 'flex-start' }}>
                Enregistrer le paiement
              </button>
            </>
          )}
        </div>

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onFermer} style={{ ...boutonNeutreStyle, flexGrow: 1 }}>
            Annuler
          </button>
          <button
            onClick={valider}
            disabled={enCours || !heures || Number(heures) <= 0 || !paiementConfirme}
            title={!paiementConfirme ? 'Enregistrez le paiement avant de valider.' : undefined}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours || !paiementConfirme ? 0.6 : 1 }}
          >
            {enCours ? 'Ajout…' : 'Valider l’ajout du forfait'}
          </button>
        </div>
      </div>
    </Modale>
  )
}
