import { describe, expect, it } from 'vitest'
import { agendaAdminComplet, seanceSansEffet, versEvenementPrestation } from '../agendaEvenements'
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

/* Demande client du 2026-10-20, deux captures à l'appui : une prestation corporate visible dans
   l'agenda du professeur n'apparaissait nulle part dans « Séances & visio » côté admin —
   « pourquoi les deux agendas ne sont pas synchronisés ». La conversion, jusque-là enfermée dans
   CalendrierProfesseur.tsx, est remontée ici pour que les deux écrans affichent la même
   prestation de la même façon : mêmes couleurs, mêmes libellés, même préfixe d'identifiant. */
describe('versEvenementPrestation', () => {
  const base = {
    id: 'prestation-1',
    debut: '2026-10-20T09:00:00.000Z',
    duree_minutes: 120,
    client: 'Telma colleagues',
    type: 'corporate' as const,
    statut: 'planifiee' as const,
  }

  it('préfixe l’identifiant, pour que le clic ouvre la fiche de prestation et non celle d’une séance', () => {
    expect(versEvenementPrestation(base).id).toBe('prestation:prestation-1')
  })

  it('nomme le client et rappelle le type, comme dans la grille du professeur', () => {
    const evenement = versEvenementPrestation(base)
    expect(evenement.titre).toBe('Telma colleagues')
    expect(evenement.sousTitre).toBe('Corporate · 120 min')
    expect(evenement.dureeMinutes).toBe(120)
  })

  it('distingue chat & chill de corporate dans le sous-titre', () => {
    expect(versEvenementPrestation({ ...base, type: 'chat_chill' }).sousTitre).toBe('Chat & chill · 120 min')
  })

  it('garde le teal, le ton réservé au hors cursus', () => {
    // Bleu/or/violet désignent déjà individuel/duo/collectif : les réutiliser ferait passer un
    // cours corporate pour un cours d'élève.
    expect(versEvenementPrestation(base).ton).toBe('teal')
  })

  it('annonce « Terminée » une fois clôturée, sans l’atténuer', () => {
    const evenement = versEvenementPrestation({ ...base, statut: 'terminee' })
    expect(evenement.statut).toBe('Terminée')
    expect(evenement.attenue).toBe(false)
    expect(evenement.ton).toBe('teal')
  })

  it('grise une prestation annulée', () => {
    const evenement = versEvenementPrestation({ ...base, statut: 'annulee' })
    expect(evenement.statut).toBe('Annulée')
    expect(evenement.attenue).toBe(true)
    expect(evenement.ton).toBe('neutre')
  })
})
