import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { detailCreneaux } from '../_lib/reservation.js'

export const config = { runtime: 'edge' }

/**
 * Ce que le public voit vraiment, rendu à l'administration — demande client du 2026-10-31 :
 * « je ne vois pas les créneaux de jeudis et vendredis qui sont paramétrés pour être disponibles
 * dans l'espace admin [...] synchroniser réglage créneau diag call dans l'espace admin avec ce
 * que tu affiches au public ».
 *
 * L'écran Paramètres montrait les PLAGES d'ouverture, la page vitrine montre les CRÉNEAUX qui en
 * restent — et entre les deux il y a le délai minimum, les rendez-vous déjà pris, les cours
 * planifiés et l'agenda Google de l'établissement. Une plage entièrement mangée par une réunion
 * récurrente disparaissait donc sans un mot, et l'admin ne pouvait que conclure que son réglage
 * n'était pas pris en compte.
 *
 * Cette route ne calcule RIEN de son côté : elle appelle exactement la fonction qui sert la page
 * publique (`detailCreneaux`, dont `creneauxLibres` n'est qu'un filtre), et se contente de
 * regrouper le résultat par plage. C'est la seule façon d'être sûr que l'aperçu dise la vérité.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    /* Seul appelant à demander l'agenda Google : il ne bloque plus aucun créneau (2026-10-31),
       mais l'administration doit pouvoir repérer ceux qui le recouvrent avant de valider une
       demande. */
    const { detail, dureeMinutes, fuseau, horizonJours, plages, agendaGoogleLu } = await detailCreneaux(
      serviceClient,
      etablissementId,
      { avecAgendaGoogle: true },
    )

    /* Regroupement par jour de la semaine et non par ligne de plage : deux plages du même jour
       peuvent se recouvrir (« 09:00–12:00 » et « 10:00–13:00 » existent toutes deux dans les
       réglages), et un créneau dédoublonné n'appartient plus à l'une plutôt qu'à l'autre. Le
       jour, lui, est ce que l'admin lit dans sa liste. */
    const parJour = new Map<number, { libres: number; chevauchentGoogle: number; occupesBase: number; horsDelai: number }>()
    for (const creneau of detail) {
      const jour = new Date(creneau.debut).toLocaleDateString('en-US', { timeZone: fuseau, weekday: 'short' })
      const index = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(jour)
      const compteur = parJour.get(index) ?? { libres: 0, chevauchentGoogle: 0, occupesBase: 0, horsDelai: 0 }
      if (creneau.etat === 'libre') {
        compteur.libres += 1
        /* Compte les créneaux PROPOSÉS qui recouvrent l'agenda, et non plus ceux qui en étaient
           exclus : depuis le 2026-10-31 l'agenda n'écarte plus rien, il se signale. */
        if (creneau.chevauchements?.includes('google')) compteur.chevauchentGoogle += 1
      } else if (creneau.etat === 'delai') compteur.horsDelai += 1
      else compteur.occupesBase += 1
      parJour.set(index, compteur)
    }

    return Response.json({
      dureeMinutes,
      fuseau,
      horizonJours,
      agendaGoogleLu,
      nbPlagesActives: plages.length,
      /* Les instants libres eux-mêmes : l'admin doit pouvoir reconnaître la liste qu'il a sous
         les yeux sur la page publique, pas seulement un décompte. */
      creneauxLibres: detail.filter((c) => c.etat === 'libre').map((c) => c.debut),
      jours: [...parJour.entries()]
        .map(([jourSemaine, compteurs]) => ({ jourSemaine, ...compteurs }))
        .sort((a, b) => a.jourSemaine - b.jourSemaine),
    })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
