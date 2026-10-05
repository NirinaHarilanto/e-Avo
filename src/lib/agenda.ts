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
  /* Statut du rendez-vous (« Confirmé », « À valider »…), affiché en bas de la pastille — demande
     client du 2026-09-29, avec capture annotée : le statut n'était lisible qu'en ouvrant la fiche. */
  statut?: string
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

/* Hauteur minimale d'une pastille à l'écran (AgendaHebdo.tsx) : un rendez-vous de 15 minutes
   ferait 12 px de haut à l'échelle de la grille, bien trop peu pour rester lisible. Vit ici,
   dans la couche pure, parce que `placerEvenementsDuJour` en a besoin pour calculer les
   chevauchements (voir `dureeMinimaleColonnesMinutes` ci-dessous) — pas seulement AgendaHebdo.tsx
   pour le rendu, qui l'importe d'ici plutôt que de la redéfinir en double. */
export const HAUTEUR_MIN_EVENEMENT_PX = 52
/* Marge visuelle entre deux pastilles consécutives placées dans la même colonne — sans elle,
   deux événements tout juste l'un après l'autre (plancher à plancher) se toucheraient bord à
   bord. */
const MARGE_SEPARATION_PX = 6

/* Convertit le plancher de hauteur ci-dessus en minutes équivalentes, à la hauteur d'heure
   actuellement affichée (`hauteurHeure`, en px pour 60 min — voir AgendaHebdo.tsx, qui varie
   selon la place disponible à l'écran). C'est ce nombre de minutes qui doit servir à DÉTECTER un
   chevauchement, pas la seule durée réelle de l'événement : un rendez-vous de 15 minutes suivi
   d'un autre juste après a chacun une pastille bien PLUS HAUTE que son créneau réel pour rester
   lisible, et sans en tenir compte ici, les deux pastilles se superposaient visuellement tout en
   étant considérées « pleine largeur » chacune — bug réel constaté en production le 2026-10-05
   (plusieurs rendez-vous admin strictement consécutifs rendus illisibles, capture à l'appui). */
export function dureeMinimaleColonnesMinutes(hauteurHeure: number): number {
  if (hauteurHeure <= 0) return 0
  return ((HAUTEUR_MIN_EVENEMENT_PX + MARGE_SEPARATION_PX) / hauteurHeure) * 60
}

/* Les événements d'une journée, positionnés verticalement et répartis horizontalement.
   Un événement qui déborde sur le lendemain est tronqué à minuit : la grille affiche une
   journée, pas un ruban continu.

   `dureeMinimaleColonnesMinutes` (minutes, défaut 0 = comportement historique) étend la durée
   utilisée UNIQUEMENT pour décider qui partage une colonne avec qui — `debutMinutes`/`finMinutes`
   renvoyés restent les horaires réels, affichés tels quels dans la pastille. */
export function placerEvenementsDuJour(
  evenements: EvenementAgenda[],
  jour: Date,
  dureeMinimaleColonnesMinutes = 0,
): EvenementPlace[] {
  const duJour = evenements
    .filter((e) => memeJour(new Date(e.debut), jour))
    .map((e) => {
      const debutMinutes = minutesDepuisMinuit(new Date(e.debut))
      // Durée minimale d'affichage : un cours de 15 min doit rester lisible et cliquable.
      const finMinutes = Math.min(MINUTES_PAR_JOUR, debutMinutes + Math.max(e.dureeMinutes, 15))
      return {
        ...e,
        debutMinutes,
        finMinutes,
        // Jamais renvoyé ni affiché : sert uniquement à grouper/attribuer les colonnes ci-dessous.
        finChevauchement: Math.min(MINUTES_PAR_JOUR, Math.max(finMinutes, debutMinutes + dureeMinimaleColonnesMinutes)),
      }
    })
    .sort((a, b) => a.debutMinutes - b.debutMinutes || a.finMinutes - b.finMinutes)

  const places: EvenementPlace[] = []
  /* Un « groupe de chevauchement » est une suite d'événements qui se recouvrent de proche en
     proche (chevauchement RÉEL ou chevauchement de leurs pastilles à l'écran) : ils se partagent
     la largeur de la colonne du jour, comme dans Outlook. */
  let groupe: typeof duJour = []
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
      finParColonne[colonne] = e.finChevauchement
      return { ...e, colonne }
    })
    for (const { finChevauchement, ...e } of avecColonne) {
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
    finDuGroupe = Math.max(finDuGroupe, evenement.finChevauchement)
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
