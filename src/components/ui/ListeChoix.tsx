import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { champStyle } from './Champ'
import { Icone } from './Icones'

export interface OptionListeChoix {
  /* Chaîne vide acceptée : c'est la valeur d'une option « Aucun(e) » / « Autre », comme un
     <option value=""> natif. */
  id: string
  libelle: ReactNode
}

/* Remplace un <select> natif par une liste dessinée DANS la page — demande client du
   2026-11-05 : « la liste déroulante n'est toujours pas visible », capture à l'appui, après
   TROIS tentatives de corriger le popup natif par CSS (2026-10-10, 2026-10-30, 2026-11-05).
   Dernier diagnostic avant ce composant : les données et les couleurs calculées du popup natif
   étaient saines — mesuré en production — mais le popup réel, dessiné par le système
   d'exploitation hors de la page, restait vide chez le client. Un popup système ne se répare
   pas depuis l'application : rien dans le code ne contrôle ce qui se passe une fois qu'il
   s'ouvre. Cette liste-ci est un <div> ordinaire, soumis aux mêmes règles de couleur et de
   thème que le reste de l'écran — si le reste de l'écran est lisible, elle l'est aussi.

   Usage : remplace <select><option>…</option></select> dans un <Champ label="…"> — le <button>
   déclencheur est un élément « labelable » (comme <select>), `getByLabelText` continue donc de
   le trouver dans les tests. */
export function ListeChoix({
  options,
  valeur,
  onChange,
  placeholder = 'Choisir…',
  disabled = false,
}: {
  options: OptionListeChoix[]
  valeur: string
  onChange: (id: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [ouvert, setOuvert] = useState(false)
  const [surligne, setSurligne] = useState(0)
  const conteneurRef = useRef<HTMLDivElement>(null)
  const boutonRef = useRef<HTMLButtonElement>(null)

  const choisie = options.find((o) => o.id === valeur) ?? null

  useEffect(() => {
    if (!ouvert) return
    function surClicExterieur(e: MouseEvent) {
      if (!conteneurRef.current?.contains(e.target as Node)) setOuvert(false)
    }
    document.addEventListener('mousedown', surClicExterieur)
    return () => document.removeEventListener('mousedown', surClicExterieur)
  }, [ouvert])

  function ouvrir() {
    setSurligne(Math.max(0, options.findIndex((o) => o.id === valeur)))
    setOuvert(true)
  }

  function choisir(id: string) {
    onChange(id)
    setOuvert(false)
    boutonRef.current?.focus()
  }

  function surTouche(e: KeyboardEvent<HTMLButtonElement>) {
    if (!ouvert) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        ouvrir()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSurligne((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSurligne((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (options[surligne]) choisir(options[surligne].id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOuvert(false)
    }
  }

  return (
    <div ref={conteneurRef} style={{ position: 'relative' }}>
      <button
        ref={boutonRef}
        type="button"
        disabled={disabled}
        onClick={() => (ouvert ? setOuvert(false) : ouvrir())}
        onKeyDown={surTouche}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        style={{
          ...champStyle,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          textAlign: 'left',
          font: 'inherit',
        }}
      >
        <span style={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: choisie ? 'var(--ink-2)' : 'var(--muted)' }}>
          {choisie ? choisie.libelle : placeholder}
        </span>
        <Icone nom="chevron" taille={13} style={{ color: 'var(--muted)', transform: ouvert ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform .12s' }} />
      </button>

      {ouvert && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 40,
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: 280,
            overflowY: 'auto',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--surface-alt)',
            boxShadow: '0 14px 34px rgba(0,0,0,.18)',
            padding: 4,
          }}
        >
          {options.map((o, i) => (
            <button
              key={o.id || '(vide)'}
              type="button"
              role="option"
              aria-selected={o.id === valeur}
              onMouseEnter={() => setSurligne(i)}
              onClick={() => choisir(o.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                font: 'inherit',
                fontSize: 13.5,
                padding: '8px 10px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ink-2)',
                background: i === surligne ? 'var(--accent-blue-gradient)' : 'transparent',
              }}
            >
              <span style={{ color: i === surligne ? '#fff' : 'inherit' }}>{o.libelle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
