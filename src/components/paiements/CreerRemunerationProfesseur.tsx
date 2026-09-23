import { useMemo, useState, type FormEvent } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { useHeuresNonPayeesProfesseur } from '../../hooks/useHeuresNonPayeesProfesseur'
import { supabase } from '../../lib/supabaseClient'
import { formaterHeures } from '../../lib/heures'
import { champStyle } from '../ui/Champ'
import { EtatChargement } from '../ui/Etats'

interface CreerRemunerationProfesseurProps {
  etablissementId: string
  onCree: () => void
  onAnnuler: () => void
}

type Mode = 'mensuel' | 'horaire'

export function CreerRemunerationProfesseur({ etablissementId, onCree, onAnnuler }: CreerRemunerationProfesseurProps) {
  const { profile, session } = useProfileContext()
  const { professeurs } = useProfesseurs()
  const [mode, setMode] = useState<Mode>('mensuel')
  const [teacherId, setTeacherId] = useState('')
  const [montant, setMontant] = useState('')
  const [periodeDebut, setPeriodeDebut] = useState('')
  const [periodeFin, setPeriodeFin] = useState('')
  const [dateEcheance, setDateEcheance] = useState('')
  const [reference, setReference] = useState('')
  const [lignesSelectionnees, setLignesSelectionnees] = useState<Set<string>>(new Set())
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const professeur = professeurs.find((p) => p.id === teacherId) ?? null
  const { lignes: heuresNonPayees, loading: chargementHeures } = useHeuresNonPayeesProfesseur(mode === 'horaire' ? teacherId : undefined)

  const heuresSelectionnees = useMemo(
    () => heuresNonPayees.filter((l) => lignesSelectionnees.has(l.id)).reduce((total, l) => total + l.heures, 0),
    [heuresNonPayees, lignesSelectionnees],
  )
  const montantHoraire = professeur?.taux_horaire ? Math.round(heuresSelectionnees * professeur.taux_horaire * 100) / 100 : 0

  function basculerLigne(id: string) {
    setLignesSelectionnees((s) => {
      const copie = new Set(s)
      if (copie.has(id)) copie.delete(id)
      else copie.add(id)
      return copie
    })
  }

  function changerTeacher(id: string) {
    setTeacherId(id)
    setLignesSelectionnees(new Set())
  }

  async function creerMensuel(e: FormEvent) {
    e.preventDefault()
    if (!profile || !teacherId || !montant) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('teacher_payments').insert({
      etablissement_id: etablissementId,
      teacher_id: teacherId,
      montant: Number(montant),
      mode_remuneration: 'mensuel',
      periode_debut: periodeDebut || null,
      periode_fin: periodeFin || null,
      date_echeance: dateEcheance || null,
      reference: reference || null,
      created_by_profile_id: profile.id,
    })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onCree()
  }

  async function creerHoraire(e: FormEvent) {
    e.preventDefault()
    if (!session || !teacherId || lignesSelectionnees.size === 0) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/payer-professeur', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ teacherId, hourLedgerIds: [...lignesSelectionnees] }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'Le règlement a échoué.')
      return
    }
    onCree()
  }

  return (
    <form onSubmit={mode === 'mensuel' ? creerMensuel : creerHoraire} className="card" style={{ padding: 18, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['mensuel', 'horaire'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            style={{
              fontSize: 12.5,
              fontWeight: mode === m ? 800 : 600,
              color: mode === m ? '#1b1510' : 'var(--ink-2)',
              background: mode === m ? 'var(--accent-gradient)' : 'rgba(0,0,0,.22)',
              border: mode === m ? 'none' : '1px solid var(--border)',
              borderRadius: 999,
              padding: '8px 14px',
              cursor: 'pointer',
            }}
          >
            {m === 'mensuel' ? 'Par mois' : 'Par heure enseignée'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Professeur</label>
          <select required value={teacherId} onChange={(e) => changerTeacher(e.target.value)} style={champStyle}>
            <option value="">Sélectionner…</option>
            {professeurs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.prenom} {p.nom}
              </option>
            ))}
          </select>
        </div>

        {mode === 'mensuel' ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 130 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Montant (Ar)</label>
              <input required type="number" min={0} step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} style={champStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 150 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Période du</label>
              <input type="date" value={periodeDebut} onChange={(e) => setPeriodeDebut(e.target.value)} style={champStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 150 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>au</label>
              <input type="date" value={periodeFin} onChange={(e) => setPeriodeFin(e.target.value)} style={champStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 160 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Échéance</label>
              <input type="date" value={dateEcheance} onChange={(e) => setDateEcheance(e.target.value)} style={champStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Référence</label>
              <input value={reference} onChange={(e) => setReference(e.target.value)} style={champStyle} />
            </div>
          </>
        ) : (
          professeur && !professeur.taux_horaire && (
            <p style={{ color: 'var(--danger)', fontSize: 12.5 }}>Ce professeur n'a pas de taux horaire renseigné (informations personnelles).</p>
          )
        )}
      </div>

      {mode === 'horaire' && teacherId && professeur?.taux_horaire && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Heures enseignées non payées</label>
          {chargementHeures ? (
            <EtatChargement lignes={2} hauteur={30} />
          ) : heuresNonPayees.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>Aucune heure non payée pour ce professeur.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
              {heuresNonPayees.map((l) => (
                <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer', padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,.03)' }}>
                  <input type="checkbox" checked={lignesSelectionnees.has(l.id)} onChange={() => basculerLigne(l.id)} />
                  <span style={{ flexGrow: 1 }}>{l.sessionDebut ? new Date(l.sessionDebut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Date inconnue'}</span>
                  <span style={{ color: 'var(--muted)' }}>{formaterHeures(l.heures)}</span>
                </label>
              ))}
            </div>
          )}
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', textAlign: 'right' }}>
            Total : <strong>{formaterHeures(heuresSelectionnees)}</strong> × {professeur.taux_horaire} Ar/h ={' '}
            <strong style={{ color: 'var(--accent-gold, #e9cf94)' }}>{montantHoraire.toFixed(2)} Ar</strong>
          </div>
        </div>
      )}

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5, width: '100%' }}>{erreur}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onAnnuler} style={{ fontSize: 12.5, padding: '10px 16px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
          Annuler
        </button>
        <button
          type="submit"
          disabled={enCours || (mode === 'horaire' && lignesSelectionnees.size === 0)}
          className="btn-shine"
          style={{ background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours ? 0.6 : 1 }}
        >
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}
