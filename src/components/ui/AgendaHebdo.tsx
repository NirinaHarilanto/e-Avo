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

/* Grille et pastilles agrandies (0068, demande client du 2026-09-23 : « il faut que les
   évènements dans les agendas, surtout pour les DUO, soient visuellement visibles... en
   agrandissant un peu le bloc pour rendre tout visible ») — un binôme DUO affiche les deux noms
   dans le titre et « Duo · 60 min » en sous-titre, sensiblement plus long qu'un événement
   individuel ; les trois hauteurs ci-dessous montent ensemble, dans les mêmes proportions
   qu'avant, pour ne rien redéfinir en dur au hasard.
   Resserrées à nouveau le 2026-09-30 (demande client, capture à l'appui : « il faut que l'agenda
   [...] soit visible sur une vue sans le défilement vertical propre à l'agenda [...] redimensionne
   et réduit un peu visuellement la taille de l'agenda »). `HAUTEUR_HEURE` n'est plus qu'un
   PLAFOND : chaque rendu recalcule la hauteur réelle d'une heure pour que la plage horaire active
   tienne pile dans l'espace mesuré sous la grille (voir `hauteurHeure` dans le composant), et ne
   grandit jamais au-delà de cette valeur même s'il reste de la place (pour ne pas non plus
   étirer démesurément une journée avec peu de créneaux). `HAUTEUR_MIN_EVENEMENT`/
   `HAUTEUR_SOUS_TITRE`, eux, restent FIXES quelle que soit la densité de la grille : ce sont des
   planchers dictés par la police du texte (jamais réduite — « les descriptions [...] doivent
   rester visuellement visibles et lisibles »), pas par la grille elle-même. */
const HAUTEUR_HEURE = 54
/* En dessous, une heure de grille ne laisse plus la place de distinguer un créneau du suivant —
   dernier repli avant de rendre l'ascenseur interne (cas extrême : une plage horaire très large
   sur un tout petit écran). La plage par défaut (7 h – 22 h, `plageHoraire` dans lib/agenda.ts)
   compte 15 heures : un ordinateur portable courant (1366 × 768) ne laisse qu'environ 460 px sous
   l'en-tête de page une fois le guide replié, d'où un plancher nettement plus bas qu'une simple
   estimation sur un grand écran ne l'aurait suggéré. */
const HAUTEUR_HEURE_MIN = 30
const LARGEUR_GOUTTIERE = 54
const PAS_MINUTES = 15

/* Une demande d'appel dure 15 minutes : à l'échelle de la grille, sa pastille ferait 12 px de
   haut et son libellé serait tronqué au point d'être illisible. On lui impose donc une hauteur
   plancher — elle déborde alors légèrement sur le créneau suivant, ce qui est sans conséquence
   puisque les chevauchements sont de toute façon répartis en colonnes. */
const HAUTEUR_MIN_EVENEMENT = 52
/* En dessous de cette hauteur, la pastille n'a la place que d'une seule ligne : le sous-titre
   est retiré plutôt qu'affiché coupé. */
const HAUTEUR_SOUS_TITRE = 70

const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

/* Les pastilles étaient à peine teintées (opacité 0.13 à 0.16) : sur la grille sombre, un cours
   se distinguait mal du fond, et une semaine chargée se lisait comme un aplat. Les fonds sont
   donc nettement plus denses, en dégradé pour garder du relief, et chaque ton porte sa propre
   ombre colorée — demande client du 2026-09-16 : « il faudrait que les évènements soient assez
   visibles ». */
