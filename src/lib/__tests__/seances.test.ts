import { describe, expect, it } from 'vitest'
import {
  estSeanceDuo,
  inscriptionsVisibles,
  libelleAuteurModification,
  libelleTypeSeance,
  nomEleveInscrit,
  seancePasseeNonCloturee,
  seanceCloturable,
  seancesHorsAffectation,
  compteRenduSessionOraleOuvrable,
} from '../seances'

describe('nomEleveInscrit', () => {
  it('nomme explicitement un élève dont le profil n’est plus résoluble', () => {
    expect(nomEleveInscrit(null)).toBe('Élève supprimé')
    expect(nomEleveInscrit(undefined)).toBe('Élève supprimé')
  })

  it('tolère un nom ou un prénom manquant', () => {
    expect(nomEleveInscrit({ prenom: 'Sandra', nom: null })).toBe('Sandra')
    expect(nomEleveInscrit({ prenom: null, nom: 'Bensas' })).toBe('Bensas')
  })
})

describe('inscriptionsVisibles', () => {
  /* Revu le 2026-09-23 : un compte supprimé ne doit plus laisser aucune trace visible, y
     compris dans l'historique — plus de distinction passé/avenir (voir le commentaire de la
     fonction). */
  it('retire un élève supprimé, y compris d’une séance déjà passée', () => {
    const inscriptions = [{ etudiant: null }, { etudiant: { id: 'a' } }]
    expect(inscriptionsVisibles(inscriptions)).toEqual([{ etudiant: { id: 'a' } }])
  })

  it('masque la séance dont tous les inscrits ont été supprimés', () => {
    expect(inscriptionsVisibles([{ etudiant: null }])).toBeNull()
  })

  it('garde une séance volontairement créée sans inscrit', () => {
    expect(inscriptionsVisibles([])).toEqual([])
  })
})

/* Un binôme DUO est une séance 'individuel' à deux inscrits (0054/0008) : seul le lien
   `duo_partenaire_id` permet de le distinguer d'un petit cours collectif. Demande client du
   2026-10-11 : la séance de François Bryan et Malalatiaina ANDRI s'affichait « Individuel ». */

const francois = { id: 'francois', duo_partenaire_id: null }
const malalatiaina = { id: 'malalatiaina', duo_partenaire_id: 'francois' }
const tiers = { id: 'tiers', duo_partenaire_id: null }

describe('estSeanceDuo', () => {
  it('reconnaît deux élèves liés, quel que soit le sens de la lecture', () => {
    expect(estSeanceDuo([{ etudiant: francois }, { etudiant: malalatiaina }])).toBe(true)
    expect(estSeanceDuo([{ etudiant: malalatiaina }, { etudiant: francois }])).toBe(true)
  })

  it('ne confond pas deux élèves qui se trouvent seuls au même cours', () => {
    expect(estSeanceDuo([{ etudiant: francois }, { etudiant: tiers }])).toBe(false)
  })

  it('exige exactement deux inscrits', () => {
    expect(estSeanceDuo([{ etudiant: francois }])).toBe(false)
    expect(estSeanceDuo([{ etudiant: francois }, { etudiant: malalatiaina }, { etudiant: tiers }])).toBe(false)
  })

  it('tolère un inscrit dont le compte a été supprimé', () => {
    expect(estSeanceDuo([{ etudiant: francois }, { etudiant: null }])).toBe(false)
  })
})

describe('libelleTypeSeance', () => {
  it('dit « Duo » pour un binôme, même si la séance est de type individuel', () => {
    expect(libelleTypeSeance('individuel', [{ etudiant: francois }, { etudiant: malalatiaina }])).toBe('Duo')
  })

  it('garde Individuel et Collectif pour les autres cas', () => {
    expect(libelleTypeSeance('individuel', [{ etudiant: francois }])).toBe('Individuel')
    expect(libelleTypeSeance('collectif', [{ etudiant: francois }, { etudiant: tiers }])).toBe('Collectif')
  })
})

/* Demande client du 2026-10-19, capture à l'appui : une modification faite par un admin
   s'affichait « Utilisateur inconnu » dans l'historique d'une séance, l'auteur étant résolu en
   relisant `profiles` avec le client authentifié — soumis à une RLS qui ne garantit pas qu'un
   admin voie la ligne d'un AUTRE admin (voir 0132). `estAdmin` vient désormais d'une colonne
   enregistrée à l'écriture, indépendante de cette lecture. */
