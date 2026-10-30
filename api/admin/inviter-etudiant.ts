import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { creerCompteSansEmail } from '../_lib/creerCompte.js'
import { notifierBienvenueEtudiant } from '../_lib/notifications.js'
import { trouverProfilHomonyme, messageHomonyme } from '../_lib/nomDuplique.js'
import { nomGroupeDuo } from '../../src/lib/duo.js'
import type { Database } from '../../src/types/database.types.js'

export const config = { runtime: 'edge' }

type TypeProgramme = Database['public']['Tables']['packages']['Row']['type_programme']
type ServiceClient = Awaited<ReturnType<typeof requireAdmin>>['serviceClient']

interface Personne {
  prenom?: string
  nom?: string
  email?: string
}

interface Corps extends Personne {
  /* Étape 1 de l'assistant (demande client du 2026-10-30) : « définir le type de cours souhaité,
     Individuel, DUO ou collectif ». Absent, la route se comporte exactement comme avant — elle
     sert aussi d'invitation nue, sans programme choisi. */
  typeProgramme?: TypeProgramme
  /* Individuel / DUO : la formule retenue dans la grille tarifaire, d'où découle le forfait. */
  tarifId?: string
  /* DUO : la seconde personne du binôme. Elle obtient son propre compte, mais le dossier
     pédagogique et financier reste celui de la première (0054). */
  partenaire?: Personne
  nomGroupe?: string
  /* Collectif : la vague, et la classe de niveau quand elle est déjà connue. */
  cohortId?: string
  cohortClassId?: string
}

/* Crée le compte d'une personne et pose son profil d'étudiant. Extrait le 2026-10-30 pour servir
   deux fois dans le même appel : le binôme DUO a deux comptes à créer, pas un. */
async function creerEtudiant(
  serviceClient: ServiceClient,
  params: { etablissementId: string; personne: Required<Personne> },
): Promise<{ id: string } | { erreur: string; statut: number }> {
  // Contrôlé avant la création du compte Auth : un refus ne doit laisser aucun utilisateur
  // orphelin derrière lui.
  const homonyme = await trouverProfilHomonyme(serviceClient, {
    etablissementId: params.etablissementId,
    role: 'etudiant',
    nom: params.personne.nom,
    prenom: params.personne.prenom,
  })
  if (homonyme) return { erreur: messageHomonyme('etudiant', homonyme), statut: 409 }

  const { data: invited, error: inviteError } = await creerCompteSansEmail(serviceClient, {
    email: params.personne.email,
    etablissementId: params.etablissementId,
    nom: params.personne.nom,
    prenom: params.personne.prenom,
  })
  if (inviteError || !invited.user) {
    return { erreur: inviteError?.message ?? 'Échec de la création du compte.', statut: 500 }
  }

  const { error: updateError } = await serviceClient
    .from('profiles')
    .update({ role: 'etudiant', status: 'approved' })
    .eq('id', invited.user.id)
  if (updateError) return { erreur: updateError.message, statut: 500 }

  return { id: invited.user.id }
}

