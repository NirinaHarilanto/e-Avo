import { jourDansFuseauEtablissement } from '../../src/lib/etablissement.js'
import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { annulerUneSeance, type SeanceAAnnuler } from '../_lib/annulerSeance.js'
import { formaterDateSeance, notifierAdminsMouvementPlanning, notifierParticipantsSeance } from '../_lib/notifications.js'
import { signalerSynchro } from '../_lib/synchro.js'

export const config = { runtime: 'edge' }

interface Corps {
  affectationId?: string
  motif?: string
}

/**
 * Retire UN professeur d'un étudiant qui en a plusieurs (0138), et annule ses séances à venir.
 *
 * Pourquoi une route serveur et pas une fonction SQL : annuler une séance ne se limite pas à son
 * statut en base, il faut retirer la réunion de l'agenda Google et prévenir les personnes
 * concernées. Les deux exigent le jeton de l'établissement, hors de portée de Postgres comme du
 * navigateur (voir l'en-tête de api/professeur/annuler-seance.ts).
 *
 * Décision client du 2026-10-27 sur le sort des séances futures : « annulées, à replanifier »,
 * et non transférées au professeur restant.
 *
 * L'ordre compte : les séances d'abord, l'affectation ensuite. Si l'annulation casse en cours de
 * route, l'affectation reste active et l'opération est simplement à relancer — l'inverse
 * laisserait un professeur retiré avec des cours encore debout dans son agenda.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireAdmin(request)
    const body = (await request.json()) as Corps

    if (!body.affectationId) {
      return Response.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }

    const { data: affectation, error: affectationError } = await serviceClient
      .from('teacher_assignments')
      .select('id, student_id, teacher_id, date_fin, etablissement_id')
      .eq('id', body.affectationId)
      .single()

    if (affectationError || !affectation || affectation.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Attribution introuvable.' }, { status: 404 })
    }
    if (affectation.date_fin) {
      return Response.json({ error: 'Ce professeur a déjà été retiré de cet étudiant.' }, { status: 409 })
    }

    /* Les séances encore à venir de CE professeur avec CET élève, et rien d'autre : le même
       triplet de conditions que le transfert de `attribuer_professeur` (0055). Une séance passée
       ne se détricote pas, ses heures sont déjà décomptées ; une séance d'un autre professeur ne
       le concerne pas ; une séance collective ne dépend pas de cette table (0074). */
    const maintenant = new Date().toISOString()
    const { data: inscriptions } = await serviceClient
      .from('session_enrollments')
      .select('session_id, sessions!inner(id, teacher_id, statut, etablissement_id, debut, duree_minutes, type)')
      .eq('student_id', affectation.student_id)
      .eq('teacher_assignment_id', affectation.id)
      .eq('sessions.statut', 'planifiee')
      .eq('sessions.type', 'individuel')
      .eq('sessions.teacher_id', affectation.teacher_id)
      .gte('sessions.debut', maintenant)

    const seances: SeanceAAnnuler[] = (inscriptions ?? [])
      .map((i) => i.sessions as unknown as SeanceAAnnuler)
      .filter((s): s is SeanceAAnnuler => Boolean(s))
      .sort((a, b) => a.debut.localeCompare(b.debut))

    for (const seance of seances) {
      await annulerUneSeance(serviceClient, seance, profileId, etablissementId, true)
    }

    /* Une seule notification pour tout le lot, jamais une par séance : retirer un professeur
       d'un élève suivi depuis des mois en annulerait des dizaines, et noyer l'élève sous autant
       de messages lui ferait manquer celui qui compte. Même choix que l'annulation d'une série
       (api/professeur/annuler-seance.ts). La séance de référence est la plus proche. */
    if (seances.length > 0) {
      const message =
        seances.length > 1
          ? `${seances.length} séances à venir ont été annulées suite au retrait de votre professeur, à partir du ${formaterDateSeance(seances[0].debut)}. Elles sont à replanifier.`
          : `La séance du ${formaterDateSeance(seances[0].debut)} a été annulée suite au retrait de votre professeur. Elle est à replanifier.`

      await notifierParticipantsSeance(serviceClient, {
        etablissementId,
        sessionId: seances[0].id,
        teacherId: affectation.teacher_id,
        acteurId: profileId,
        type: 'seance_annulee',
        titre: seances.length > 1 ? 'Séances annulées' : 'Séance annulée',
        message,
      })

      await notifierAdminsMouvementPlanning(serviceClient, {
        etablissementId,
        acteurId: profileId,
        teacherId: affectation.teacher_id,
        type: 'planning_seance_annulee',
        titre: seances.length > 1 ? 'Séances annulées (professeur retiré)' : 'Séance annulée (professeur retiré)',
        detail: message,
        studentIds: [affectation.student_id],
      })
    }

    const motif = body.motif?.trim() || null
    /* `date_fin` est une date (jour), jamais un instant — voir 0039. Le jour est celui
       d'Antananarivo et non le jour UTC du serveur : un retrait fait entre minuit et 3 h du
       matin serait sinon daté de la veille. Divergence assumée avec `current_date` des fonctions
       SQL, qui s'évalue dans le fuseau du serveur Postgres : la colonne n'est jamais lue
       autrement que par `date_fin is null`.
       Le `.is('date_fin', null)` final rend l'écriture idempotente : un double clic ne réécrit
       pas une clôture déjà posée, ni n'efface son motif. */
    const { error: clotureError } = await serviceClient
      .from('teacher_assignments')
      .update({ date_fin: jourDansFuseauEtablissement(), motif_changement: motif })
      .eq('id', affectation.id)
      .is('date_fin', null)

    if (clotureError) {
      return Response.json({ error: "Le retrait du professeur a échoué." }, { status: 500 })
    }

    // Les écrans ouverts (dossier de l'élève, « Mes étudiants » des deux professeurs) se
    // rechargent d'eux-mêmes. Sans séance annulée, aucune notification n'a été émise, donc
    // aucun signal n'est encore parti.
    await signalerSynchro(etablissementId)

    return Response.json({ ok: true, seancesAnnulees: seances.length })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
