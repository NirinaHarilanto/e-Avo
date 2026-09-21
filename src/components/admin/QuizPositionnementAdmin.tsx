import { useCallback, useEffect, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { Champ, champStyle } from '../ui/Champ'
import { boutonDangerStyle, boutonNeutreStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { EtatVide } from '../ui/EtatVide'
import { Modale } from '../ui/Modale'

type Question = Database['public']['Tables']['quiz_questions']['Row']

/* Paramétrage du questionnaire écrit passé par les candidats au collectif (demande client du
   2026-09-21 : « paramétrable depuis l'espace admin »). Les 10 questions livrées par le client
   sont insérées par la migration 0051 ; tout est modifiable ici, y compris la bonne réponse. */
export function QuizPositionnementAdmin() {
  const { profile } = useProfileContext()
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [edition, setEdition] = useState<Question | 'nouvelle' | null>(null)

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from('quiz_questions').select('*').order('ordre')
    if (error) setErreur(error.message)
    setQuestions(data ?? [])
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  async function enregistrer(valeurs: { enonce: string; options: string[]; bonneReponse: number; ordre: number }) {
    if (!profile) return
    setErreur(null)
    const { error } =
      edition && edition !== 'nouvelle'
        ? await supabase
            .from('quiz_questions')
            .update({ enonce: valeurs.enonce, options: valeurs.options, bonne_reponse: valeurs.bonneReponse, ordre: valeurs.ordre })
            .eq('id', edition.id)
        : await supabase.from('quiz_questions').insert({
            etablissement_id: profile.etablissement_id,
            enonce: valeurs.enonce,
            options: valeurs.options,
            bonne_reponse: valeurs.bonneReponse,
            ordre: valeurs.ordre,
          })
    if (error) {
      setErreur(error.message)
      return
    }
    setEdition(null)
    charger()
  }

  async function basculerActif(question: Question) {
    setErreur(null)
    const { error } = await supabase.from('quiz_questions').update({ actif: !question.actif }).eq('id', question.id)
    if (error) {
      setErreur(error.message)
      return
    }
    charger()
  }

  async function supprimer(question: Question) {
    if (!window.confirm('Supprimer cette question ? Les tests déjà passés gardent leur note.')) return
    setErreur(null)
    const { error } = await supabase.from('quiz_questions').delete().eq('id', question.id)
    if (error) {
      setErreur(error.message)
      return
    }
    charger()
  }

  if (questions === null) return <EtatChargement lignes={4} hauteur={60} />

  const actives = questions.filter((q) => q.actif)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, flexGrow: 1, lineHeight: 1.55 }}>
          {actives.length} question(s) active(s). Seules les questions actives sont posées aux candidats, et la note est
          calculée sur leur nombre — désactiver une question ne fausse donc aucun résultat déjà enregistré.
        </p>
        <button onClick={() => setEdition('nouvelle')} className="btn-shine" style={boutonPrimaireStyle}>
          Ajouter une question
        </button>
      </div>

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {questions.length === 0 ? (
        <EtatVide
          icone="documents"
          titre="Aucune question"
          description="Ajoutez au moins une question pour que les candidats au collectif puissent valider leur réservation."
        />
      ) : (
        questions.map((question) => (
          <div
            key={question.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
              borderRadius: 12,
              border: '1px solid var(--border)',
              padding: '12px 14px',
              opacity: question.actif ? 1 : 0.55,
            }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--ink)', flexGrow: 1, minWidth: 220 }}>
                <strong style={{ color: 'var(--muted)' }}>{question.ordre}.</strong> {question.enonce}
              </span>
              <button onClick={() => setEdition(question)} style={boutonSecondaireStyle}>
                Modifier
              </button>
              <button onClick={() => basculerActif(question)} style={boutonNeutreStyle}>
                {question.actif ? 'Désactiver' : 'Activer'}
              </button>
              <button onClick={() => supprimer(question)} style={boutonDangerStyle}>
                Supprimer
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {question.options.map((option, index) => (
                <span
                  key={option}
                  style={{
                    fontSize: 12,
                    color: index === question.bonne_reponse ? 'var(--accent-teal)' : 'var(--muted)',
                    fontWeight: index === question.bonne_reponse ? 700 : 400,
                  }}
                >
                  {String.fromCharCode(65 + index)}. {option}
                  {index === question.bonne_reponse && ' ✓'}
                </span>
              ))}
            </div>
          </div>
        ))
      )}

      {edition && (
        <FormulaireQuestion
          question={edition === 'nouvelle' ? null : edition}
          ordreParDefaut={questions.length + 1}
          onFermer={() => setEdition(null)}
          onEnregistrer={enregistrer}
        />
      )}
    </div>
  )
}

function FormulaireQuestion({
  question,
  ordreParDefaut,
  onFermer,
  onEnregistrer,
}: {
  question: Question | null
  ordreParDefaut: number
  onFermer: () => void
  onEnregistrer: (valeurs: { enonce: string; options: string[]; bonneReponse: number; ordre: number }) => void
}) {
  const [enonce, setEnonce] = useState(question?.enonce ?? '')
  const [options, setOptions] = useState<string[]>(question?.options ?? ['', '', '', ''])
  const [bonneReponse, setBonneReponse] = useState(question?.bonne_reponse ?? 0)
  const [ordre, setOrdre] = useState(String(question?.ordre ?? ordreParDefaut))

  const remplies = options.filter((o) => o.trim().length > 0)
  const valide = enonce.trim().length > 0 && remplies.length >= 2 && (options[bonneReponse] ?? '').trim().length > 0

  return (
    <Modale titre={question ? 'Modifier la question' : 'Nouvelle question'} onFermer={onFermer} largeurMax={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Champ label="Énoncé" obligatoire>
          <textarea
            value={enonce}
            onChange={(e) => setEnonce(e.target.value)}
            rows={2}
            style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Champ>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Propositions — cochez la bonne réponse
          </span>
          {options.map((option, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <input
                type="radio"
                name="bonne-reponse"
                checked={bonneReponse === index}
                onChange={() => setBonneReponse(index)}
                aria-label={`Proposition ${String.fromCharCode(65 + index)} correcte`}
              />
              <input
                value={option}
                onChange={(e) => setOptions((liste) => liste.map((o, i) => (i === index ? e.target.value : o)))}
                placeholder={`Proposition ${String.fromCharCode(65 + index)}`}
                style={{ ...champStyle, flexGrow: 1 }}
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => {
                    setOptions((liste) => liste.filter((_, i) => i !== index))
                    /* Retirer une proposition décale les suivantes : sans ce recalage, la bonne
                       réponse désignerait soudain une autre proposition. */
                    setBonneReponse((actuel) => (actuel > index ? actuel - 1 : actuel === index ? 0 : actuel))
                  }}
                  style={boutonDangerStyle}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setOptions((liste) => [...liste, ''])} style={boutonSecondaireStyle}>
            Ajouter une proposition
          </button>
        </div>

        <Champ label="Ordre d’affichage">
          <input type="number" min={1} value={ordre} onChange={(e) => setOrdre(e.target.value)} style={champStyle} />
        </Champ>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onFermer} style={boutonNeutreStyle}>
            Annuler
          </button>
          <button
            onClick={() =>
              onEnregistrer({
                enonce: enonce.trim(),
                options: options.map((o) => o.trim()).filter((o) => o.length > 0),
                bonneReponse,
                ordre: Number(ordre) || ordreParDefaut,
              })
            }
            disabled={!valide}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, opacity: valide ? 1 : 0.6 }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </Modale>
  )
}
