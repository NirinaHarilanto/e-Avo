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

/**
 * Notifie les personnes CONCERNÉES par une séance (son professeur et les élèves qui y sont
 * inscrits) quand elle est reprogrammée ou annulée — jamais l'admin, sauf s'il fait partie de
 * ces personnes (demande client du 2026-09-17 : la validation admin disparaît, remplacée par une
 * notification directe aux seuls intéressés). L'auteur de la modification n'est jamais notifié
 * de sa propre action. Le lien pointe vers le calendrier de chacun, différent selon son rôle.
 */
export async function notifierParticipantsSeance(
  serviceClient: ServiceClient,
  params: {
    etablissementId: string
    sessionId: string
    teacherId: string
    acteurId: string
    type: string
    titre: string
    message?: string | null
  },
) {
  const { data: enrollments } = await serviceClient.from('session_enrollments').select('student_id').eq('session_id', params.sessionId)
  const destinataireIds = new Set<string>([params.teacherId, ...(enrollments ?? []).map((e) => e.student_id)])
  destinataireIds.delete(params.acteurId)
  if (destinataireIds.size === 0) return

  const { data: profils } = await serviceClient.from('profiles').select('id, role').in('id', [...destinataireIds])
  const roleParId = new Map((profils ?? []).map((p) => [p.id, p.role]))

  await Promise.all(
    [...destinataireIds].map((destinataireProfileId) =>
      creerNotification(serviceClient, {
        etablissementId: params.etablissementId,
        destinataireProfileId,
        type: params.type,
        titre: params.titre,
        message: params.message ?? null,
        lien: roleParId.get(destinataireProfileId) === 'professeur' ? '/professeur/calendrier' : '/mon-espace/agenda',
      }),
    ),
  )
}

const FUSEAU_ETABLISSEMENT = 'Indian/Antananarivo'

/* Le serveur tourne en UTC : sans fuseau explicite, une heure de séance s'afficherait avec trois
   heures d'écart dans les notifications. */
export function formaterDateSeance(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: FUSEAU_ETABLISSEMENT })
}

/**
 * Prévient l'administration de tout mouvement du planning d'un professeur — séance créée,
 * reprogrammée ou annulée (demande client du 2026-09-29). Vont aux admins de l'établissement,
 * administrateurs plateforme compris, jamais à l'auteur du mouvement lui-même.
 */
export async function notifierAdminsMouvementPlanning(
  serviceClient: ServiceClient,
  params: {
    etablissementId: string
    acteurId: string
    teacherId: string
    type: 'planning_seance_creee' | 'planning_seance_reprogrammee' | 'planning_seance_annulee'
    titre: string
    detail: string
    studentIds?: string[]
  },
) {
  const [{ data: admins }, { data: plateforme }] = await Promise.all([
    serviceClient
      .from('profiles')
      .select('id')
      .eq('etablissement_id', params.etablissementId)
      .eq('role', 'admin_etablissement')
      .eq('status', 'approved'),
    serviceClient.from('platform_admins').select('id'),
  ])
  const idsPlateforme = (plateforme ?? []).map((p) => p.id)
  const { data: plateformeDeLEtablissement } = idsPlateforme.length
    ? await serviceClient.from('profiles').select('id').in('id', idsPlateforme).eq('etablissement_id', params.etablissementId)
    : { data: [] as { id: string }[] }

  const destinataires = new Set([...(admins ?? []), ...(plateformeDeLEtablissement ?? [])].map((p) => p.id))
  destinataires.delete(params.acteurId)
  if (destinataires.size === 0) return

  const personnes = [params.teacherId, ...(params.studentIds ?? [])]
  const { data: profils } = await serviceClient.from('profiles').select('id, prenom, nom').in('id', personnes)
  const nom = (id: string) => {
    const p = (profils ?? []).find((x) => x.id === id)
    return p ? [p.prenom, p.nom].filter(Boolean).join(' ') : null
  }
  const professeur = nom(params.teacherId) ?? 'Un professeur'
  const eleves = (params.studentIds ?? []).map(nom).filter(Boolean).join(', ')

  await Promise.all(
    [...destinataires].map((destinataireProfileId) =>
      creerNotification(serviceClient, {
        etablissementId: params.etablissementId,
        destinataireProfileId,
        type: params.type,
        titre: `${params.titre} · ${professeur}`,
        message: `${params.detail}${eleves ? ` Élève(s) : ${eleves}.` : ''}`,
        lien: '/admin/seances',
      }),
    ),
  )
}
