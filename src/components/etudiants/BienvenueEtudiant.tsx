import { useProfileContext } from '../../context/ProfileContext'
import { Modale } from '../ui/Modale'

/* Message de bienvenue en pop-up à la première connexion d'un nouvel étudiant (demande client du
   2026-09-29). Le contenu vient de la notification `bienvenue_etudiant` créée à la conversion
   (voir notifierBienvenueEtudiant dans api/_lib/notifications.ts) : le pop-up s'affiche tant
   qu'elle n'est pas lue, puis « Commencer » la marque lue — elle reste consultable dans la cloche,
   mais le pop-up ne revient plus. */
export function BienvenueEtudiant() {
  const { notifications, marquerNotificationLue } = useProfileContext()
  const bienvenue = notifications.find((n) => n.type === 'bienvenue_etudiant' && !n.lu)
  if (!bienvenue) return null

  return (
    <Modale titre={bienvenue.titre} onFermer={() => marquerNotificationLue(bienvenue.id)} largeurMax={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {bienvenue.message && <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-2)', margin: 0 }}>{bienvenue.message}</p>}
        <button
          type="button"
          onClick={() => marquerNotificationLue(bienvenue.id)}
          className="btn-shine"
          style={{ alignSelf: 'flex-end', background: 'var(--accent-gradient)', color: '#1b1510', padding: '10px 22px', fontSize: 13, fontWeight: 700 }}
        >
          Commencer
        </button>
      </div>
    </Modale>
  )
}
