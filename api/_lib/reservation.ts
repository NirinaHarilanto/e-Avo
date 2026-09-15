/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { calculerCreneauxLibres } from '../../src/lib/creneaux.js'
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
  if (!parametres || !plages || plages.length === 0) {
    return { creneaux: [], dureeMinutes, fuseau }
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

  const occupations = [...(rendezVous ?? []), ...(seances ?? [])].map((o) => ({
    debut: o.debut,
    fin: new Date(new Date(o.debut).getTime() + o.duree_minutes * 60_000).toISOString(),
  }))

  /* L'agenda Google réel de l'établissement est ce qui rend la liste vraiment à jour : un
     empêchement noté directement dans Google retire aussitôt le créneau. Une panne Google ne doit
     pour autant jamais bloquer la réservation — on continue alors avec les seules occupations
     connues en base, quitte à ce que l'admin refuse le rendez-vous. */
  try {
    const integration = await integrationDeLEtablissement(serviceClient, etablissementId)
    if (integration) {
      occupations.push(...(await occupationsAgenda(integration, maintenant, finHorizon)))
    }
  } catch {
    // Silencieux volontairement : l'incident est déjà tracé par les autres appels Google.
  }

  const creneaux = calculerCreneauxLibres(
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

  return { creneaux, dureeMinutes, fuseau }
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
