import { useState } from 'react'
import { CreerForfait } from './CreerForfait'
import { AssignerVague } from './AssignerVague'
import type { TypeProgrammeProspect } from '../../types/database.types'

const LABEL: Record<TypeProgrammeProspect, string> = { individuel: 'Individuel', duo: 'Duo', collectif: 'Collectif' }

interface ChoixProgrammeInitialProps {
  studentId: string
  etablissementId: string
  onCree: () => void
}

/* Étape initiale de classement d'un étudiant qui n'a encore ni forfait ni vague : l'admin
   choisit d'abord le programme, ce qui détermine s'il faut créer un forfait (individuel/duo)
   ou assigner une vague (collectif). */
export function ChoixProgrammeInitial({ studentId, etablissementId, onCree }: ChoixProgrammeInitialProps) {
  const [choix, setChoix] = useState<TypeProgrammeProspect | null>(null)

  if (choix === 'collectif') {
    return <AssignerVague studentId={studentId} etablissementId={etablissementId} vagueActuelle={null} ouvertParDefaut onTermine={onCree} />
  }
  if (choix === 'individuel' || choix === 'duo') {
    return <CreerForfait studentId={studentId} etablissementId={etablissementId} typeProgrammeInitial={choix} onCree={onCree} />
  }

  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ fontSize: 14, color: 'var(--accent-gold, #e9cf94)' }}>Choisir un programme</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(['individuel', 'duo', 'collectif'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setChoix(type)}
            className="btn-shine"
            style={{ fontSize: 12.5, padding: 10, background: 'var(--accent-blue-gradient)', color: '#fff' }}
          >
            {LABEL[type]}
          </button>
        ))}
      </div>
    </div>
  )
}
