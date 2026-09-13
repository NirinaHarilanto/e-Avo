import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../hooks/useNotifications'

export function NotificationsBell({ profileId }: { profileId: string | undefined }) {
  const { notifications, nonLues, marquerLue } = useNotifications(profileId)
  const [ouvert, setOuvert] = useState(false)
  const navigate = useNavigate()

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOuvert((v) => !v)}
        style={{
          position: 'relative',
          width: 36,
          height: 36,
          borderRadius: 999,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--ink-2)',
          cursor: 'pointer',
          fontSize: 15,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label="Notifications"
      >
        🔔
        {nonLues > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              minWidth: 16,
              height: 16,
              borderRadius: 999,
              background: 'var(--danger)',
              color: '#fff',
              fontSize: 9.5,
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
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
              borderRadius: 14,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              boxShadow: '0 12px 30px rgba(0,0,0,.4)',
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
                    background: n.lu ? 'transparent' : 'rgba(94,179,255,.08)',
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
