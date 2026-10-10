import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Vérification d'unicité du numéro de devis/facture AVANT d'enregistrer — demande client du
   2026-10-10 : « bloquer la validation [...] si le numéro [...] existe déjà ». Ces tests fixent
   le comportement de la fonction partagée par les quatre points de saisie (CreerFacture,
   CreerDevis, et l'édition en ligne des deux dans FacturationAdmin). */

const appels = vi.hoisted(() => ({
  derniereTable: '' as string,
  filtres: [] as [string, string][],
  resultat: null as { id: string } | null,
}))

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      appels.derniereTable = table
      appels.filtres = []
      const chaine = {
        eq: (colonne: string, valeur: string) => {
          appels.filtres.push([colonne, valeur])
          return chaine
        },
        neq: (colonne: string, valeur: string) => {
          appels.filtres.push([`neq:${colonne}`, valeur])
          return chaine
        },
        select: () => chaine,
        maybeSingle: async () => ({ data: appels.resultat }),
      }
      return chaine
    },
  },
}))

const { numeroDejaUtilise, messageNumeroDejaUtilise } = await import('../facturation')

beforeEach(() => {
  appels.resultat = null
})

describe('numeroDejaUtilise', () => {
  it('renvoie false quand aucune ligne ne porte ce numéro', async () => {
    appels.resultat = null
    expect(await numeroDejaUtilise('invoices', 'etab-1', 'FAC-2026-0001')).toBe(false)
  })

  it('renvoie true quand une ligne porte déjà ce numéro', async () => {
    appels.resultat = { id: 'autre-ligne' }
    expect(await numeroDejaUtilise('invoices', 'etab-1', 'FAC-2026-0001')).toBe(true)
  })

  it('filtre sur la bonne table, le bon établissement et le numéro nettoyé', async () => {
    await numeroDejaUtilise('quotes', 'etab-1', '  DEV-2026-0007  ')
    expect(appels.derniereTable).toBe('quotes')
    expect(appels.filtres).toEqual([
      ['etablissement_id', 'etab-1'],
      ['numero', 'DEV-2026-0007'],
    ])
  })

  it('exclut la ligne en cours de modification (sinon un renommage se détecterait lui-même)', async () => {
    appels.resultat = null
    await numeroDejaUtilise('invoices', 'etab-1', 'FAC-2026-0001', 'ma-propre-ligne')
    expect(appels.filtres).toContainEqual(['neq:id', 'ma-propre-ligne'])
  })

  it('ne requête même pas pour un numéro vide', async () => {
    appels.derniereTable = ''
    expect(await numeroDejaUtilise('invoices', 'etab-1', '   ')).toBe(false)
    expect(appels.derniereTable).toBe('')
  })
})

describe('messageNumeroDejaUtilise', () => {
  it('nomme le numéro en cause dans le message', () => {
    expect(messageNumeroDejaUtilise('FAC-2026-0001')).toContain('FAC-2026-0001')
  })
})
