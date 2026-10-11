import { describe, expect, it } from 'vitest'
import { estPoseParHOC, type EmpreintesHOC } from '../evenementsHOC.js'

/* Filtre anti-doublon de la superposition Google (demande client du 2026-10-11 : un cours
   s'affichait deux fois dans l'agenda du professeur, une fois comme séance HOC et une fois comme
   événement Google). */

const empreintes: EmpreintesHOC = {
  ids: new Set(['3kfao1buuv9s3aauvtbglqb1og', 'abc123']),
  debutsSeances: new Set(['2026-10-12T18:00:00.000Z']),
}

function evenement(partiel: Partial<{ id: string; titre: string; debut: string }> = {}) {
  return {
    id: 'inconnu',
    titre: 'Déjeuner',
    debut: '2026-10-12T11:00:00.000Z',
    ...partiel,
  }
}

describe('estPoseParHOC', () => {
  it('reconnaît un événement par son identifiant enregistré en base', () => {
    expect(estPoseParHOC(evenement({ id: '3kfao1buuv9s3aauvtbglqb1og' }), empreintes)).toBe(true)
  })

  it('laisse passer un événement personnel sans rapport', () => {
    expect(estPoseParHOC(evenement(), empreintes)).toBe(false)
  })

  it('reconnaît une occurrence de série via son identifiant maître', () => {
    // singleEvents=true : Google détaille la série en instances « <maître>_<horodatage> ».
    expect(estPoseParHOC(evenement({ id: 'abc123_20261012T180000Z' }), empreintes)).toBe(true)
  })

  it('reconnaît un événement orphelin par son horaire de séance et son titre de cours', () => {
    const orphelin = evenement({ id: 'ancien-id-disparu-de-la-base', titre: 'Cours · François Bryan · Nirina Stéphane', debut: '2026-10-12T18:00:00.000Z' })
    expect(estPoseParHOC(orphelin, empreintes)).toBe(true)
  })

  it('reconnaît l’orphelin quel que soit le fuseau d’écriture de la même heure', () => {
    // Google rend « +02:00 » là où Postgres rend « +00:00 » : c'est le même instant.
    const orphelin = evenement({ id: 'autre', titre: 'Cours · François Bryan', debut: '2026-10-12T20:00:00+02:00' })
    expect(estPoseParHOC(orphelin, empreintes)).toBe(true)
  })

  it('ne masque pas un événement personnel qui tombe à l’heure d’une séance mais n’est pas un cours', () => {
    const perso = evenement({ id: 'perso', titre: 'Rendez-vous médecin', debut: '2026-10-12T18:00:00.000Z' })
    expect(estPoseParHOC(perso, empreintes)).toBe(false)
  })

  it('ne masque pas un cours dont l’horaire ne correspond à aucune séance', () => {
    const autre = evenement({ id: 'autre', titre: 'Cours de piano', debut: '2026-10-13T18:00:00.000Z' })
    expect(estPoseParHOC(autre, empreintes)).toBe(false)
  })

  it('tolère une date illisible sans planter', () => {
    expect(estPoseParHOC(evenement({ titre: 'Cours · X', debut: 'pas-une-date' }), empreintes)).toBe(false)
  })
})
