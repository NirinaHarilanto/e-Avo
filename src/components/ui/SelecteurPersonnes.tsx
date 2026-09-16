import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { normaliserNom } from '../../lib/nomDuplique'

export interface PersonneSelectionnable {
  id: string
  nom: string | null
  prenom: string | null
  /* Étiquette facultative affichée à côté du nom dans la liste de suggestions (ex. « Étudiant »,
     « Professeur ») — purement indicative, aucune logique n'en dépend ici. */
  role?: string
}

interface SelecteurPersonnesProps {
  etiquette: string
  placeholder?: string
  candidats: PersonneSelectionnable[]
  selectionnes: string[]
  onChange: (ids: string[]) => void
  /* Identifiants à exclure des suggestions même s'ils correspondent à la recherche — sert à
     empêcher qu'une même personne soit choisie à la fois dans la zone « obligatoire » et la zone
     « optionnelle » d'un même formulaire (voir FormulaireCreerEvenement). */
  exclure?: string[]
}

const LIMITE_SUGGESTIONS = 8

function nomComplet(p: PersonneSelectionnable): string {
  return `${p.prenom ?? ''} ${p.nom ?? ''}`.trim()
}

/* Champ de recherche multi-sélection façon Outlook (demande client du 2026-09-16) : on tape un
   nom ou un prénom, une liste de suggestions apparaît, on choisit — la personne devient une
   pastille amovible dans le champ, et la recherche se vide pour en ajouter une autre. Toutes les
   personnes passées en `candidats` sont retrouvables, quel que soit leur rôle : c'est l'appelant
   qui décide du vivier (tous les inscrits de l'établissement pour l'admin, les seuls élèves
   attribués pour un professeur — voir CalendrierProfesseur.tsx). */
export function SelecteurPersonnes({ etiquette, placeholder, candidats, selectionnes, onChange, exclure = [] }: SelecteurPersonnesProps) {
  const [saisie, setSaisie] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const [surligne, setSurligne] = useState(0)
  const champRef = useRef<HTMLInputElement>(null)

  const candidatParId = useMemo(() => new Map(candidats.map((c) => [c.id, c])), [candidats])
  const recherche = normaliserNom(saisie)
  const suggestions = useMemo(() => {
    if (!recherche) return []
    return candidats
      .filter((c) => !selectionnes.includes(c.id) && !exclure.includes(c.id) && normaliserNom(nomComplet(c)).includes(recherche))
      .slice(0, LIMITE_SUGGESTIONS)
  }, [candidats, recherche, selectionnes, exclure])

  function ajouter(id: string) {
    onChange([...selectionnes, id])
    setSaisie('')
    setSurligne(0)
    champRef.current?.focus()
  }

  function retirer(id: string) {
    onChange(selectionnes.filter((v) => v !== id))
  }

  function surTouche(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSurligne((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSurligne((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (suggestions[surligne]) ajouter(suggestions[surligne].id)
    } else if (e.key === 'Backspace' && !saisie && selectionnes.length > 0) {
      // Comme dans Outlook : effacer dans un champ vide retire la dernière pastille.
      retirer(selectionnes[selectionnes.length - 1])
    } else if (e.key === 'Escape') {
      setOuvert(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>{etiquette}</label>
      <div
        onClick={() => champRef.current?.focus()}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '7px 9px',
          background: 'rgba(0,0,0,.22)',
          cursor: 'text',
        }}
      >
        {selectionnes.map((id) => {
          const personne = candidatParId.get(id)
          return (
            <span
              key={id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--accent-blue)',
                background: 'rgba(94,179,255,.14)',
                border: '1px solid rgba(94,179,255,.3)',
                borderRadius: 999,
                padding: '3px 6px 3px 10px',
              }}
            >
              {personne ? nomComplet(personne) : 'Personne introuvable'}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  retirer(id)
                }}
                aria-label={`Retirer ${personne ? nomComplet(personne) : ''}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 15,
                  height: 15,
                  borderRadius: 999,
                  border: 'none',
                  background: 'rgba(94,179,255,.22)',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontSize: 11,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </span>
          )
        })}
        <input
          ref={champRef}
          value={saisie}
          onChange={(e) => {
            setSaisie(e.target.value)
            setOuvert(true)
            setSurligne(0)
          }}
          onFocus={() => setOuvert(true)}
          onBlur={() => setTimeout(() => setOuvert(false), 120)}
          onKeyDown={surTouche}
          placeholder={selectionnes.length === 0 ? placeholder : ''}
          style={{
            flex: '1 1 120px',
            minWidth: 120,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--ink)',
            fontSize: 13,
            fontFamily: 'inherit',
            padding: '3px 2px',
          }}
        />
      </div>

      {ouvert && suggestions.length > 0 && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            zIndex: 20,
            background: '#0d1938',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 12px 28px rgba(0,0,0,.5)',
            overflow: 'hidden',
          }}
        >
          {suggestions.map((personne, index) => (
            <button
              key={personne.id}
              type="button"
              role="option"
              aria-selected={index === surligne}
              // onMouseDown plutôt que onClick : il se déclenche AVANT le `blur` du champ, qui
              // fermerait sinon la liste avant que le clic n'ait pu être traité.
              onMouseDown={(e) => {
                e.preventDefault()
                ajouter(personne.id)
              }}
              onMouseEnter={() => setSurligne(index)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                padding: '9px 12px',
                border: 'none',
                background: index === surligne ? 'rgba(94,179,255,.14)' : 'transparent',
                color: 'var(--ink)',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span>{nomComplet(personne)}</span>
              {personne.role && <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{personne.role}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
