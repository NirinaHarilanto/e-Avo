import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useTarifs } from '../../hooks/useTarifs'
import type { Database, TypeProgrammeProspect } from '../../types/database.types'

type Package = Database['public']['Tables']['packages']['Row']

const LABEL_PROGRAMME: Record<'individuel' | 'duo', string> = { individuel: 'Individuel', duo: 'Duo' }

interface CreerForfaitProps {
  studentId: string
  etablissementId: string
  /* Présent = mode édition d'un forfait existant plutôt que création. */
  forfaitExistant?: Package | null
  /* Création seulement : programme déjà choisi en amont (voir ChoixProgrammeInitial), le
     formulaire s'ouvre alors directement plutôt que replié derrière un bouton. */
  typeProgrammeInitial?: 'individuel' | 'duo'
  onCree: () => void
}

export function CreerForfait({ studentId, etablissementId, forfaitExistant, typeProgrammeInitial, onCree }: CreerForfaitProps) {
  const modeEdition = !!forfaitExistant
  const [ouvert, setOuvert] = useState(modeEdition || !!typeProgrammeInitial)
  const [typeProgramme, setTypeProgramme] = useState<'individuel' | 'duo'>(
    forfaitExistant?.type_programme === 'duo' || typeProgrammeInitial === 'duo' ? 'duo' : 'individuel',
  )
  const [totalHeures, setTotalHeures] = useState(forfaitExistant?.total_heures ?? 20)
  const [montant, setMontant] = useState(forfaitExistant?.montant?.toString() ?? '')
  const [echeance, setEcheance] = useState(forfaitExistant?.echeance ?? '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  /* Rappel de la grille tarifaire de l'établissement pour le programme choisi : l'admin saisit
     un montant, il n'est pas calculé — la grille est une brochure en texte libre, et le montant
     réellement convenu peut s'en écarter (remise, ancienneté…). */
  const { tarifs } = useTarifs(etablissementId)
  const tarifsDuProgramme = tarifs.filter((t) => t.type_programme === typeProgramme)

  async function enregistrer() {
    setEnCours(true)
    setErreur(null)
    const payload = {
      type_programme: typeProgramme as TypeProgrammeProspect,
      total_heures: totalHeures,
      montant: montant ? Number(montant) : null,
      echeance: echeance || null,
    }
    const { error } = forfaitExistant
      ? await supabase.from('packages').update(payload).eq('id', forfaitExistant.id)
      : await supabase.from('packages').insert({ etablissement_id: etablissementId, student_id: studentId, ...payload })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    if (!modeEdition) setOuvert(false)
    onCree()
  }

  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)} className="btn-shine" style={{ width: '100%', fontSize: 12.5, padding: 10, background: 'var(--accent-gradient)', color: '#1b1510' }}>
        Créer un forfait
      </button>
    )
  }

  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ fontSize: 14, color: 'var(--accent-gold, #e9cf94)' }}>{modeEdition ? 'Modifier le forfait' : 'Nouveau forfait'}</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Programme</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['individuel', 'duo'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTypeProgramme(type)}
              style={{
                flexGrow: 1,
                fontSize: 12.5,
                fontWeight: typeProgramme === type ? 800 : 600,
                color: typeProgramme === type ? '#1b1510' : 'var(--ink-2)',
                background: typeProgramme === type ? 'var(--accent-gradient)' : 'rgba(0,0,0,.22)',
                border: typeProgramme === type ? 'none' : '1px solid var(--border)',
                borderRadius: 999,
                padding: '9px 12px',
                cursor: 'pointer',
              }}
            >
              {LABEL_PROGRAMME[type]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Total d'heures</label>
        <input
          type="number"
          min={1}
          value={totalHeures}
          onChange={(e) => setTotalHeures(Number(e.target.value))}
          style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Montant du forfait (Ar)</label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          placeholder="Ex. 1 200 000"
          style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
        />
        {tarifsDuProgramme.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--muted-2)', lineHeight: 1.5 }}>
            Grille en vigueur :{' '}
            {tarifsDuProgramme.map((t) => `${t.titre} — ${t.prix.toLocaleString('fr-FR')} ${t.unite}`).join(' · ')}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Échéance (optionnel)</label>
        <input
          type="date"
          value={echeance}
          onChange={(e) => setEcheance(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
        />
      </div>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{erreur}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        {!modeEdition && (
          <button onClick={() => setOuvert(false)} style={{ flexGrow: 1, fontSize: 12.5, padding: 9, borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
            Annuler
          </button>
        )}
        <button onClick={enregistrer} disabled={enCours} className="btn-shine" style={{ flexGrow: 1, fontSize: 12.5, padding: 9, background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours ? 0.6 : 1 }}>
          {modeEdition ? 'Enregistrer' : 'Confirmer'}
        </button>
      </div>
    </div>
  )
}
