import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerCompteSansEmail } from '../_lib/creerCompte.js'
import { trouverProfilHomonyme, messageHomonyme } from '../_lib/nomDuplique.js'

export const config = { runtime: 'edge' }

// Conversion Prospect -> Étudiant (pipeline, étape finale). Le prospect n'a pas de compte
// Auth avant cet appel : on en crée un (sans e-mail, voir creerCompte.ts — déclenche quand
// même handle_new_user, qui crée `profiles`), puis on relie le nouveau profil au prospect
// d'origine sans jamais dupliquer ou migrer la ligne `prospects` — diagnostic_calls.prospect_id
// reste la clé stable avant et après conversion.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const body = (await request.json()) as { prospectId?: string }
    if (!body.prospectId) {
      return Response.json({ error: 'prospectId requis.' }, { status: 400 })
    }

    const { data: prospect, error: prospectError } = await serviceClient
      .from('prospects')
      .select('*')
      .eq('id', body.prospectId)
      .eq('etablissement_id', etablissementId)
      .single()

    if (prospectError || !prospect) {
      return Response.json({ error: 'Prospect introuvable pour cet établissement.' }, { status: 404 })
    }

    // Même règle qu'à l'invitation directe : la liste des étudiants ne doit jamais contenir
    // deux fois le même nom, y compris quand l'étudiant arrive par le pipeline prospect.
    const homonyme = await trouverProfilHomonyme(serviceClient, {
      etablissementId,
      role: 'etudiant',
      nom: prospect.nom,
      prenom: prospect.prenom,
    })
    if (homonyme) {
      return Response.json({ error: messageHomonyme('etudiant', homonyme) }, { status: 409 })
    }

    const { data: invited, error: inviteError } = await creerCompteSansEmail(serviceClient, {
      email: prospect.email,
      etablissementId,
      nom: prospect.nom,
      prenom: prospect.prenom,
    })
    if (inviteError || !invited.user) {
      return Response.json({ error: inviteError?.message ?? "Échec de la création du compte." }, { status: 500 })
    }

    // Reprend les informations personnelles déjà connues du prospect — demande client du
    // 2026-09-16, « il faut récupérer toutes les informations du prospect et les mettre dans
    // les informations personnelles de l'étudiant ». `handle_new_user` (migration 0002) ne
    // connaît que nom/prénom/e-mail : le téléphone, seul autre champ personnel que porte
    // `prospects`, doit donc être copié ici après coup plutôt qu'à la création du compte. Les
    // autres informations de prospects (langue visée, objectif) n'ont pas d'équivalent sur
    // profiles — elles restent lisibles via `prospect_id`, déjà exploité par le dossier étudiant
    // pour retrouver le compte rendu de l'appel diagnostic.
    await serviceClient
      .from('profiles')
      .update({ prospect_id: prospect.id, telephone: prospect.telephone })
      .eq('id', invited.user.id)
    await serviceClient.from('prospects').update({ statut: 'etudiant' }).eq('id', prospect.id)

    return Response.json({ profileId: invited.user.id })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
