/* Monogramme "eA" + nom de marque, réutilisé dans tous les en-têtes. Le style (texte à
   dégradé animé) reprend la mécanique `.logo-glow` des maquettes Axone. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg
        width={size * 0.9}
        height={size}
        viewBox="0 0 34 38"
        fill="none"
        style={{ filter: 'drop-shadow(0 0 10px rgba(94,179,255,.55))' }}
      >
        <path d="M17 2.6 30.2 10v15L17 32.4 3.8 25V10L17 2.6Z" stroke="#8fcfff" strokeWidth="1.5" />
        <path d="M17 11v5.4M17 21.2v5.4M10.4 17.4h4.6M19 17.4h4.6" stroke="#e9cf94" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="17" cy="17.4" r="2.9" fill="#5eb3ff" />
      </svg>
      <span
        className="logo-glow brand-font"
        style={{ fontWeight: 700, fontSize: size, letterSpacing: 2 }}
      >
        e-Avo
      </span>
    </div>
  )
}
