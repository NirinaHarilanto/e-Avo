import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { Modale } from '../ui/Modale'
import { boutonAvertissementStyle, boutonNeutreStyle, boutonSecondaireStyle } from '../ui/Boutons'
import { champStyle } from '../ui/Champ'
import { Icone } from '../ui/Icones'
import type { Database } from '../../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

interface MettreEnPauseCompteProps {
  personne: Pick<Profile, 'id' | 'nom' | 'prenom' | 'status'>
  onChange: () => void
}

/* Pause d'un étudiant (0063, demande client du 2026-09-23) : « à côté du bouton Supprimer »,
   voir SupprimerCompte.tsx dont ce composant reprend le gabarit — un compte en pause reste
   visible et réversible, contrairement à une suppression, donc pas de ModaleConfirmation
   générique ici : il faut un motif obligatoire à saisir, et un second geste (Réactiver) une fois
   la pause posée. */
export function MettreEnPauseCompte({ personne, onChange }: MettreEnPauseCompteProps) {
  const { session } = useProfileContext()
  const [ouverte, setOuverte] = useState(false)
  const [motif, setMotif] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function envoyer(decision: 'pause' | 'reactiver') {
    if (!session) return
    setEnCours(true)
    setErreur(null)
    const { ok, error } = await fetch('/api/admin/pause-etudiant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ profileId: personne.id, decision, motif: decision === 'pause' ? motif.trim() : undefined }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'La demande a échoué. Réessayez dans un instant.' }))
    setEnCours(false)

    if (!ok) {
      setErreur(error ?? 'La demande a échoué. Réessayez dans un instant.')
      return
    }
    setOuverte(false)
    setMotif('')
    onChange()
  }

  if (personne.status === 'en_pause') {
    return (
      <button type="button" onClick={() => envoyer('reactiver')} disabled={enCours} style={{ ...boutonSecondaireStyle, opacity: enCours ? 0.7 : 1 }}>
        <Icone nom="lecture" taille={13} />
        {enCours ? 'Réactivation…' : 'Réactiver'}
      </button>
    )
  }

  if (personne.status !== 'approved') return null

  return (
    <>
      <button type="button" onClick={() => setOuverte(true)} style={boutonAvertissementStyle}>
        <Icone nom="pause" taille={13} />
        Pause
      </button>

      {ouverte && (
        <Modale titre={`Mettre ${personne.prenom} ${personne.nom} en pause ?`} onFermer={() => setOuverte(false)} largeurMax={420}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)', margin: 0 }}>
              {personne.prenom} {personne.nom} reste visible dans vos listes et garde l'accès à son espace, mais son
              dossier est signalé en pause jusqu'à ce que vous le réactiviez.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Motif de la pause (obligatoire)</label>
              <textarea
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                rows={3}
                placeholder="Ex. absence prolongée, litige de paiement en cours…"
                style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
            {erreur && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{erreur}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setOuverte(false)} style={boutonNeutreStyle}>
                Annuler
              </button>
              <button
                type="button"
                onClick={() => envoyer('pause')}
                disabled={enCours || !motif.trim()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 12,
                  fontWeight: 700,
                  background: 'var(--warning)',
                  color: '#1b1510',
                  border: 'none',
                  borderRadius: 999,
                  padding: '8px 16px',
                  cursor: enCours || !motif.trim() ? 'not-allowed' : 'pointer',
                  opacity: enCours || !motif.trim() ? 0.6 : 1,
                }}
              >
                {enCours ? 'Mise en pause…' : 'Mettre en pause'}
              </button>
            </div>
          </div>
        </Modale>
      )}
    </>
  )
}
