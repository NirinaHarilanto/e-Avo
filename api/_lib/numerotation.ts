/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

/* Numéro suivant d'une série annuelle PREFIXE-<année>-<rang> (FAC pour les factures, TS pour
   les TimeSheets). Le rang se déduit des numéros déjà émis cette année plutôt que d'un compteur
   séparé : une séquence resterait désynchronisée des documents créés par trigger. Calculé côté
   serveur pour que deux admins simultanés n'obtiennent pas le même numéro depuis leur
   navigateur (contrainte unique (etablissement_id, numero) en dernier recours). */
export async function numeroSuivant(
  serviceClient: ServiceClient,
  table: 'invoices' | 'timesheets',
  prefixe: 'FAC' | 'TS',
  etablissementId: string,
): Promise<string> {
  const debut = `${prefixe}-${new Date().getFullYear()}-`
  const { data } =
    table === 'invoices'
      ? await serviceClient.from('invoices').select('numero').eq('etablissement_id', etablissementId).like('numero', `${debut}%`)
      : await serviceClient.from('timesheets').select('numero').eq('etablissement_id', etablissementId).like('numero', `${debut}%`)

  const dernier = (data ?? []).reduce((max, ligne) => {
    const rang = Number(ligne.numero.slice(debut.length))
    return Number.isFinite(rang) && rang > max ? rang : max
  }, 0)
  return `${debut}${String(dernier + 1).padStart(4, '0')}`
}
