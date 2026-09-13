/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

/**
 * Insère une notification interne. `notifications` n'a aucune policy insert cliente (0028) :
 * toujours créée par du code serveur, pour rester adossée à un événement métier réel.
 */
export async function creerNotification(
  serviceClient: ServiceClient,
  params: {
    etablissementId: string
    destinataireProfileId: string
    type: string
    titre: string
    message?: string | null
    lien?: string | null
  },
) {
  await serviceClient.from('notifications').insert({
    etablissement_id: params.etablissementId,
    destinataire_profile_id: params.destinataireProfileId,
    type: params.type,
    titre: params.titre,
    message: params.message ?? null,
    lien: params.lien ?? null,
  })
}
