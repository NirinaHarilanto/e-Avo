import { useMemo, useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useSeancesAdmin, type SeanceAdmin } from '../../hooks/useSeancesAdmin'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { BadgeStatutSeance } from '../shared/BadgeStatutSeance'
import { initiales } from '../etudiants/DossierEtudiantVue'

const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

function lundiDeLaSemaine(date: Date): Date {
  const d = new Date(date)
  const jour = d.getDay()
  const diff = jour === 0 ? -6 : 1 - jour
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

type Vue = 'semaine' | 'globale'

export function SeancesAdmin() {
  const { seances, loading, erreur } = useSeancesAdmin()
  const { professeurs } = useProfesseurs()
  const [vue, setVue] = useState<Vue>('semaine')
  const [semaineDebut, setSemaineDebut] = useState(() => lundiDeLaSemaine(new Date()))
  const [professeurId, setProfesseurId] = useState<string | null>(null)

  const semaineFin = useMemo(() => {
    const fin = new Date(semaineDebut)
    fin.setDate(fin.getDate() + 7)
    return fin
  }, [semaineDebut])

  const seancesSemaine = useMemo(
    () => seances.filter((s) => s.session.debut >= semaineDebut.toISOString() && s.session.debut < semaineFin.toISOString()),
    [seances, semaineDebut, semaineFin],
  )

  const maintenant = new Date().toISOString()
  const aVenir = seances
    .filter((s) => s.session.statut === 'planifiee')
    .sort((a, b) => a.session.debut.localeCompare(b.session.debut))
  const passees = seances
    .filter((s) => s.session.statut !== 'planifiee')
    .sort((a, b) => b.session.debut.localeCompare(a.session.debut))

  return (
    <AdminLayout actif="Séances & visio">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 28, color: '#fff' }}>Séances & visio</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['semaine', 'globale'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVue(v)}
              className={`nav-item${vue === v ? ' nav-item-active' : ''}`}
              style={{
                padding: '9px 16px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: vue === v ? 800 : 600,
                color: vue === v ? '#1b1510' : 'var(--ink-2)',
                background: vue === v ? 'var(--accent-gradient)' : undefined,
                cursor: 'pointer',
              }}
            >
              {v === 'semaine' ? 'Vue par semaine' : 'Vue globale'}
            </button>
          ))}
        </div>
      </div>

      {erreur && <p style={{ color: 'var(--danger)' }}>{erreur}</p>}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : vue === 'globale' ? (
        seances.length === 0 ? (
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
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <button
              onClick={() => setSemaineDebut((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}
              style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px', cursor: 'pointer' }}
            >
              ← Semaine précédente
            </button>
            <span className="brand-font" style={{ fontSize: 15, color: 'var(--ink)' }}>
              Semaine du {semaineDebut.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })} au{' '}
              {new Date(semaineFin.getTime() - 86400000).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}
            </span>
            <button
              onClick={() => setSemaineDebut((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}
              style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px', cursor: 'pointer' }}
            >
              Semaine suivante →
            </button>
          </div>

          <div style={{ display: 'flex', gap: 18 }}>
            <aside style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => setProfesseurId(null)}
                className="carte-ligne"
                style={{
                  textAlign: 'left',
                  borderRadius: 12,
                  border: professeurId === null ? '1px solid rgba(94,179,255,.5)' : '1px solid var(--border)',
                  background: 'var(--surface)',
                  padding: '11px 14px',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  cursor: 'pointer',
                }}
              >
                Toutes les séances de la semaine
              </button>
              {professeurs.map((prof) => {
                const nb = seancesSemaine.filter((s) => s.professeur?.id === prof.id).length
                return (
                  <button
                    key={prof.id}
                    onClick={() => setProfesseurId(prof.id)}
                    className="carte-ligne"
                    style={{
                      textAlign: 'left',
                      borderRadius: 12,
                      border: professeurId === prof.id ? '1px solid rgba(94,179,255,.5)' : '1px solid var(--border)',
                      background: 'var(--surface)',
                      padding: '11px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ width: 30, height: 30, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                      {initiales(prof)}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', flexGrow: 1 }}>
                      {prof.prenom} {prof.nom}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{nb}</span>
                  </button>
                )
              })}
            </aside>

            <div style={{ flexGrow: 1, minWidth: 0 }}>
              <AgendaSemaine
                seances={professeurId ? seancesSemaine.filter((s) => s.professeur?.id === professeurId) : seancesSemaine}
                semaineDebut={semaineDebut}
              />
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function AgendaSemaine({ seances, semaineDebut }: { seances: SeanceAdmin[]; semaineDebut: Date }) {
  const jours = useMemo(() => {
    return JOURS_SEMAINE.map((label, index) => {
      const date = new Date(semaineDebut)
      date.setDate(date.getDate() + index)
      const dateIso = date.toISOString().slice(0, 10)
      const seancesJour = seances
        .filter((s) => s.session.debut.slice(0, 10) === dateIso)
        .sort((a, b) => a.session.debut.localeCompare(b.session.debut))
      return { label, date, seancesJour }
    })
  }, [seances, semaineDebut])

  if (seances.length === 0) {
    return <p style={{ color: 'var(--muted)' }}>Aucune séance cette semaine.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {jours.map(({ label, date, seancesJour }) => (
        <div key={label} className="card" style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: seancesJour.length ? 10 : 0 }}>
            <span className="brand-font" style={{ fontSize: 13.5, color: 'var(--ink)' }}>
              {label}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
          </div>
          {seancesJour.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted-2)', margin: 0 }}>Aucune séance.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {seancesJour.map((seance) => (
                <div key={seance.session.id} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,.03)' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)', width: 50, flexShrink: 0 }}>
                    {new Date(seance.session.debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="brand-font" style={{ fontSize: 12.5, color: 'var(--ink)', width: 160, flexShrink: 0 }}>
                    {seance.professeur ? `${seance.professeur.prenom} ${seance.professeur.nom}` : 'Professeur inconnu'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--ink-2)', flexGrow: 1, minWidth: 160 }}>
                    {seance.session.type === 'individuel' ? 'Individuel' : 'Collectif'} · {seance.session.duree_minutes} min ·{' '}
                    {seance.inscriptions.map((i) => `${i.etudiant?.prenom ?? '?'} ${i.etudiant?.nom ?? ''}`).join(', ') || 'aucun élève inscrit'}
                  </span>
                  <BadgeStatutSeance statut={seance.session.statut} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
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
