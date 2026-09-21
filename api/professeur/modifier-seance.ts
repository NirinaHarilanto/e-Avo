import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { deplacerVisio } from '../_lib/synchroniserVisio.js'
import { notifierParticipantsSeance } from '../_lib/notifications.js'

export const config = { runtime: 'edge' }

interface Corps {
  sessionId?: string
  debut?: string
  dureeMinutes?: number
  justificatif?: string
}

// Modifie l'heure/la durée d'une séance encore planifiée — appliqué IMMÉDIATEMENT, professeur
// comme admin. Remplace proposer-changement-seance.ts + admin/valider-changement-seance.ts
// (supprimés) : la validation admin intermédiaire n'apportait rien puisque ni l'élève ni le
// professeur n'étaient prévenus entre-temps (demande client du 2026-09-17). Un justificatif
// reste obligatoire dès que l'heure ou la durée change réellement — il nourrit désormais
// l'historique tracé dans session_modifications plutôt qu'une décision d'admin à motiver.
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

    const { error: updateError } = await serviceClient
      .from('sessions')
      .update({ debut: nouveauDebut, duree_minutes: nouvelleDuree })
      .eq('id', session.id)
    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 })
    }

    await serviceClient.from('session_modifications').insert({
      session_id: session.id,
      etablissement_id: etablissementId,
      modifie_par: profileId,
      type_modification: 'reprogrammee',
      ancien_debut: session.debut,
      nouveau_debut: nouveauDebut,
      ancienne_duree_minutes: session.duree_minutes,
      nouvelle_duree_minutes: nouvelleDuree,
      justificatif,
    })

    await deplacerVisio(serviceClient, {
      sessionId: session.id,
      etablissementId,
      debut: nouveauDebut,
      dureeMinutes: nouvelleDuree,
    })

    await notifierParticipantsSeance(serviceClient, {
      etablissementId,
      sessionId: session.id,
      teacherId: session.teacher_id,
      acteurId: profileId,
      type: 'seance_reprogrammee',
      titre: 'Séance reprogrammée',
      message: `Nouvelle heure : ${new Date(nouveauDebut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}.`,
    })

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
