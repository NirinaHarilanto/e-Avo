import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { SeanceDuParcours } from '../../hooks/useDossierEtudiant'
import { Modale } from '../ui/Modale'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { champStyle } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { Icone } from '../ui/Icones'

/* Cinq étoiles cliquables (note obligatoire) ou simplement affichées (lecture seule) — un seul
   composant pour les deux usages plutôt que dupliquer le tracé des cinq pictogrammes. */
export function Etoiles({
  valeur,
  onChange,
  taille = 15,
}: {
  valeur: number
  onChange?: (valeur: number) => void
  taille?: number
}) {
  return (
    <div style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
          aria-pressed={n <= valeur}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 1,
            cursor: onChange ? 'pointer' : 'default',
            color: n <= valeur ? 'var(--accent-gold, #e9cf94)' : 'var(--border)',
            display: 'inline-flex',
          }}
        >
          <svg width={taille} height={taille} viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M12 2.5l2.9 6.4 6.9.7-5.2 4.8 1.5 6.9L12 17.8l-6.1 3.5 1.5-6.9L2.2 9.6l6.9-.7z" />
          </svg>
        </button>
      ))}
    </div>
  )
}

/* Pastille compacte pour la ligne de séance (dossier vu par l'admin/le professeur) — moyenne des
   notes globales si plusieurs enquêtes existent (binôme DUO), une décimale seulement quand ce
   n'est pas un nombre rond. */
export function BadgeSatisfaction({ satisfactions }: { satisfactions: SeanceDuParcours['satisfactions'] }) {
  if (satisfactions.length === 0) return null
  const moyenne = satisfactions.reduce((total, s) => total + s.note_globale, 0) / satisfactions.length
  const affichee = Number.isInteger(moyenne) ? String(moyenne) : moyenne.toFixed(1)
  return (
    <span
      title={`Satisfaction : ${affichee}/5${satisfactions.length > 1 ? ` (moyenne de ${satisfactions.length} avis)` : ''}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)' }}
    >
      <Icone nom="etoile" taille={12} />
      {affichee}/5
    </span>
  )
}

/* Bouton + pop-up de l'enquête de satisfaction (0068, demande client du 2026-09-23) : « à chaque
   fin de séance, l'étudiant devra renseigner une petite enquête... avec un système d'étoiles ».
   Écrit directement dans `session_satisfaction` — pas d'endpoint dédié, la RLS
   (session_satisfaction_student_insert) porte déjà toutes les règles (séance terminée, élève
   réellement concerné, y compris un second membre de binôme DUO sans inscription propre). */
export function SatisfactionSeance({
  seance,
  studentId,
  onEnregistre,
}: {
  seance: SeanceDuParcours
  studentId: string
  onEnregistre: () => void
}) {
  const [ouverte, setOuverte] = useState(false)
  const [noteGlobale, setNoteGlobale] = useState(0)
  const [notePedagogie, setNotePedagogie] = useState(0)
  const [commentaire, setCommentaire] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const dejaRepondu = seance.satisfactions.find((s) => s.student_id === studentId) ?? null

  if (dejaRepondu) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Etoiles valeur={dejaRepondu.note_globale} taille={13} />
        <span style={{ fontSize: 10.5, color: 'var(--muted-2)' }}>Merci pour votre avis</span>
      </span>
    )
  }

  async function enregistrer() {
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('session_satisfaction').insert({
      etablissement_id: seance.session.etablissement_id,
      session_id: seance.session.id,
      student_id: studentId,
      note_globale: noteGlobale,
      note_pedagogie: notePedagogie || null,
      commentaire: commentaire.trim() || null,
    })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setOuverte(false)
    onEnregistre()
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOuverte(true)
        }}
        style={{ background: 'transparent', border: '1px dashed var(--border)', borderRadius: 999, padding: '2px 9px', fontSize: 10.5, fontWeight: 700, color: 'var(--accent-blue)', cursor: 'pointer' }}
      >
        Donner votre avis
      </button>

      {ouverte && (
        <Modale titre="Votre avis sur cette séance" onFermer={() => setOuverte(false)} largeurMax={420}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Note globale (obligatoire)</label>
              <Etoiles valeur={noteGlobale} onChange={setNoteGlobale} taille={22} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Clarté du cours (facultatif)</label>
              <Etoiles valeur={notePedagogie} onChange={setNotePedagogie} taille={22} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Commentaire (facultatif)</label>
              <textarea
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                rows={3}
                placeholder="Ce que vous avez aimé, ce qui pourrait être amélioré…"
                style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
            {erreur && <MessageErreur>{erreur}</MessageErreur>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setOuverte(false)} style={boutonNeutreStyle}>
                Annuler
              </button>
              <button
                type="button"
                onClick={enregistrer}
                disabled={enCours || noteGlobale === 0}
                className="btn-shine"
                style={{ ...boutonPrimaireStyle, fontSize: 12.5, padding: '9px 16px', opacity: enCours || noteGlobale === 0 ? 0.6 : 1 }}
              >
                {enCours ? 'Envoi…' : 'Envoyer mon avis'}
              </button>
            </div>
          </div>
        </Modale>
      )}
    </>
  )
}
