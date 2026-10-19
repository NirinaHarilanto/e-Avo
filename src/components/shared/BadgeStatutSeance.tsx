import { seancePasseeNonCloturee } from '../../lib/seances'

/* Badge de statut de séance, partagé entre le calendrier professeur et la vue calendrier
   globale de l'admin — extrait de CalendrierProfesseur.tsx pour éviter la duplication. */
export function BadgeStatutSeance({
  statut,
  seance,
}: {
  statut: string
  /* Horaire de la séance, quand l'appelant l'a sous la main : une séance encore « planifiée »
     dont l'heure est passée s'affiche alors « À clôturer » plutôt que « Planifiée » (demande
     client du 2026-10-19 — voir seancePasseeNonCloturee). Optionnel pour rester compatible avec
     les appelants qui ne connaissent que le statut. */
  seance?: { debut: string; duree_minutes: number }
}) {
  if (seance && seancePasseeNonCloturee({ statut, ...seance })) {
    return (
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning, #e0a94d)', background: 'rgba(224,169,77,.14)', border: '1px solid rgba(224,169,77,.32)', borderRadius: 999, padding: '4px 10px' }}>
        À clôturer
      </span>
    )
  }
  if (statut === 'terminee') {
    return (
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-teal)', background: 'rgba(111,227,192,.14)', border: '1px solid rgba(111,227,192,.3)', borderRadius: 999, padding: '4px 10px' }}>
        Terminée
      </span>
    )
  }
  if (statut === 'annulee') {
    return (
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)', background: 'rgba(255,138,112,.12)', border: '1px solid rgba(255,138,112,.3)', borderRadius: 999, padding: '4px 10px' }}>
        Annulée
      </span>
    )
  }
  /* 0085, demande client du 2026-09-29 : distincte d'« Annulée » — la séance aura bien lieu,
     juste pas à cette occurrence (absence à la clôture, ni l'élève ni le professeur ne sont
     impactés). Ambre plutôt que rouge : pas un échec, un simple report. */
  if (statut === 'reportee') {
    return (
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning, #e0a94d)', background: 'rgba(224,169,77,.14)', border: '1px solid rgba(224,169,77,.32)', borderRadius: 999, padding: '4px 10px' }}>
        Reportée
      </span>
    )
  }
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-cyan)', background: 'rgba(169,140,255,.12)', border: '1px solid rgba(169,140,255,.3)', borderRadius: 999, padding: '4px 10px' }}>
      Planifiée
    </span>
  )
}
