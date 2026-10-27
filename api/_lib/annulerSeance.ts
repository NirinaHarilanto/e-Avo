import { annulerVisio } from './synchroniserVisio.js'
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

export type SeanceAAnnuler = Pick<
  Database['public']['Tables']['sessions']['Row'],
  'id' | 'teacher_id' | 'statut' | 'etablissement_id' | 'debut' | 'duree_minutes'
>

/**
 * Annule UNE séance en base (statut + trace + visio), sans notifier personne — la notification
 * est l'affaire de l'appelant, qui décide d'en envoyer une par séance ou une seule consolidée
 * pour tout un lot (série annulée, professeur retiré d'un élève).
 *
 * Extraite de api/professeur/annuler-seance.ts, où elle était privée, quand le retrait d'un
 * professeur (0138) a eu besoin d'annuler les séances à venir de ce professeur : réécrire ces
 * trois écritures ailleurs aurait tôt ou tard laissé la réunion Google vivante dans l'agenda de
 * tout le monde, sans que rien ne le signale à l'écran.
 */
export async function annulerUneSeance(
  serviceClient: ServiceClient,
  session: SeanceAAnnuler,
  profileId: string,
  etablissementId: string,
  estAdmin: boolean,
): Promise<void> {
  await serviceClient.from('sessions').update({ statut: 'annulee' }).eq('id', session.id)
  await serviceClient.from('session_modifications').insert({
    session_id: session.id,
    etablissement_id: etablissementId,
    modifie_par: profileId,
    // Capturé ici, jamais recalculé à la lecture — même raisonnement que modifier-seance.ts
    // (voir 0132).
    modifie_par_est_admin: estAdmin,
    type_modification: 'annulee',
    ancien_debut: session.debut,
    ancienne_duree_minutes: session.duree_minutes,
  })
  await annulerVisio(serviceClient, { sessionId: session.id, etablissementId })
}
