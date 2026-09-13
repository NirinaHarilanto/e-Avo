import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useContrats } from '../../hooks/useContrats'
import { ContratImprimable } from '../contrats/ContratImprimable'

/* Contenu partagé entre l'espace étudiant et professeur : useContrats() interroge `contracts`
   sans filtre explicite, mais la policy contracts_destinataire_select (0021) ne renvoie de
   toute façon que les contrats du profil connecté — pas besoin d'une requête dédiée. */
export function MesContrats() {
  const { session } = useProfileContext()
  const { contrats, loading, erreur, recharger } = useContrats()
  const [enCours, setEnCours] = useState<string | null>(null)
  const [erreurSignature, setErreurSignature] = useState<string | null>(null)
  const [contratAImprimer, setContratAImprimer] = useState<(typeof contrats)[number] | null>(null)

  async function signer(contractId: string) {
    if (!session) return
    setEnCours(contractId)
    setErreurSignature(null)
    const reponse = await fetch('/api/contrats/signer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ contractId }),
    })
    setEnCours(null)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreurSignature(corps?.error ?? 'La signature a échoué.')
      return
    }
    recharger()
  }

  if (loading) return <p style={{ color: 'var(--muted)' }}>Chargement…</p>
  if (erreur) return <p style={{ color: 'var(--danger)' }}>{erreur}</p>
  if (contrats.length === 0) return <p style={{ color: 'var(--muted)' }}>Aucun contrat pour le moment.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {erreurSignature && <p style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erreurSignature}</p>}
      {contrats.map((item) => {
        const { contrat } = item
        const peutSigner = contrat.statut === 'envoye' && !contrat.signe_destinataire_at
        return (
          <div key={contrat.id} className="card card-lift" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)', flexGrow: 1, minWidth: 180 }}>
                {contrat.titre}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: contrat.statut === 'signe' ? 'var(--accent-teal)' : 'var(--accent-cyan)',
                  background: contrat.statut === 'signe' ? 'rgba(111,227,192,.14)' : 'rgba(94,179,255,.12)',
                  border: `1px solid ${contrat.statut === 'signe' ? 'rgba(111,227,192,.3)' : 'rgba(94,179,255,.3)'}`,
                  borderRadius: 999,
                  padding: '4px 10px',
                }}
              >
                {contrat.statut === 'signe' ? 'Signé' : contrat.statut === 'envoye' ? 'En attente de signature' : contrat.statut === 'resilie' ? 'Résilié' : 'Brouillon'}
              </span>
              {peutSigner && (
                <button onClick={() => signer(contrat.id)} disabled={enCours === contrat.id} className="btn-shine" style={{ fontSize: 12, padding: '8px 14px', background: 'var(--accent-gradient)', color: '#1b1510' }}>
                  {enCours === contrat.id ? 'Signature…' : 'Je signe'}
                </button>
              )}
              <button
                onClick={() => setContratAImprimer(item)}
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}
              >
                Voir / Imprimer
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              Établissement : {contrat.signe_etablissement_at ? `signé le ${new Date(contrat.signe_etablissement_at).toLocaleDateString('fr-FR')}` : 'en attente'} · Vous :{' '}
              {contrat.signe_destinataire_at ? `signé le ${new Date(contrat.signe_destinataire_at).toLocaleDateString('fr-FR')}` : 'en attente'}
              {contrat.date_limite_signature && <> · limite le {new Date(contrat.date_limite_signature).toLocaleDateString('fr-FR')}</>}
            </div>
          </div>
        )
      })}

      {contratAImprimer && (
        <ContratImprimable contrat={contratAImprimer.contrat} destinataire={contratAImprimer.destinataire} onFermer={() => setContratAImprimer(null)} />
      )}
    </div>
  )
}
