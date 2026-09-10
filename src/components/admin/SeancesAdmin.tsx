import { AdminLayout } from '../layout/AdminLayout'
import { useSeancesAdmin, type SeanceAdmin } from '../../hooks/useSeancesAdmin'
import { BadgeStatutSeance } from '../shared/BadgeStatutSeance'

/* Vue calendrier globale pour l'admin : toutes les séances de l'établissement, tous
   professeurs confondus — lecture seule (les actions de planification/clôture restent dans
   l'espace professeur, propriétaire de ses séances). */
export function SeancesAdmin() {
  const { seances, loading, erreur } = useSeancesAdmin()

  const maintenant = new Date().toISOString()
  const aVenir = seances
    .filter((s) => s.session.statut === 'planifiee')
    .sort((a, b) => a.session.debut.localeCompare(b.session.debut))
  const passees = seances
    .filter((s) => s.session.statut !== 'planifiee')
    .sort((a, b) => b.session.debut.localeCompare(a.session.debut))

  return (
    <AdminLayout actif="Séances & visio">
      <h1 style={{ fontSize: 28, color: '#fff', marginBottom: 22 }}>Séances & visio</h1>

      {erreur && <p style={{ color: 'var(--danger)' }}>{erreur}</p>}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : seances.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Aucune séance planifiée pour le moment.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 style={{ fontSize: 17, color: 'var(--accent-gold, #e9cf94)' }}>À venir · {aVenir.length}</h2>
            {aVenir.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>Aucune séance à venir.</p>}
            {aVenir.map((seance) => (
              <LigneSeance key={seance.session.id} seance={seance} maintenant={maintenant} />
            ))}
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 style={{ fontSize: 17, color: 'var(--accent-gold, #e9cf94)' }}>Passées · {passees.length}</h2>
            {passees.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>Aucune séance passée.</p>}
            {passees.map((seance) => (
              <LigneSeance key={seance.session.id} seance={seance} maintenant={maintenant} />
            ))}
          </section>
        </div>
      )}
    </AdminLayout>
  )
}

function LigneSeance({ seance }: { seance: SeanceAdmin; maintenant: string }) {
  return (
    <div className="card card-lift" style={{ padding: '15px 18px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, color: 'var(--muted)', width: 150, flexShrink: 0 }}>
        {new Date(seance.session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
      </span>
      <span className="brand-font" style={{ fontSize: 13.5, color: 'var(--ink)', width: 170, flexShrink: 0 }}>
        {seance.professeur ? `${seance.professeur.prenom} ${seance.professeur.nom}` : 'Professeur inconnu'}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flexGrow: 1, minWidth: 200 }}>
        {seance.session.type === 'individuel' ? 'Individuel' : 'Collectif'} · {seance.session.duree_minutes} min ·{' '}
        {seance.inscriptions.map((i) => `${i.etudiant?.prenom ?? '?'} ${i.etudiant?.nom ?? ''}`).join(', ') || 'aucun élève inscrit'}
      </span>
      <BadgeStatutSeance statut={seance.session.statut} />
    </div>
  )
}
