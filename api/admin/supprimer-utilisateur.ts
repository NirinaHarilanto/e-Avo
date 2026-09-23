import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

/**
 * Supprime un étudiant ou un professeur depuis l'espace admin. Un vrai DELETE sur `profiles`
 * échouerait dès que la personne a le moindre historique : `teacher_assignments`, `sessions`,
 * `hour_ledger`, `invoices`, `documents`, `contracts`, `notifications`... référencent toutes
 * `profiles(id)` sans `on delete cascade` (délibérément, pour ne jamais perdre une trace
 * financière/pédagogique par un delete silencieux — voir supprimer-ligne-financiere.ts).
 *
 * On fait donc une suppression douce : `status = 'suspended'` (valeur du type `statut_profil`
 * jamais utilisée jusqu'ici, migration 0002) retire la personne des listes actives, et le compte
 * Auth est soft-deleted (`deleteUser(id, true)` — e-mail anonymisé côté GoTrue, jetons révoqués,
 * connexion définitivement impossible) SANS supprimer la ligne `auth.users` : `profiles.id` reste
 * une référence valide, tout l'historique lié reste intact et correctement attribué.
 */
/* Les séances déjà planifiées d'un élève supprimé ne disparaissaient nulle part : ni la séance,
   ni son inscription ne sont touchées par le passage en `suspended`. Résultat constaté le
   2026-09-23 : l'agenda du professeur continuait d'afficher des créneaux dont l'élève n'existe
   plus pour l'application. On ne touche qu'à l'AVENIR et qu'au `planifiee` — le passé est de
   l'historique pédagogique et financier, il reste intact. Une séance qui n'a plus aucun inscrit
   après le retrait passe en `annulee` plutôt que d'être supprimée, pour que le professeur garde
   trace de ce qui était prévu. */
async function annulerSeancesAVenir(
  serviceClient: Awaited<ReturnType<typeof requireAdmin>>['serviceClient'],
  studentId: string,
): Promise<void> {
  const maintenant = new Date().toISOString()
  const { data: inscriptions } = await serviceClient
    .from('session_enrollments')
    .select('session_id, sessions!inner(id, debut, statut)')
    .eq('student_id', studentId)
    .gt('sessions.debut', maintenant)
    .eq('sessions.statut', 'planifiee')

  const sessionIds = (inscriptions ?? []).map((i: { session_id: string }) => i.session_id)
  if (sessionIds.length === 0) return

  await serviceClient.from('session_enrollments').delete().eq('student_id', studentId).in('session_id', sessionIds)

  const { data: restantes } = await serviceClient
    .from('session_enrollments')
    .select('session_id')
    .in('session_id', sessionIds)
  const encoreOccupees = new Set((restantes ?? []).map((r: { session_id: string }) => r.session_id))
  const aAnnuler = sessionIds.filter((id) => !encoreOccupees.has(id))
  if (aAnnuler.length > 0) {
    await serviceClient.from('sessions').update({ statut: 'annulee' }).in('id', aAnnuler)
  }
}

/* Un binôme DUO n'a de sens qu'à deux : si l'un des deux membres est supprimé alors que l'autre
   n'a JAMAIS activé son compte (`status = 'pending'`), ce second compte reste orphelin pour
   toujours — sans principal ni secondaire en face, il ne mènera jamais nulle part, mais son
   adresse e-mail reste retenue indéfiniment côté Auth et bloque toute réinscription future avec
   cette même adresse (bug réel constaté le 2026-09-23, voir aussi la garde de secours dans
   api/_lib/creerCompte.ts). On ne touche qu'aux invitations jamais activées : un partenaire déjà
   actif (`approved`/`en_pause`) garde son compte et son dossier intacts, même privé de l'autre
   moitié de son duo — cette suppression-ci reste volontairement silencieuse sur ce cas, laissé à
   une décision explicite de l'admin. */
async function nettoyerPartenaireDuoJamaisActive(
  serviceClient: Awaited<ReturnType<typeof requireAdmin>>['serviceClient'],
  profileId: string,
  duoPartenaireId: string | null,
): Promise<void> {
  // Les deux sens du lien sont possibles : le profil supprimé peut être le secondaire (son
  // propre duo_partenaire_id pointe vers le principal) ou le principal (un secondaire pointe
  // vers lui) — voir migration 0054, lien asymétrique.
  const [{ data: viaPrincipal }, { data: viaSecondaire }] = await Promise.all([
    duoPartenaireId
      ? serviceClient.from('profiles').select('id, status').eq('id', duoPartenaireId).maybeSingle()
      : Promise.resolve({ data: null }),
    serviceClient.from('profiles').select('id, status').eq('duo_partenaire_id', profileId).maybeSingle(),
  ])

  for (const candidat of [viaPrincipal, viaSecondaire]) {
    if (!candidat || candidat.status !== 'pending') continue
    await serviceClient.from('profiles').update({ status: 'suspended', email: null }).eq('id', candidat.id)
    await serviceClient.auth.admin.deleteUser(candidat.id, true)
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId, profileId } = await requireAdmin(request)
    const body = (await request.json()) as { profileId?: string }
    if (!body.profileId) {
      return Response.json({ error: 'Identifiant manquant.' }, { status: 400 })
    }
    if (body.profileId === profileId) {
      return Response.json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' }, { status: 400 })
    }

    const { data: cible, error: erreurCible } = await serviceClient
      .from('profiles')
      .select('id, role, etablissement_id, duo_partenaire_id')
      .eq('id', body.profileId)
      .maybeSingle()

    if (erreurCible || !cible || cible.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Compte introuvable.' }, { status: 404 })
    }
    if (cible.role !== 'etudiant' && cible.role !== 'professeur') {
      return Response.json({ error: 'Seuls les comptes étudiant ou professeur peuvent être supprimés ici.' }, { status: 403 })
    }

    /* `email` remis à null en même temps que le statut — pas seulement l'e-mail Auth (anonymisé
       plus bas par `deleteUser(..., true)`, ce qui libère bien l'adresse pour un nouveau compte
       Auth). `profiles.email` n'a aucune contrainte d'unicité et n'est jamais touché par ce
       soft-delete : sans ce correctif, un ré-enregistrement avec la même adresse (exactement le
       scénario prévu par cette suppression — « supprimer puis se réinscrire ») laissait DEUX
       lignes `profiles` portant le même e-mail. Bug réel rencontré le 2026-09-23 :
       `api/auth/verifier-email.ts` (`.maybeSingle()`) échouait silencieusement dès qu'une
       recherche par e-mail retombait sur ces deux lignes, et l'écran de connexion répondait
       « adresse inconnue » à un compte pourtant bien réel. */
    const { error: erreurStatut } = await serviceClient
      .from('profiles')
      .update({ status: 'suspended', email: null })
      .eq('id', body.profileId)
    if (erreurStatut) {
      return Response.json({ error: erreurStatut.message }, { status: 500 })
    }

    if (cible.role === 'etudiant') {
      await annulerSeancesAVenir(serviceClient, body.profileId)
    }

    await nettoyerPartenaireDuoJamaisActive(serviceClient, body.profileId, cible.duo_partenaire_id)

    const { error: erreurAuth } = await serviceClient.auth.admin.deleteUser(body.profileId, true)
    if (erreurAuth) {
      return Response.json({ error: erreurAuth.message }, { status: 500 })
    }

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
