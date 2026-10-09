/// <reference types="node" />
import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { integrationHoteReunion, modifierEvenementVisio } from '../_lib/google.js'
import { notifierModificationEvenement } from '../_lib/notifications.js'
import type { Database } from '../../src/types/database.types.js'

export const config = { runtime: 'edge' }

interface Corps {
  evenementId?: string
  titre?: string
  debut?: string
  dureeMinutes?: number
  obligatoiresIds?: string[]
  optionnelsIds?: string[]
  notes?: string
}

/**
 * Modification d'un événement « autre » créé par le professeur lui-même (voir
 * creer-evenement.ts) — demande client du 2026-09-29 : « les mêmes mécaniques [...] pour
 * l'espace admin et professeur ». Restreint à son propre événement (`cree_par`), exactement
 * comme annuler-evenement.ts ; l'admin, lui, passe par sa propre route qui peut modifier
 * n'importe quel rendez-vous de l'établissement (api/admin/modifier-evenement.ts).
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId, roles } = await requireTeacherOrAdmin(request)
    if (!roles.includes('professeur')) {
      return Response.json({ error: 'Réservé à un professeur.' }, { status: 403 })
    }
    const corps = (await request.json()) as Corps

    if (!corps.evenementId) {
      return Response.json({ error: 'evenementId est requis.' }, { status: 400 })
    }

    const { data: evenement } = await serviceClient
      .from('evenements_admin')
      .select('id, etablissement_id, cree_par, google_event_id, lien_meet, annule, debut, duree_minutes, titre, notes, participants_obligatoires, participants_optionnels')
      .eq('id', corps.evenementId)
      .maybeSingle()
    if (!evenement || evenement.etablissement_id !== etablissementId || evenement.cree_par !== profileId) {
      return Response.json({ error: 'Événement introuvable.' }, { status: 404 })
    }
    if (evenement.annule) {
      return Response.json({ error: 'Cet événement est annulé.' }, { status: 409 })
    }

    const titre = corps.titre?.trim()
    if (titre !== undefined && !titre) {
      return Response.json({ error: 'Le titre est obligatoire.' }, { status: 400 })
    }
    if (corps.debut !== undefined && Number.isNaN(new Date(corps.debut).getTime())) {
      return Response.json({ error: 'Date et heure invalides.' }, { status: 400 })
    }
    if (corps.dureeMinutes !== undefined && (corps.dureeMinutes < 5 || corps.dureeMinutes > 480)) {
      return Response.json({ error: 'Durée invalide.' }, { status: 400 })
    }

    const obligatoiresIds =
      corps.obligatoiresIds !== undefined ? [...new Set(corps.obligatoiresIds.filter(Boolean))] : undefined
    const optionnelsIds =
      corps.optionnelsIds !== undefined
        ? [...new Set(corps.optionnelsIds.filter(Boolean))].filter((id) => !(obligatoiresIds ?? []).includes(id))
        : undefined
    if (obligatoiresIds !== undefined && optionnelsIds !== undefined && obligatoiresIds.length === 0 && optionnelsIds.length === 0) {
      return Response.json({ error: 'Choisissez au moins un participant.' }, { status: 400 })
    }

    const tousLesIds = [...(obligatoiresIds ?? []), ...(optionnelsIds ?? [])]
    let emailsInvites: string[] | undefined
    if (tousLesIds.length > 0) {
      const { data: participants, error: erreurParticipants } = await serviceClient
        .from('profiles')
        .select('id, email')
        .eq('etablissement_id', etablissementId)
        .in('id', tousLesIds)
      if (erreurParticipants) {
        return Response.json({ error: erreurParticipants.message }, { status: 500 })
      }
      const parId = new Map((participants ?? []).map((p) => [p.id, p]))
      if (tousLesIds.some((id) => !parId.has(id))) {
        return Response.json({ error: 'Un participant est introuvable dans cet établissement.' }, { status: 400 })
      }
      emailsInvites = tousLesIds.map((id) => parId.get(id)?.email).filter((email): email is string => !!email)
    }

    const misAJour: Database['public']['Tables']['evenements_admin']['Update'] = {}
    if (titre !== undefined) misAJour.titre = titre
    if (corps.debut !== undefined) misAJour.debut = new Date(corps.debut).toISOString()
    if (corps.dureeMinutes !== undefined) misAJour.duree_minutes = corps.dureeMinutes
    if (obligatoiresIds !== undefined) misAJour.participants_obligatoires = obligatoiresIds
    if (optionnelsIds !== undefined) misAJour.participants_optionnels = optionnelsIds
    if (corps.notes !== undefined) misAJour.notes = corps.notes.trim() || null

    if (Object.keys(misAJour).length === 0) {
      return Response.json({ error: 'Aucune modification à enregistrer.' }, { status: 400 })
    }

    const { error: erreurMaj } = await serviceClient.from('evenements_admin').update(misAJour).eq('id', evenement.id)
    if (erreurMaj) {
      return Response.json({ error: erreurMaj.message }, { status: 500 })
    }

    if (evenement.google_event_id) {
      /* Compte qui héberge l'événement : son créateur (0107), pas l'établissement. */
      const hote = await integrationHoteReunion(serviceClient, {
        organisateurId: evenement.cree_par,
        etablissementId,
      }).catch(() => null)
      if (hote) {
        const horaireChange = corps.debut !== undefined || corps.dureeMinutes !== undefined
        await modifierEvenementVisio(hote, evenement.google_event_id, {
          titre,
          debut: horaireChange ? (corps.debut !== undefined ? new Date(corps.debut).toISOString() : evenement.debut) : undefined,
          dureeMinutes: horaireChange ? (corps.dureeMinutes ?? evenement.duree_minutes) : undefined,
          description: corps.notes?.trim(),
          emailsInvites: emailsInvites?.filter((email) => email !== hote.googleEmail),
          lienVisio: evenement.lien_meet ?? undefined,
        }).catch(() => {})
      }
    }

    // Prévient retirés / ajoutés / restants (voir notifierModificationEvenement) : les participants
    // ne sont réécrits que si le corps de la requête en fournit une nouvelle liste.
    const anciensIds = [...evenement.participants_obligatoires, ...evenement.participants_optionnels]
    const nouveauxIds =
      obligatoiresIds !== undefined || optionnelsIds !== undefined
        ? [...(obligatoiresIds ?? evenement.participants_obligatoires), ...(optionnelsIds ?? evenement.participants_optionnels)]
        : anciensIds
    const contenuChange =
      (titre !== undefined && titre !== evenement.titre) ||
      (corps.debut !== undefined && new Date(corps.debut).getTime() !== new Date(evenement.debut).getTime()) ||
      (corps.dureeMinutes !== undefined && corps.dureeMinutes !== evenement.duree_minutes) ||
      (corps.notes !== undefined && (corps.notes.trim() || null) !== (evenement.notes ?? null))
    await notifierModificationEvenement(serviceClient, {
      etablissementId,
      acteurId: profileId,
      titre: titre ?? evenement.titre,
      debut: corps.debut !== undefined ? new Date(corps.debut).toISOString() : evenement.debut,
      anciensIds,
      nouveauxIds,
      contenuChange,
    })

    return Response.json({ ok: true })
  } catch (erreur) {
    if (erreur instanceof TeacherAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
