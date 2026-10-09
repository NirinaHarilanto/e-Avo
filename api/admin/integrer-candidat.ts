import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerCompteSansEmail } from '../_lib/creerCompte.js'
import { trouverProfilHomonyme, messageHomonyme } from '../_lib/nomDuplique.js'
import { creerNotification } from '../_lib/notifications.js'
import { resultatSimulation, TOTAL_SIMULATION_MAX, TOTAL_SIMULATION_REQUIS } from '../../src/lib/recrutement.js'

export const config = { runtime: 'edge' }

/**
 * Passage d'un candidat formateur en phase d'intégration (0082) — demande client : « quand le
 * candidat valide les étapes, il passe en phase d'intégration, apparaît dans la liste des
 * professeurs avec ce statut, et son espace professeur est créé automatiquement à partir de
 * ses informations personnelles ». Même création de compte qu'une invitation de professeur
 * (inviter-professeur.ts), le rôle ne pouvant être posé que par la clé service_role.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const { candidatureId } = (await request.json()) as { candidatureId?: string }
    if (!candidatureId) {
      return Response.json({ error: 'Candidature manquante.' }, { status: 400 })
    }

    const { data: candidat } = await serviceClient
      .from('candidatures_formateurs')
      .select('*')
      .eq('id', candidatureId)
      .eq('etablissement_id', etablissementId)
      .maybeSingle()
    if (!candidat) {
      return Response.json({ error: 'Candidature introuvable.' }, { status: 404 })
    }
    if (candidat.statut !== 'simulation') {
      return Response.json({ error: 'Seul un candidat ayant passé la simulation de cours peut entrer en intégration.' }, { status: 409 })
    }
    /* `simulation.avis` appartenait à l'ancienne grille maison (avis saisi à la main) : la
       grille officielle du 2026-10-01 (`resultatSimulation`, 14/20 minimum sans critère noté 1)
       l'a remplacée côté écran, mais ce contrôle serveur n'avait jamais été mis à jour en même
       temps — `avis` n'est plus écrit par aucun formulaire, donc ce test échouait pour TOUT
       candidat, quel que soit son résultat réel à la grille. Trouvé le 2026-10-10 : l'écran
       affichait « candidat validé » (vert) pendant que ce point bloquait son passage en
       intégration avec un message qui ne correspondait à aucun champ existant.
       Le serveur recalcule désormais la MÊME règle que l'écran, depuis les mêmes données — jamais
       la valeur `valide` du client, qui pourrait être falsifiée dans la requête. */
    if (!resultatSimulation(candidat.simulation ?? {}).valide) {
      return Response.json(
        { error: `La grille de simulation ne valide pas ce candidat (${TOTAL_SIMULATION_REQUIS}/${TOTAL_SIMULATION_MAX} minimum, aucun critère noté 1).` },
        { status: 400 },
      )
    }
    if (candidat.professeur_id) {
      return Response.json({ error: 'L’espace professeur de ce candidat existe déjà.' }, { status: 409 })
    }

    const homonyme = await trouverProfilHomonyme(serviceClient, {
      etablissementId,
      role: 'professeur',
      nom: candidat.nom,
      prenom: candidat.prenom,
    })
    if (homonyme) {
      return Response.json({ error: messageHomonyme('professeur', homonyme) }, { status: 409 })
    }

    const { data: compte, error: erreurCompte } = await creerCompteSansEmail(serviceClient, {
      email: candidat.email,
      etablissementId,
      nom: candidat.nom,
      prenom: candidat.prenom,
    })
    if (erreurCompte || !compte.user) {
      return Response.json({ error: erreurCompte?.message ?? 'Échec de la création du compte.' }, { status: 500 })
    }

    const tauxSouhaite = Number(candidat.preselection?.taux_horaire)
    const { error: erreurProfil } = await serviceClient
      .from('profiles')
      .update({
        role: 'professeur',
        status: 'approved',
        statut_integration: 'en_integration',
        telephone: candidat.telephone,
        ville: candidat.ville,
        ...(Number.isFinite(tauxSouhaite) && tauxSouhaite > 0 ? { taux_horaire: tauxSouhaite } : {}),
      })
      .eq('id', compte.user.id)
    if (erreurProfil) {
      return Response.json({ error: erreurProfil.message }, { status: 500 })
    }

    await serviceClient
      .from('candidatures_formateurs')
      .update({ statut: 'integration', professeur_id: compte.user.id })
      .eq('id', candidat.id)

    await creerNotification(serviceClient, {
      etablissementId,
      destinataireProfileId: compte.user.id,
      type: 'bienvenue_formateur',
      titre: 'Bienvenue chez Hari Online Club',
      message: 'Votre espace professeur est prêt. Première étape de votre intégration : lire et signer votre contrat dans « Mes contrats ».',
      lien: '/professeur/contrats',
    })

    return Response.json({ ok: true, professeurId: compte.user.id })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
