import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { deplacerVisio } from '../_lib/synchroniserVisio.js'
import { formaterDateSeance, notifierAdminsMouvementPlanning, notifierParticipantsSeance } from '../_lib/notifications.js'
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

export const config = { runtime: 'edge' }

type ServiceClient = ReturnType<typeof createClient<Database>>
type SeanceAReprogrammer = Pick<Database['public']['Tables']['sessions']['Row'], 'id' | 'debut' | 'duree_minutes'>

interface Corps {
  sessionId?: string
  debut?: string
  dureeMinutes?: number
  justificatif?: string
  /* Portée d'une séance faisant partie d'une série (0123, `serie_id`), même demande client que
     pour l'annulation (annuler-seance.ts). 'serie' décale TOUTES les séances encore planifiées de
     la série du même delta de temps que celui appliqué à la séance cliquée — l'heure de la
     journée change pour chacune, la date de chacune reste la sienne, exactement le comportement
     de Google Agenda sur « toute la série ». */
  portee?: 'occurrence' | 'serie'
}

/* Reprogramme UNE séance en base (horaire + historique + visio), sans notifier personne — comme
   pour annuler-seance.ts, une seule notification consolidée est envoyée pour toute une série
   plutôt qu'une par séance. */
async function reprogrammerUneSeance(
  serviceClient: ServiceClient,
  session: SeanceAReprogrammer,
  nouveauDebut: string,
  nouvelleDuree: number,
  profileId: string,
  etablissementId: string,
  justificatif: string,
  estAdmin: boolean,
): Promise<void> {
  await serviceClient.from('sessions').update({ debut: nouveauDebut, duree_minutes: nouvelleDuree }).eq('id', session.id)
  await serviceClient.from('session_modifications').insert({
    session_id: session.id,
    etablissement_id: etablissementId,
    modifie_par: profileId,
    // Capturé ici, jamais recalculé à la lecture : un admin plateforme reste invisible via RLS
    // à un autre admin une fois son établissement différent de celui de la séance (0132).
    modifie_par_est_admin: estAdmin,
    type_modification: 'reprogrammee',
    ancien_debut: session.debut,
    nouveau_debut: nouveauDebut,
    ancienne_duree_minutes: session.duree_minutes,
    nouvelle_duree_minutes: nouvelleDuree,
    justificatif,
  })
  await deplacerVisio(serviceClient, { sessionId: session.id, etablissementId, debut: nouveauDebut, dureeMinutes: nouvelleDuree })
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
    if (body.portee === 'serie' && !session.serie_id) {
      return Response.json({ error: "Cette séance ne fait pas partie d'une série." }, { status: 400 })
    }

    /* « Toute la série » (0123) : même delta de temps appliqué à toutes les séances ENCORE
       PLANIFIÉES de la série — chacune garde sa propre date, seule l'heure du jour se décale du
       même écart que celui demandé sur la séance cliquée. Jamais les séances déjà terminées ou
       annulées, même garde-fou que pour l'annulation (annuler-seance.ts). */
    const deltaMs = new Date(nouveauDebut).getTime() - new Date(session.debut).getTime()

    const seancesAReprogrammer: SeanceAReprogrammer[] =
      body.portee === 'serie' && session.serie_id
        ? (
            await serviceClient
              .from('sessions')
              .select('id, debut, duree_minutes')
              .eq('serie_id', session.serie_id)
              .eq('statut', 'planifiee')
          ).data ?? [session]
        : [session]

    for (const s of seancesAReprogrammer) {
      const debutDeS = s.id === session.id ? nouveauDebut : new Date(new Date(s.debut).getTime() + deltaMs).toISOString()
      await reprogrammerUneSeance(serviceClient, s, debutDeS, nouvelleDuree, profileId, etablissementId, justificatif, estAdmin)
    }

    const estSerie = seancesAReprogrammer.length > 1
    await notifierParticipantsSeance(serviceClient, {
      etablissementId,
      sessionId: session.id,
      teacherId: session.teacher_id,
      acteurId: profileId,
      type: 'seance_reprogrammee',
      titre: estSerie ? 'Série de séances reprogrammée' : 'Séance reprogrammée',
      message: estSerie
        ? `${seancesAReprogrammer.length} séances de la série ont été décalées. Nouvelle heure de celle-ci : ${formaterDateSeance(nouveauDebut)}.`
        : `Nouvelle heure : ${formaterDateSeance(nouveauDebut)}.`,
    })

    const { data: inscrits } = await serviceClient.from('session_enrollments').select('student_id').eq('session_id', session.id)
    await notifierAdminsMouvementPlanning(serviceClient, {
      etablissementId,
      acteurId: profileId,
      teacherId: session.teacher_id,
      type: 'planning_seance_reprogrammee',
      titre: estSerie ? 'Série de séances reprogrammée' : 'Séance reprogrammée',
      detail: estSerie
        ? `${seancesAReprogrammer.length} séances de la série décalées du même écart, à partir du ${formaterDateSeance(session.debut)}. Motif : ${justificatif}.`
        : `Séance du ${formaterDateSeance(session.debut)} déplacée au ${formaterDateSeance(nouveauDebut)} (${nouvelleDuree} min). Motif : ${justificatif}.`,
      studentIds: (inscrits ?? []).map((i) => i.student_id),
    })

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
