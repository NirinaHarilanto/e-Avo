import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useCohortClasses } from '../../hooks/useCohortClasses'
import { LABEL_NIVEAU_CLASSE, libelleCreneau } from '../../lib/classesCollectif'
import { useCreneauxClasses } from '../../hooks/useCreneauxClasses'
import { Champ, champStyle } from '../ui/Champ'
import { boutonNeutreStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'
import { MessageErreur } from '../ui/Etats'

/* Changer la CLASSE de niveau d'un élève collectif, SANS repasser par le choix de la vague —
   demande client du 2026-10-11 : « rajoute la possibilité de changer de classe également pour
   l'étudiant ». AssignerVague.tsx permet déjà de choisir vague ET classe ensemble, mais oblige à
   reparcourir les deux à chaque fois, y compris quand seule la classe doit changer (même élève,
   même promotion, juste un autre niveau ou un autre créneau). Composant scopé à LA vague
   actuelle : une seule liste à choisir, pas deux. */
export function ChangerClasseEtudiant({
  studentId,
  cohortId,
  classeActuelleId,
  onTermine,
}: {
  studentId: string
  cohortId: string
  classeActuelleId: string | null
  onTermine: () => void
}) {
  const { classes, loading } = useCohortClasses(cohortId)
  const { creneaux: creneauxClasses } = useCreneauxClasses()
  const [ouvert, setOuvert] = useState(false)
  const [classeId, setClasseId] = useState(classeActuelleId ?? '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function changer() {
    setEnCours(true)
    setErreur(null)
    // Le trigger de capacité (migration 0074) reste la garde ultime si deux admins agissent en
    // même temps — même principe que l'ajout d'élèves depuis la fiche de la classe.
    const { error } = await supabase
      .from('cohort_enrollments')
      .update({ cohort_class_id: classeId || null })
      .eq('cohort_id', cohortId)
      .eq('student_id', studentId)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setOuvert(false)
    onTermine()
  }

  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)} style={boutonSecondaireStyle}>
        Changer de classe
      </button>
    )
  }

  return (
    <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h4 style={{ fontSize: 13, color: 'var(--accent-gold, #e9cf94)', margin: 0 }}>Changer de classe</h4>
      <Champ label="Classe">
        <select value={classeId} onChange={(e) => setClasseId(e.target.value)} style={champStyle}>
          <option value="">{loading ? 'Chargement…' : 'Aucune classe (à régulariser plus tard)'}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {LABEL_NIVEAU_CLASSE[c.niveau]}
              {c.nom ? ` — ${c.nom}` : ''} · {libelleCreneau(creneauxClasses, c.creneau)}
            </option>
          ))}
        </select>
      </Champ>
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setOuvert(false)} disabled={enCours} style={boutonNeutreStyle}>
          Annuler
        </button>
        <button
          onClick={changer}
          disabled={enCours || classeId === (classeActuelleId ?? '')}
          className="btn-shine"
          style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours || classeId === (classeActuelleId ?? '') ? 0.6 : 1 }}
        >
          {enCours ? 'Enregistrement…' : 'Confirmer'}
        </button>
      </div>
    </div>
  )
}
