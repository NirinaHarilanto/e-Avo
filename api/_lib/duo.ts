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

/**
 * Replie chaque binôme DUO sur le seul porteur du forfait.
 *
 * Un binôme partage UN forfait, celui du principal (0054) : les deux membres suivent la même
 * heure de cours, mais elle ne se décompte qu'une fois. Depuis que les deux sont inscrits à la
 * séance (2026-10-11), toute liste tirée des inscriptions contient les deux — il faut donc
 * ramener le secondaire sur son principal avant d'écrire dans `hour_ledger`, sans quoi l'heure
 * serait débitée deux fois, dont une sur un profil qui n'a aucun forfait.
 *
 * Un secondaire dont le principal n'est PAS dans la liste reste tel quel : mieux vaut un débit
 * sur lui qu'un débit perdu.
 */
export async function replierBinomesDuo(serviceClient: ServiceClient, studentIds: string[]): Promise<string[]> {
  if (studentIds.length < 2) return studentIds
  const { data } = await serviceClient.from('profiles').select('id, duo_partenaire_id').in('id', studentIds)
  const presents = new Set(studentIds)
  const porteur = new Map((data ?? []).map((p) => [p.id, p.duo_partenaire_id]))
  return [
    ...new Set(
      studentIds.map((id) => {
        const principal = porteur.get(id)
        return principal && presents.has(principal) ? principal : id
      }),
    ),
  ]
}

/**
 * Ces élèves sont-ils EXACTEMENT un binôme DUO — deux personnes, liées l'une à l'autre ?
 *
 * Sert à distinguer un duo d'un vrai cours collectif, que `sessions.type` ne sait pas différencier
 * (il ne connaît qu'individuel/collectif, 0008). Deux élèves d'une même vague qui se retrouvent
 * seuls à une séance ne forment PAS un duo : seul le lien `duo_partenaire_id` fait foi.
 */
export async function estBinomeDuo(serviceClient: ServiceClient, studentIds: string[]): Promise<boolean> {
  if (studentIds.length !== 2) return false
  const { data } = await serviceClient.from('profiles').select('id, duo_partenaire_id').in('id', studentIds)
  if (!data || data.length !== 2) return false
  const [a, b] = data
  return a.duo_partenaire_id === b.id || b.duo_partenaire_id === a.id
}
