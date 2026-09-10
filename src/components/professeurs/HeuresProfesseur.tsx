import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useCalendrierProfesseur } from '../../hooks/useCalendrierProfesseur'
import { initiales } from '../etudiants/DossierEtudiantVue'

export function HeuresProfesseur() {
  const { profile } = useProfileContext()
  const { seances, heuresEnseignees, loading } = useCalendrierProfesseur(profile?.id)

  const parEtudiant = new Map<string, { prenom: string | null; nom: string | null; heures: number; seances: number }>()
  for (const seance of seances) {
    if (seance.session.statut !== 'terminee') continue
    for (const inscription of seance.inscriptions) {
      const existant = parEtudiant.get(inscription.student_id) ?? {
        prenom: inscription.etudiant?.prenom ?? null,
        nom: inscription.etudiant?.nom ?? null,
        heures: 0,
        seances: 0,
      }
      existant.heures += seance.session.duree_minutes / 60
      existant.seances += 1
      parEtudiant.set(inscription.student_id, existant)
    }
  }
  const repartition = [...parEtudiant.entries()].sort((a, b) => b[1].heures - a[1].heures)

  return (
    <ProfesseurLayout actif="Mes heures">
      <h1 style={{ fontSize: 28, color: '#fff', marginBottom: 22 }}>Mes heures</h1>

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ padding: '20px 22px', maxWidth: 320 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Total heures enseignées</span>
            <div className="brand-font" style={{ fontSize: 32, color: 'var(--accent-gold, #e9cf94)', marginTop: 8 }}>
              {heuresEnseignees} h
            </div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <h2 style={{ fontSize: 16, color: 'var(--accent-gold, #e9cf94)', marginBottom: 4 }}>Répartition par élève</h2>
            <p style={{ fontSize: 11.5, color: 'var(--muted-2)', marginBottom: 14 }}>Basée sur les séances clôturées.</p>
            {repartition.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucune séance clôturée pour le moment.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {repartition.map(([studentId, ligne]) => (
                  <div key={studentId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: '1px solid var(--border-soft)' }}>
                    <span style={{ width: 32, height: 32, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                      {initiales({ prenom: ligne.prenom, nom: ligne.nom })}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--ink)', flexGrow: 1 }}>
                      {ligne.prenom} {ligne.nom}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{ligne.seances} séance{ligne.seances > 1 ? 's' : ''}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>{ligne.heures} h</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </ProfesseurLayout>
  )
}
