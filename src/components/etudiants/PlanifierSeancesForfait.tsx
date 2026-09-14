import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { champStyle } from '../ui/Champ'

const JOURS = [
  { valeur: 1, label: 'Lun' },
  { valeur: 2, label: 'Mar' },
  { valeur: 3, label: 'Mer' },
  { valeur: 4, label: 'Jeu' },
  { valeur: 5, label: 'Ven' },
  { valeur: 6, label: 'Sam' },
  { valeur: 0, label: 'Dim' },
]

interface Creneau {
  jour: number
  heure: string
}

interface PlanifierSeancesForfaitProps {
  studentIds: string[]
  teacherId: string
  dureeParDefaut?: number
  dateFinParDefaut?: string | null
  onCree: () => void
}

/* Génère les dates concrètes (jour de la semaine + heure, répétées entre deux dates) côté
   client — comme le fait déjà `<input type="datetime-local">` ailleurs dans le projet, ce qui
   garde le calcul dans le fuseau horaire du navigateur plutôt que de le refaire côté serveur.
   L'API `/api/admin/planifier-seances-prevision` ne fait ensuite que créer une séance par
   date déjà résolue. */
export function PlanifierSeancesForfait({ studentIds, teacherId, dureeParDefaut, dateFinParDefaut, onCree }: PlanifierSeancesForfaitProps) {
  const { session } = useProfileContext()
  const [creneaux, setCreneaux] = useState<Creneau[]>([{ jour: 1, heure: '18:00' }])
  const [dateDebut, setDateDebut] = useState(() => new Date().toISOString().slice(0, 10))
  const [dateFin, setDateFin] = useState(dateFinParDefaut ?? '')
  const [dureeMinutes, setDureeMinutes] = useState(dureeParDefaut ?? 60)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [resultat, setResultat] = useState<number | null>(null)

  function ajouterCreneau() {
    setCreneaux((c) => [...c, { jour: 1, heure: '18:00' }])
  }

  function retirerCreneau(index: number) {
    setCreneaux((c) => c.filter((_, i) => i !== index))
  }

  function majCreneau(index: number, patch: Partial<Creneau>) {
    setCreneaux((c) => c.map((cr, i) => (i === index ? { ...cr, ...patch } : cr)))
  }

  function calculerDebuts(): string[] {
    if (!dateDebut || !dateFin || creneaux.length === 0) return []
    const jours = new Set(creneaux.map((c) => c.jour))
    const heureParJour = new Map(creneaux.map((c) => [c.jour, c.heure]))
    const debuts: string[] = []
    const curseur = new Date(`${dateDebut}T00:00`)
    const fin = new Date(`${dateFin}T00:00`)
    while (curseur <= fin) {
      if (jours.has(curseur.getDay())) {
        const heure = heureParJour.get(curseur.getDay())!
        const iso = new Date(`${curseur.toISOString().slice(0, 10)}T${heure}`).toISOString()
        debuts.push(iso)
      }
      curseur.setDate(curseur.getDate() + 1)
    }
    return debuts
  }

  const debutsPrevus = calculerDebuts()

  async function creer() {
    if (!session || debutsPrevus.length === 0) return
    setEnCours(true)
    setErreur(null)
    setResultat(null)
    const reponse = await fetch('/api/admin/planifier-seances-prevision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ studentIds, teacherId, dureeMinutes, debuts: debutsPrevus }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'La planification a échoué.')
      return
    }
    setResultat(debutsPrevus.length)
    onCree()
  }

  return (
    <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ fontSize: 16, color: 'var(--ink)' }}>Planning prévisionnel</h3>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
        Les séances sont créées avec le statut « planifiée » ; c'est le professeur qui, séance après séance, indique si
        elle a bien eu lieu.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Créneaux hebdomadaires</label>
        {creneaux.map((c, index) => (
          <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={c.jour} onChange={(e) => majCreneau(index, { jour: Number(e.target.value) })} style={{ ...champStyle, flexGrow: 1 }}>
              {JOURS.map((j) => (
                <option key={j.valeur} value={j.valeur}>
                  {j.label}
                </option>
              ))}
            </select>
            <input type="time" value={c.heure} onChange={(e) => majCreneau(index, { heure: e.target.value })} style={{ ...champStyle, width: 110 }} />
            {creneaux.length > 1 && (
              <button
                onClick={() => retirerCreneau(index)}
                type="button"
                style={{ fontSize: 12, color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                Retirer
              </button>
            )}
          </div>
        ))}
        <button
          onClick={ajouterCreneau}
          type="button"
          style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          + Ajouter un créneau
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 110px', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Du</label>
          <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Au (échéance du forfait)</label>
          <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Durée (min)</label>
          <input type="number" min={15} step={15} value={dureeMinutes} onChange={(e) => setDureeMinutes(Number(e.target.value))} style={champStyle} />
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
        {debutsPrevus.length > 0 ? `${debutsPrevus.length} séance(s) seront créées.` : 'Renseigne au moins un créneau et une plage de dates valide.'}
      </p>

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{erreur}</p>}
      {resultat !== null && <p style={{ color: 'var(--accent-teal)', fontSize: 13 }}>{resultat} séance(s) planifiée(s).</p>}

      <button
        onClick={creer}
        disabled={enCours || debutsPrevus.length === 0}
        className="btn-shine"
        style={{ background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours || debutsPrevus.length === 0 ? 0.6 : 1 }}
      >
        {enCours ? 'Planification…' : 'Planifier'}
      </button>
    </div>
  )
}
