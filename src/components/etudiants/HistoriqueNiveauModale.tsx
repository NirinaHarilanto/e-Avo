import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useNiveauxEtudiant } from '../../hooks/useNiveauxEtudiant'
import { supabase } from '../../lib/supabaseClient'
import type { DossierEtudiant } from '../../hooks/useDossierEtudiant'
import { Modale } from '../ui/Modale'
import { Champ, champStyle } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'

interface EtapeNiveau {
  date: string
  niveau: string
  source: 'diagnostic' | 'evaluation'
  notes?: string | null
}

interface HistoriqueNiveauModaleProps {
  studentId: string
  etablissementId: string
  diagnostic: DossierEtudiant['diagnostic']
  /* Seul l'admin peut ajouter une réévaluation — cohérent avec le reste du dossier (informations
     personnelles, forfait, professeur) qui ne s'édite que depuis l'espace admin. */
  peutModifier?: boolean
  onFermer: () => void
}

/* Historique du niveau d'un étudiant : le niveau établi à l'appel diagnostic (figé, non
   modifiable ici — voir PipelineCRM pour le corriger) suivi des réévaluations ultérieures
   ajoutées au fil de sa progression. Le niveau « actuel » affiché ailleurs dans le dossier est
   toujours la dernière étape de cette même liste (voir DossierEtudiantVue.tsx). */
export function HistoriqueNiveauModale({ studentId, etablissementId, diagnostic, peutModifier, onFermer }: HistoriqueNiveauModaleProps) {
  const { profile } = useProfileContext()
  const { evaluations, loading, recharger } = useNiveauxEtudiant(studentId)
  const [ouvert, setOuvert] = useState(false)
  const [niveau, setNiveau] = useState('')
  const [notes, setNotes] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const etapes: EtapeNiveau[] = [
    ...(diagnostic?.niveau_evalue ? [{ date: diagnostic.date_appel, niveau: diagnostic.niveau_evalue, source: 'diagnostic' as const }] : []),
    ...evaluations.map((e) => ({ date: e.date_evaluation, niveau: e.niveau, source: 'evaluation' as const, notes: e.notes })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  async function ajouter() {
    if (!profile || !niveau.trim()) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('niveau_evaluations').insert({
      etablissement_id: etablissementId,
      student_id: studentId,
      niveau: niveau.trim(),
      notes: notes.trim() || null,
      evalue_par: profile.id,
    })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setNiveau('')
    setNotes('')
    setOuvert(false)
    recharger()
  }

  return (
    <Modale titre="Historique du niveau" onFermer={onFermer} largeurMax={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {loading ? (
          <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Chargement…</p>
        ) : etapes.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Aucun niveau évalué pour le moment.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {etapes.map((etape, index) => {
              const estActuel = index === etapes.length - 1
              return (
                <div
                  key={`${etape.date}-${index}`}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '9px 4px',
                    borderBottom: index < etapes.length - 1 ? '1px solid var(--border-soft)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: estActuel ? 'var(--accent-teal)' : 'var(--ink)' }}>
                      {etape.niveau}
                      {estActuel && <span style={{ fontSize: 10.5, fontWeight: 700, marginLeft: 7, color: 'var(--accent-teal)' }}>ACTUEL</span>}
                    </span>
                    {etape.notes && <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>{etape.notes}</span>}
                    {etape.source === 'diagnostic' && <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Établi à l'appel diagnostic</span>}
                  </div>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)', flexShrink: 0 }}>
                    {new Date(etape.date).toLocaleDateString('fr-FR')}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {peutModifier && (
          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
            {!ouvert ? (
              <button type="button" onClick={() => setOuvert(true)} style={{ ...boutonNeutreStyle, width: '100%', justifyContent: 'center' }}>
                Ajouter une évaluation
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Champ label="Nouveau niveau" obligatoire>
                  <input value={niveau} onChange={(e) => setNiveau(e.target.value)} placeholder="Ex. B1, Intermédiaire+…" style={champStyle} />
                </Champ>
                <Champ label="Remarque (optionnel)">
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} style={champStyle} />
                </Champ>
                {erreur && <MessageErreur>{erreur}</MessageErreur>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setOuvert(false)} style={{ ...boutonNeutreStyle, flexGrow: 1, justifyContent: 'center' }}>
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={ajouter}
                    disabled={enCours || !niveau.trim()}
                    className="btn-shine"
                    style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours || !niveau.trim() ? 0.6 : 1 }}
                  >
                    {enCours ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modale>
  )
}
