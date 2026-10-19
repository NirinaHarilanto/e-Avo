import { describe, expect, it, beforeEach } from 'vitest'
import { trouverHomonymeProspect, trouverProfilHomonyme } from '../nomDuplique.js'

/* Signalé par le client le 2026-10-19, capture à l'appui : « Un profil existe déjà pour dentalis
   bensas (prospect ou étudiant) » sur le formulaire public, alors que ce compte avait été SUPPRIMÉ
   depuis l'espace admin. Cinq comptes étaient dans ce cas en production.

   La cause : le profil suspendu était bien ignoré, mais le prospect dont ce compte était né, lui,
   restait en base et suffisait à réserver le nom à vie. Demande : « il faut que la suppression
   soit totale et sans historique bloquant pour le ré-ajout ».

   Ces tests verrouillent le principe : une garde d'unicité ne compte que ce qui est encore
   vivant. Jamais ce qui a été supprimé. */

let prospects: { id: string; nom: string; prenom: string }[] = []
let profilsActifs: { id: string; nom: string; prenom: string }[] = []
let profilsSupprimes: { prospect_id: string | null }[] = []
/* Tous les profils du rôle demandé, comptes supprimés COMPRIS : depuis le 2026-10-19 la requête
   ne les écarte plus elle-même, c'est `homonymeBloquant` qui tranche (règle unique, partagée avec
   l'édition de fiche côté navigateur). */
let profilsDuRole: { id: string; nom: string; prenom: string; status?: string }[] = []

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'prospects') {
        return { select: () => ({ eq: async () => ({ data: prospects }) }) }
      }
      if (table !== 'profiles') throw new Error('table inattendue : ' + table)
      return {
        select: () => ({
          eq: () => ({
            /* Trois chaînes partent du filtre d'établissement :
               `.in('role', …).neq('status', …)` → profils actifs (homonyme prospect)
               `.eq('role', …)`                  → tous les profils du rôle, supprimés compris :
                                                   c'est `homonymeBloquant` qui les écarte, pour
                                                   que la règle ne soit plus écrite deux fois
               `.eq('status', …).not('prospect_id')` → prospects des comptes supprimés */
            in: () => ({ neq: async () => ({ data: profilsActifs }) }),
            eq: (colonne: string) => {
              const chaine = {
                not: async () => ({ data: profilsSupprimes }),
                then: (resoudre: (r: { data: unknown }) => unknown) =>
                  Promise.resolve({ data: colonne === 'status' ? profilsSupprimes : profilsDuRole }).then(resoudre),
              }
              return chaine
            },
          }),
        }),
      }
    },
  } as never
}

const params = { etablissementId: 'etab-1', nom: 'bensas', prenom: 'dentalis' }

beforeEach(() => {
  prospects = []
  profilsActifs = []
  profilsSupprimes = []
  profilsDuRole = []
})

describe('trouverHomonymeProspect', () => {
  it('refuse un nom déjà porté par un prospect vivant', async () => {
    prospects = [{ id: 'prospect-1', nom: 'bensas', prenom: 'dentalis' }]
    expect(await trouverHomonymeProspect(clientFactice(), params)).toMatchObject({ id: 'prospect-1' })
  })

  it('laisse passer le nom d’un compte supprimé dont le prospect traîne encore', async () => {
    prospects = [{ id: 'prospect-1', nom: 'bensas', prenom: 'dentalis' }]
    profilsSupprimes = [{ prospect_id: 'prospect-1' }]
    expect(await trouverHomonymeProspect(clientFactice(), params)).toBeNull()
  })

  it('ne confond pas deux prospects dont un seul est fantôme', async () => {
    prospects = [
      { id: 'prospect-mort', nom: 'bensas', prenom: 'dentalis' },
      { id: 'prospect-vivant', nom: 'bensas', prenom: 'dentalis' },
    ]
    profilsSupprimes = [{ prospect_id: 'prospect-mort' }]
    // Le vivant bloque toujours : c'est bien une vraie personne encore inscrite.
    expect(await trouverHomonymeProspect(clientFactice(), params)).toMatchObject({ id: 'prospect-vivant' })
  })

  it('refuse un nom déjà porté par un profil actif, prospect ou pas', async () => {
    profilsActifs = [{ id: 'profil-1', nom: 'bensas', prenom: 'dentalis' }]
    expect(await trouverHomonymeProspect(clientFactice(), params)).toMatchObject({ id: 'profil-1' })
  })

  it('ignore accents et casse, comme avant le correctif', async () => {
    prospects = [{ id: 'prospect-1', nom: 'BENSAS', prenom: 'Déntalis' }]
    expect(await trouverHomonymeProspect(clientFactice(), params)).toMatchObject({ id: 'prospect-1' })
  })
})

describe('trouverProfilHomonyme', () => {
  it('refuse un nom déjà porté par un profil actif', async () => {
    profilsDuRole = [{ id: 'profil-1', nom: 'bensas', prenom: 'dentalis', status: 'approved' }]
    const trouve = await trouverProfilHomonyme(clientFactice(), { ...params, role: 'etudiant' })
    expect(trouve).toMatchObject({ id: 'profil-1' })
  })

  it('laisse le nom libre quand aucun profil ne le porte', async () => {
    profilsDuRole = []
    expect(await trouverProfilHomonyme(clientFactice(), { ...params, role: 'etudiant' })).toBeNull()
  })

  /* Capture client du 2026-10-19 : un compte supprimé réservait encore son nom. La requête ne
     filtre plus elle-même — c'est `homonymeBloquant` qui écarte les supprimés, pour que la règle
     ne vive qu'à un seul endroit (le navigateur avait sa propre copie, qui l'avait oubliée). */
  it('ne se laisse pas bloquer par un compte supprimé', async () => {
    profilsDuRole = [{ id: 'profil-mort', nom: 'bensas', prenom: 'dentalis', status: 'suspended' }]
    expect(await trouverProfilHomonyme(clientFactice(), { ...params, role: 'etudiant' })).toBeNull()
  })

  it('ne bloque pas une personne sur sa propre fiche', async () => {
    profilsDuRole = [{ id: 'profil-1', nom: 'bensas', prenom: 'dentalis', status: 'approved' }]
    const trouve = await trouverProfilHomonyme(clientFactice(), { ...params, role: 'etudiant', exclureId: 'profil-1' })
    expect(trouve).toBeNull()
  })
})
