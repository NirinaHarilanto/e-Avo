import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'

export const config = { runtime: 'edge' }

interface Corps {
  type?: 'corporate' | 'chat_chill'
  client?: string
  debut?: string
  dureeMinutes?: number
  lieu?: string
  notes?: string
  /* Admin seulement : la prestation est créée pour ce professeur. Omis par un professeur, qui ne
     peut en créer que pour lui-même. */
  teacherId?: string
}

/**
 * Création d'une prestation externe (corporate, chat & chill) — demande client du 2026-10-19 :
 * « dans l'espace professeur, pour chaque séance de cours lors de sa création, il faut rajouter
 * les options Cours corporate et cours chat & chill ».
 *
 * Passe par le serveur parce que `prestations_externes` n'ouvre l'écriture qu'à l'admin (0131) :
 * un professeur qui planifie sa propre prestation depuis son agenda n'a pas de policy pour
 * l'insérer lui-même, exactement comme pour ses séances (0009/0011). Le contrôle de rôle est
 * fait ici, pas en base.
 *
 * Aucune heure n'est créditée à ce stade : c'est la clôture qui écrit dans `hour_ledger` (voir
 * cloturer.ts). Planifier n'est pas enseigner.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId, roles } = await requireTeacherOrAdmin(request)
    const corps = (await request.json()) as Corps

    if (corps.type !== 'corporate' && corps.type !== 'chat_chill') {
      return Response.json({ error: 'Type de prestation invalide.' }, { status: 400 })
    }
    const client = corps.client?.trim()
    if (!client) {
      return Response.json({ error: 'Le client est obligatoire.' }, { status: 400 })
    }
    if (!corps.debut || Number.isNaN(new Date(corps.debut).getTime())) {
      return Response.json({ error: 'La date de début est invalide.' }, { status: 400 })
    }
    const duree = Number(corps.dureeMinutes)
    if (!Number.isFinite(duree) || duree <= 0 || duree > 600) {
      return Response.json({ error: 'La durée doit être comprise entre 1 et 600 minutes.' }, { status: 400 })
    }

    /* Un professeur ne crée que pour lui-même : accepter un `teacherId` de sa part lui
       permettrait de poser des heures facturables sur le compte d'un collègue. */
    const estAdmin = roles.includes('admin_etablissement')
    const teacherId = estAdmin && corps.teacherId ? corps.teacherId : profileId

    if (teacherId !== profileId) {
      const { data: cible } = await serviceClient
        .from('profiles')
        .select('id, role, etablissement_id')
        .eq('id', teacherId)
        .maybeSingle()
      if (!cible || cible.role !== 'professeur' || cible.etablissement_id !== etablissementId) {
        return Response.json({ error: 'Professeur invalide pour cet établissement.' }, { status: 400 })
      }
    } else if (!roles.includes('professeur')) {
      return Response.json({ error: 'Indiquez le professeur concerné.' }, { status: 400 })
    }

    const { data: prestation, error } = await serviceClient
      .from('prestations_externes')
      .insert({
        etablissement_id: etablissementId,
        teacher_id: teacherId,
        type: corps.type,
        client,
        debut: new Date(corps.debut).toISOString(),
        duree_minutes: Math.round(duree),
        lieu: corps.lieu?.trim() || null,
        notes: corps.notes?.trim() || null,
        cree_par: profileId,
      })
      .select('id')
      .single()

    if (error || !prestation) {
      return Response.json({ error: error?.message ?? 'La prestation n’a pas pu être enregistrée.' }, { status: 500 })
    }

    return Response.json({ ok: true, id: prestation.id })
  } catch (erreur) {
    if (erreur instanceof TeacherAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
