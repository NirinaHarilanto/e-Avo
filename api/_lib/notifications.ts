/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { signalerSynchro } from './synchro.js'

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
  // Tout événement métier notifié prévient aussi les espaces ouverts (agendas, listes...).
  await signalerSynchro(params.etablissementId)
}

/**
 * Message de bienvenue d'un nouvel étudiant — demande client du 2026-09-29 : « le message de
 * bienvenue du nouvel étudiant sous forme de pop-up avec la notification associée dans son espace
 * personnel ». La notification (type `bienvenue_etudiant`) est créée ici, côté serveur, comme
 * toutes les autres ; c'est BienvenueEtudiant.tsx qui l'affiche en pop-up à la première connexion,
 * puis la marque lue — elle reste ensuite consultable dans la cloche.
 */
export async function notifierBienvenueEtudiant(
  serviceClient: ServiceClient,
  params: { etablissementId: string; etudiantId: string; prenom: string },
) {
  await creerNotification(serviceClient, {
    etablissementId: params.etablissementId,
    destinataireProfileId: params.etudiantId,
    type: 'bienvenue_etudiant',
    titre: `Bienvenue chez Hari Online Club, ${params.prenom} !`,
    message:
      'Votre espace étudiant est prêt. Vous y retrouvez votre professeur, votre programme, vos séances et votre compteur d’heures, mis à jour après chaque cours. Vos prochains cours et rendez-vous apparaissent dans « Mon agenda ».',
    lien: '/mon-espace',
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

/**
 * Prévient les personnes concernées par la modification d'un événement « autre » (demande client du
 * 2026-09-29) :
 *  - RETIRÉES : notification d'annulation — l'événement disparaît de leur agenda, puisqu'elles ne
 *    figurent plus dans ses participants (voir useEvenementsAdmin.ts) ;
 *  - AJOUTÉES : nouvelle invitation ;
 *  - déjà PRÉSENTES : mise à jour des informations, seulement si quelque chose a réellement changé.
 * L'auteur de la modification n'est jamais notifié de sa propre action. Google Calendar envoie de
 * son côté ses propres e-mails aux invités (`sendUpdates=all`, voir modifierEvenementVisio) ; ces
 * notifications sont le pendant interne, celui qui compte pour qui n'a pas d'adresse ou de Google.
 */
export async function notifierModificationEvenement(
  serviceClient: ServiceClient,
  params: {
    etablissementId: string
    acteurId: string
    titre: string
    debut: string
    anciensIds: string[]
    nouveauxIds: string[]
    contenuChange: boolean
  },
) {
  const anciens = new Set(params.anciensIds)
  const nouveaux = new Set(params.nouveauxIds)
  const retires = params.anciensIds.filter((id) => !nouveaux.has(id))
  const ajoutes = params.nouveauxIds.filter((id) => !anciens.has(id))
  const restants = params.nouveauxIds.filter((id) => anciens.has(id))
  const concernes = [...new Set([...retires, ...ajoutes, ...(params.contenuChange ? restants : [])])].filter((id) => id !== params.acteurId)
  if (concernes.length === 0) return

  const { data: profils } = await serviceClient.from('profiles').select('id, role').in('id', concernes)
  const roleParId = new Map((profils ?? []).map((p) => [p.id, p.role]))
  const quand = formaterDateSeance(params.debut)
  const lienDe = (id: string) => (roleParId.get(id) === 'professeur' ? '/professeur/calendrier' : '/mon-espace/agenda')

  const notifications = [
    ...retires.map((id) => ({ id, type: 'evenement_annule', titre: 'Rendez-vous annulé', message: `Vous ne participez plus à « ${params.titre} » du ${quand}.` })),
    ...ajoutes.map((id) => ({ id, type: 'evenement_invitation', titre: 'Nouvelle invitation', message: `Vous êtes invité(e) à « ${params.titre} » le ${quand}.` })),
    ...(params.contenuChange
      ? restants.map((id) => ({ id, type: 'evenement_modifie', titre: 'Rendez-vous modifié', message: `« ${params.titre} » : nouvelles informations, rendez-vous le ${quand}.` }))
      : []),
  ].filter((n) => n.id !== params.acteurId)

  await Promise.all(
    notifications.map((n) =>
      creerNotification(serviceClient, {
        etablissementId: params.etablissementId,
        destinataireProfileId: n.id,
        type: n.type,
        titre: n.titre,
        message: n.message,
        lien: n.type === 'evenement_annule' ? lienDe(n.id) : lienDe(n.id),
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
