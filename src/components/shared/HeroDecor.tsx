/* Décor animé de fond pour les sections héros (rayons lumineux, hexagones à la dérive,
   halo doux) — repris des maquettes Axone (Main.dc.html, Landing.dc.html). Purement
   décoratif : `aria-hidden` et `pointer-events: none` partout, désactivé automatiquement
   par la règle `prefers-reduced-motion` globale (src/index.css). */
export function HeroDecor({ accent = '#5eb3ff' }: { accent?: string }) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <span
        style={{
          position: 'absolute',
          top: '-4%',
          left: '31%',
          width: 2,
          height: '56%',
          background: 'linear-gradient(to bottom, rgba(150,225,255,.75), transparent)',
          filter: 'blur(1.5px)',
          animation: 'rayBreath 5.5s ease-in-out infinite',
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: '-4%',
          left: '52%',
          width: 3,
          height: '46%',
          background: 'linear-gradient(to bottom, rgba(150,225,255,.75), transparent)',
          filter: 'blur(1.5px)',
          animation: 'rayBreath 6.4s ease-in-out .8s infinite',
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: '-4%',
          left: '68%',
          width: 2,
          height: '40%',
          background: 'linear-gradient(to bottom, rgba(150,225,255,.75), transparent)',
          filter: 'blur(1.5px)',
          animation: 'rayBreath 5.9s ease-in-out .4s infinite',
        }}
      />

      <span
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 60,
          width: 420,
          height: 130,
          marginLeft: -210,
          background: `radial-gradient(closest-side, ${accent}55, ${accent}22 42%, transparent 74%)`,
          filter: 'blur(8px)',
          animation: 'glowBreath 4.5s ease-in-out infinite',
        }}
      />

      <svg
        width="48"
        height="53"
        viewBox="0 0 54 60"
        fill="none"
        style={{
          position: 'absolute',
          left: 60,
          top: 220,
          color: 'rgba(112,214,255,.5)',
          filter: 'drop-shadow(0 0 7px rgba(79,210,255,.45))',
          animation: 'hexDrift 9s ease-in-out infinite',
        }}
      >
        <path d="M27 2 51 16v28L27 58 3 44V16L27 2Z" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <svg
        width="32"
        height="36"
        viewBox="0 0 54 60"
        fill="none"
        style={{
          position: 'absolute',
          left: 140,
          top: 340,
          color: 'rgba(112,214,255,.5)',
          filter: 'drop-shadow(0 0 7px rgba(79,210,255,.45))',
          animation: 'hexDrift 11s ease-in-out 1.2s infinite',
        }}
      >
        <path d="M27 2 51 16v28L27 58 3 44V16L27 2Z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
      <svg
        width="46"
        height="51"
        viewBox="0 0 54 60"
        fill="none"
        style={{
          position: 'absolute',
          right: 90,
          top: 190,
          color: 'rgba(112,214,255,.5)',
          filter: 'drop-shadow(0 0 7px rgba(79,210,255,.45))',
          animation: 'hexDrift 10s ease-in-out .6s infinite',
        }}
      >
        <path d="M27 2 51 16v28L27 58 3 44V16L27 2Z" stroke="currentColor" strokeWidth="1.5" />
      </svg>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(46% 52% at 50% 44%, rgba(4,10,22,.5), rgba(4,10,22,.18) 62%, transparent 100%)',
        }}
      />
    </div>
  )
}
