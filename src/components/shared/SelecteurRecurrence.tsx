import { useState } from 'react'
import {
  preselectionsRecurrence,
  regleEquivalente,
  finParDefaut,
  LIBELLE_FREQUENCE_PERSONNALISEE,
  type RegleRecurrence,
  type FrequenceRecurrence,
} from '../../lib/recurrence'
import { champStyle, etiquetteStyle } from '../ui/Champ'

const VALEUR_PERSONNALISE = 'personnalise'

/* Lundi en tête, dimanche en queue — demande client du 2026-11-03 : « définir les jours de la
   semaine DU LUNDI AU DIMANCHE (en ligne visuellement) ». L'ordre de `Date.getDay()` commence
   lui au dimanche ; on affiche donc dans l'ordre de la semaine française, en gardant les
   numéros de `getDay()` comme valeurs. */
const JOURS_SEMAINE = [
  { jour: 1, court: 'Lun' },
  { jour: 2, court: 'Mar' },
  { jour: 3, court: 'Mer' },
  { jour: 4, court: 'Jeu' },
  { jour: 5, court: 'Ven' },
  { jour: 6, court: 'Sam' },
  { jour: 0, court: 'Dim' },
]

function heureDeLaDate(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function regleParDefautPersonnalisee(debut: Date): RegleRecurrence {
  return {
    frequence: 'semaine',
    intervalle: 1,
    joursSemaine: [debut.getDay()],
    heuresParJour: { [debut.getDay()]: heureDeLaDate(debut) },
    fin: finParDefaut(debut),
  }
}

/* Sélecteur de récurrence façon Google Agenda — demande client du 2026-10-12 : « il faut que
   l'affichage et les options de récurrence ressemblent à l'agenda de Gmail visuellement ».

   Repris le 2026-11-03 sur deux points, après l'incident des 107 séances fantômes :
   - la PÉRIODE ne se cache plus derrière « Personnalisé… ». Dès qu'une répétition est choisie,
     « Du … au … » s'affiche : « quand le mode répétition est activé, il faut qu'une zone de
     définition de la période correspondant à la répétition apparaisse ». C'est ce qui manquait
     quand « Tous les jours » a produit 156 séances d'un coup ;
   - le personnalisé porte une HEURE PAR JOUR, pas une heure unique héritée du départ.

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
    const coche = actuels.includes(jour)
    const prochains = coche ? actuels.filter((j) => j !== jour) : [...actuels, jour].sort((a, b) => a - b)
    const heures = { ...(valeur.heuresParJour ?? {}) }
    /* Un jour décoché perd son heure, un jour coché reprend celle du départ : sans ça, décocher
       puis recocher ressusciterait une heure que l'utilisateur croyait effacée. */
    if (coche) delete heures[jour]
    else heures[jour] = heures[jour] ?? heureDeLaDate(debut)
    onChange({ ...valeur, joursSemaine: prochains, heuresParJour: heures })
  }

  function changerHeureJour(jour: number, heure: string) {
    if (!valeur) return
    onChange({ ...valeur, heuresParJour: { ...(valeur.heuresParJour ?? {}), [jour]: heure } })
  }

  const dateDebutLisible = debut.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <select value={choix} onChange={(e) => changerPreset(e.target.value)} style={champStyle}>
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>

      {/* Période TOUJOURS visible dès qu'une répétition est active, préréglage compris : c'est le
          garde-fou qui manquait le 2026-11-03. Le début n'est pas saisissable ici — il vient de la
          date de l'événement juste au-dessus, et deux champs de début qui se contrediraient
          seraient pires que pas de champ du tout. */}
      {valeur && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            borderRadius: 10,
            border: '1px solid var(--border-soft, var(--border))',
            background: 'var(--voile-doux, rgba(255,255,255,.03))',
            padding: '9px 12px',
          }}
        >
          <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Du</span>
          <strong style={{ fontSize: 12.5, color: 'var(--ink)' }}>{dateDebutLisible}</strong>
          <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>au</span>
          <input
            type="date"
            value={valeur.fin.type === 'le' ? (valeur.fin.date ?? '') : ''}
            min={debut.toISOString().slice(0, 10)}
            onChange={(e) => onChange({ ...valeur, fin: { type: 'le', date: e.target.value } })}
            style={{ ...champStyle, width: 'auto', padding: '5px 9px' }}
          />
          {valeur.fin.type !== 'le' && (
            <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>
              Sans date de fin, la répétition s’arrête au plafond de 156 séances.
            </span>
          )}
        </div>
      )}

      {personnaliseOuvert && valeur && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            borderRadius: 12,
            border: '1px solid var(--border-soft, var(--border))',
            background: 'var(--voile-doux, rgba(255,255,255,.03))',
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={etiquetteStyle}>Jours et horaires</span>
              {/* Une ligne par jour, du lundi au dimanche, avec SON heure à côté — demande client
                  du 2026-11-03. Le jour décoché reste affiché en gris : on voit toute la semaine
                  d'un coup d'œil plutôt que seulement ce qui est déjà choisi. */}
              {JOURS_SEMAINE.map(({ jour, court }) => {
                const actif = (valeur.joursSemaine ?? []).includes(jour)
                return (
                  <div key={jour} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => basculerJour(jour)}
                      aria-pressed={actif}
                      style={{
                        width: 62,
                        padding: '5px 0',
                        borderRadius: 8,
                        border: `1px solid ${actif ? 'transparent' : 'var(--border)'}`,
                        background: actif ? 'var(--accent-gradient)' : 'transparent',
                        color: actif ? '#1b1510' : 'var(--muted)',
                        fontSize: 11.5,
                        fontWeight: 800,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        flexShrink: 0,
                      }}
                    >
                      {court}
                    </button>
                    <input
                      type="time"
                      aria-label={`Heure du ${court}`}
                      disabled={!actif}
                      value={valeur.heuresParJour?.[jour] ?? heureDeLaDate(debut)}
                      onChange={(e) => changerHeureJour(jour, e.target.value)}
                      style={{ ...champStyle, width: 'auto', padding: '5px 9px', opacity: actif ? 1 : 0.4 }}
                    />
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={etiquetteStyle}>Se termine</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input
                type="radio"
                checked={valeur.fin.type === 'le'}
                onChange={() => onChange({ ...valeur, fin: finParDefaut(debut) })}
              />
              À la date de fin choisie ci-dessus
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
              séance(s)
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