describe('libelleAuteurModification', () => {
  it('dit « Admin » quand l’acteur a la capacité admin mais que son nom reste illisible', () => {
    expect(libelleAuteurModification(true, null)).toBe('Admin')
  })

  it('ajoute le nom à « Admin » quand il est aussi lisible', () => {
    expect(libelleAuteurModification(true, { prenom: 'Nirina Stéphane', nom: 'RAKOTONJANAHARY' })).toBe('Admin · Nirina Stéphane RAKOTONJANAHARY')
  })

  it('affiche le nom seul pour un professeur', () => {
    expect(libelleAuteurModification(false, { prenom: 'Antsa', nom: 'RAHINARA' })).toBe('Antsa RAHINARA')
  })

  it('dit « Utilisateur inconnu » seulement quand ni la capacité ni le nom ne sont connus', () => {
    expect(libelleAuteurModification(false, null)).toBe('Utilisateur inconnu')
  })
})

/* Demande client du 2026-10-19 : le dossier d'un élève en cours collectif affichait « Aucune
   séance enregistrée ». Les périodes du parcours se construisent sur `teacher_assignments`, qu'un
   élève collectif n'a pas — ses séances, inscrites par sa classe de niveau (0074), n'étaient
   réclamées par aucune période et disparaissaient du dossier. */
describe('seancesHorsAffectation', () => {
  const seance = (id: string, teacher_assignment_id: string | null) => ({ id, enrollment: { teacher_assignment_id } })

  it('retient les séances d’une classe de niveau, sans affectation individuelle', () => {
    const seances = [seance('collective-1', null), seance('individuelle-1', 'affectation-1')]
    expect(seancesHorsAffectation(seances, ['affectation-1']).map((s) => s.id)).toEqual(['collective-1'])
  })

  it('laisse les séances individuelles à leur période', () => {
    const seances = [seance('individuelle-1', 'affectation-1'), seance('individuelle-2', 'affectation-2')]
    expect(seancesHorsAffectation(seances, ['affectation-1', 'affectation-2'])).toEqual([])
  })

  it('ne perd pas une séance dont l’affectation a disparu', () => {
    // Sinon elle ne s'afficherait nulle part : ni dans une période (l'affectation n'existe plus),
    // ni dans le bloc collectif.
    const seances = [seance('orpheline', 'affectation-supprimee')]
    expect(seancesHorsAffectation(seances, ['affectation-1']).map((s) => s.id)).toEqual(['orpheline'])
  })

  it('rend toutes les séances quand l’élève n’a aucune affectation', () => {
    const seances = [seance('collective-1', null), seance('collective-2', null)]
    expect(seancesHorsAffectation(seances, [])).toHaveLength(2)
  })
})

/* Signalé par le client le 2026-10-19, capture à l'appui : son dossier affichait deux séances
   « Planifiée » (18 et 19 octobre) ET l'alerte « Aucun cours planifié ». Les deux étaient exactes
   au mot près — l'une donnait le STATUT en base, l'autre comptait les séances À VENIR, et la
   séance du 19 venait de passer — mais l'écran se contredisait. « il faut que toutes les
   informations soient cohérentes ». */
describe('seancePasseeNonCloturee', () => {
  const maintenant = new Date('2026-10-19T16:52:00Z')
  const seance = (debut: string, duree_minutes = 60, statut = 'planifiee') => ({ statut, debut, duree_minutes })

  it('reconnaît une séance planifiée dont l’horaire est entièrement passé', () => {
    expect(seancePasseeNonCloturee(seance('2026-10-18T16:00:00Z'), maintenant)).toBe(true)
    // La séance du jour, commencée à 16 h et finie à 17 h… non : finie à 17 h, il est 16 h 52.
    expect(seancePasseeNonCloturee(seance('2026-10-19T16:00:00Z', 52), maintenant)).toBe(true)
  })

  it('ne bascule pas une séance encore en cours', () => {
    // Commencée il y a 52 minutes, elle dure 90 minutes : elle n'est pas en retard de clôture.
    expect(seancePasseeNonCloturee(seance('2026-10-19T16:00:00Z', 90), maintenant)).toBe(false)
  })

  it('ne touche jamais une séance à venir', () => {
    expect(seancePasseeNonCloturee(seance('2026-10-20T16:00:00Z'), maintenant)).toBe(false)
  })

  it('ne concerne que le statut « planifiée »', () => {
    // Une séance passée déjà clôturée, annulée ou reportée garde son propre libellé.
    expect(seancePasseeNonCloturee(seance('2026-10-18T16:00:00Z', 60, 'terminee'), maintenant)).toBe(false)
    expect(seancePasseeNonCloturee(seance('2026-10-18T16:00:00Z', 60, 'annulee'), maintenant)).toBe(false)
    expect(seancePasseeNonCloturee(seance('2026-10-18T16:00:00Z', 60, 'reportee'), maintenant)).toBe(false)
  })
})

/* Règle posée par le client le 2026-11-04 : « toute séance de cours doit être clôturable à
   partir de 5 min avant la fin de la séance ». Avant, le bouton s'ouvrait dès le DÉBUT. */
