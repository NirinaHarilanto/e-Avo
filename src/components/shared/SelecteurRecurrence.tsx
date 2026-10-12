import { useState } from 'react'
import {
  preselectionsRecurrence,
  regleEquivalente,
  LIBELLE_FREQUENCE_PERSONNALISEE,
  LIBELLE_JOUR_COURT,
  type RegleRecurrence,
  type FrequenceRecurrence,
} from '../../lib/recurrence'
import { champStyle, etiquetteStyle } from '../ui/Champ'

const VALEUR_PERSONNALISE = 'personnalise'

function regleParDefautPersonnalisee(debut: Date): RegleRecurrence {
  return { frequence: 'semaine', intervalle: 1, joursSemaine: [debut.getDay()], fin: { type: 'jamais' } }
}

/* Sélecteur de récurrence façon Google Agenda — demande client du 2026-10-12 : « il faut que
   l'affichage et les options de récurrence ressemblent à l'agenda de Gmail visuellement ».
   Remplace l'ancienne liste figée à 5 choix (REPETITIONS, FicheEvenementGoogle.tsx) : une liste
   déroulante de préréglages calculés sur la vraie date de départ, plus un « Personnalisé… » qui
   déplie fréquence + intervalle + jours de la semaine + condition de fin — même structure que le
   dialogue « Personnaliser » de Google Agenda.

   Un seul composant, deux usages : la règle qu'il produit se traduit soit en RRULE (rendez-vous
   « autre », récurrence entièrement déléguée à Google), soit en dates concrètes via
   `genererOccurrences` (séances de cours, 0123) — ce composant ne connaît ni l'un ni l'autre, il
   se contente de construire une `RegleRecurrence` pure. */
export function SelecteurRecurrence({
  debut,
  valeur,
  onChange,
}: {
  /* Date/heure de départ de l'événement — sert à calculer les préréglages (« tous les lundis »…)
     et le jour par défaut d'un « Personnalisé » tout juste ouvert. */
  debut: Date
  valeur: RegleRecurrence | null
  onChange: (regle: RegleRecurrence | null) => void
}) {
  const options = preselectionsRecurrence(debut)
  const presetCorrespondant = valeur ? options.find((o) => o.regle && regleEquivalente(o.regle, valeur)) : options.find((o) => o.valeur === 'aucune')
  const [personnaliseOuvert, setPersonnaliseOuvert] = useState(!presetCorrespondant && !!valeur)
  const choix = personnaliseOuvert ? VALEUR_PERSONNALISE : (presetCorrespondant?.valeur ?? VALEUR_PERSONNALISE)

  function changerPreset(nouvelleValeur: string) {
    if (nouvelleValeur === VALEUR_PERSONNALISE) {
      setPersonnaliseOuvert(true)
      onChange(valeur ?? regleParDefautPersonnalisee(debut))
      return
    }
    setPersonnaliseOuvert(false)
    const option = options.find((o) => o.valeur === nouvelleValeur)
    onChange(option?.regle ?? null)
  }

  function basculerJour(jour: number) {
    if (!valeur) return
    const actuels = valeur.joursSemaine ?? []
    const prochains = actuels.includes(jour) ? actuels.filter((j) => j !== jour) : [...actuels, jour].sort((a, b) => a - b)
    onChange({ ...valeur, joursSemaine: prochains })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <select value={choix} onChange={(e) => changerPreset(e.target.value)} style={champStyle}>
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>

      {personnaliseOuvert && valeur && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            borderRadius: 12,
            border: '1px solid var(--border-soft, var(--border))',
            background: 'rgba(255,255,255,.03)',
            padding: '12px 14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Se répète tous les</span>
            <input
              type="number"
              min={1}
              max={99}
              value={valeur.intervalle}
              onChange={(e) => onChange({ ...valeur, intervalle: Math.max(1, Number(e.target.value)) })}
              style={{ ...champStyle, width: 64, padding: '6px 9px' }}
            />
            <select
              value={valeur.frequence}
              onChange={(e) => {
                const frequence = e.target.value as FrequenceRecurrence
                onChange({
                  ...valeur,
                  frequence,
                  joursSemaine: frequence === 'semaine' ? (valeur.joursSemaine?.length ? valeur.joursSemaine : [debut.getDay()]) : undefined,
                })
              }}
              style={{ ...champStyle, width: 'auto', padding: '6px 9px' }}
            >
              {(Object.keys(LIBELLE_FREQUENCE_PERSONNALISEE) as FrequenceRecurrence[]).map((f) => (
                <option key={f} value={f}>
                  {valeur.intervalle > 1 ? LIBELLE_FREQUENCE_PERSONNALISEE[f].pluriel : LIBELLE_FREQUENCE_PERSONNALISEE[f].singulier}
                </option>
              ))}
            </select>
          </div>

          {valeur.frequence === 'semaine' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={etiquetteStyle}>Se répète le</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {LIBELLE_JOUR_COURT.map((lettre, jour) => {
                  const actif = (valeur.joursSemaine ?? []).includes(jour)
                  return (
                    <button
                      key={jour}
                      type="button"
                      onClick={() => basculerJour(jour)}
                      aria-pressed={actif}
                      aria-label={`Jour ${jour}`}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        border: `1px solid ${actif ? 'transparent' : 'var(--border)'}`,
                        background: actif ? 'var(--accent-gradient)' : 'transparent',
                        color: actif ? '#1b1510' : 'var(--ink-2)',
                        fontSize: 11.5,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {lettre}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={etiquetteStyle}>Se termine</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input type="radio" checked={valeur.fin.type === 'jamais'} onChange={() => onChange({ ...valeur, fin: { type: 'jamais' } })} />
              Jamais
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input
                type="radio"
                checked={valeur.fin.type === 'le'}
                onChange={() => onChange({ ...valeur, fin: { type: 'le', date: valeur.fin.date ?? '' } })}
              />
              Le
              <input
                type="date"
                disabled={valeur.fin.type !== 'le'}
                value={valeur.fin.type === 'le' ? (valeur.fin.date ?? '') : ''}
                onChange={(e) => onChange({ ...valeur, fin: { type: 'le', date: e.target.value } })}
                style={{ ...champStyle, padding: '5px 9px', opacity: valeur.fin.type === 'le' ? 1 : 0.5 }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input
                type="radio"
                checked={valeur.fin.type === 'apres'}
                onChange={() => onChange({ ...valeur, fin: { type: 'apres', occurrences: valeur.fin.occurrences ?? 10 } })}
              />
              Après
              <input
                type="number"
                min={1}
                max={156}
                disabled={valeur.fin.type !== 'apres'}
                value={valeur.fin.type === 'apres' ? (valeur.fin.occurrences ?? 10) : ''}
                onChange={(e) => onChange({ ...valeur, fin: { type: 'apres', occurrences: Math.max(1, Number(e.target.value)) } })}
                style={{ ...champStyle, width: 56, padding: '5px 9px', opacity: valeur.fin.type === 'apres' ? 1 : 0.5 }}
              />
              occurrence(s)
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
