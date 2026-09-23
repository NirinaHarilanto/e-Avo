import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerCompteSansEmail } from '../_lib/creerCompte.js'
import { trouverProfilHomonyme, messageHomonyme } from '../_lib/nomDuplique.js'
import { nomGroupeDuo } from '../../src/lib/duo.js'
import { categorieDepuisNiveauEstime, CAPACITE_MAX_CLASSE } from '../../src/lib/classesCollectif.js'

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

    // DUO (0054) — demande client du 2026-09-21 : les deux personnes du binôme partagent le
    // même espace étudiant. Si le partenaire a DÉJÀ été converti (son profil existe), celui
    // qu'on convertit maintenant devient le « secondaire » : il obtient son propre compte/login,
    // mais son dossier pédagogique et financier reste celui du partenaire (voir les policies
    // RLS étendues dans la migration). Si le partenaire n'est pas encore converti, rien à lier
    // pour l'instant — ce sera fait en sens inverse quand lui-même sera converti à son tour.
    // Recherché AVANT la création du forfait ci-dessous (pas après, comme au départ) : c'est ce
    // qui permet de savoir déjà si CE prospect devient secondaire, et donc de ne PAS lui créer
    // son propre forfait — sans ce test, un binôme se retrouvait avec deux forfaits de 10 h
    // séparés au lieu d'un seul pool d'heures partagé (0059, demande client du 2026-09-22 :
    // « même comptage d'heure vu qu'ils seront associés »).
    let profilPrincipal: { id: string; prenom: string | null; duo_nom_groupe: string | null } | null = null
    // Repli du prénom du principal pour `nomGroupeDuo` ci-dessous, au cas défensif où
    // `profiles.prenom` serait vide — celui du PARTENAIRE (prospect d'origine), jamais celui de
    // `prospect` (le secondaire qu'on est en train de convertir), sans quoi le nom du groupe se
    // retrouverait dupliqué (« Bensas/Bensas » au lieu de « Sandra/Bensas »).
    let prenomPartenaireReplie: string | null = null
    if (prospect.duo_partenaire_id) {
      const { data: prospectPartenaire } = await serviceClient
        .from('prospects')
        .select('id, prenom')
        .eq('id', prospect.duo_partenaire_id)
        .maybeSingle()
      if (prospectPartenaire) {
        prenomPartenaireReplie = prospectPartenaire.prenom
        const { data } = await serviceClient
          .from('profiles')
          .select('id, prenom, duo_nom_groupe')
          .eq('prospect_id', prospectPartenaire.id)
          .maybeSingle()
        profilPrincipal = data
      }
    }

    // Forfait choisi par le prospect (0054) — demande client du 2026-09-21 : repris
    // automatiquement en `packages` à la conversion, pour ne pas ressaisir ce qui a déjà été
    // décidé à l'appel diagnostic. Le collectif n'a pas de forfait (l'élève est identifié par
    // sa vague via cohort_enrollments, voir 0027) : le tarif choisi y reste informatif.
    let forfaitId: string | null = null

    /* Le forfait d'un binôme vit TOUJOURS sur le principal (0054) : c'est son id que lit le
       dossier étudiant partagé (voir useDossierEtudiant). Quand ce prospect-ci devient
       secondaire, un éventuel forfait à créer doit donc l'être au nom du principal, pas au sien. */
    const beneficiaireForfait = profilPrincipal?.id ?? invited.user.id

    if (profilPrincipal) {
      // Secondaire : le forfait du binôme est déjà celui du principal, converti avant lui —
      // reprend son id tel quel pour que le paiement de CE prospect (s'il y en a un — chacun
      // paie sa part du forfait partagé) s'y rattache, plutôt que d'en ouvrir un second.
      const { data: forfaitPrincipal } = await serviceClient
        .from('packages')
        .select('id')
        .eq('student_id', profilPrincipal.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      forfaitId = forfaitPrincipal?.id ?? null
    }

    /* Création du forfait si le binôme n'en a encore aucun. Le cas « secondaire sans forfait
       principal » n'est pas théorique : le membre converti en premier peut très bien être celui
       qui ne portait ni tarif ni rendez-vous (l'autre ayant été refusé au même moment, par
       exemple par la garde d'homonyme). Sans ce repli, le tarif choisi à l'appel diagnostic était
       purement et simplement perdu, et le binôme se retrouvait sans forfait du tout. */
    if (!forfaitId && prospect.tarif_choisi_id && (prospect.type_programme === 'individuel' || prospect.type_programme === 'duo')) {
      /* Heure d'essai (0057) : on ne crée PAS le forfait complet. L'élève démarre sur un forfait
         d'une heure, au tarif horaire de son programme, qui mémorise le forfait visé. Le
         complément ne naîtra qu'à la décision (api/admin/decider-essai.ts) — de cette façon la
         facture émise pour l'essai reste juste quoi qu'il arrive ensuite. */
      const { data: tarif } = prospect.essai_demande
        ? await serviceClient
            .from('tarifs')
            .select('heures, prix')
            .eq('etablissement_id', etablissementId)
            .eq('type_programme', prospect.type_programme)
            .eq('heures', 1)
            .maybeSingle()
        : await serviceClient
            .from('tarifs')
            .select('heures, prix')
            .eq('id', prospect.tarif_choisi_id)
            .maybeSingle()
      // Un tarif sans volume d'heures fixe (heures = null, ex. « sur devis ») ne décrit pas un
      // forfait exploitable tel quel — mieux vaut laisser l'admin le créer à la main plutôt que
      // de générer un forfait de 0 h.
      if (tarif && tarif.heures != null) {
        const { data: forfaitCree } = await serviceClient
          .from('packages')
          .insert({
            etablissement_id: etablissementId,
            student_id: beneficiaireForfait,
            type_programme: prospect.type_programme,
            total_heures: tarif.heures,
            montant: tarif.prix,
            ...(prospect.essai_demande ? { essai: true, tarif_vise_id: prospect.tarif_choisi_id } : {}),
          })
          .select('id')
          .maybeSingle()
        if (forfaitCree) forfaitId = forfaitCree.id
      }
    }

    // Paiement du forfait encaissé AVANT la conversion (0056) : la ligne existe déjà, rattachée
    // au prospect. On la reprend telle quelle plutôt que d'en créer une seconde — acomptes déjà
    // versés, reste dû et facture éventuelle restent donc attachés au même mouvement financier,
    // qui devient simplement celui de l'étudiant. Poser `student_id` déclenche au passage le
    // reçu automatique si le forfait était déjà soldé (voir le trigger revu en 0056).
    await serviceClient
      .from('student_payments')
      .update({ student_id: invited.user.id, ...(forfaitId ? { package_id: forfaitId } : {}) })
      .eq('prospect_id', prospect.id)
      .is('student_id', null)

    if (profilPrincipal) {
      const nomGroupe = nomGroupeDuo(prospect.duo_nom_groupe, profilPrincipal.prenom ?? prenomPartenaireReplie ?? '', prospect.prenom)
      await serviceClient
        .from('profiles')
        .update({ duo_partenaire_id: profilPrincipal.id, duo_nom_groupe: nomGroupe })
        .eq('id', invited.user.id)
      await serviceClient.from('profiles').update({ duo_nom_groupe: nomGroupe }).eq('id', profilPrincipal.id)
    }

    // Rattachement automatique à la vague du parcours collectif — demande client du 2026-09-21 :
    // un candidat converti depuis une session de test oral doit retrouver sa vague sans que
    // l'admin ait à la ré-assigner à la main. Dérivé de l'inscription la plus récente plutôt que
    // d'un paramètre transmis par l'appelant : couvre indifféremment la conversion depuis la
    // page Prospects et depuis la nouvelle page Cours collectifs, sans dupliquer cette logique.
    let niveauDetecte: string | null = null
    let classeAssignee: string | null = null
    const { data: inscription } = await serviceClient
      .from('test_positionnement_inscriptions')
      .select('creneau_id, niveau_estime')
      .eq('prospect_id', prospect.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (inscription) {
      const { data: creneau } = await serviceClient
        .from('creneaux_test_positionnement')
        .select('cohort_id')
        .eq('id', inscription.creneau_id)
        .maybeSingle()
      if (creneau) {
        // Classe de niveau (0074) : dérivée automatiquement du niveau CECRL du quiz écrit, sans
        // ressaisie — demande client du 2026-09-23. On ne bloque jamais la conversion faute de
        // classe disponible : l'étudiant rejoint quand même la promotion, à régulariser ensuite
        // depuis la page Cours collectifs (le trigger de capacité, migration 0074, empêche de
        // toute façon de dépasser 7 élèves par classe).
        const categorie = categorieDepuisNiveauEstime(inscription.niveau_estime)
        niveauDetecte = categorie
        let cohortClassId: string | null = null
        if (categorie) {
          const { data: classes } = await serviceClient
            .from('cohort_classes')
            .select('id')
            .eq('cohort_id', creneau.cohort_id)
            .eq('niveau', categorie)
          const classeIds = (classes ?? []).map((c: { id: string }) => c.id)
          if (classeIds.length > 0) {
            const { data: inscrits } = await serviceClient
              .from('cohort_enrollments')
              .select('cohort_class_id')
              .in('cohort_class_id', classeIds)
            const effectifs = new Map<string, number>(classeIds.map((id: string) => [id, 0]))
            for (const i of inscrits ?? []) {
              if (i.cohort_class_id) effectifs.set(i.cohort_class_id, (effectifs.get(i.cohort_class_id) ?? 0) + 1)
            }
            const disponible = classeIds
              .filter((id: string) => (effectifs.get(id) ?? 0) < CAPACITE_MAX_CLASSE)
              .sort((a: string, b: string) => (effectifs.get(a) ?? 0) - (effectifs.get(b) ?? 0))[0]
            cohortClassId = disponible ?? null
          }
        }
        classeAssignee = cohortClassId
        await serviceClient
          .from('cohort_enrollments')
          .upsert(
            {
              etablissement_id: etablissementId,
              cohort_id: creneau.cohort_id,
              cohort_class_id: cohortClassId,
              student_id: invited.user.id,
            },
            { onConflict: 'cohort_id,student_id' },
          )
      }
    }

    return Response.json({ profileId: invited.user.id, niveauDetecte, classeAssignee })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
