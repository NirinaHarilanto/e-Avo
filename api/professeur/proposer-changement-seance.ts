import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { deplacerVisio } from '../_lib/synchroniserVisio.js'

export const config = { runtime: 'edge' }

interface Corps {
  sessionId?: string
  debut?: string
  dureeMinutes?: number
  justificatif?: string
}

// Modifie l'heure/la durée d'une séance encore planifiée. Un professeur ne peut agir que sur
// ses propres séances et sa demande reste en attente jusqu'à validation par un admin
// (api/admin/valider-changement-seance.ts) ; un admin, déjà validateur, voit son changement
// appliqué immédiatement. Dans les deux cas, un justificatif est obligatoire dès que l'heure de
// début ou la durée change réellement — sinon la demande est refusée avant toute écriture.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId, roles } = await requireTeacherOrAdmin(request)
    const body = (await request.json()) as Corps

    if (!body.sessionId) {
      return Response.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }

    const { data: session, error: sessionError } = await serviceClient
      .from('sessions')
      .select('*')
      .eq('id', body.sessionId)
      .single()

    if (sessionError || !session || session.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Séance introuvable.' }, { status: 404 })
    }

    const estAdmin = roles.includes('admin_etablissement')
    if (!estAdmin && session.teacher_id !== profileId) {
      return Response.json({ error: "Cette séance n'est pas la vôtre." }, { status: 403 })
    }
    if (session.statut !== 'planifiee') {
      return Response.json({ error: 'Seule une séance encore planifiée peut être reprogrammée.' }, { status: 409 })
    }
    if (session.changement_statut === 'en_attente' && !estAdmin) {
      return Response.json({ error: 'Une demande est déjà en attente de validation pour cette séance.' }, { status: 409 })
    }

    const nouveauDebut = body.debut ? new Date(body.debut).toISOString() : session.debut
    const nouvelleDuree = body.dureeMinutes ?? session.duree_minutes
    if (Number.isNaN(new Date(nouveauDebut).getTime()) || nouvelleDuree <= 0) {
      return Response.json({ error: 'Date ou durée invalide.' }, { status: 400 })
    }

    // Comparaison par instant : PostgREST rend `session.debut` avec un suffixe "+00:00" alors
    // que `nouveauDebut` (recalculé via `new Date(...).toISOString()`) porte toujours "Z" —
    // une comparaison de chaînes détecterait systématiquement un changement, même quand la
    // date envoyée décrit exactement le même instant.
    const heureChangee = new Date(nouveauDebut).getTime() !== new Date(session.debut).getTime() || nouvelleDuree !== session.duree_minutes
    if (!heureChangee) {
      return Response.json({ error: 'Aucune modification à enregistrer.' }, { status: 400 })
    }
    const justificatif = body.justificatif?.trim()
    if (!justificatif) {
      return Response.json({ error: "Un justificatif est obligatoire pour modifier l'heure ou la durée d'une séance." }, { status: 400 })
    }

    // L'admin est déjà le validateur : sa propre modification s'applique tout de suite plutôt
    // que d'attendre qu'il se valide lui-même. Le professeur, lui, propose seulement — les
    // colonnes réelles (debut/duree_minutes) ne bougent qu'à la validation admin.
    const { error: updateError } = await serviceClient
      .from('sessions')
      .update(
        estAdmin
          ? {
              debut: nouveauDebut,
              duree_minutes: nouvelleDuree,
              debut_propose: null,
              duree_minutes_propose: null,
              justificatif_changement: justificatif,
              changement_demande_par: profileId,
              changement_demande_le: new Date().toISOString(),
              changement_statut: 'aucun',
            }
          : {
              debut_propose: nouveauDebut,
              duree_minutes_propose: nouvelleDuree,
              justificatif_changement: justificatif,
              changement_demande_par: profileId,
              changement_demande_le: new Date().toISOString(),
              changement_statut: 'en_attente',
            },
      )
      .eq('id', session.id)

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 })
    }

    // Seul le changement d'un admin s'applique tout de suite : l'événement Google ne bouge donc
    // qu'ici. Une proposition de professeur attendra sa validation
    // (api/admin/valider-changement-seance.ts), qui fait le même appel.
    if (estAdmin) {
      await deplacerVisio(serviceClient, {
        sessionId: session.id,
        etablissementId,
        debut: nouveauDebut,
        dureeMinutes: nouvelleDuree,
      })
    }

    return Response.json({ ok: true, statut: estAdmin ? 'applique' : 'en_attente' })
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
