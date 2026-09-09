import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { useCalendrierProfesseur, type SeanceProfesseur } from '../../hooks/useCalendrierProfesseur'
import { getJoinUrl } from '../../lib/visio'
import { Logo } from '../shared/Logo'

const champStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '11px 14px',
  fontSize: 13.5,
  color: 'var(--ink)',
  background: 'rgba(0,0,0,.22)',
}

export function CalendrierProfesseur() {
  const { profile, seDeconnecter } = useProfileContext()
  const { seances, etudiantsActifs, loading, erreur, recharger } = useCalendrierProfesseur(profile?.id)
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)

  const maintenant = new Date().toISOString()
  const aVenir = seances
    .filter((s) => s.session.statut === 'planifiee')
    .sort((a, b) => a.session.debut.localeCompare(b.session.debut))
  const passees = seances
    .filter((s) => s.session.statut !== 'planifiee')
    .sort((a, b) => b.session.debut.localeCompare(a.session.debut))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 32px', borderBottom: '1px solid var(--border-soft)' }}>
        <Logo size={24} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="brand-font" style={{ fontSize: 13, color: 'var(--accent-gold, #e9cf94)' }}>
            {profile?.prenom} {profile?.nom}
          </span>
          <button
            onClick={() => seDeconnecter()}
            style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px', cursor: 'pointer' }}
          >
            Déconnexion
          </button>
        </div>
      </header>

      <div style={{ padding: '28px 32px 48px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 26, color: '#fff' }}>Mon calendrier</h1>
          <button onClick={() => setFormulaireOuvert(true)} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510' }}>
            Planifier une séance
          </button>
        </div>

        {erreur && <p style={{ color: 'var(--danger)' }}>{erreur}</p>}

        {formulaireOuvert && profile && (
          <FormulairePlanification
            etudiantsActifs={etudiantsActifs}
            onAnnuler={() => setFormulaireOuvert(false)}
            onCree={() => {
              setFormulaireOuvert(false)
              recharger()
            }}
          />
        )}

        {loading ? (
          <p style={{ color: 'var(--muted)' }}>Chargement…</p>
        ) : (
          <>
            <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 style={{ fontSize: 18, color: 'var(--accent-gold, #e9cf94)' }}>À venir</h2>
              {aVenir.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>Aucune séance planifiée.</p>}
              {aVenir.map((seance) => (
                <CarteSeance key={seance.session.id} seance={seance} maintenant={maintenant} onChange={recharger} />
              ))}
            </section>

            <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 style={{ fontSize: 18, color: 'var(--accent-gold, #e9cf94)' }}>Passées</h2>
              {passees.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>Aucune séance passée.</p>}
              {passees.map((seance) => (
                <CarteSeance key={seance.session.id} seance={seance} maintenant={maintenant} onChange={recharger} />
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function FormulairePlanification({
  etudiantsActifs,
  onAnnuler,
  onCree,
}: {
  etudiantsActifs: { id: string; prenom: string | null; nom: string | null }[]
  onAnnuler: () => void
  onCree: () => void
}) {
  const { session } = useProfileContext()
  const [studentIds, setStudentIds] = useState<string[]>([])
  const [debut, setDebut] = useState('')
  const [dureeMinutes, setDureeMinutes] = useState(60)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  function basculer(id: string) {
    setStudentIds((courant) => (courant.includes(id) ? courant.filter((v) => v !== id) : [...courant, id]))
  }

  async function creer() {
    if (!session || studentIds.length === 0 || !debut) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/professeur/planifier-seance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        studentIds,
        type: studentIds.length > 1 ? 'collectif' : 'individuel',
        debut: new Date(debut).toISOString(),
        dureeMinutes,
      }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'La planification a échoué.')
      return
    }
    onCree()
  }

  return (
    <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ fontSize: 16, color: 'var(--ink)' }}>Nouvelle séance</h3>

      {etudiantsActifs.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>Aucun élève ne vous est actuellement attribué.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Élève(s)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {etudiantsActifs.map((etudiant) => {
              const actif = studentIds.includes(etudiant.id)
              return (
                <button
                  key={etudiant.id}
                  type="button"
                  onClick={() => basculer(etudiant.id)}
                  style={{
                    fontSize: 12.5,
                    fontWeight: actif ? 800 : 600,
                    color: actif ? '#fff' : 'var(--ink-2)',
                    background: actif ? 'var(--accent-blue-gradient)' : 'rgba(0,0,0,.22)',
                    border: actif ? 'none' : '1px solid var(--border)',
                    borderRadius: 999,
                    padding: '9px 15px',
                    cursor: 'pointer',
                  }}
                >
                  {etudiant.prenom} {etudiant.nom}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Date et heure</label>
          <input type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Durée (min)</label>
          <input type="number" min={15} step={15} value={dureeMinutes} onChange={(e) => setDureeMinutes(Number(e.target.value))} style={champStyle} />
        </div>
      </div>

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{erreur}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onAnnuler} style={{ flexGrow: 1, fontSize: 13, padding: 11, borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
          Annuler
        </button>
        <button
          onClick={creer}
          disabled={enCours || studentIds.length === 0 || !debut}
          className="btn-shine"
          style={{ flexGrow: 1, background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours || studentIds.length === 0 || !debut ? 0.6 : 1 }}
        >
          {enCours ? 'Création…' : 'Planifier'}
        </button>
      </div>
    </div>
  )
}

function CarteSeance({ seance, maintenant, onChange }: { seance: SeanceProfesseur; maintenant: string; onChange: () => void }) {
  const { session: authSession } = useProfileContext()
  const [presences, setPresences] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(seance.inscriptions.map((i) => [i.student_id, true])),
  )
  const [clotureOuverte, setClotureOuverte] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const estAVenir = seance.session.statut === 'planifiee'
  const dejaCommencee = seance.session.debut <= maintenant

  async function annuler() {
    setEnCours(true)
    const { error } = await supabase.from('sessions').update({ statut: 'annulee' }).eq('id', seance.session.id)
    setEnCours(false)
    if (!error) onChange()
  }

  async function cloturer() {
    if (!authSession) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/professeur/cloturer-seance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authSession.access_token}` },
      body: JSON.stringify({
        sessionId: seance.session.id,
        presences: Object.entries(presences).map(([studentId, present]) => ({ studentId, present })),
      }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'La clôture a échoué.')
      return
    }
    setClotureOuverte(false)
    onChange()
  }

  return (
    <div className="card card-lift" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="brand-font" style={{ fontSize: 15, color: 'var(--ink)' }}>
            {new Date(seance.session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {seance.session.type === 'individuel' ? 'Individuel' : 'Collectif'} · {seance.session.duree_minutes} min ·{' '}
            {seance.inscriptions.map((i) => `${i.etudiant?.prenom ?? '?'} ${i.etudiant?.nom ?? ''}`).join(', ')}
          </span>
        </div>
        <BadgeStatut statut={seance.session.statut} />
      </div>

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erreur}</p>}

      {estAVenir && !clotureOuverte && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {seance.video && (
            <a href={getJoinUrl(seance.video)} target="_blank" rel="noreferrer" className="btn-shine btn-secondary" style={{ fontSize: 12.5, padding: '9px 16px' }}>
              Rejoindre
            </a>
          )}
          {dejaCommencee && (
            <button onClick={() => setClotureOuverte(true)} className="btn-shine" style={{ fontSize: 12.5, padding: '9px 16px', background: 'var(--accent-gradient)', color: '#1b1510' }}>
              Clôturer
            </button>
          )}
          <button
            onClick={annuler}
            disabled={enCours}
            style={{ fontSize: 12.5, padding: '9px 16px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}
          >
            Annuler la séance
          </button>
        </div>
      )}

      {clotureOuverte && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>Présence</span>
          {seance.inscriptions.map((i) => (
            <label key={i.student_id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={presences[i.student_id] ?? true}
                onChange={(e) => setPresences((p) => ({ ...p, [i.student_id]: e.target.checked }))}
              />
              {i.etudiant?.prenom} {i.etudiant?.nom}
            </label>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setClotureOuverte(false)} style={{ flexGrow: 1, fontSize: 12.5, padding: 9, borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
              Annuler
            </button>
            <button onClick={cloturer} disabled={enCours} className="btn-shine" style={{ flexGrow: 1, fontSize: 12.5, padding: 9, background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours ? 0.6 : 1 }}>
              Confirmer la clôture
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BadgeStatut({ statut }: { statut: string }) {
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
