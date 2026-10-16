import { describe, expect, it } from 'vitest'
import { fraisCollectifASaisir } from '../PipelineCRM'
import type { ProspectAvecDiagnostic } from '../../../hooks/useProspectsPipeline'

type Cible = Pick<ProspectAvecDiagnostic, 'type_programme' | 'paiement'>

const paiement = { montant: 150000, montant_regle: 150000 } as ProspectAvecDiagnostic['paiement']

/* Au collectif, l'élève ne règle qu'UNE somme (le tarif de son niveau) : encaissée depuis la fiche
   du pipeline OU depuis la fenêtre de conversion, jamais les deux — demande client du 2026-10-16.
   Le Suivi des cours collectifs additionnant toutes les lignes rattachées au prospect
   (`suiviCollectif.ts`), une seconde saisie n'était pas qu'un clic de trop : elle affichait
   300 000 Ar de frais pour 150 000 réellement encaissés. */
describe('fraisCollectifASaisir', () => {
  it('réclame les frais d’un candidat collectif qui n’a encore rien réglé', () => {
    expect(fraisCollectifASaisir({ type_programme: 'collectif', paiement: null } as Cible)).toBe(true)
  })

  it('ne les redemande pas quand un paiement a déjà été encaissé', () => {
    expect(fraisCollectifASaisir({ type_programme: 'collectif', paiement } as Cible)).toBe(false)
  })

  /* Individuel et duo ont leur propre paiement de forfait, déjà exigé avant la conversion par la
     fiche elle-même : cette fenêtre-ci ne les concerne pas, avec ou sans ligne de paiement. */
  it('ne concerne ni l’individuel ni le duo', () => {
    expect(fraisCollectifASaisir({ type_programme: 'individuel', paiement: null } as Cible)).toBe(false)
    expect(fraisCollectifASaisir({ type_programme: 'duo', paiement: null } as Cible)).toBe(false)
    expect(fraisCollectifASaisir({ type_programme: null, paiement: null } as Cible)).toBe(false)
  })
})
