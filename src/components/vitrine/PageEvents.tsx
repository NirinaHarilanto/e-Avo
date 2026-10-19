import { urlImageEvent, useEventsPublies, type Event } from '../../hooks/useEvents'
import { FlecheBouton, IcoHX } from './IconesHX'

/* Section Events de la vitrine — demande client du 2026-10-19 (point 12) : « rajoute une section
   Events sur la page principale de HOC au même niveau que Tarifs & cours, témoignages, etc.
   Prépare les animations et visuel respectant les codes de HOC. »

   Aucune maquette n'existe pour cette page : son habillage reprend donc, à la lettre, le
   vocabulaire déjà en place dans la vitrine plutôt que d'inventer un style de plus — hero sombre
   avec ses halos et son grain (comme Témoignages et À propos), `eyebrow` + `h-xl` en titre,
   apparitions au défilement via `.rv`/`.reveal` (voir animations.ts, qui les observe), et le
   liseré doré au survol des cartes.

   Le contenu vient entièrement de la base (`events`, 0130) : l'admin le gère depuis son espace,
   et seuls les événements publiés arrivent ici — c'est la RLS qui le garantit. */

/* Une date d'événement se lit d'un coup d'œil : le jour en gros, le mois au-dessus. Même
   découpage que les pastilles de date de l'agenda, dans le vocabulaire de la vitrine. */
function Pastille({ debut }: { debut: string }) {
  const date = new Date(debut)
  return (
    <span className="ev-date" aria-hidden>
      <span className="ev-mois">{date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</span>
      <span className="ev-jour">{date.getDate()}</span>
    </span>
  )
}

function formaterQuand(evenement: Event): string {
  const debut = new Date(evenement.debut)
  const jour = debut.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const heureDebut = debut.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (!evenement.fin) return `${jour} à ${heureDebut}`
  const fin = new Date(evenement.fin)
  /* Un événement sur plusieurs jours annonce ses deux dates ; sur une seule journée, seule
     l'heure de fin change — répéter la date entière serait du bruit. */
  const memeJour = debut.toDateString() === fin.toDateString()
  const heureFin = fin.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (memeJour) return `${jour}, de ${heureDebut} à ${heureFin}`
  return `Du ${jour} à ${heureDebut} au ${fin.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${heureFin}`
}

function CarteEvent({ evenement, passe = false, delai = 0 }: { evenement: Event; passe?: boolean; delai?: number }) {
  const image = urlImageEvent(evenement.image_path)

  return (
    <article className={`ev-carte rv${passe ? ' passe' : ''}`} style={{ transitionDelay: `${delai}s` }}>
      {/* Sans image, la carte garde sa place : un dégradé aux teintes de la maison tient le
          cadre, plutôt qu'un trou ou une hauteur qui change d'une carte à l'autre. */}
      <div className={`ev-visuel${image ? '' : ' vide'}`}>
        {image ? <img src={image} alt={evenement.titre} loading="lazy" /> : <IcoHX nom="etoile" />}
        <Pastille debut={evenement.debut} />
      </div>

      <div className="ev-corps">
        <h3>{evenement.titre}</h3>
        {evenement.accroche && <p className="ev-accroche">{evenement.accroche}</p>}

        <ul className="ev-meta">
          <li>
            <IcoHX nom="horloge" />
            {formaterQuand(evenement)}
          </li>
          {evenement.lieu && (
            <li>
              <IcoHX nom="globe" />
              {evenement.lieu}
            </li>
          )}
        </ul>

        <p className="ev-texte">{evenement.description}</p>

        {evenement.lien_url && evenement.lien_libelle && (
          /* `rel` complet sur un lien sortant saisi par l'admin : il peut pointer n'importe où,
             et `noopener` empêche la page de destination d'atteindre celle-ci. */
          <a className="btn btn-gold ev-action" href={evenement.lien_url} target="_blank" rel="noopener noreferrer">
            {evenement.lien_libelle} <FlecheBouton />
          </a>
        )}
      </div>
    </article>
  )
}

export function PageEvents() {
  const { aVenir, passes, loading } = useEventsPublies()

  return (
    <div className="events">
      <section className="dark phero">
        <div className="clip">
          <div className="glow g1" />
          <div className="glow g2" />
          <div className="spot" />
          <div className="grain" />
        </div>
        <div className="wrap">
          <div className="reveal ev-intro">
            <div className="eyebrow">Events</div>
            <h1 className="h-xl">
              <span className="line">
                <span>La vie du</span>
              </span>
              <span className="line">
                <span className="it" style={{ transitionDelay: '.12s' }}>
                  Hari Online Club
                </span>
              </span>
            </h1>
            <p className="by rv" style={{ transitionDelay: '.3s' }}>
              Ateliers, rencontres, sessions de conversation et temps forts de nos vagues : retrouvez ici tout ce que
              nous organisons, en ligne comme sur place.
            </p>
          </div>
        </div>
      </section>

      <section className="light ev-sec">
        <div className="wrap">
          {loading ? (
            <p className="ev-vide">Chargement des événements…</p>
          ) : aVenir.length === 0 && passes.length === 0 ? (
            <p className="ev-vide">
              Aucun événement n’est programmé pour le moment. Revenez bientôt : nous en annonçons régulièrement.
            </p>
          ) : (
            <>
              {aVenir.length > 0 && (
                <>
                  <h2 className="ev-titre-groupe rv">À venir</h2>
                  <div className="ev-grille">
                    {aVenir.map((evenement, index) => (
                      /* Les cartes apparaissent l'une après l'autre, par vagues de trois (le
                         nombre de colonnes) : au-delà, le dernier arrivé se ferait attendre
                         plusieurs secondes sur une liste longue. */
                      <CarteEvent key={evenement.id} evenement={evenement} delai={(index % 3) * 0.1} />
                    ))}
                  </div>
                </>
              )}

              {passes.length > 0 && (
                <>
                  {/* Les événements passés restent visibles, estompés : ils montrent à un visiteur
                      que la vie du club est réelle et régulière, ce qu'une page vide les jours
                      sans événement à venir ne dirait pas. */}
                  <h2 className="ev-titre-groupe rv">Déjà passés</h2>
                  <div className="ev-grille">
                    {passes.map((evenement, index) => (
                      <CarteEvent key={evenement.id} evenement={evenement} passe delai={(index % 3) * 0.1} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
