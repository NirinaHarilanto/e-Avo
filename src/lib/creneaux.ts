/* Calcul des créneaux d'appel proposés à un visiteur. Volontairement pur (aucune requête, aucune
   horloge implicite : `maintenant` est toujours passé en paramètre) pour être testable — c'est la
   pièce la plus facile à casser de la réservation, et la seule dont une erreur se voit
   directement chez le prospect.

   Tous les calculs se font dans le fuseau de l'établissement, jamais dans celui du navigateur :
   une plage « lundi 9h-12h » est une heure malgache, qu'un visiteur en France doit voir convertie
   dans sa propre heure locale par l'affichage, pas par le calcul. */

export interface PlageHebdomadaire {
  /* 0 = dimanche … 6 = samedi, convention Date.getDay(). */
  jour_semaine: number
  /* Format 'HH:MM' ou 'HH:MM:SS' (Postgres rend les `time` en 'HH:MM:SS'). */
  heure_debut: string
  heure_fin: string
  actif?: boolean
}

export interface Occupation {
  debut: string | Date
  fin: string | Date
}

export interface ParametresCreneaux {
  dureeMinutes: number
  delaiMinimumHeures: number
  horizonJours: number
  pauseMinutes: number
  fuseau: string
}

/* Décalage du fuseau par rapport à UTC, en minutes, à un instant donné. Passe par Intl plutôt
   que par une table de fuseaux : c'est la seule source qui suit les changements d'heure. */
function decalageMinutes(instant: Date, fuseau: string): number {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = Object.fromEntries(format.formatToParts(instant).map((p) => [p.type, p.value]))
  const localEnUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    /* Intl rend minuit comme '24' dans certaines implémentations. */
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  )
  return (localEnUtc - instant.getTime()) / 60_000
}

/* Instant UTC correspondant à une date/heure exprimée dans le fuseau de l'établissement. Deux
   passes : le décalage dépend de l'instant, qu'on ne connaît qu'après l'avoir appliqué une
   première fois (seul cas gênant : les quelques heures autour d'un changement d'heure). */
export function instantDepuisLocal(
  annee: number,
  mois: number,
  jour: number,
  heures: number,
  minutes: number,
  fuseau: string,
): Date {
  const naif = Date.UTC(annee, mois - 1, jour, heures, minutes)
  const premier = decalageMinutes(new Date(naif), fuseau)
  const second = decalageMinutes(new Date(naif - premier * 60_000), fuseau)
  return new Date(naif - second * 60_000)
}

/* Composants de date tels qu'ils se lisent dans le fuseau de l'établissement. */
export function partiesLocales(instant: Date, fuseau: string) {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const parts = Object.fromEntries(format.formatToParts(instant).map((p) => [p.type, p.value]))
  const joursCourts = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return {
    annee: Number(parts.year),
    mois: Number(parts.month),
    jour: Number(parts.day),
    heures: Number(parts.hour) % 24,
    minutes: Number(parts.minute),
    jourSemaine: joursCourts.indexOf(String(parts.weekday)),
  }
}

function minutesDepuisHeure(valeur: string): number {
  const [h, m] = valeur.split(':')
  return Number(h) * 60 + Number(m)
}

function versDate(valeur: string | Date): Date {
  return valeur instanceof Date ? valeur : new Date(valeur)
}

/**
 * Créneaux libres, en instants ISO, sur l'horizon de réservation.
 *
 * Un créneau est retenu s'il tient entièrement dans une plage d'ouverture, s'il commence après le
 * délai minimum, et s'il ne chevauche aucune occupation (rendez-vous déjà pris ou événement de
 * l'agenda Google). La pause configurée élargit chaque occupation des deux côtés : deux appels
 * ne peuvent pas se toucher.
 */
export function calculerCreneauxLibres(
  plages: PlageHebdomadaire[],
  occupations: Occupation[],
  parametres: ParametresCreneaux,
  maintenant: Date,
): string[] {
  const { dureeMinutes, delaiMinimumHeures, horizonJours, pauseMinutes, fuseau } = parametres
  const plagesActives = plages.filter((p) => p.actif !== false)
  if (plagesActives.length === 0 || dureeMinutes <= 0) return []

  /* L'horizon se compte en jours civils locaux, borné par la boucle plus bas, et non en
     multiples de 24 h : sinon le dernier jour réservable dépendrait de l'heure à laquelle le
     visiteur ouvre la page (à 6 h du matin il verrait le lundi J+7, à 18 h il ne le verrait
     plus). Seul le délai minimum, lui, reste une vraie durée. */
  const debutAutorise = new Date(maintenant.getTime() + delaiMinimumHeures * 3_600_000)

  const occupees = occupations.map((o) => ({
    debut: versDate(o.debut).getTime() - pauseMinutes * 60_000,
    fin: versDate(o.fin).getTime() + pauseMinutes * 60_000,
  }))

  const libres: string[] = []
  const depart = partiesLocales(maintenant, fuseau)

  /* On balaie jour local par jour local plutôt qu'en ajoutant 24 h à un instant : un jour civil
     ne fait pas toujours 24 h (changement d'heure), et c'est la date locale qui porte le sens
     d'une plage « tous les lundis ». */
  for (let decalageJour = 0; decalageJour <= horizonJours; decalageJour++) {
    const midiLocal = instantDepuisLocal(depart.annee, depart.mois, depart.jour + decalageJour, 12, 0, fuseau)
    const jourCourant = partiesLocales(midiLocal, fuseau)

    for (const plage of plagesActives) {
      if (plage.jour_semaine !== jourCourant.jourSemaine) continue

      const debutPlage = minutesDepuisHeure(plage.heure_debut)
      const finPlage = minutesDepuisHeure(plage.heure_fin)

      for (let m = debutPlage; m + dureeMinutes <= finPlage; m += dureeMinutes) {
        const debut = instantDepuisLocal(
          jourCourant.annee,
          jourCourant.mois,
          jourCourant.jour,
          Math.floor(m / 60),
          m % 60,
          fuseau,
        )
        const fin = new Date(debut.getTime() + dureeMinutes * 60_000)

        if (debut < debutAutorise) continue
        const chevauche = occupees.some((o) => debut.getTime() < o.fin && fin.getTime() > o.debut)
        if (chevauche) continue

        libres.push(debut.toISOString())
      }
    }
  }

  return [...new Set(libres)].sort()
}

/** Regroupe les créneaux par date locale, pour l'affichage en colonnes de jours. */
export function grouperParJour(creneaux: string[], fuseau: string): { date: string; creneaux: string[] }[] {
  const parJour = new Map<string, string[]>()
  for (const creneau of creneaux) {
    const p = partiesLocales(new Date(creneau), fuseau)
    const cle = `${p.annee}-${String(p.mois).padStart(2, '0')}-${String(p.jour).padStart(2, '0')}`
    const liste = parJour.get(cle) ?? []
    liste.push(creneau)
    parJour.set(cle, liste)
  }
  return [...parJour.entries()].map(([date, liste]) => ({ date, creneaux: liste })).sort((a, b) => a.date.localeCompare(b.date))
}