const TONS: Record<string, { fond: string; bordure: string; texte: string; ombre: string }> = {
  bleu: { fond: 'linear-gradient(135deg, rgba(94,179,255,.42), rgba(47,111,214,.34))', bordure: 'var(--accent-blue)', texte: '#eaf5ff', ombre: 'rgba(47,111,214,.45)' },
  or: { fond: 'linear-gradient(135deg, rgba(233,207,148,.40), rgba(199,156,79,.32))', bordure: 'var(--accent-gold)', texte: '#fff6e2', ombre: 'rgba(199,156,79,.42)' },
  teal: { fond: 'linear-gradient(135deg, rgba(111,227,192,.40), rgba(45,166,134,.32))', bordure: 'var(--accent-teal)', texte: '#e6fff7', ombre: 'rgba(45,166,134,.42)' },
  violet: { fond: 'linear-gradient(135deg, rgba(199,156,255,.42), rgba(141,96,243,.34))', bordure: 'var(--accent-violet)', texte: '#f5edff', ombre: 'rgba(141,96,243,.45)' },
  danger: { fond: 'linear-gradient(135deg, rgba(255,138,112,.40), rgba(214,80,55,.32))', bordure: 'var(--danger)', texte: '#ffeee9', ombre: 'rgba(214,80,55,.42)' },
  neutre: { fond: 'linear-gradient(135deg, rgba(255,255,255,.20), rgba(255,255,255,.12))', bordure: 'var(--muted)', texte: 'var(--ink)', ombre: 'rgba(0,0,0,.35)' },
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

  /* Hauteur de la grille asservie à ce qu'il reste RÉELLEMENT sous elle dans la fenêtre (demande
     client du 2026-09-30 : agenda visible « sur une vue sans le défilement vertical »), plutôt
     qu'un maxHeight fixe — chaque espace (admin, professeur, étudiant) a un habillage différent
     au-dessus de la grille (fil d'Ariane, titre de page, guide, légende…), jamais la même hauteur
     disponible. `calc(100dvh - Npx)` en CSS a été essayé puis abandonné : le `zoom` posé sur
     `body` dans les 3 espaces connectés (0.82, voir index.css) réduit aussi les unités `vh` sous
     Chrome, laissant un vide sous la grille au lieu de la remplir (même bug déjà rencontré et
     documenté sur .barre-laterale, réglé là par un ancrage `position: fixed`). Mesurer en JS via
     `getBoundingClientRect()`/`window.innerHeight` contourne le problème : ces deux valeurs sont
     déjà exprimées en pixels visuels réels, zoom compris des deux côtés du calcul. */
  const [hauteurDisponible, setHauteurDisponible] = useState<number | null>(null)
  useEffect(() => {
    function recalculer() {
      const sommet = zoneDefilement.current?.getBoundingClientRect().top
      if (sommet == null) return
      /* `getBoundingClientRect()`/`window.innerHeight` sont déjà en pixels visuels réels, zoom
         compris — mais une valeur qu'on ÉCRIT ensuite dans `style.height` sur un élément DESCENDANT
         du `body` zoomé est, elle, réinterprétée dans le repère zoomé : Chrome la multiplie une
         seconde fois par le zoom au rendu (720 px de `height` avec zoom 0.82 ne couvrent que
         720 × 0.82 = 590 px à l'écran). Sans cette division, la grille restait visiblement plus
         courte que l'espace mesuré, écart proportionnel au zoom de l'espace (0.82 étudiant/
         professeur, 0.74 admin) — constaté en testant ce composant hors connexion. */
      const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1
      // Marge sous la grille : la page garde un peu d'air plutôt que de toucher pile le bas de
      // la fenêtre, et un plancher pour qu'un tout petit écran retrouve un ascenseur plutôt
      // qu'une grille écrasée à rien.
      setHauteurDisponible(Math.max(320, (window.innerHeight - sommet - 20) / zoom))
    }
    recalculer()
    window.addEventListener('resize', recalculer)
    // Rattrape un habillage qui change de hauteur sans que la fenêtre soit redimensionnée — le
    // dépliage du guide de page (GuidePage.tsx) au-dessus de cette grille, par exemple.
    // `ResizeObserver` n'existe pas dans l'environnement de test (jsdom) : le composant reste
    // fonctionnel sans lui, juste moins réactif à ce cas précis hors navigateur réel.
    const observateur = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recalculer) : null
    observateur?.observe(document.body)
    return () => {
      window.removeEventListener('resize', recalculer)
      observateur?.disconnect()
    }
  }, [compact])

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
  /* Hauteur d'une heure : la valeur qui fait tenir PILE toute la plage active dans l'espace
     mesuré (`hauteurDisponible`), plafonnée à HAUTEUR_HEURE pour ne pas étirer une journée avec
     peu de créneaux, plancher à HAUTEUR_HEURE_MIN en dernier recours (voir le commentaire plus
     haut). Retombe sur HAUTEUR_HEURE tant que la mesure n'est pas encore connue (premier rendu). */
  const hauteurHeure =
    hauteurDisponible != null && heures.length > 0
      ? Math.min(HAUTEUR_HEURE, Math.max(HAUTEUR_HEURE_MIN, hauteurDisponible / heures.length))
      : HAUTEUR_HEURE
  const hauteurGrille = heures.length * hauteurHeure

  // À l'ouverture, cadrer sur le début de journée utile plutôt que sur 00 h.
  useEffect(() => {
    zoneDefilement.current?.scrollTo({ top: Math.max(0, (8 - plage.debut) * hauteurHeure) })
  }, [plage.debut, hauteurHeure])

  const minutesMaintenant = minutesDepuisMinuit(maintenant)
  const traitMaintenant = (minutesMaintenant - plage.debut * 60) * (hauteurHeure / 60)
  const traitVisible = minutesMaintenant >= plage.debut * 60 && minutesMaintenant <= plage.fin * 60

  function creneauDepuisClic(jour: Date, evenement: MouseEvent<HTMLDivElement>) {
    if (!onCreneauLibre) return
    const rect = evenement.currentTarget.getBoundingClientRect()
    const minutes = plage.debut * 60 + ((evenement.clientY - rect.top) / hauteurHeure) * 60
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

        {/* `min()` avec `hauteurGrille` : quand la plage horaire est courte (peu de créneaux dans
            la semaine), la zone n'a pas besoin de s'étirer jusqu'au bas mesuré de la fenêtre —
            elle épouse le contenu plutôt que de laisser un vide sous la grille. */}
        <div ref={zoneDefilement} style={{ height: hauteurDisponible != null ? Math.min(hauteurDisponible, hauteurGrille) : 620, overflowY: 'auto' }}>
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
                    top: index * hauteurHeure - 6,
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
                    backgroundImage: `repeating-linear-gradient(to bottom, var(--border-soft) 0 1px, transparent 1px ${hauteurHeure}px)`,
                  }}
                >
                  {places.map((place) => {
                    const ton = TONS[place.ton ?? 'bleu'] ?? TONS.bleu
                    const largeur = 100 / place.colonnes
                    const hauteur = Math.max(
                      HAUTEUR_MIN_EVENEMENT,
                      (place.finMinutes - place.debutMinutes) * (hauteurHeure / 60) - 2,
                    )
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
                          top: (place.debutMinutes - plage.debut * 60) * (hauteurHeure / 60),
                          height: hauteur,
                          left: `calc(${place.colonne * largeur}% + 3px)`,
                          width: `calc(${largeur}% - 6px)`,
                          textAlign: 'left',
                          padding: '3px 7px',
                          borderRadius: 8,
                          border: `1px solid ${ton.bordure}`,
                          borderLeft: `4px solid ${ton.bordure}`,
                          background: ton.fond,
                          boxShadow: `0 2px 10px ${ton.ombre}`,
                          color: 'var(--ink)',
                          cursor: onSelectionner ? 'pointer' : 'default',
                          // Une séance annulée reste lisible : elle s'efface, sans disparaître.
                          opacity: place.attenue ? 0.62 : 1,
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 1,
                        }}
                      >
                        {/* Polices resserrées et pastille plus haute (demande client du 2026-09-29 : « les
                            informations [...] sont visuellement coupées et non visibles ») : un nom
                            de deux mots passait à la ligne et sa seconde moitié tombait sous le
                            bord de la pastille. Titre limité à deux lignes, statut toujours en
                            dernière ligne, sous-titre seulement s'il reste de la place. */}
                        <span style={{ fontSize: 10, fontWeight: 800, color: ton.texte, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                          {new Date(place.debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          {place.marqueur ? ` · ${place.marqueur}` : ''}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 750, lineHeight: 1.2, color: '#ffffff', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {place.titre}
                        </span>
                        {place.sousTitre && hauteur >= HAUTEUR_SOUS_TITRE && (
                          <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,.82)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {place.sousTitre}
                          </span>
                        )}
                        {place.statut && (
                          <span style={{ marginTop: 'auto', fontSize: 9, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: ton.texte, opacity: 0.95, whiteSpace: 'nowrap' }}>
                            ● {place.statut}
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
