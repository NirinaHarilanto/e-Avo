import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'

export const config = { runtime: 'edge' }

/**
 * Déconnexion du Google Calendar personnel (0098) : la ligne est supprimée, donc le jeton avec
 * elle. Ne touche à rien côté Google — la personne garde l'accès à ses propres événements ailleurs,
 * seule la liaison avec HOC disparaît (ses réunions à venir déjà créées restent dans son agenda,
 * mais les suivantes repartiront du compte de l'établissement).
 *
 * Soumise à la même autorisation que le changement d'adresse pour un PROFESSEUR depuis le
 * 2026-10-10 (0112) : sans ce contrôle, le verrou serait décoratif — il suffirait de se déconnecter
 * puis de se reconnecter avec une autre adresse pour contourner la validation de l'administration.
 * L'admin, qui est l'autorité de validation, n'est pas concerné.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, roles } = await requireTeacherOrAdmin(request)

    if (!roles.includes('admin_etablissement')) {
      const { data: autorisation } = await serviceClient
        .from('demandes_agenda_google')
        .select('id')
        .eq('profile_id', profileId)
        .eq('statut', 'approuvee')
        .maybeSingle()

      if (!autorisation) {
        return Response.json(
          {
            error:
              'Le retrait de votre compte Google doit être validé par l’administration : faites-en la demande depuis « Mon profil ». Pour simplement réparer une synchronisation, reconnectez la même adresse — c’est libre.',
            changementARequerir: true,
          },
          { status: 409 },
        )
      }
    }

    const { error } = await serviceClient.from('google_integrations_personnelles').delete().eq('profile_id', profileId)
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
