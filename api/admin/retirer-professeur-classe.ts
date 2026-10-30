import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { annulerUneSeance, type SeanceAAnnuler } from '../_lib/annulerSeance.js'
import { formaterDateSeance, notifierAdminsMouvementPlanning, notifierParticipantsSeance } from '../_lib/notifications.js'
import { signalerSynchro } from '../_lib/synchro.js'

export const config = { runtime: 'edge' }

interface Corps {
  assignationId?: string
  motif?: string
}

/**
 * Retire UN co-professeur d'une classe de cours collectif (0142), et annule SES séances à venir
 * pour cette classe — pendant exact de api/admin/retirer-professeur.ts (0138) côté individuel.
 * Même raison d'être en route serveur et pas en fonction SQL : annuler une séance retire la
 * réunion de l'agenda Google et prévient les personnes concernées, hors de portée de Postgres.
 *
 * Le titulaire de la classe (`cohort_classes.teacher_id`) ne se retire jamais par cette route :
 * il se REMPLACE, via « Changer de professeur » (AttribuerProfesseurClasse.tsx), exactement
 * comme avant 0142.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireAdmin(request)
    const body = (await request.json()) as Corps

    if (!body.assignationId) {
      return Response.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }

    const { data: assignation, error: assignationError } = await serviceClient
      .from('cohort_class_teachers')
      .select('id, cohort_class_id, teacher_id, removed_at, etablissement_id')
      .eq('id', body.assignationId)
      .single()

    if (assignationError || !assignation || assignation.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Attribution introuvable.' }, { status: 404 })
    }
    if (assignation.removed_at) {
      return Response.json({ error: 'Ce professeur a déjà été retiré de cette classe.' }, { status: 409 })
    }

    /* Les séances encore à venir de CE co-professeur pour CETTE classe, et rien d'autre : une
       séance passée ne se détricote pas (heures déjà décomptées), une séance du titulaire ou
       d'un autre co-professeur ne le concerne pas. */
    const maintenant = new Date().toISOString()
    const { data: sessionsAVenir } = await serviceClient
      .from('sessions')
      .select('id, teacher_id, statut, etablissement_id, debut, duree_minutes')
      .eq('cohort_class_id', assignation.cohort_class_id)
      .eq('teacher_id', assignation.teacher_id)
      .eq('statut', 'planifiee')
      .gte('debut', maintenant)

    const seances: SeanceAAnnuler[] = (sessionsAVenir ?? []).sort((a, b) => a.debut.localeCompare(b.debut))

    for (const seance of seances) {
      await annulerUneSeance(serviceClient, seance, profileId, etablissementId, true)
    }

    /* Une seule notification pour tout le lot, jamais une par séance — même choix qu'en 0138. */
    if (seances.length > 0) {
      const message =
        seances.length > 1
          ? `${seances.length} séances à venir ont été annulées suite au retrait de ce professeur de la classe, à partir du ${formaterDateSeance(seances[0].debut)}. Elles sont à replanifier.`
          : `La séance du ${formaterDateSeance(seances[0].debut)} a été annulée suite au retrait de ce professeur de la classe. Elle est à replanifier.`

      await notifierParticipantsSeance(serviceClient, {
        etablissementId,
        sessionId: seances[0].id,
        teacherId: assignation.teacher_id,
        acteurId: profileId,
        type: 'seance_annulee',
        titre: seances.length > 1 ? 'Séances annulées' : 'Séance annulée',
        message,
      })

      await notifierAdminsMouvementPlanning(serviceClient, {
        etablissementId,
        acteurId: profileId,
        teacherId: assignation.teacher_id,
        type: 'planning_seance_annulee',
        titre: seances.length > 1 ? 'Séances annulées (professeur retiré)' : 'Séance annulée (professeur retiré)',
        detail: message,
      })
    }

    const motif = body.motif?.trim() || null
    const { error: clotureError } = await serviceClient
      .from('cohort_class_teachers')
      .update({ removed_at: new Date().toISOString(), removed_motif: motif, removed_by_profile_id: profileId })
      .eq('id', assignation.id)
      .is('removed_at', null)

    if (clotureError) {
      return Response.json({ error: 'Le retrait du professeur a échoué.' }, { status: 500 })
    }

    await signalerSynchro(etablissementId)

    return Response.json({ ok: true, seancesAnnulees: seances.length })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
