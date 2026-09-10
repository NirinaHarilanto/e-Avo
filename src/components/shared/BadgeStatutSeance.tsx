/* Badge de statut de séance, partagé entre le calendrier professeur et la vue calendrier
   globale de l'admin — extrait de CalendrierProfesseur.tsx pour éviter la duplication. */
export function BadgeStatutSeance({ statut }: { statut: string }) {
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
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-cyan)', background: 'rgba(94,179,255,.12)', border: '1px solid rgba(94,179,255,.3)', borderRadius: 999, padding: '4px 10px' }}>
      Planifiée
    </span>
  )
}
