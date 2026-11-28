import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

/* Bandeau Black Friday du hero d'accueil — demande client du 2026-11-28, puis maquette fournie le
   même jour : une bande NOIRE pleine largeur, collée sous le menu, semée d'étincelles dorées.
   Une première version en carte violette posée dans le hero a été écartée par le client.

   Le texte vient du visuel promotionnel qu'il avait fourni d'abord (« −15% on your individual
   classes », du 27 novembre au 3 décembre), la mise en forme vient de la maquette de la bande.
   La maquette portait « −50% sur tous nos abonnements », qui n'est pas l'offre réelle : elle
   servait d'exemple de présentation, pas de contenu.

   DEUX INSTANTS, PAS DEUX DATES. L'offre court du 27 novembre au 3 décembre inclus, heure
   d'Antananarivo. Les bornes sont donc écrites avec leur décalage `+03:00` : le bandeau apparaît
   et disparaît au même moment pour tout le monde, quel que soit le fuseau du visiteur.
   `toISOString().slice(0,10)` et consorts sont proscrits ici comme partout (ils reculeraient d'un
   jour entre minuit et 3 h du matin à Madagascar). */

const DEBUT = new Date('2026-11-27T00:00:00+03:00')
/* Borne de FIN exclusive : minuit au terme du 3 décembre, donc le 4 à 0 h. Écrire
   « 2026-12-03T23:59 » priverait l'offre de sa dernière minute. */
const FIN = new Date('2026-12-04T00:00:00+03:00')

/** Vrai pendant toute la période de l'offre. Sert aussi au hero, qui remonte son contenu sous la
 *  bande quand elle est là — sans quoi il resterait un vide à l'emplacement qu'elle n'occupe pas. */
export function promotionEnCours(instant: number = Date.now()): boolean {
  return instant >= DEBUT.getTime() && instant < FIN.getTime()
}

/** La bande s'efface d'elle-même passé le 3 décembre : personne n'a à penser à la retirer. */
export function BandeauBlackFriday() {
  /* Une seule vérification par chargement de page ne suffit pas : un onglet laissé ouvert pendant
     la nuit du 3 au 4 doit voir la bande disparaître. On repasse donc chaque minute, ce qui est
     assez fin pour une bascule à minuit et assez rare pour ne rien coûter. */
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    if (Date.now() >= FIN.getTime()) return
    const minuterie = setInterval(() => setMaintenant(Date.now()), 60_000)
    return () => clearInterval(minuterie)
  }, [])

  if (!promotionEnCours(maintenant)) return null

  return (
    <div className="bf-bande" role="region" aria-label="Offre Black Friday">
      {/* Étincelles dorées des deux bords, purement décoratives : dessinées en CSS plutôt
          qu'importées en image, pour rester nettes à tout facteur de zoom et ne rien peser. */}
      <span className="bf-etincelles gauche" aria-hidden="true" />
      <span className="bf-etincelles droite" aria-hidden="true" />

      <div className="bf-in">
        <svg className="bf-ico" viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false">
          <path
            d="M20.6 12.6 12.4 20.8a2 2 0 0 1-2.8 0l-6.4-6.4a2 2 0 0 1-.6-1.6l.5-6.2a2 2 0 0 1 1.9-1.9l6.2-.5a2 2 0 0 1 1.6.6l6.4 6.4a2 2 0 0 1 0 2.8z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <circle cx="8.6" cy="8.6" r="1.7" fill="currentColor" />
        </svg>

        <span className="bf-titre">
          <b>BLACK</b>
          <i>FRIDAY</i>
        </span>

        <span className="bf-barre" aria-hidden="true" />

        <span className="bf-phrase">
          {/* Espace fine insécable (U+202F) avant le point d'exclamation : la typographie
              française l'exige, et elle empêche surtout le « ! » de tomber seul à la ligne. */}
          <span className="bf-ligne">
            Profitez de <mark className="bf-remise">−15%</mark> sur vos cours individuels&#8239;!
          </span>
          <small>27 nov. – 3 déc. · Nouvelles souscriptions en cours individuel uniquement</small>
        </span>

        <svg className="bf-cadeau" viewBox="0 0 24 24" width="42" height="42" aria-hidden="true" focusable="false">
          <path d="M3 11h18v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <rect x="2" y="7" width="20" height="4.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 7v14" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 7S10.6 3 8.4 3a2.2 2.2 0 0 0 0 4.4zM12 7s1.4-4 3.6-4a2.2 2.2 0 0 1 0 4.4z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>

        {/* `?reserver=1` ouvre la page Cours & tarifs directement sur la formule individuelle,
           fenêtre de réservation déjà déployée — le chemin le plus court entre cette bande et une
           inscription, et le même que celui du bouton de la page Équipe. */}
        <Link className="bf-cta" to="/cours?reserver=1">
          J’en profite
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path
              d="M9 5l7 7-7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>
    </div>
  )
}
