import { useState } from 'react'
import {
  SECTIONS_DIAGNOSTIC,
  formaterReponse,
  type QuestionDiagnostic,
  type ReponsesDiagnostic,
} from '../../lib/diagnostic'
import { Champ, champStyle } from '../ui/Champ'

/* Trame de l'appel diagnostic, déroulée par l'interviewer pendant l'appel. Les questions
   viennent de `lib/diagnostic.ts` : ce composant ne fait que les rendre, rien n'est écrit en
   dur ici. */
export function FormulaireDiagnosticCall({
  reponses,
  onChange,
}: {
  reponses: ReponsesDiagnostic
  onChange: (reponses: ReponsesDiagnostic) => void
}) {
  function definir(cle: string, valeur: string | string[] | undefined) {
    onChange({ ...reponses, [cle]: valeur })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {SECTIONS_DIAGNOSTIC.map((section) => (
        <div key={section.titre} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--accent-blue)' }}>
            {section.titre}
          </span>
          {section.questions.map((question) => (
            <ChampQuestion key={question.cle} question={question} reponses={reponses} onDefinir={definir} />
          ))}
        </div>
      ))}
    </div>
  )
}

function ChampQuestion({
  question,
  reponses,
  onDefinir,
}: {
  question: QuestionDiagnostic
  reponses: ReponsesDiagnostic
  onDefinir: (cle: string, valeur: string | string[] | undefined) => void
}) {
  const valeur = reponses[question.cle]
  const precision = typeof reponses[`${question.cle}_precision`] === 'string' ? (reponses[`${question.cle}_precision`] as string) : ''

  if (question.type === 'choix-multiple') {
    const coches = Array.isArray(valeur) ? valeur : []
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>{question.libelle}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(question.options ?? []).map((option) => (
            <label key={option} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={coches.includes(option)}
                onChange={(e) =>
                  onDefinir(question.cle, e.target.checked ? [...coches, option] : coches.filter((o) => o !== option))
                }
                style={{ marginTop: 2 }}
              />
              {option}
            </label>
          ))}
        </div>
        {question.precision && (
          <input
            value={precision}
            onChange={(e) => onDefinir(`${question.cle}_precision`, e.target.value)}
            placeholder="Autre (à préciser)"
            style={champStyle}
          />
        )}
      </div>
    )
  }

  if (question.type === 'choix') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Champ label={question.libelle}>
          <select value={typeof valeur === 'string' ? valeur : ''} onChange={(e) => onDefinir(question.cle, e.target.value)} style={champStyle}>
            <option value="">Non renseigné</option>
            {(question.options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            {question.precision && <option value="Autre">Autre</option>}
          </select>
        </Champ>
        {question.precision && valeur === 'Autre' && (
          <input
            value={precision}
            onChange={(e) => onDefinir(`${question.cle}_precision`, e.target.value)}
            placeholder="Précisez"
            style={champStyle}
          />
        )}
      </div>
    )
  }

  if (question.type === 'zone') {
    return (
      <Champ label={question.libelle}>
        <textarea
          value={typeof valeur === 'string' ? valeur : ''}
          onChange={(e) => onDefinir(question.cle, e.target.value)}
          rows={2}
          style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </Champ>
    )
  }

  return (
    <Champ label={question.libelle}>
      <input
        value={typeof valeur === 'string' ? valeur : ''}
        onChange={(e) => onDefinir(question.cle, e.target.value)}
        placeholder={question.placeholder}
        style={champStyle}
      />
    </Champ>
  )
}

/* Lecture seule du même questionnaire, pour le dossier de l'élève une fois le prospect
   converti : seules les questions réellement remplies sont affichées. */
export function RecapitulatifDiagnostic({ reponses }: { reponses: ReponsesDiagnostic }) {
  const [tout, setTout] = useState(false)
  const sections = SECTIONS_DIAGNOSTIC.map((section) => ({
    titre: section.titre,
    lignes: section.questions
      .map((q) => ({ libelle: q.libelle, valeur: formaterReponse(reponses, q) }))
      .filter((l): l is { libelle: string; valeur: string } => l.valeur !== null),
  })).filter((s) => s.lignes.length > 0)

  if (sections.length === 0) return null
  const visibles = tout ? sections : sections.slice(0, 2)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {visibles.map((section) => (
        <div key={section.titre} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--accent-blue)' }}>
            {section.titre}
          </span>
          {section.lignes.map((ligne) => (
            <div key={ligne.libelle} style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{ligne.libelle}</span>
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)', textAlign: 'right' }}>{ligne.valeur}</span>
            </div>
          ))}
        </div>
      ))}
      {sections.length > 2 && (
        <button
          type="button"
          onClick={() => setTout((v) => !v)}
          style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', padding: 0, fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', cursor: 'pointer', textDecoration: 'underline' }}
        >
          {tout ? 'Réduire' : `Voir les ${sections.length - 2} autres sections`}
        </button>
      )}
    </div>
  )
}
