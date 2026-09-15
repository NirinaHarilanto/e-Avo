import type { ReactNode } from 'react'
import { Modale } from './Modale'
import { boutonNeutreStyle } from './Boutons'

interface ModaleConfirmationProps {
  titre: ReactNode
  description: ReactNode
  libelleConfirmer?: string
  libelleEnCours?: string
  enCours?: boolean
  erreur?: string | null
  onConfirmer: () => void
  onFermer: () => void
}

/* Pop-up de confirmation générique pour toute action destructive/irréversible — bâtie sur
   `Modale` plutôt que dupliquée à chaque usage (suppression de compte, et tout autre « êtes-vous
   sûr ? » à venir). */
export function ModaleConfirmation({
  titre,
  description,
  libelleConfirmer = 'Confirmer',
  libelleEnCours = 'Suppression…',
  enCours,
  erreur,
  onConfirmer,
  onFermer,
}: ModaleConfirmationProps) {
  return (
    <Modale titre={titre} onFermer={onFermer} largeurMax={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>{description}</div>
        {erreur && (
          <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{erreur}</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onFermer} style={boutonNeutreStyle}>
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirmer}
            disabled={enCours}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 12,
              fontWeight: 700,
              background: 'var(--danger)',
              color: '#fff',
              border: 'none',
              borderRadius: 999,
              padding: '8px 16px',
              cursor: 'pointer',
              opacity: enCours ? 0.7 : 1,
            }}
          >
            {enCours ? libelleEnCours : libelleConfirmer}
          </button>
        </div>
      </div>
    </Modale>
  )
}
