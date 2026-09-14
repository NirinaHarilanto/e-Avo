import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import {
  ajouterJours,
  joursDeLaSemaine,
  libelleSemaine,
  lundiDeLaSemaine,
  memeJour,
  minutesDepuisMinuit,
  placerEvenementsDuJour,
  plageHoraire,
  type EvenementAgenda,
} from '../../lib/agenda'
import { Icone } from './Icones'

/* Agenda hebdomadaire en grille horaire, dans l'esprit d'Outlook : les heures en ordonnée, les
   jours en abscisse, chaque cours dessiné à sa place et à sa durée réelle. Les trois espaces
   (admin, professeur, étudiant) montent ce même composant — il ne connaît que des
   `EvenementAgenda`, jamais une séance ni une requête. Les calculs de placement vivent dans
   src/lib/agenda.ts, testés à part.

   Sous 900 px la grille bascule en vue « jour » : sept colonnes sur un téléphone ne seraient ni
   lisibles ni cliquables. */

const HAUTEUR_HEURE = 52
const LARGEUR_GOUTTIERE = 54
const PAS_MINUTES = 15

const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const TONS: Record<string, { fond: string; bordure: string; texte: string }> = {
  bleu: { fond: 'rgba(94,179,255,.16)', bordure: 'var(--accent-blue)', texte: 'var(--accent-cyan)' },
  or: { fond: 'rgba(233,207,148,.15)', bordure: 'var(--accent-gold)', texte: 'var(--accent-gold)' },
  teal: { fond: 'rgba(111,227,192,.14)', bordure: 'var(--accent-teal)', texte: 'var(--accent-teal)' },
  violet: { fond: 'rgba(199,156,255,.14)', bordure: 'var(--accent-violet)', texte: 'var(--accent-violet)' },
  danger: { fond: 'rgba(255,138,112,.13)', bordure: 'var(--danger)', texte: 'var(--danger)' },
  neutre: { fond: 'rgba(255,255,255,.05)', bordure: 'var(--muted-2)', texte: 'var(--ink-2)' },
}

interface AgendaHebdoProps {
  evenements: EvenementAgenda[]
  semaineDebut: Date
  onSemaineChange: (lundi: Date) => void
  /* Absent = agenda en lecture seule (espace étudiant) : plus aucun curseur cliquable. */
  onSelectionner?: (evenement: EvenementAgenda) => void
  /* Absent = pas de création depuis la grille (espaces admin et étudiant). */
  onCreneauLibre?: (debut: Date) => void
  /* Bandeau libre sous la barre de navigation : légende de couleurs, filtre, compteur… */
  legende?: ReactNode
  videMessage?: string
}

function useVueJour(): boolean {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches)
  useEffect(() => {
    const requete = window.matchMedia('(max-width: 900px)')
    const surChangement = (e: MediaQueryListEvent) => setCompact(e.matches)
    requete.addEventListener('change', surChangement)
    return () => requete.removeEventListener('change', surChangement)
  }, [])
  return compact
}