/* Invitation d'un étudiant depuis l'espace admin — donne accès à la plateforme sans passer par
 * le pipeline prospect (api/admin/convert-prospect.ts reste le chemin normal pour un prospect
 * déjà suivi). Le rôle est déjà 'etudiant' par défaut via `handle_new_user` (migration 0002) ;
 * il est fixé explicitement par cohérence avec inviter-professeur.ts.
 *
 * Depuis le 2026-10-30, la route ne crée plus seulement un compte : elle monte tout l'espace
 * personnel en un seul geste, selon le type de cours — demande client, « en fonction du type de
 * cours souhaité, il faut récupérer les informations indispensables à la création d'espace
 * personnel pour chaque type de cours. Enregistrer, valider et classer l'étudiant dans la bonne
 * classe pour les cours collectifs ». Ce qui s'ajoute au compte, par type :
 *
 *   INDIVIDUEL — le forfait de la formule retenue (`packages`), repris de la grille tarifaire.
 *   DUO        — un second compte pour le binôme, les deux profils liés l'un à l'autre, et UN
 *                SEUL forfait, porté par la première personne : « même comptage d'heures vu
 *                qu'ils seront associés » (0054/0059). Deux forfaits séparés était précisément
 *                le bug corrigé à l'époque.
 *   COLLECTIF  — l'inscription à la vague et, si elle est déjà connue, à la classe de niveau.
 *                Le forfait de 32 h, lui, naît tout seul : c'est le trigger 0071 qui le pose à
 *                l'insertion dans `cohort_enrollments`, et rien ici ne doit le doubler.
 *
 * Un échec APRÈS la création du compte ne le défait jamais : il est signalé tel quel, à
 * régulariser depuis l'écran concerné — même choix que convert-prospect.ts et decider-essai.ts.
 * Défaire un compte Auth à moitié créé laisse plus de dégâts que la ligne qui manque.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const body = (await request.json()) as Corps
    if (!body.email || !body.nom || !body.prenom) {
      return Response.json({ error: 'Email, nom et prénom requis.' }, { status: 400 })
    }
    if (body.typeProgramme === 'duo' && (!body.partenaire?.email || !body.partenaire?.nom || !body.partenaire?.prenom)) {
      return Response.json({ error: 'Le binôme DUO demande le prénom, le nom et l’e-mail de la seconde personne.' }, { status: 400 })
    }
    if (body.typeProgramme === 'collectif' && !body.cohortId) {
      return Response.json({ error: 'Un étudiant en cours collectif doit être rattaché à une vague.' }, { status: 400 })
    }

    const principal = await creerEtudiant(serviceClient, {
      etablissementId,
      personne: { prenom: body.prenom, nom: body.nom, email: body.email },
    })
    if ('erreur' in principal) return Response.json({ error: principal.erreur }, { status: principal.statut })

    const resume: { profileId: string; partenaireId?: string; forfaitId?: string; inscritEnVague?: boolean; avertissement?: string } = {
      profileId: principal.id,
    }

    /* Le binôme, créé juste après : l'homonyme et l'e-mail déjà pris sont contrôlés pour lui
       aussi. Un refus à ce stade laisse la première personne créée — on le dit plutôt que de
       prétendre que rien n'a eu lieu. */
    if (body.typeProgramme === 'duo' && body.partenaire?.email && body.partenaire.nom && body.partenaire.prenom) {
      const second = await creerEtudiant(serviceClient, {
        etablissementId,
        personne: { prenom: body.partenaire.prenom, nom: body.partenaire.nom, email: body.partenaire.email },
      })
      if ('erreur' in second) {
        return Response.json(
          {
            error: `${body.prenom} ${body.nom} a bien été créé(e), mais pas le binôme : ${second.erreur}. Ajoutez la seconde personne séparément.`,
            profileId: principal.id,
          },
          { status: second.statut },
        )
      }
      resume.partenaireId = second.id

      /* Lien asymétrique (0054) : seul le SECONDAIRE porte `duo_partenaire_id`, qui pointe vers
         le principal — celui qui porte réellement forfait, séances et paiements. Les deux
         partagent le nom du groupe. */
      const nomGroupe = nomGroupeDuo(body.nomGroupe, body.prenom, body.partenaire.prenom)
      await serviceClient
        .from('profiles')
        .update({ duo_partenaire_id: principal.id, duo_nom_groupe: nomGroupe })
        .eq('id', second.id)
      await serviceClient.from('profiles').update({ duo_nom_groupe: nomGroupe }).eq('id', principal.id)
    }

    /* Le forfait de la formule retenue. Un tarif sans volume d'heures fixe (« sur devis ») ne
       décrit pas un forfait exploitable : mieux vaut laisser l'admin le créer à la main que de
       générer un forfait de 0 h — même prudence que convert-prospect.ts.
       Jamais pour le collectif : son forfait de 32 h naît du trigger 0071, plus bas. */
    if (body.tarifId && (body.typeProgramme === 'individuel' || body.typeProgramme === 'duo')) {
      const { data: tarif } = await serviceClient
        .from('tarifs')
        .select('heures, prix')
        .eq('id', body.tarifId)
        .eq('etablissement_id', etablissementId)
        .maybeSingle()
      if (tarif && tarif.heures != null) {
        const { data: forfait, error: erreurForfait } = await serviceClient
          .from('packages')
          .insert({
            etablissement_id: etablissementId,
            // Le forfait d'un binôme vit TOUJOURS sur le principal (0054) : c'est son id que lit
            // le dossier partagé (useDossierEtudiant).
            student_id: principal.id,
            type_programme: body.typeProgramme,
            total_heures: tarif.heures,
            montant: tarif.prix,
          })
          .select('id')
          .maybeSingle()
        if (erreurForfait) {
          resume.avertissement = `Le compte est créé, mais le forfait n'a pas pu l'être : ${erreurForfait.message}. Créez-le depuis la fiche de l'étudiant.`
        } else if (forfait) {
          resume.forfaitId = forfait.id
        }
      } else {
        resume.avertissement =
          "La formule retenue n'a pas de volume d'heures fixe : aucun forfait n'a été créé, à saisir depuis la fiche de l'étudiant."
      }
    }

    /* Inscription à la vague et, quand elle est connue, à la classe — « classer l'étudiant dans
       la bonne classe pour les cours collectifs ». Le trigger de capacité (0074) refuse un 8e
       élève : la vague, elle, reste acquise, et la classe se régularise depuis Cours collectifs.
       L'insertion déclenche aussi la création du forfait collectif de 32 h (trigger 0071). */
    if (body.typeProgramme === 'collectif' && body.cohortId) {
      const { error: erreurVague } = await serviceClient.from('cohort_enrollments').insert({
        etablissement_id: etablissementId,
        cohort_id: body.cohortId,
        cohort_class_id: body.cohortClassId ?? null,
        student_id: principal.id,
      })
      if (erreurVague && body.cohortClassId) {
        // Second essai sans la classe : mieux vaut un élève dans sa vague, à classer, qu'un
        // élève hors de toute promotion parce que sa classe était pleine.
        const { error: erreurSansClasse } = await serviceClient.from('cohort_enrollments').insert({
          etablissement_id: etablissementId,
          cohort_id: body.cohortId,
          cohort_class_id: null,
          student_id: principal.id,
        })
        resume.inscritEnVague = !erreurSansClasse
        resume.avertissement = erreurSansClasse
          ? `Le compte est créé, mais l'inscription à la vague a échoué : ${erreurVague.message}. Inscrivez-le depuis Cours collectifs.`
          : `Le compte est créé et rattaché à la vague, mais pas à la classe choisie : ${erreurVague.message}. Classez-le depuis Cours collectifs.`
      } else if (erreurVague) {
        resume.avertissement = `Le compte est créé, mais l'inscription à la vague a échoué : ${erreurVague.message}. Inscrivez-le depuis Cours collectifs.`
      } else {
        resume.inscritEnVague = true
      }
    }

    await notifierBienvenueEtudiant(serviceClient, { etablissementId, etudiantId: principal.id, prenom: body.prenom })
    if (resume.partenaireId && body.partenaire?.prenom) {
      await notifierBienvenueEtudiant(serviceClient, {
        etablissementId,
        etudiantId: resume.partenaireId,
        prenom: body.partenaire.prenom,
      })
    }

    return Response.json(resume)
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
