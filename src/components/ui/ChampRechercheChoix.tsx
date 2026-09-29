import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { normaliserNom } from '../../lib/nomDuplique'
import { champStyle } from './Champ'

export interface OptionRecherche {
  id: string
  libelle: string
  detail?: string
}

const LIMITE = 10

/* Choix unique par recherche : on tape quelques lettres, on choisit une ligne. Pendant de
   SelecteurPersonnes (multi-sélection) pour les formulaires qui ne désignent qu'une cible. */
export function ChampRechercheChoix({
  options,
  valeur,
  onChange,
  placeholder = 'Rechercher…',
}: {
  options: OptionRecherche[]
  valeur: string
  onChange: (id: string) => void
  placeholder?: string
}) {
  const [saisie, setSaisie] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const [surligne, setSurligne] = useState(0)
  const champRef = useRef<HTMLInputElement>(null)
  const choisie = options.find((o) => o.id === valeur) ?? null

  const recherche = normaliserNom(saisie)
  const suggestions = useMemo(
    () =>
      options
        .filter((o) => !recherche || normaliserNom(`${o.libelle} ${o.detail ?? ''}`).includes(recherche))
        .slice(0, LIMITE),
    [options, recherche],
  )

  function choisir(id: string) {
    onChange(id)
    setSaisie('')
    setOuvert(false)
  }

  function surTouche(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOuvert(true)
      setSurligne((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSurligne((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && ouvert && suggestions[surligne]) {
      e.preventDefault()
      choisir(suggestions[surligne].id)
    } else if (e.key === 'Escape') {
      setOuvert(false)
    }
  }

  if (choisie && !ouvert) {
    return (
      <div style={{ ...champStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {choisie.libelle}
          {choisie.detail && <span style={{ color: 'var(--muted)', fontSize: 11.5 }}> · {choisie.detail}</span>}
        </span>
        <button
          type="button"
          onClick={() => {
            onChange('')
            setOuvert(true)
            setTimeout(() => champRef.current?.focus(), 0)
          }}
          aria-label="Changer"
          style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 15, padding: 0 }}
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={champRef}
        value={saisie}
        placeholder={placeholder}
        onChange={(e) => {
          setSaisie(e.target.value)
          setOuvert(true)
          setSurligne(0)
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
        onKeyDown={surTouche}
        style={{ ...champStyle, width: '100%', boxSizing: 'border-box' }}
      />
      {ouvert && suggestions.length > 0 && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 30,
            background: 'var(--surface, #111a2e)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 12px 30px rgba(0,0,0,.4)',
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {suggestions.map((o, i) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={i === surligne}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choisir(o.id)}
              onMouseEnter={() => setSurligne(i)}
              style={{
                display: 'flex',
                width: '100%',
                justifyContent: 'space-between',
                gap: 10,
                textAlign: 'left',
                padding: '9px 12px',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                color: 'var(--ink)',
                background: i === surligne ? 'rgba(94,179,255,.12)' : 'transparent',
              }}
            >
              <span>{o.libelle}</span>
              {o.detail && <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{o.detail}</span>}
            </button>
          ))}
        </div>
      )}
      {ouvert && recherche && suggestions.length === 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30, fontSize: 12, color: 'var(--muted)', background: 'var(--surface, #111a2e)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px' }}>
          Aucun résultat.
        </div>
      )}
    </div>
  )
}
