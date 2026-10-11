/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

/**
 * Les deux membres d'un binôme DUO, à partir d'une liste d'élèves.
 *
 * Un binôme DUO (0054) partage un seul dossier : séances, forfait et `session_enrollments` vivent
 * tous sur le PRINCIPAL, et le SECONDAIRE n'est inscrit à aucune séance. Toute liste construite à
 * partir des inscriptions ne contient donc qu'une des deux personnes — c'est ce qui faisait
 * qu'une seule des deux était invitée à la réunion Google de son propre cours (signalé par le
 * client le 2026-10-11).
 *
 * Miroir serveur de `useSecondairesDuo` (côté client) : les DEUX sens du lien sont couverts, car
 * rien ne garantit lequel des deux membres figure dans la liste d'entrée — le lien est
 * asymétrique (seul le secondaire porte `duo_partenaire_id`), mais une séance peut très bien
 * avoir été créée en partant du secondaire.
 *
 * Renvoie `studentIds` augmentée des partenaires trouvés, sans doublon et sans compte suspendu
 * (un compte supprimé ne doit plus recevoir d'invitation).
 */
export async function avecPartenairesDuo(serviceClient: ServiceClient, studentIds: string[]): Promise<string[]> {
  if (studentIds.length === 0) return []

  const [{ data: secondaires }, { data: moi }] = await Promise.all([
    // Sens 1 : les secondaires qui pointent vers l'un des élèves fournis (cas courant — la séance
    // porte le principal, c'est le secondaire qui manque).
    serviceClient.from('profiles').select('id').in('duo_partenaire_id', studentIds).neq('status', 'suspended'),
    // Sens 2 : si l'un des élèves fournis est lui-même un secondaire, son principal est le membre
    // manquant.
    serviceClient.from('profiles').select('id, duo_partenaire_id').in('id', studentIds),
  ])

  const principauxAAjouter = (moi ?? [])
    .map((p) => p.duo_partenaire_id)
    .filter((id): id is string => !!id && !studentIds.includes(id))

  const { data: principaux } = principauxAAjouter.length
    ? await serviceClient.from('profiles').select('id').in('id', principauxAAjouter).neq('status', 'suspended')
    : { data: [] as { id: string }[] }

  return [...new Set([...studentIds, ...(secondaires ?? []).map((p) => p.id), ...(principaux ?? []).map((p) => p.id)])]
}
