import { describe, expect, it } from 'vitest'
import { agendaAdminComplet, seanceSansEffet } from '../agendaEvenements'
import type { RendezVousAvecProspect } from '../../hooks/useRendezVous'
import type { EvenementAdminAvecParticipants } from '../../hooks/useEvenementsAdmin'

/* Un rendez-vous refusé/annulé ou un événement annulé doit disparaître des grilles d'agenda
   (demande client du 2026-10-11, « retirer visuellement le rendez-vous des agendas concernés »),
   pas seulement s'y griser — voir le commentaire de agendaAdminComplet pour le détail. */

function rdv(id: string, statut: RendezVousAvecProspect['statut']): RendezVousAvecProspect {
  return {
    id,
    debut: '2026-10-20T10:00:00.000Z',
    duree_minutes: 30,
    statut,
    prospects: { nom: 'Dupont', prenom: 'Alice', email: null, telephone: null, langue_visee: null, objectif: null, type_programme: null, statut: 'prospect' },
  } as unknown as RendezVousAvecProspect
}

function evenement(id: string, annule: boolean): EvenementAdminAvecParticipants {
  return {
    id,
    titre: 'Entretien',
    debut: '2026-10-20T10:00:00.000Z',
    duree_minutes: 30,
    annule,
    obligatoires: [],
    optionnels: [],
    creeParAdmin: false,
  } as unknown as EvenementAdminAvecParticipants
}

describe('seanceSansEffet', () => {
  it('reconnaît une séance annulée ou reportée comme sans effet', () => {
    expect(seanceSansEffet('annulee')).toBe(true)
    expect(seanceSansEffet('reportee')).toBe(true)
  })

  it('ne marque pas une séance planifiée ou terminée comme sans effet', () => {
    expect(seanceSansEffet('planifiee')).toBe(false)
    expect(seanceSansEffet('terminee')).toBe(false)
  })
})

describe('agendaAdminComplet', () => {
  it('exclut les rendez-vous refusés et annulés', () => {
    const resultat = agendaAdminComplet(
      [rdv('confirme', 'confirme'), rdv('en-attente', 'en_attente'), rdv('refuse', 'refuse'), rdv('annule', 'annule')],
      [],
    )
    expect(resultat.map((e) => e.id).sort()).toEqual(['rdv:confirme', 'rdv:en-attente'].sort())
  })

  it('exclut les événements admin annulés', () => {
    const resultat = agendaAdminComplet([], [evenement('actif', false), evenement('annule', true)])
    expect(resultat.map((e) => e.id)).toEqual(['evt:actif'])
  })

  it('ne modifie pas les tableaux d’origine', () => {
    const rendezVous = [rdv('a', 'annule')]
    const evenementsAdmin = [evenement('b', true)]
    agendaAdminComplet(rendezVous, evenementsAdmin)
    expect(rendezVous).toHaveLength(1)
    expect(evenementsAdmin).toHaveLength(1)
  })
})
