import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useContrats } from '../../hooks/useContrats'
import { ContratImprimable } from '../contrats/ContratImprimable'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { EtatVide } from '../ui/EtatVide'
import { boutonSecondaireStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

const LIBELLE_STATUT = {
  signe: { texte: 'Signé', couleur: 'var(--accent-teal)', fond: 'rgba(111,227,192,.14)', bord: 'rgba(111,227,192,.3)' },
  envoye: { texte: 'En attente de votre signature', couleur: 'var(--accent-cyan)', fond: 'rgba(94,179,255,.12)', bord: 'rgba(94,179,255,.3)' },
  resilie: { texte: 'Résilié', couleur: 'var(--danger)', fond: 'rgba(255,138,112,.12)', bord: 'rgba(255,138,112,.3)' },
  brouillon: { texte: 'Brouillon', couleur: 'var(--muted)', fond: 'rgba(255,255,255,.05)', bord: 'var(--border-soft)' },
} as const

function styleStatut(statut: string) {
  return LIBELLE_STATUT[statut as keyof typeof LIBELLE_STATUT] ?? LIBELLE_STATUT.brouillon
}

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

  if (loading) return <EtatChargement lignes={2} hauteur={78} />
  if (erreur) return <MessageErreur>{erreur}</MessageErreur>
  if (contrats.length === 0) {
    return (
      <EtatVide
        icone="contrats"
        titre="Aucun contrat pour le moment"
        description="Vos contrats apparaîtront ici dès que l’établissement vous en aura envoyé un. Vous pourrez alors le lire, le signer en ligne et l’imprimer."
      />
    )
  }

  const aSigner = contrats.filter((item) => item.contrat.statut === 'envoye' && !item.contrat.signe_destinataire_at).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {erreurSignature && <MessageErreur>{erreurSignature}</MessageErreur>}

      {aSigner > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '11px 14px',
            borderRadius: 12,
            border: '1px solid rgba(233,207,148,.32)',
            background: 'rgba(233,207,148,.09)',
            color: 'var(--accent-gold, #e9cf94)',
            fontSize: 12.5,
          }}
        >
          <Icone nom="alerte" taille={16} />
          <span>
            {aSigner} contrat{aSigner > 1 ? 's' : ''} attend{aSigner > 1 ? 'ent' : ''} votre signature. Ouvrez-le avec « Voir / Imprimer »
            pour en lire le contenu, puis cliquez sur « Je signe ».
          </span>
        </div>
      )}

      {contrats.map((item) => {
        const { contrat } = item
        const peutSigner = contrat.statut === 'envoye' && !contrat.signe_destinataire_at
        const statut = styleStatut(contrat.statut)
        return (
          <div key={contrat.id} className="card card-lift" style={{ padding: '15px 18px', display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span className="brand-font" style={{ fontSize: 14.5, color: 'var(--ink)', flexGrow: 1, minWidth: 180 }}>
                {contrat.titre}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: statut.couleur,
                  background: statut.fond,
                  border: `1px solid ${statut.bord}`,
                  borderRadius: 999,
                  padding: '4px 10px',
                }}
              >
                {statut.texte}
              </span>
              {peutSigner && (
                <button onClick={() => signer(contrat.id)} disabled={enCours === contrat.id} className="btn-shine" style={{ ...boutonPrimaireStyle, fontSize: 12, padding: '8px 14px' }}>
                  {enCours === contrat.id ? 'Signature…' : 'Je signe'}
                </button>
              )}
              <button onClick={() => setContratAImprimer(item)} style={boutonSecondaireStyle}>
                Voir / Imprimer
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--border-soft)' }}>
              <EtapeSignature
                label="Établissement"
                fait={!!contrat.signe_etablissement_at}
                detail={contrat.signe_etablissement_at ? `signé le ${new Date(contrat.signe_etablissement_at).toLocaleDateString('fr-FR')}` : 'en attente'}
              />
              <EtapeSignature
                label="Vous"
                fait={!!contrat.signe_destinataire_at}
                detail={contrat.signe_destinataire_at ? `signé le ${new Date(contrat.signe_destinataire_at).toLocaleDateString('fr-FR')}` : 'en attente'}
              />
              {contrat.date_limite_signature && (
                <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>
                  À signer avant le {new Date(contrat.date_limite_signature).toLocaleDateString('fr-FR')}
                </span>
              )}
            </div>
          </div>
        )
      })}

      {contratAImprimer && (
        <ContratImprimable
          contrat={contratAImprimer.contrat}
          destinataire={contratAImprimer.destinataire}
          signataireEtablissement={contratAImprimer.signataireEtablissement}
          onFermer={() => setContratAImprimer(null)}
        />
      )}
    </div>
  )
}

function EtapeSignature({ label, fait, detail }: { label: string; fait: boolean; detail: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--muted)' }}>
      <span
        style={{
          width: 17,
          height: 17,
          borderRadius: 999,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: fait ? '#0a1530' : 'var(--muted-2)',
          background: fait ? 'var(--accent-teal)' : 'transparent',
          border: fait ? 'none' : '1px dashed var(--muted-2)',
        }}
      >
        {fait && <Icone nom="valide" taille={11} />}
      </span>
      <strong style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{label}</strong> {detail}
    </span>
  )
}