export function AgendaHebdo({
  evenements,
  semaineDebut,
  onSemaineChange,
  onSelectionner,
  onCreneauLibre,
  legende,
  videMessage,
}: AgendaHebdoProps) {
  const compact = useVueJour()
  const [jourAffiche, setJourAffiche] = useState(0)
  const [maintenant, setMaintenant] = useState(() => new Date())
  const zoneDefilement = useRef<HTMLDivElement>(null)

  // Le trait d'heure courante n'a besoin que d'une précision à la minute.
  useEffect(() => {
    const minuterie = setInterval(() => setMaintenant(new Date()), 60_000)
    return () => clearInterval(minuterie)
  }, [])

  const jours = useMemo(() => joursDeLaSemaine(semaineDebut), [semaineDebut])
  const joursVisibles = compact ? [jours[jourAffiche] ?? jours[0]] : jours
  const plage = useMemo(() => plageHoraire(evenements), [evenements])
  const heures = useMemo(
    () => Array.from({ length: plage.fin - plage.debut }, (_, i) => plage.debut + i),
    [plage],
  )
  const hauteurGrille = heures.length * HAUTEUR_HEURE

  // À l'ouverture, cadrer sur le début de journée utile plutôt que sur 00 h.
  useEffect(() => {
    zoneDefilement.current?.scrollTo({ top: Math.max(0, (8 - plage.debut) * HAUTEUR_HEURE) })
  }, [plage.debut])

  const minutesMaintenant = minutesDepuisMinuit(maintenant)
  const traitMaintenant = (minutesMaintenant - plage.debut * 60) * (HAUTEUR_HEURE / 60)
  const traitVisible = minutesMaintenant >= plage.debut * 60 && minutesMaintenant <= plage.fin * 60

  function creneauDepuisClic(jour: Date, evenement: MouseEvent<HTMLDivElement>) {
    if (!onCreneauLibre) return
    const rect = evenement.currentTarget.getBoundingClientRect()
    const minutes = plage.debut * 60 + ((evenement.clientY - rect.top) / HAUTEUR_HEURE) * 60
    const arrondi = Math.max(0, Math.round(minutes / PAS_MINUTES) * PAS_MINUTES)
    const debut = new Date(jour)
    debut.setHours(0, arrondi, 0, 0)
    onCreneauLibre(debut)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={() => onSemaineChange(ajouterJours(semaineDebut, -7))} aria-label="Semaine précédente" style={boutonNav}>
            <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
              <Icone nom="chevron" taille={15} />
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              onSemaineChange(lundiDeLaSemaine(new Date()))
              setJourAffiche(Math.max(0, (new Date().getDay() + 6) % 7))
            }}
            style={{ ...boutonNav, width: 'auto', padding: '0 14px', fontSize: 12, fontWeight: 700 }}
          >
            Aujourd’hui
          </button>
          <button type="button" onClick={() => onSemaineChange(ajouterJours(semaineDebut, 7))} aria-label="Semaine suivante" style={boutonNav}>
            <Icone nom="chevron" taille={15} />
          </button>
          <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)', marginLeft: 4 }}>
            {libelleSemaine(semaineDebut)}
          </span>
        </div>
        {legende}
      </div>

      {compact && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {jours.map((jour, index) => {
            const actif = index === jourAffiche
            return (
              <button
                key={index}
                type="button"
                onClick={() => setJourAffiche(index)}
                aria-pressed={actif}
                style={{
                  flexGrow: 1,
                  minWidth: 44,
                  padding: '7px 4px',
                  borderRadius: 10,
                  border: `1px solid ${actif ? 'rgba(94,179,255,.5)' : 'var(--border-soft)'}`,
                  background: actif ? 'rgba(94,179,255,.12)' : 'transparent',
                  color: actif ? 'var(--ink)' : 'var(--muted)',
                  fontSize: 11,
                  fontWeight: actif ? 800 : 600,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <span>{JOURS_COURTS[index]}</span>
                <span style={{ fontSize: 12.5 }}>{jour.getDate()}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `${LARGEUR_GOUTTIERE}px repeat(${joursVisibles.length}, minmax(0, 1fr))`,
            borderBottom: '1px solid var(--border-soft)',
          }}
        >
          <div />
          {joursVisibles.map((jour) => {
            const estAujourdhui = memeJour(jour, maintenant)
            return (
              <div
                key={jour.toISOString()}
                style={{
                  padding: '9px 6px',
                  textAlign: 'center',
                  borderLeft: '1px solid var(--border-soft)',
                  background: estAujourdhui ? 'rgba(94,179,255,.07)' : 'transparent',
                }}
              >
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: estAujourdhui ? 'var(--accent-blue)' : 'var(--muted)' }}>
                  {jour.toLocaleDateString('fr-FR', { weekday: 'short' })}
                </div>
                <div className="brand-font" style={{ fontSize: 15, color: estAujourdhui ? 'var(--accent-cyan)' : 'var(--ink)' }}>
                  {jour.getDate()}
                </div>
              </div>
            )
          })}
        </div>

        <div ref={zoneDefilement} style={{ maxHeight: 620, overflowY: 'auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `${LARGEUR_GOUTTIERE}px repeat(${joursVisibles.length}, minmax(0, 1fr))`,
              position: 'relative',
            }}
          >
            <div style={{ position: 'relative', height: hauteurGrille }}>
              {heures.map((heure, index) => (
                <span
                  key={heure}
                  style={{
                    position: 'absolute',
                    top: index * HAUTEUR_HEURE - 6,
                    right: 8,
                    fontSize: 10.5,
                    color: 'var(--muted-2)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {String(heure).padStart(2, '0')}:00
                </span>
              ))}
            </div>

            {joursVisibles.map((jour) => {
              const estAujourdhui = memeJour(jour, maintenant)
              const places = placerEvenementsDuJour(evenements, jour)
              return (
                <div
                  key={jour.toISOString()}
                  onClick={onCreneauLibre ? (e) => creneauDepuisClic(jour, e) : undefined}
                  style={{
                    position: 'relative',
                    height: hauteurGrille,
                    borderLeft: '1px solid var(--border-soft)',
                    background: estAujourdhui ? 'rgba(94,179,255,.05)' : 'transparent',
                    cursor: onCreneauLibre ? 'copy' : 'default',
                    // Les lignes d'heures sont peintes en fond plutôt qu'en éléments : une div
                    // par heure et par jour ferait des centaines de nœuds inutiles.
                    backgroundImage: `repeating-linear-gradient(to bottom, var(--border-soft) 0 1px, transparent 1px ${HAUTEUR_HEURE}px)`,
                  }}
                >
                  {places.map((place) => {
                    const ton = TONS[place.ton ?? 'bleu'] ?? TONS.bleu
                    const largeur = 100 / place.colonnes
                    return (
                      <button
                        key={place.id}
                        type="button"
                        disabled={!onSelectionner}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectionner?.(place)
                        }}
                        title={`${new Date(place.debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · ${place.titre}${place.sousTitre ? ` · ${place.sousTitre}` : ''}`}
                        style={{
                          position: 'absolute',
                          top: (place.debutMinutes - plage.debut * 60) * (HAUTEUR_HEURE / 60),
                          height: (place.finMinutes - place.debutMinutes) * (HAUTEUR_HEURE / 60) - 2,
                          left: `calc(${place.colonne * largeur}% + 3px)`,
                          width: `calc(${largeur}% - 6px)`,
                          textAlign: 'left',
                          padding: '4px 7px',
                          borderRadius: 7,
                          border: `1px solid ${ton.bordure}`,
                          borderLeft: `3px solid ${ton.bordure}`,
                          background: ton.fond,
                          color: 'var(--ink)',
                          cursor: onSelectionner ? 'pointer' : 'default',
                          opacity: place.attenue ? 0.5 : 1,
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 1,
                        }}
                      >
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: ton.texte, fontVariantNumeric: 'tabular-nums' }}>
                          {new Date(place.debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          {place.marqueur ? ` · ${place.marqueur}` : ''}
                        </span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {place.titre}
                        </span>
                        {place.sousTitre && (
                          <span style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {place.sousTitre}
                          </span>
                        )}
                      </button>
                    )
                  })}

                  {estAujourdhui && traitVisible && (
                    <div aria-hidden style={{ position: 'absolute', top: traitMaintenant, left: 0, right: 0, height: 2, background: 'var(--danger)', boxShadow: '0 0 8px rgba(255,138,112,.7)', zIndex: 2 }}>
                      <span style={{ position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 999, background: 'var(--danger)' }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {evenements.length === 0 && (
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, textAlign: 'center' }}>
          {videMessage ?? 'Aucun cours cette semaine. Utilisez les flèches pour changer de semaine.'}
        </p>
      )}
      {onCreneauLibre && (
        <p style={{ fontSize: 11.5, color: 'var(--muted-2)', margin: 0 }}>
          Astuce : cliquez directement sur un créneau libre de la grille pour y planifier un cours.
        </p>
      )}
    </div>
  )
}

const boutonNav: CSSProperties = {
  width: 32,
  height: 32,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--ink-2)',
  cursor: 'pointer',
}
