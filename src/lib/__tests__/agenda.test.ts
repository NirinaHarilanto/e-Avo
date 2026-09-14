import { describe, expect, it } from 'vitest'
import {
  joursDeLaSemaine,
  libelleSemaine,
  lundiDeLaSemaine,
  placerEvenementsDuJour,
  plageHoraire,
  type EvenementAgenda,
} from '../agenda'

// Dates construites en heure locale (comme <input type="datetime-local"> et comme le rendu) :
// une chaîne ISO avec "Z" décalerait les tests selon le fuseau de la machine.
function evenement(id: string, jour: string, heure: string, dureeMinutes: number): EvenementAgenda {
  return { id, debut: new Date(`${jour}T${heure}`).toISOString(), dureeMinutes, titre: id }
}

describe('lundiDeLaSemaine', () => {
  it('remonte au lundi, y compris depuis un dimanche', () => {
    expect(lundiDeLaSemaine(new Date('2026-09-16T15:00')).getDate()).toBe(14) // mercredi -> lundi 14
    expect(lundiDeLaSemaine(new Date('2026-09-20T15:00')).getDate()).toBe(14) // dimanche -> lundi 14
    expect(lundiDeLaSemaine(new Date('2026-09-14T00:30')).getDate()).toBe(14) // lundi -> lui-même
  })

  it('remet l’heure à minuit', () => {
    const lundi = lundiDeLaSemaine(new Date('2026-09-16T15:42'))
    expect([lundi.getHours(), lundi.getMinutes(), lundi.getSeconds()]).toEqual([0, 0, 0])
  })
})

describe('joursDeLaSemaine', () => {
  it('produit 7 jours consécutifs, changement de mois compris', () => {
    const jours = joursDeLaSemaine(lundiDeLaSemaine(new Date('2026-09-30T10:00')))
    expect(jours).toHaveLength(7)
    expect(jours[0].getDate()).toBe(28)
    expect(jours[6].getDate()).toBe(4)
    expect(jours[6].getMonth()).toBe(9) // octobre
  })
})

describe('placerEvenementsDuJour', () => {
  const jour = new Date('2026-09-16T00:00')

  it('ne garde que les événements du jour demandé', () => {
    const places = placerEvenementsDuJour(
      [evenement('a', '2026-09-16', '09:00', 60), evenement('b', '2026-09-17', '09:00', 60)],
      jour,
    )
    expect(places.map((p) => p.id)).toEqual(['a'])
  })

  it('positionne à la minute depuis minuit', () => {
    const [place] = placerEvenementsDuJour([evenement('a', '2026-09-16', '09:30', 90)], jour)
    expect(place.debutMinutes).toBe(570)
    expect(place.finMinutes).toBe(660)
  })

  it('donne toute la largeur à un cours isolé', () => {
    const [place] = placerEvenementsDuJour([evenement('a', '2026-09-16', '09:00', 60)], jour)
    expect([place.colonne, place.colonnes]).toEqual([0, 1])
  })

  it('répartit deux cours qui se chevauchent côte à côte', () => {
    const places = placerEvenementsDuJour(
      [evenement('a', '2026-09-16', '09:00', 60), evenement('b', '2026-09-16', '09:30', 60)],
      jour,
    )
    expect(places.map((p) => p.colonnes)).toEqual([2, 2])
    expect(places.map((p) => p.colonne).sort()).toEqual([0, 1])
  })

  it('remet en pleine largeur après la fin d’un chevauchement', () => {
    const places = placerEvenementsDuJour(
      [
        evenement('a', '2026-09-16', '09:00', 60),
        evenement('b', '2026-09-16', '09:30', 60),
        evenement('c', '2026-09-16', '14:00', 60),
      ],
      jour,
    )
    expect(places.find((p) => p.id === 'c')?.colonnes).toBe(1)
  })

  it('réutilise une colonne libérée', () => {
    // a 9h-11h, b 9h-10h, c 10h-11h : c reprend la colonne de b, il n’en faut que deux.
    const places = placerEvenementsDuJour(
      [
        evenement('a', '2026-09-16', '09:00', 120),
        evenement('b', '2026-09-16', '09:00', 60),
        evenement('c', '2026-09-16', '10:00', 60),
      ],
      jour,
    )
    expect(new Set(places.map((p) => p.colonnes))).toEqual(new Set([2]))
  })

  it('garde une hauteur minimale lisible pour un cours très court', () => {
    const [place] = placerEvenementsDuJour([evenement('a', '2026-09-16', '09:00', 5)], jour)
    expect(place.finMinutes - place.debutMinutes).toBe(15)
  })

  it('tronque à minuit un cours qui déborde sur le lendemain', () => {
    const [place] = placerEvenementsDuJour([evenement('a', '2026-09-16', '23:30', 120)], jour)
    expect(place.finMinutes).toBe(1440)
  })
})

describe('plageHoraire', () => {
  it('garde la fenêtre de bureau par défaut', () => {
    expect(plageHoraire([evenement('a', '2026-09-16', '09:00', 60)])).toEqual({ debut: 7, fin: 22 })
  })

  it('s’élargit pour ne couper ni un cours matinal ni un cours tardif', () => {
    expect(plageHoraire([evenement('a', '2026-09-16', '06:15', 60)]).debut).toBe(6)
    expect(plageHoraire([evenement('a', '2026-09-16', '22:30', 60)]).fin).toBe(24)
  })
})

describe('libelleSemaine', () => {
  it('abrège quand la semaine tient dans un seul mois', () => {
    expect(libelleSemaine(new Date('2026-09-14T00:00'))).toBe('14 – 20 septembre 2026')
  })

  it('nomme les deux mois à cheval', () => {
    expect(libelleSemaine(new Date('2026-09-28T00:00'))).toBe('28 septembre – 4 octobre 2026')
  })
})
