import { describe, expect, it } from 'vitest'
import { grouperDuo } from '../PipelineCRM'
import type { ProspectAvecDiagnostic } from '../../../hooks/useProspectsPipeline'

function prospect(id: string, prenom: string, duoPartenaireId: string | null = null): ProspectAvecDiagnostic {
  return {
    id,
    prenom,
    nom: 'Test',
    duo_partenaire_id: duoPartenaireId,
    type_programme: 'duo',
  } as ProspectAvecDiagnostic
}

describe('grouperDuo', () => {
  it('réunit en un seul bloc les deux membres d’un binôme liés symétriquement', () => {
    const sandra = prospect('s', 'Sandra', 'b')
    const bensas = prospect('b', 'Bensas', 's')

    const groupes = grouperDuo([sandra, bensas])

    expect(groupes).toHaveLength(1)
    expect(groupes[0]).toEqual([sandra, bensas])
  })

  /* api/prospects/reserver.ts écrit le lien des deux côtés en deux temps : le second écrit peut
     avoir échoué sans annuler la réservation. Ne regarder que `duo_partenaire_id` du dossier
     rencontré en premier laissait alors le binôme éclaté en deux cartes — le symptôme même que
     ce regroupement doit supprimer. */
  it('réunit aussi un binôme dont le lien n’a été écrit que d’un côté', () => {
    const sandra = prospect('s', 'Sandra', null)
    const bensas = prospect('b', 'Bensas', 's')

    expect(grouperDuo([sandra, bensas])).toHaveLength(1)
    // Peu importe l'ordre d'arrivée des deux dossiers dans la colonne.
    expect(grouperDuo([bensas, sandra])).toHaveLength(1)
  })

  it('laisse une carte individuelle quand le partenaire n’est pas dans la même colonne', () => {
    const sandra = prospect('s', 'Sandra', 'b')

    const groupes = grouperDuo([sandra])

    expect(groupes).toEqual([sandra])
  })

  it('n’apparie jamais deux fois la même personne', () => {
    const sandra = prospect('s', 'Sandra', 'b')
    const bensas = prospect('b', 'Bensas', 's')
    const seul = prospect('x', 'Fetra', null)

    const groupes = grouperDuo([sandra, bensas, seul])

    expect(groupes).toHaveLength(2)
    expect(groupes[1]).toEqual(seul)
  })
})
