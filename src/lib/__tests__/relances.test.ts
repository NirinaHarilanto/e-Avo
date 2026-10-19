import { describe, expect, it } from 'vitest'
import { diagnosticProbablementManque } from '../relances'

/* C'est cette règle qui fait apparaître le bouton « Relancer (absence au rendez-vous) » sur une
   carte de prospect (demande client 4 du 2026-10-19). Trop tôt, elle invite à relancer quelqu'un
   qui n'a rien manqué ; jamais, et l'admin ne voit pas le candidat perdu. */
describe('diagnosticProbablementManque', () => {
  const rendezVous = '2026-10-19T09:00:00.000Z'

  it('dit non pendant le rendez-vous', () => {
    expect(
      diagnosticProbablementManque({ statut: 'diagnostic_planifie', debutRendezVous: rendezVous }, new Date('2026-10-19T09:20:00.000Z')),
    ).toBe(false)
  })

  it('dit non juste avant la fin de la marge', () => {
    expect(
      diagnosticProbablementManque({ statut: 'diagnostic_planifie', debutRendezVous: rendezVous }, new Date('2026-10-19T09:44:00.000Z')),
    ).toBe(false)
  })

  it('dit oui passé la marge', () => {
    expect(
      diagnosticProbablementManque({ statut: 'diagnostic_planifie', debutRendezVous: rendezVous }, new Date('2026-10-19T09:46:00.000Z')),
    ).toBe(true)
  })

  it('dit non quand le diagnostic a été marqué comme fait', () => {
    // Le prospect a bien été vu : son statut a avancé, il n'y a plus d'absence à rattraper.
    expect(
      diagnosticProbablementManque({ statut: 'diagnostic_fait', debutRendezVous: rendezVous }, new Date('2026-10-20T09:00:00.000Z')),
    ).toBe(false)
  })

  it('dit non pour un prospect qui n’a pas encore de rendez-vous', () => {
    expect(diagnosticProbablementManque({ statut: 'prospect', debutRendezVous: null }, new Date('2026-10-20T09:00:00.000Z'))).toBe(false)
  })

  it('dit non pour un rendez-vous planifié sans date connue', () => {
    // Un prospect saisi à la main par l'admin peut porter le statut sans avoir de rendez-vous :
    // il n'y a alors aucune heure passée à constater.
    expect(diagnosticProbablementManque({ statut: 'diagnostic_planifie', debutRendezVous: null }, new Date('2026-10-20T09:00:00.000Z'))).toBe(
      false,
    )
    expect(
      diagnosticProbablementManque({ statut: 'diagnostic_planifie', debutRendezVous: undefined }, new Date('2026-10-20T09:00:00.000Z')),
    ).toBe(false)
  })

  it('dit non sur une date illisible plutôt que de se tromper', () => {
    expect(
      diagnosticProbablementManque({ statut: 'diagnostic_planifie', debutRendezVous: 'pas-une-date' }, new Date('2026-10-20T09:00:00.000Z')),
    ).toBe(false)
  })
})
