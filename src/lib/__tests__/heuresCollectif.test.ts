import { describe, expect, it } from 'vitest'
import { classeDuDebit, heuresDeLaClasse, heuresDeLaVague } from '../heuresCollectif'

/* Incident du 2026-11-20, capture à l'appui : la fiche de Larissa RAOELIMBOLOLONA annonçait
   32h/32 — forfait terminé — quand la fenêtre « Déplacer un étudiant » la présentait à 4h sur 32,
   donc à mi-parcours, prête à recevoir 28 h gratuites si l'administration conservait son
   compteur. Les deux écrans comptaient le même grand livre et n'en tiraient pas le même chiffre.
   Mesuré ensuite sur la base entière : 21 élèves sur 25 faussés, 286 h en jeu.

   L'écart tient à la REPRISE D'ANTÉRIORITÉ (0140) : 28 h des 32 de Larissa ont été suivies avant
   la mise en service de HOC. Aucune séance ne les porte — ces cours n'ont jamais existé dans
   l'application — et elles se rattachent au forfait par `package_id`. Une jointure qui ne passe
   que par `session_id` les perd en silence, et perd du même coup l'essentiel du parcours des
   élèves les plus anciens.

   Ces tests gardent les deux chemins, parce que c'est l'oubli du second qui a coûté cher. */

const SEANCES = new Map<string, string | null>([
  ['seance-intermediate', 'classe-intermediate'],
  ['seance-beginner', 'classe-beginner'],
  ['seance-orpheline', null],
])
const FORFAITS = new Map<string, string | null>([
  ['forfait-intermediate', 'classe-intermediate'],
  ['forfait-beginner', 'classe-beginner'],
  ['forfait-sans-classe', null],
])

describe('heuresDeLaClasse', () => {
  it('compte les heures d’une séance de la classe', () => {
    const debits = [{ heures: 2, session_id: 'seance-intermediate', package_id: null }]
    expect(heuresDeLaClasse(debits, SEANCES, FORFAITS, 'classe-intermediate')).toBe(2)
  })

  /* Le cœur de l'incident : sans séance, c'est le forfait alimenté qui situe l'écriture. */
  it('compte une reprise d’antériorité, qui n’a aucune séance derrière elle', () => {
    const debits = [{ heures: 28, session_id: null, package_id: 'forfait-intermediate' }]
    expect(heuresDeLaClasse(debits, SEANCES, FORFAITS, 'classe-intermediate')).toBe(28)
  })

  /* Le cas Larissa, en entier : 28 h reprises à l'import + 4 séances d'une heure = 32 sur 32.
     La règle d'avant en comptait 4, et l'annonçait à mi-parcours. */
  it('reconstitue le parcours complet de Larissa : 28h reprises + 4 séances = 32h', () => {
    const debits = [
      { heures: 28, session_id: null, package_id: 'forfait-intermediate' },
      { heures: 1, session_id: 'seance-intermediate', package_id: null },
      { heures: 1, session_id: 'seance-intermediate', package_id: null },
      { heures: 1, session_id: 'seance-intermediate', package_id: null },
      { heures: 1, session_id: 'seance-intermediate', package_id: null },
    ]
    expect(heuresDeLaClasse(debits, SEANCES, FORFAITS, 'classe-intermediate')).toBe(32)
  })

  /* La portée « classe » de 0146 tient toujours : monter de niveau fait repartir le compteur, et
     ni les séances ni les reprises de la classe quittée ne suivent l'élève. */
  it('ignore les heures d’une autre classe, séances comme reprises', () => {
    const debits = [
      { heures: 10, session_id: 'seance-beginner', package_id: null },
      { heures: 28, session_id: null, package_id: 'forfait-beginner' },
      { heures: 1, session_id: 'seance-intermediate', package_id: null },
    ]
    expect(heuresDeLaClasse(debits, SEANCES, FORFAITS, 'classe-intermediate')).toBe(1)
  })

  /* Un débit qu'on ne sait rattacher à rien ne compte jamais : un compteur prudent vaut mieux
     qu'un compteur qui gonfle avec des heures d'ailleurs. */
  it('ne compte pas une écriture qu’aucun des deux chemins ne situe', () => {
    const debits = [
      { heures: 5, session_id: null, package_id: null },
      { heures: 3, session_id: 'seance-inconnue', package_id: null },
      { heures: 4, session_id: null, package_id: 'forfait-inconnu' },
      { heures: 7, session_id: null, package_id: 'forfait-sans-classe' },
    ]
    expect(heuresDeLaClasse(debits, SEANCES, FORFAITS, 'classe-intermediate')).toBe(0)
  })

  /* La séance prime sur le forfait : une écriture qui porte les deux décompte une séance bien
     réelle, et c'est elle qui dit où l'heure a été suivie. */
  it('suit la séance quand une écriture porte aussi un forfait', () => {
    const debits = [{ heures: 2, session_id: 'seance-beginner', package_id: 'forfait-intermediate' }]
    expect(heuresDeLaClasse(debits, SEANCES, FORFAITS, 'classe-intermediate')).toBe(0)
    expect(heuresDeLaClasse(debits, SEANCES, FORFAITS, 'classe-beginner')).toBe(2)
  })

  it('accepte des heures rendues en chaîne par PostgREST (numeric)', () => {
    const debits = [{ heures: '1.5', session_id: 'seance-intermediate', package_id: null }]
    expect(heuresDeLaClasse(debits, SEANCES, FORFAITS, 'classe-intermediate')).toBe(1.5)
  })
})

describe('classeDuDebit', () => {
  it('rend la classe de la séance, du forfait, ou null', () => {
    expect(classeDuDebit({ heures: 1, session_id: 'seance-beginner' }, SEANCES, FORFAITS)).toBe('classe-beginner')
    expect(classeDuDebit({ heures: 1, package_id: 'forfait-intermediate' }, SEANCES, FORFAITS)).toBe('classe-intermediate')
    expect(classeDuDebit({ heures: 1 }, SEANCES, FORFAITS)).toBeNull()
    // Une séance sans classe (séance de vague d'avant 0146) ne rattache à aucune classe.
    expect(classeDuDebit({ heures: 1, session_id: 'seance-orpheline' }, SEANCES, FORFAITS)).toBeNull()
  })
})

describe('heuresDeLaVague', () => {
  const SEANCES_VAGUE = new Set(['seance-a', 'seance-b'])
  const FORFAITS_VAGUE = new Set(['forfait-a'])

  it('additionne séances de la vague et reprises de ses forfaits', () => {
    const debits = [
      { heures: 1, session_id: 'seance-a', package_id: null },
      { heures: 2, session_id: 'seance-b', package_id: null },
      { heures: 28, session_id: null, package_id: 'forfait-a' },
      { heures: 99, session_id: 'seance-dailleurs', package_id: null },
      { heures: 99, session_id: null, package_id: 'forfait-dailleurs' },
    ]
    expect(heuresDeLaVague(debits, SEANCES_VAGUE, FORFAITS_VAGUE)).toBe(31)
  })
})
