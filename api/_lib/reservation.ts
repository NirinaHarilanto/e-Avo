/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { detaillerCreneaux, type CreneauDetaille, type Occupation } from '../../src/lib/creneaux.js'
import { integrationDeLEtablissement, occupationsAgenda } from './google.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

/**
 * Créneaux d'appel encore libres pour un établissement.
 *
 * Partagé entre l'affichage (api/prospects/creneaux) et la réservation elle-même
 * (api/prospects/reserver) volontairement : si la vérification faite à l'enregistrement était
 * écrite séparément de celle qui produit la liste, les deux finiraient par diverger et un
 * visiteur se verrait refuser un créneau que la page venait de lui proposer.
 */
export async function creneauxLibres(
  serviceClient: ServiceClient,
  etablissementId: string,
): Promise<{ creneaux: string[]; dureeMinutes: number; fuseau: string }> {
  const { detail, dureeMinutes, fuseau } = await detailCreneaux(serviceClient, etablissementId)
  return { creneaux: detail.filter((c) => c.etat === 'libre').map((c) => c.debut), dureeMinutes, fuseau }
}

/**
 * Le même calcul, mais sans jeter ce qui a été écarté : chaque créneau théorique de la grille y
 * garde la raison pour laquelle il n'est pas proposé.
 *
 * Sert l'aperçu de l'écran Paramètres (api/admin/apercu-creneaux.ts) — demande client du
 * 2026-10-31 : « synchroniser réglage créneau diag call dans l'espace admin avec ce que tu
 * affiches au public ». Une plage ouverte qui ne produit aucun créneau ne se distinguait pas
 * d'une plage oubliée, et c'est exactement ce qui est arrivé au jeudi et au vendredi.
 */
export async function detailCreneaux(
  serviceClient: ServiceClient,
  etablissementId: string,
): Promise<{
  detail: CreneauDetaille[]
  dureeMinutes: number
  fuseau: string
  horizonJours: number
  plages: { jour_semaine: number; heure_debut: string; heure_fin: string }[]
  /* Faux quand la lecture de l'agenda Google a échoué : l'aperçu ne doit pas affirmer qu'un
     créneau est libre alors qu'on n'a pas pu vérifier l'agenda réel. */
  agendaGoogleLu: boolean
}> {
  const [{ data: parametres }, { data: plages }] = await Promise.all([
    serviceClient.from('reservation_parametres').select('*').eq('etablissement_id', etablissementId).maybeSingle(),
    serviceClient
      .from('creneaux_disponibilites')
      .select('jour_semaine, heure_debut, heure_fin, actif')
      .eq('etablissement_id', etablissementId)
      .eq('actif', true),
  ])

  const dureeMinutes = parametres?.duree_minutes ?? 15
  const fuseau = parametres?.fuseau ?? 'Indian/Antananarivo'
  const horizonJours = parametres?.horizon_jours ?? 21
  if (!parametres || !plages || plages.length === 0) {
    return { detail: [], dureeMinutes, fuseau, horizonJours, plages: plages ?? [], agendaGoogleLu: true }
  }

  const maintenant = new Date()
  const finHorizon = new Date(maintenant.getTime() + (parametres.horizon_jours + 1) * 86_400_000)

  const [{ data: rendezVous }, { data: seances }] = await Promise.all([
    serviceClient
      .from('rendez_vous')
      .select('debut, duree_minutes')
      .eq('etablissement_id', etablissementId)
      .in('statut', ['en_attente', 'confirme'])
      .gte('debut', maintenant.toISOString())
      .lte('debut', finHorizon.toISOString()),
    /* Les cours déjà planifiés occupent aussi l'établissement : sans eux, un appel pourrait
       tomber en plein cours tant que le compte Google n'est pas connecté. */
    serviceClient
      .from('sessions')
      .select('debut, duree_minutes')
      .eq('etablissement_id', etablissementId)
      .neq('statut', 'annulee')
      .gte('debut', maintenant.toISOString())
      .lte('debut', finHorizon.toISOString()),
  ])

  const occupations: Occupation[] = [...(rendezVous ?? []), ...(seances ?? [])].map((o) => ({
    debut: o.debut,
    fin: new Date(new Date(o.debut).getTime() + o.duree_minutes * 60_000).toISOString(),
    source: 'base',
  }))

  /* L'agenda Google réel de l'établissement est ce qui rend la liste vraiment à jour : un
     empêchement noté directement dans Google retire aussitôt le créneau. Une panne Google ne doit
     pour autant jamais bloquer la réservation — on continue alors avec les seules occupations
     connues en base, quitte à ce que l'admin refuse le rendez-vous. */
  let agendaGoogleLu = true
  try {
    const integration = await integrationDeLEtablissement(serviceClient, etablissementId)
    if (integration) {
      const evenements = await occupationsAgenda(integration, maintenant, finHorizon)
      occupations.push(...evenements.map((e) => ({ ...e, source: 'google' as const })))
    }
  } catch {
    // Silencieux volontairement : l'incident est déjà tracé par les autres appels Google.
    agendaGoogleLu = false
  }

  const detail = detaillerCreneaux(
    plages,
    occupations,
    {
      dureeMinutes,
      delaiMinimumHeures: parametres.delai_minimum_heures,
      horizonJours: parametres.horizon_jours,
      pauseMinutes: parametres.pause_minutes,
      fuseau,
    },
    maintenant,
  )

  return { detail, dureeMinutes, fuseau, horizonJours, plages, agendaGoogleLu }
}

/** Profils à prévenir dans l'application quand une demande arrive ou change d'état. */
export async function adminsDeLEtablissement(
  serviceClient: ServiceClient,
  etablissementId: string,
): Promise<string[]> {
  const { data } = await serviceClient
    .from('profiles')
    .select('id')
    .eq('etablissement_id', etablissementId)
    .eq('role', 'admin_etablissement')
    .eq('status', 'approved')
  return (data ?? []).map((p) => p.id)
}
