import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { Icone } from '../ui/Icones'

/* Notifications en temps réel (0083, demande client du 2026-09-29) : le seul abonnement Supabase
   Realtime de l'application vit dans ProfileContext (useNotificationsTempsReel.ts), pas ici — la
   cloche se contente de le lire. */
export function NotificationsBell() {
  const { notifications, notificationsNonLues: nonLues, marquerNotificationLue: marquerLue } = useProfileContext()
  const [ouvert, setOuvert] = useState(false)
  const navigate = useNavigate()

  return (
    <div style={{ position: 'relative' }}>
      {/* Carré arrondi de 44 px, bordé, comme les deux boutons d'en-tête des maquettes du
          2026-10-16 — et non plus un rond de 36 px. Le compteur y est violet et cerné de la
          couleur du fond de page, ce qui le détache du bouton sans ajouter d'ombre. */}
      <button
        onClick={() => setOuvert((v) => !v)}
        style={{
          position: 'relative',
          width: 44,
          height: 44,
          borderRadius: 12,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--accent-blue)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label={nonLues > 0 ? `Notifications, ${nonLues} non lues` : 'Notifications'}
      >
        <Icone nom="cloche" taille={18} />
        {nonLues > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              minWidth: 20,
              height: 20,
              boxSizing: 'border-box',
              borderRadius: 999,
              background: 'var(--accent-blue)',
              color: '#fefffa',
              fontSize: 11,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 5px',
              /* `--surface-alt` et non `--bg-page` : le fond de page est une image en thème
                 sombre (dégradé), et une bordure n'accepte qu'une couleur. Les deux valent la
                 même teinte en thème clair. */
              border: '2px solid var(--surface-alt)',
            }}
          >
            {nonLues > 9 ? '9+' : nonLues}
          </span>
        )}
      </button>

      {ouvert && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setOuvert(false)} />
          <div
            style={{
              position: 'absolute',
              top: 44,
              right: 0,
              width: 320,
              maxHeight: 400,
              overflowY: 'auto',
              zIndex: 31,
              borderRadius: 18,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              boxShadow: '0 12px 30px rgba(73,48,106,.16)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-soft)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>
              Notifications
            </div>
            {notifications.length === 0 ? (
              <p style={{ padding: 16, fontSize: 12.5, color: 'var(--muted)' }}>Aucune notification.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={async () => {
                    if (!n.lu) await marquerLue(n.id)
                    setOuvert(false)
                    if (n.lien) navigate(n.lien)
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border-soft)',
                    background: n.lu ? 'transparent' : 'var(--hoc-pastille, rgba(169,140,255,.08))',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{n.titre}</span>
                  {n.message && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{n.message}</span>}
                  <span style={{ fontSize: 10, color: 'var(--muted-2)' }}>{new Date(n.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
