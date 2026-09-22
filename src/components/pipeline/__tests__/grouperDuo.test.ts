import { describe, expect, it } from 'vitest'
import { grouperDuo, identifierPorteur } from '../PipelineCRM'
import type { ProspectAvecDiagnostic } from '../../../hooks/useProspectsPipeline'

function prospect(
  id: string,
  prenom: string,
  duoPartenaireId: string | null = null,
  extra: Partial<ProspectAvecDiagnostic> = {},
): ProspectAvecDiagnostic {
  return {
    id,
    prenom,
    nom: 'Test',
    duo_partenaire_id: duoPartenaireId,
    type_programme: 'duo',
    rendezVous: null,
    diagnostic: null,
    tarif_choisi_id: null,
    ...extra,
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

describe('identifierPorteur', () => {
  /* api/prospects/reserver.ts n'écrit rendez_vous que sur le premier prospect créé (« Personne 1 »
     du formulaire) — jamais sur le second, dont `created_at` est pourtant postérieur. Un tri par
     date récente placerait donc souvent le second EN PREMIER dans la paire ; `identifierPorteur`
     doit malgré tout désigner celui qui porte réellement le rendez-vous. */
  it('désigne le membre qui porte le rendez-vous, même s’il n’est pas en tête de paire', () => {
    const sandra = prospect('s', 'Sandra', 'b', { rendezVous: { id: 'rdv1' } as never })
    const bensas = prospect('b', 'Bensas', 's')

    expect(identifierPorteur([bensas, sandra])).toEqual([sandra, bensas])
  })

  /* Depuis que l'autre membre reçoit lui aussi son propre diagnostic_calls (0060, trame à deux
     vitesses), `diagnostic` seul ne suffit plus à distinguer le porteur — les deux peuvent en
     avoir un. `rendezVous` doit rester prioritaire même dans ce cas. */
  it('donne priorité au rendez-vous même quand les deux membres ont un diagnostic', () => {
    const sandra = prospect('s', 'Sandra', 'b', { rendezVous: { id: 'rdv1' } as never, diagnostic: { id: 'd1' } as never })
    const bensas = prospect('b', 'Bensas', 's', { diagnostic: { id: 'd2' } as never })

    expect(identifierPorteur([bensas, sandra])).toEqual([sandra, bensas])
  })

  it('se rabat sur le tarif choisi quand personne n’a de rendez-vous', () => {
    const sandra = prospect('s', 'Sandra', 'b', { tarif_choisi_id: 't1' })
    const bensas = prospect('b', 'Bensas', 's')

    expect(identifierPorteur([bensas, sandra])).toEqual([sandra, bensas])
  })

  it('se rabat sur le premier de la paire quand rien ne distingue les deux membres', () => {
    const sandra = prospect('s', 'Sandra', 'b')
    const bensas = prospect('b', 'Bensas', 's')

    expect(identifierPorteur([sandra, bensas])).toEqual([sandra, bensas])
  })
})
