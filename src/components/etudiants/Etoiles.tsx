/* Cinq étoiles cliquables (note obligatoire) ou simplement affichées (lecture seule) — un seul
   composant pour les deux usages plutôt que dupliquer le tracé des cinq pictogrammes.

   Extrait de SatisfactionSeance.tsx le 2026-10-19, quand l'enquête par séance a été remplacée par
   les deux enquêtes de parcours (demande client 8) : les étoiles, elles, servent toujours. */
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
