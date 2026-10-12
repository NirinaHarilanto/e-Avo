import { etiquetteStyle } from '../ui/Champ'

/* La question que Google Agenda pose lui-même avant de modifier un événement récurrent — extrait
   de FicheEvenementGoogle.tsx le 2026-10-12 pour être repris à l'identique sur les séances de
   cours (0123, EditerSeancePlanifieeModale.tsx) : un même geste visuel, que la récurrence soit
   entièrement Google (rendez-vous « autre ») ou une série `sessions` HOC-native (cours). La poser
   est la condition pour modifier/annuler un événement répété : sans elle, un clic pouvait
   effacer toute une série alors qu'on visait une seule occurrence. */
export function ChoixPortee({
  valeur,
  onChange,
  texte = 'Cet événement se répète. Que faut-il modifier ?',
}: {
  valeur: 'occurrence' | 'serie'
  onChange: (v: 'occurrence' | 'serie') => void
  texte?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={etiquetteStyle}>{texte}</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(
          [
            ['occurrence', 'Cette date seulement'],
            ['serie', 'Toute la série'],
          ] as const
        ).map(([cle, libelle]) => (
          <button
            key={cle}
            type="button"
            onClick={() => onChange(cle)}
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              padding: '7px 14px',
              borderRadius: 999,
              cursor: 'pointer',
              color: valeur === cle ? '#1b1510' : 'var(--ink-2)',
              background: valeur === cle ? 'var(--accent-gradient)' : 'transparent',
              border: `1px solid ${valeur === cle ? 'transparent' : 'var(--border)'}`,
            }}
          >
            {libelle}
          </button>
        ))}
      </div>
    </div>
  )
}
