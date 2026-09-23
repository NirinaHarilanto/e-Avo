import { NATURES_RENDEZ_VOUS, type NatureRendezVous } from '../../lib/natureRendezVous'

/* Sélecteur de nature (séance de cours / autre), partagé entre RendezVousAdmin.tsx et
   CalendrierProfesseur.tsx — voir lib/natureRendezVous.ts. */
export function ChoixNatureRendezVous({ valeur, onChange }: { valeur: NatureRendezVous; onChange: (v: NatureRendezVous) => void }) {
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <legend style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', padding: 0, marginBottom: 2 }}>
        Nature du rendez-vous
      </legend>
      {NATURES_RENDEZ_VOUS.map((nature) => {
        const actif = valeur === nature.valeur
        return (
          <label
            key={nature.valeur}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 9,
              padding: '9px 11px',
              borderRadius: 10,
              cursor: 'pointer',
              border: actif ? '1px solid rgba(94,179,255,.42)' : '1px solid var(--border)',
              background: actif ? 'rgba(94,179,255,.1)' : 'transparent',
            }}
          >
            <input
              type="radio"
              name="nature-rendez-vous"
              checked={actif}
              onChange={() => onChange(nature.valeur)}
              style={{ marginTop: 2, accentColor: 'var(--accent-blue)' }}
            />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{nature.titre}</span>
              <span style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.45 }}>{nature.detail}</span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
