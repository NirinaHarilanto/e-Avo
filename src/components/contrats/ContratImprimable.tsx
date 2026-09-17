import { useEffect, useState } from 'react'
import { useEtablissement } from '../../hooks/useEtablissement'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { OverlayImpression } from '../facturation/OverlayImpression'

type Contract = Database['public']['Tables']['contracts']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

interface ContratImprimableProps {
  contrat: Contract
  destinataire: Profile | null
  // Profil ayant signé pour l'établissement (contrat.signe_etablissement_par) — optionnel :
  // les deux appelants actuels (ContratsAdmin.tsx, MesContrats.tsx) le passent via useContrats().
  signataireEtablissement?: Profile | null
  onFermer: () => void
}

const LABELS_STATUT: Record<Contract['statut'], string> = { brouillon: 'Brouillon', envoye: 'Envoyé', signe: 'Signé', resilie: 'Résilié' }
const COULEURS_STATUT: Record<Contract['statut'], string> = {
  brouillon: '#6b7280',
  envoye: '#b07a12',
  signe: '#1c6b41',
  resilie: '#8a2f0a',
}

/* État de signature d'une partie, affiché EN PLUS de la ligne blanche à signer plutôt qu'à sa
   place : ce document sert aussi bien à relire un brouillon avant envoi qu'à archiver un contrat
   déjà signé numériquement dans l'application (voir ContratsAdmin.tsx, « Signer pour
   l'établissement ») — la ligne de signature garde donc son sens pour une signature papier,
   tandis que ce badge donne l'état réel, à l'écran, sans avoir à deviner. */
function BadgeSignature({ signeLe }: { signeLe: string | null }) {
  return (
    <span
      style={{
        display: 'inline-block',
        marginTop: 6,
        fontSize: 11,
        fontWeight: 700,
        color: signeLe ? '#1c6b41' : '#8a6d0a',
        background: signeLe ? '#dff5e8' : '#faf0c2',
        border: `1px solid ${signeLe ? '#8fd6ac' : '#e3cf6d'}`,
        borderRadius: 999,
        padding: '3px 10px',
      }}
    >
      {signeLe ? `Signé le ${new Date(signeLe).toLocaleDateString('fr-FR')}` : 'En attente de signature'}
    </span>
  )
}

/* Image de signature (déposée dans "Mon profil", migration 0047) si le profil signataire en a
   une, sinon repli texte "Vu et approuvé par {prénom} {nom}" — demande client du 2026-09-17.
   URL signée récupérée en local (useEffect), PAS via useCacheRequete : ce cache partagé n'a pas
   de TTL (voir son commentaire) alors qu'une URL signée en a un ; comme ce composant est une
   modale démontée à la fermeture, refaire la demande à chaque montage est déjà correct et
   suffisant, sans avoir à gérer d'expiration. */
function SignatureAffichee({ profil, signeLe }: { profil: Profile | null; signeLe: string | null }) {
  const [urlSignee, setUrlSignee] = useState<string | null>(null)

  useEffect(() => {
    setUrlSignee(null)
    if (!profil?.signature_path) return
    let annule = false
    supabase
      .storage
      .from('signatures')
      .createSignedUrl(profil.signature_path, 300)
      .then(({ data }) => {
        if (!annule) setUrlSignee(data?.signedUrl ?? null)
      })
    return () => {
      annule = true
    }
  }, [profil?.signature_path])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {signeLe &&
        (urlSignee ? (
          <img
            src={urlSignee}
            alt={`Signature de ${profil?.prenom ?? ''} ${profil?.nom ?? ''}`.trim()}
            style={{ maxHeight: 46, maxWidth: 200, alignSelf: 'flex-start' }}
          />
        ) : (
          <span style={{ fontSize: 12, fontStyle: 'italic', color: '#333' }}>
            Vu et approuvé par {profil ? `${profil.prenom ?? ''} ${profil.nom ?? ''}`.trim() : 'la partie signataire'}
          </span>
        ))}
      <BadgeSignature signeLe={signeLe} />
    </div>
  )
}

/* Vue complète et instantanée d'un contrat — demande client du 2026-09-16 : « voir l'entièreté du
   contrat à l'état instantané (si c'est signé ou pas encore) ». Reprise telle quelle du bouton
   « Imprimer » déjà existant (qui ouvrait déjà cette même fenêtre, avec « Fermer » ET
   « Imprimer » comme actions) : ce n'est donc pas un nouveau composant, seulement une meilleure
   étiquette sur la ligne de contrat (voir ContratsAdmin.tsx, « Voir le contrat ») et l'ajout du
   statut de signature de chaque partie, jusqu'ici visible seulement dans la liste, jamais dans le
   document lui-même. */
export function ContratImprimable({ contrat, destinataire, signataireEtablissement, onFermer }: ContratImprimableProps) {
  const etablissement = useEtablissement(contrat.etablissement_id)

  return (
    <OverlayImpression onFermer={onFermer}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, margin: 0 }}>{etablissement?.nom ?? "Établissement"}</h1>
          <h2 style={{ fontSize: 17, margin: '16px 0 4px' }}>{contrat.titre}</h2>
          <p style={{ fontSize: 12, color: '#555', margin: 0 }}>
            {destinataire ? `${destinataire.prenom} ${destinataire.nom}` : ''} — émis le {new Date(contrat.created_at).toLocaleDateString('fr-FR')}
          </p>
        </div>
        <span
          style={{
            flexShrink: 0,
            fontSize: 11.5,
            fontWeight: 700,
            color: '#fff',
            background: COULEURS_STATUT[contrat.statut],
            borderRadius: 999,
            padding: '5px 12px',
          }}
        >
          {LABELS_STATUT[contrat.statut]}
        </span>
      </div>

      <div style={{ marginTop: 24, fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{contrat.corps_genere}</div>

      <div style={{ marginTop: 48, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <div>
          <p style={{ margin: 0 }}>Fait pour {etablissement?.nom},</p>
          <p style={{ marginTop: 40, marginBottom: 0 }}>Signature</p>
          <SignatureAffichee profil={signataireEtablissement ?? null} signeLe={contrat.signe_etablissement_at} />
        </div>
        <div>
          <p style={{ margin: 0 }}>Fait pour {destinataire ? `${destinataire.prenom} ${destinataire.nom}` : 'le destinataire'},</p>
          <p style={{ marginTop: 40, marginBottom: 0 }}>Signature</p>
          <SignatureAffichee profil={destinataire} signeLe={contrat.signe_destinataire_at} />
        </div>
      </div>
    </OverlayImpression>
  )
}