describe('seanceCloturable', () => {
  const seance = (debut: string, duree_minutes = 60, statut = 'planifiee') => ({ statut, debut, duree_minutes })
  // Séance de 10h00 à 11h00 : clôture ouverte à partir de 10h55.
  const DEBUT = '2026-11-04T10:00:00Z'

  it('reste fermée tant qu’il manque plus de 5 min avant la fin', () => {
    expect(seanceCloturable(seance(DEBUT), new Date('2026-11-04T10:00:00Z'))).toBe(false)
    expect(seanceCloturable(seance(DEBUT), new Date('2026-11-04T10:30:00Z'))).toBe(false)
    expect(seanceCloturable(seance(DEBUT), new Date('2026-11-04T10:54:59Z'))).toBe(false)
  })

  it('s’ouvre pile 5 min avant la fin, et le reste après', () => {
    expect(seanceCloturable(seance(DEBUT), new Date('2026-11-04T10:55:00Z'))).toBe(true)
    expect(seanceCloturable(seance(DEBUT), new Date('2026-11-04T11:00:00Z'))).toBe(true)
    // Une séance oubliée trois jours doit évidemment rester clôturable.
    expect(seanceCloturable(seance(DEBUT), new Date('2026-11-07T09:00:00Z'))).toBe(true)
  })

  it('tient compte de la durée réelle, pas d’une heure fixe', () => {
    // Séance de 30 min : clôture à partir de 10h25, pas 10h55.
    expect(seanceCloturable(seance(DEBUT, 30), new Date('2026-11-04T10:24:00Z'))).toBe(false)
    expect(seanceCloturable(seance(DEBUT, 30), new Date('2026-11-04T10:25:00Z'))).toBe(true)
    // Séance de 2 h : toujours fermée à 10h55.
    expect(seanceCloturable(seance(DEBUT, 120), new Date('2026-11-04T10:55:00Z'))).toBe(false)
    expect(seanceCloturable(seance(DEBUT, 120), new Date('2026-11-04T11:55:00Z'))).toBe(true)
  })

  it('ne s’applique qu’aux séances encore planifiées', () => {
    const apres = new Date('2026-11-04T11:30:00Z')
    expect(seanceCloturable(seance(DEBUT, 60, 'terminee'), apres)).toBe(false)
    expect(seanceCloturable(seance(DEBUT, 60, 'annulee'), apres)).toBe(false)
    expect(seanceCloturable(seance(DEBUT, 60, 'reportee'), apres)).toBe(false)
  })
})

/* Demande client du 2026-11-08 : « à 5 min de la fin de la session orale, il faudrait rajouter un
   bouton sur le pop-up afin que l'admin puisse renseigner le compte rendu de la session ». Même
   seuil que la clôture d'une séance, et c'est voulu : les deux répondent à la question « le cours
   touche-t-il à sa fin ? ». Ces tests gardent le seuil ET le fait qu'il se calcule sur la durée
   réelle du créneau, qui va de 5 à 240 minutes (0051) — un créneau de 15 min ouvrirait son compte
   rendu au bout de 10, pas au bout de 55. */
describe('compteRenduSessionOraleOuvrable', () => {
  const DEBUT = '2026-11-08T10:00:00Z'
  const creneau = (duree = 60) => ({ debut: DEBUT, duree_minutes: duree })

  it('reste fermé tant qu’il manque plus de cinq minutes avant la fin', () => {
    expect(compteRenduSessionOraleOuvrable(creneau(), new Date('2026-11-08T09:30:00Z'))).toBe(false)
    expect(compteRenduSessionOraleOuvrable(creneau(), new Date('2026-11-08T10:00:00Z'))).toBe(false)
    expect(compteRenduSessionOraleOuvrable(creneau(), new Date('2026-11-08T10:54:59Z'))).toBe(false)
  })

  it('s’ouvre cinq minutes avant la fin et ne se referme plus', () => {
    expect(compteRenduSessionOraleOuvrable(creneau(), new Date('2026-11-08T10:55:00Z'))).toBe(true)
    expect(compteRenduSessionOraleOuvrable(creneau(), new Date('2026-11-08T11:00:00Z'))).toBe(true)
    // Une session oubliée trois jours doit évidemment rester renseignable.
    expect(compteRenduSessionOraleOuvrable(creneau(), new Date('2026-11-11T09:00:00Z'))).toBe(true)
  })

  it('se cale sur la durée réelle du créneau', () => {
    // Créneau de 15 min : ouvert dès 10h10.
    expect(compteRenduSessionOraleOuvrable(creneau(15), new Date('2026-11-08T10:09:00Z'))).toBe(false)
    expect(compteRenduSessionOraleOuvrable(creneau(15), new Date('2026-11-08T10:10:00Z'))).toBe(true)
    // Créneau de 2 h : encore fermé à 11h00.
    expect(compteRenduSessionOraleOuvrable(creneau(120), new Date('2026-11-08T11:00:00Z'))).toBe(false)
    expect(compteRenduSessionOraleOuvrable(creneau(120), new Date('2026-11-08T11:55:00Z'))).toBe(true)
  })
})
