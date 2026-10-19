import { describe, expect, it } from 'vitest'
import { grouperEnvois, libelleDestinataires } from '../messagerie'

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
