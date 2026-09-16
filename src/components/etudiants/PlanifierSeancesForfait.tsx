import { useEffect, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { champStyle } from '../ui/Champ'
import { AvertissementDureeMeet } from '../shared/AvertissementDureeMeet'

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
  /* Omis côté professeur : la route `api/professeur/...` planifie forcément pour l'appelant.
     Renseigné côté admin, qui planifie pour le professeur attribué à l'élève. */
  teacherId?: string
  dureeParDefaut?: number
  dateFinParDefaut?: string | null
  /* Volume total du forfait, en heures — sert à calculer automatiquement l'échéance (voir
     `dateFinCalculee` ci-dessous). Omis côté professeur, qui n'a pas accès au forfait de l'élève
     depuis cet écran : l'échéance y reste alors à saisir à la main, comportement inchangé. */
  heuresForfait?: number | null
  /* Route cible — la version professeur restreint la planification à ses propres élèves. */
  endpoint?: string
  titre?: string
  /* Reçoit la date d'échéance effectivement retenue (calculée ou corrigée à la main) : c'est à
     l'appelant, qui seul connaît l'identifiant du forfait, de la reporter sur `packages.echeance`
     si besoin (voir EtudiantsAdmin.tsx) — ce composant ne connaît que la planification. */
  onCree: (dateFinRetenue: string) => void
}

/* Génère les dates concrètes (jour de la semaine + heure, répétées entre deux dates) côté
   client — comme le fait déjà `<input type="datetime-local">` ailleurs dans le projet, ce qui
   garde le calcul dans le fuseau horaire du navigateur plutôt que de le refaire côté serveur.
   L'API `/api/admin/planifier-seances-prevision` ne fait ensuite que créer une séance par
   date déjà résolue. */
export function PlanifierSeancesForfait({
  studentIds,
  teacherId,
  dureeParDefaut,
  dateFinParDefaut,
  heuresForfait,
  endpoint = '/api/admin/planifier-seances-prevision',
  titre = 'Planning prévisionnel',
  onCree,
}: PlanifierSeancesForfaitProps) {
  const { session } = useProfileContext()
  const [creneaux, setCreneaux] = useState<Creneau[]>([{ jour: 1, heure: '18:00' }])
  const [dateDebut, setDateDebut] = useState(() => new Date().toISOString().slice(0, 10))
  const [dateFin, setDateFin] = useState(dateFinParDefaut ?? '')
  /* Tant que l'admin n'a pas lui-même retouché le champ, l'échéance reste asservie au calcul
     automatique (voir l'effet plus bas) — demande client du 2026-09-16 : « pré-remplir
     l'information [...] modifiable manuellement après remplissage ». Une échéance déjà connue
     à l'ouverture (`dateFinParDefaut`, ex. un forfait déjà planifié qu'on rouvre) compte comme
     une valeur déjà décidée : le calcul ne vient pas l'écraser. */
  const [dateFinTouchee, setDateFinTouchee] = useState(!!dateFinParDefaut)
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

  /* Échéance déduite du forfait, de la fréquence (créneaux hebdomadaires) et de la date de
     début — demande client du 2026-09-16 : « l'échéance du forfait doit être défini
     automatiquement [...] en se basant sur le forfait pris par l'étudiant, la fréquence des
     cours et la date de début ». Simule les séances au fil des jours (même logique que
     `calculerDebuts`, mais SANS date de fin connue à l'avance) jusqu'à ce que le volume
     d'heures du forfait soit atteint, et retient la date de la dernière séance nécessaire —
     plus précis qu'une simple division en semaines, qui arrondirait mal dès que les créneaux
     ne sont pas répartis à intervalle régulier. */
  function dateFinCalculee(): string | null {
    if (!heuresForfait || !dateDebut || creneaux.length === 0) return null
    const jours = new Set(creneaux.map((c) => c.jour))
    let heuresAccumulees = 0
    let derniereDate: string | null = null
    const curseur = new Date(`${dateDebut}T00:00`)
    // Garde-fou : au-delà de 3 ans, quelque chose ne tourne pas rond (créneau à 0 min, forfait
    // aberrant…) plutôt qu'une boucle qui tourne indéfiniment.
    for (let jour = 0; jour < 366 * 3 && heuresAccumulees < heuresForfait; jour++) {
      if (jours.has(curseur.getDay())) {
        heuresAccumulees += dureeMinutes / 60
        derniereDate = curseur.toISOString().slice(0, 10)
      }
      curseur.setDate(curseur.getDate() + 1)
    }
    return heuresAccumulees >= heuresForfait ? derniereDate : null
  }

  useEffect(() => {
    if (dateFinTouchee) return
    const calculee = dateFinCalculee()
    if (calculee) setDateFin(calculee)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFinTouchee, heuresForfait, dateDebut, dureeMinutes, JSON.stringify(creneaux)])

  async function creer() {
    if (!session || debutsPrevus.length === 0 || studentIds.length === 0 || !dateFin) return
    setEnCours(true)
    setErreur(null)
    setResultat(null)
    const reponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ studentIds, ...(teacherId ? { teacherId } : {}), dureeMinutes, debuts: debutsPrevus }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'La planification a échoué.')
      return
    }
    setResultat(debutsPrevus.length)
    onCree(dateFin)
  }

  return (
    <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ fontSize: 16, color: 'var(--ink)' }}>{titre}</h3>
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
          <input
            type="date"
            value={dateFin}
            onChange={(e) => {
              setDateFin(e.target.value)
              setDateFinTouchee(true)
            }}
            style={champStyle}
          />
          {!dateFinTouchee && heuresForfait && (
            <span style={{ fontSize: 10.5, color: 'var(--muted-2)' }}>Calculée à partir du forfait ({heuresForfait} h) — modifiable</span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Durée (min)</label>
          <input type="number" min={15} step={15} value={dureeMinutes} onChange={(e) => setDureeMinutes(Number(e.target.value))} style={champStyle} />
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
        {studentIds.length === 0
          ? 'Sélectionnez au moins un élève.'
          : debutsPrevus.length > 0
            ? `${debutsPrevus.length} séance(s) seront créées.`
            : 'Renseignez au moins un créneau et une plage de dates valide.'}
      </p>

      <AvertissementDureeMeet dureeMinutes={dureeMinutes} nombreEleves={studentIds.length} />

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{erreur}</p>}
      {resultat !== null && <p style={{ color: 'var(--accent-teal)', fontSize: 13 }}>{resultat} séance(s) planifiée(s).</p>}

      <button
        onClick={creer}
        disabled={enCours || debutsPrevus.length === 0 || studentIds.length === 0}
        className="btn-shine"
        style={{
          background: 'var(--accent-gradient)',
          color: '#1b1510',
          opacity: enCours || debutsPrevus.length === 0 || studentIds.length === 0 ? 0.6 : 1,
        }}
      >
        {enCours ? 'Planification…' : 'Planifier'}
      </button>
    </div>
  )
}
