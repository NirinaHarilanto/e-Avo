/* Calculs purs de l'agenda hebdomadaire (AgendaHebdo.tsx) : découpage d'une semaine, placement
   vertical d'un événement à la minute, et répartition horizontale des événements qui se
   chevauchent. Isolés ici pour être testables sans rendu — c'est la partie où une erreur
   d'arrondi ou de fuseau se voit le moins à l'œil. */

export const MINUTES_PAR_JOUR = 24 * 60

export interface EvenementAgenda {
  id: string
  debut: string
  dureeMinutes: number
  titre: string
  sousTitre?: string
  /* Teinte de la pastille — reprend le vocabulaire des composants de socle (Stat, Badge). */
  ton?: 'bleu' | 'or' | 'teal' | 'violet' | 'neutre' | 'danger'
  /* Grisé et non cliquable : séance annulée, ou cours d'un autre professeur en vue admin. */
  attenue?: boolean
  /* Pastille discrète en coin (ex. changement d'horaire en attente de validation). */
  marqueur?: string
}

export interface EvenementPlace extends EvenementAgenda {
  /* Position dans la journée, en minutes depuis minuit — le rendu multiplie par la hauteur
     d'une minute. */
  debutMinutes: number
  finMinutes: number
  /* Répartition horizontale quand plusieurs cours se chevauchent : `colonne` sur `colonnes`. */
  colonne: number
  colonnes: number
}

export function lundiDeLaSemaine(date: Date): Date {
  const d = new Date(date)
  const jour = d.getDay()
  // getDay() : 0 = dimanche. La semaine française commence le lundi.
  d.setDate(d.getDate() + (jour === 0 ? -6 : 1 - jour))
  d.setHours(0, 0, 0, 0)
  return d
}

export function ajouterJours(date: Date, nombre: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + nombre)
  return d
}

export function joursDeLaSemaine(lundi: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i))
}

export function memeJour(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function minutesDepuisMinuit(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

/* Les événements d'une journée, positionnés verticalement et répartis horizontalement.
   Un événement qui déborde sur le lendemain est tronqué à minuit : la grille affiche une
   journée, pas un ruban continu. */
export function placerEvenementsDuJour(evenements: EvenementAgenda[], jour: Date): EvenementPlace[] {
  const duJour = evenements
    .filter((e) => memeJour(new Date(e.debut), jour))
    .map((e) => {
      const debutMinutes = minutesDepuisMinuit(new Date(e.debut))
      return {
        ...e,
        debutMinutes,
        // Durée minimale d'affichage : un cours de 15 min doit rester lisible et cliquable.
        finMinutes: Math.min(MINUTES_PAR_JOUR, debutMinutes + Math.max(e.dureeMinutes, 15)),
      }
    })
    .sort((a, b) => a.debutMinutes - b.debutMinutes || a.finMinutes - b.finMinutes)

  const places: EvenementPlace[] = []
  /* Un « groupe de chevauchement » est une suite d'événements qui se recouvrent de proche en
     proche : ils se partagent la largeur de la colonne du jour, comme dans Outlook. */
  let groupe: (EvenementAgenda & { debutMinutes: number; finMinutes: number })[] = []
  let finDuGroupe = -1

  const viderGroupe = () => {
    if (groupe.length === 0) return
    // Colonnes attribuées gloutonnement : on réutilise la première colonne libre.
    const finParColonne: number[] = []
    const avecColonne = groupe.map((e) => {
      let colonne = finParColonne.findIndex((fin) => fin <= e.debutMinutes)
      if (colonne === -1) {
        colonne = finParColonne.length
      }
      finParColonne[colonne] = e.finMinutes
      return { ...e, colonne }
    })
    for (const e of avecColonne) {
      places.push({ ...e, colonnes: finParColonne.length })
    }
    groupe = []
    finDuGroupe = -1
  }

  for (const evenement of duJour) {
    if (groupe.length > 0 && evenement.debutMinutes >= finDuGroupe) {
      viderGroupe()
    }
    groupe.push(evenement)
    finDuGroupe = Math.max(finDuGroupe, evenement.finMinutes)
  }
  viderGroupe()

  return places
}

/* Plage horaire à afficher : une fenêtre de bureau par défaut, élargie pour ne jamais couper un
   cours qui commence tôt ou finit tard. */
export function plageHoraire(
  evenements: EvenementAgenda[],
  defaut: { debut: number; fin: number } = { debut: 7, fin: 22 },
): { debut: number; fin: number } {
  let debut = defaut.debut
  let fin = defaut.fin
  for (const e of evenements) {
    const d = new Date(e.debut)
    const heureDebut = Math.floor(minutesDepuisMinuit(d) / 60)
    const heureFin = Math.ceil((minutesDepuisMinuit(d) + Math.max(e.dureeMinutes, 15)) / 60)
    debut = Math.min(debut, heureDebut)
    fin = Math.max(fin, Math.min(24, heureFin))
  }
  return { debut: Math.max(0, debut), fin: Math.min(24, Math.max(fin, debut + 1)) }
}

export function libelleSemaine(lundi: Date): string {
  const dimanche = ajouterJours(lundi, 6)
  const memeMois = lundi.getMonth() === dimanche.getMonth()
  const debut = lundi.toLocaleDateString('fr-FR', memeMois ? { day: 'numeric' } : { day: 'numeric', month: 'long' })
  const fin = dimanche.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  return `${debut} – ${fin}`
}
