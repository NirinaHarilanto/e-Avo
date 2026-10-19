import { describe, expect, it } from 'vitest'
import { entetesMessage, grouperEnvois, libelleDestinataires } from '../messagerie'

/* Capture client du 2026-10-19 : « Message de bienvenue de la fondatrice » occupait cinq lignes
   dans « Envoyés », une par élève, toutes identiques à la minute près. « Il faut que le mail
   reste groupé, exactement comme Outlook, pas explosé visuellement message par message. » */

function message(id: string, destinataire: string, champs: Partial<ReturnType<typeof base>> = {}) {
  return { ...base(id, destinataire), ...champs }
}

function base(id: string, destinataire: string) {
  return {
    id,
    expediteur_profile_id: 'admin-1',
    destinataire_profile_id: destinataire,
    objet: 'Message de bienvenue de la fondatrice',
    corps: 'Bienvenue chez Hari Online Club !',
    created_at: '2026-10-19T19:30:00.000Z',
    lu: false,
  }
}

describe('grouperEnvois', () => {
  it('réunit en une seule ligne un envoi parti à cinq personnes', () => {
    const groupes = grouperEnvois(['a', 'b', 'c', 'd', 'e'].map((d) => message(`m-${d}`, d)))
    expect(groupes).toHaveLength(1)
    expect(groupes[0].messages).toHaveLength(5)
    // Le premier de la liste porte le groupe : c'est lui qui donne la clé et l'ouverture.
    expect(groupes[0].principal.id).toBe('m-a')
  })

  it('ne confond pas deux envois différents', () => {
    const groupes = grouperEnvois([
      message('m-1', 'a'),
      message('m-2', 'b', { objet: 'Tests d’envoie de message' }),
      message('m-3', 'c', { corps: 'Un autre texte' }),
      message('m-4', 'd', { created_at: '2026-10-19T16:38:00.000Z' }),
    ])
    expect(groupes).toHaveLength(4)
  })

  it('sépare deux expéditeurs qui écriraient le même texte au même moment', () => {
    const groupes = grouperEnvois([message('m-1', 'a'), message('m-2', 'b', { expediteur_profile_id: 'prof-9' })])
    expect(groupes).toHaveLength(2)
  })

  it('garde l’ordre de la liste reçue, déjà triée par date', () => {
    const groupes = grouperEnvois([
      message('recent', 'a'),
      message('ancien', 'b', { objet: 'Plus ancien', created_at: '2026-10-18T08:00:00.000Z' }),
    ])
    expect(groupes.map((g) => g.principal.id)).toEqual(['recent', 'ancien'])
  })

  it('tolère une liste vide', () => {
    expect(grouperEnvois([])).toEqual([])
  })
})

describe('libelleDestinataires', () => {
  it('énumère tant que la liste reste courte', () => {
    expect(libelleDestinataires(['Marie'])).toBe('Marie')
    expect(libelleDestinataires(['Marie', 'Jean'])).toBe('Marie et Jean')
    expect(libelleDestinataires(['Marie', 'Jean', 'Paul'])).toBe('Marie, Jean et Paul')
  })

  it('abrège au-delà, en gardant le compte exact', () => {
    expect(libelleDestinataires(['Marie', 'Jean', 'Paul', 'Luc'])).toBe('Marie, Jean, Paul et 1 autre')
    expect(libelleDestinataires(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c et 2 autres')
  })

  it('ne laisse pas une ligne vide quand personne n’est résolu', () => {
    expect(libelleDestinataires([])).toBe('Personne')
  })
})

/* Capture client du 2026-10-19 : la fiche d'un message ouvert ne nommait qu'un seul
   correspondant, sur une ligne qui ne disait que le sens de lecture (« De » ou « À »). « Il faut
   bien présenter visuellement un message envoyé et bien structuré : Destinataire, Expéditeur,
   Date et heure d'envoi, Message. » Les deux intitulés doivent donc TOUJOURS apparaître, quel que
   soit l'onglet ouvert — c'est toujours « moi » d'un côté et le ou les correspondants de
   l'autre. */
describe('entetesMessage', () => {
  const libelleRole = { etudiant: 'Élève', admin_etablissement: 'Administration' }
  const admin = { prenom: 'Harinjo', nom: 'Andriamahenina', role: 'admin_etablissement' }
  const eleve = { prenom: 'bernard', nom: 'bensas', role: 'etudiant' }

  it('un message reçu : moi en destinataire, le correspondant en expéditeur', () => {
    const { destinataire, expediteur } = entetesMessage({
      estRecu: true,
      correspondant: eleve,
      moi: admin,
      destinataires: [],
      libelleRole,
    })
    expect(destinataire).toBe('Harinjo Andriamahenina · Administration')
    expect(expediteur).toBe('bernard bensas · Élève')
  })

  it('un message envoyé à une seule personne : le correspondant en destinataire, moi en expéditeur', () => {
    const { destinataire, expediteur } = entetesMessage({
      estRecu: false,
      correspondant: eleve,
      moi: admin,
      destinataires: [eleve],
      libelleRole,
    })
    expect(destinataire).toBe('bernard bensas · Élève')
    expect(expediteur).toBe('Harinjo Andriamahenina · Administration')
  })

  it('un envoi groupé : tous les destinataires nommés, moi en expéditeur', () => {
    const lalaina = { prenom: 'Lalaina', nom: 'bensas', role: 'etudiant' }
    const { destinataire, expediteur } = entetesMessage({
      estRecu: false,
      correspondant: eleve,
      moi: admin,
      destinataires: [eleve, lalaina],
      libelleRole,
    })
    // Juste les noms, sans « N destinataires » devant : la ligne « Destinataire » le dit déjà.
    expect(destinataire).toBe('bernard bensas et Lalaina bensas')
    expect(expediteur).toBe('Harinjo Andriamahenina · Administration')
  })

  it('ne plante pas quand la personne connectée n’est pas encore connue', () => {
    const { expediteur } = entetesMessage({ estRecu: false, correspondant: eleve, moi: null, destinataires: [eleve], libelleRole })
    expect(expediteur).toBe('Moi')
  })

  it('nomme un correspondant dont le compte a disparu, plutôt que de planter', () => {
    const { expediteur } = entetesMessage({ estRecu: true, correspondant: null, moi: admin, destinataires: [], libelleRole })
    expect(expediteur).toBe('Personne inconnue')
  })
})
