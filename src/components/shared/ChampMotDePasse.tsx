import { useState, type InputHTMLAttributes } from 'react'
import { Icone } from '../ui/Icones'

interface ChampMotDePasseProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  valeur: string
  onValeurChange: (valeur: string) => void
}

export function ChampMotDePasse({ valeur, onValeurChange, style, ...props }: ChampMotDePasseProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div style={{ position: 'relative', display: 'flex' }}>
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        value={valeur}
        onChange={(e) => onValeurChange(e.target.value)}
        style={{
          width: '100%',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '12px 44px 12px 14px',
          fontSize: 14,
          color: 'var(--ink)',
          background: 'rgba(0,0,0,.22)',
          ...style,
        }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        style={{
          position: 'absolute',
          right: 4,
          top: 0,
          bottom: 0,
          margin: 'auto 0',
          height: 32,
          width: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          color: 'var(--ink-2)',
        }}
      >
        <Icone nom={visible ? 'oeil_barre' : 'oeil'} taille={18} />
      </button>
    </div>
  )
}
