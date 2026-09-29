import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type EvenementAdmin = Database['public']['Tables']['evenements_admin']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export type ParticipantEvenement = Pick<Profile, 'id' | 'nom' | 'prenom' | 'role'>

export interface EvenementAdminAvecParticipants extends EvenementAdmin {
  obligatoires: ParticipantEvenement[]
  optionnels: ParticipantEvenement[]
  /* L'admin qui a créé le rendez-vous n'est jamais lui-même dans obligatoires/optionnels (le
     vivier de FormulaireCreerEvenement ne propose que des élèves/professeurs, jamais un autre
     admin, voir RendezVousAdmin.tsx) — pourtant demande client du 2026-09-29 : « il faut
     mentionner Admin HOC dans la liste des participants » quand c'est l'admin qui invite. Dérivé
     de `cree_par` plutôt qu'ajouté en base : approximatif pour un administrateur PLATEFORME
     (platform_admins, 0022), dont la policy RLS ne permet pas à un élève/professeur de lire le
     statut — seul `profiles.role === 'admin_etablissement'` est donc détecté ici (le cas courant :
     l'admin de l'établissement, pas l'admin plateforme). Voir agendaEvenements.ts pour l'affichage. */
  creeParAdmin: boolean
}

/* Requête partagée par useEvenementsAdmin et useEvenementsProfesseur : c'est le RLS qui filtre
   quelles lignes reviennent selon l'appelant (admin : tout l'établissement — policy
   "evenements_admin_admin_all" ; professeur : ses propres événements créés ou où il est
   participant — policy "evenements_admin_teacher_select", 0073), la requête elle-même est
   identique des deux côtés. */
async function chargerEvenements(): Promise<EvenementAdminAvecParticipants[]> {
  const { data: evenements, error } = await supabase.from('evenements_admin').select('*').order('debut', { ascending: true })
  if (error) throw new Error(error.message)

  // cree_par (voir le commentaire de creeParAdmin) résolu dans le même aller-retour que les
  // participants — pas de statut filtré dessus : un admin qui a quitté reste l'organisateur
  // historique du rendez-vous, contrairement à un participant supprimé (voir plus bas).
  const idsCreateurs = new Set((evenements ?? []).map((e) => e.cree_par).filter((id): id is string => !!id))
  const tousLesIds = [...new Set([...(evenements ?? []).flatMap((e) => [...e.participants_obligatoires, ...e.participants_optionnels]), ...idsCreateurs])]
  // Un participant supprimé disparaît du rendez-vous (demande client du 2026-09-23) —
  // passé compris : la ligne reste en base, réversible si la personne se réinscrit. `status`
  // sert uniquement à ce filtre ci-dessous, jamais renvoyé (ParticipantEvenement ne le porte pas).
  const { data: profils } = tousLesIds.length
    ? await supabase.from('profiles').select('id, nom, prenom, role, status').in('id', tousLesIds)
    : { data: [] as (ParticipantEvenement & { status: string })[] }
  const profilParId = new Map((profils ?? []).map((p) => [p.id, p]))

  return (evenements ?? [])
    .map((e): EvenementAdminAvecParticipants => ({
      ...e,
      obligatoires: e.participants_obligatoires
        .map((id) => profilParId.get(id))
        .filter((p): p is ParticipantEvenement & { status: string } => !!p && p.status !== 'suspended'),
      optionnels: e.participants_optionnels
        .map((id) => profilParId.get(id))
        .filter((p): p is ParticipantEvenement & { status: string } => !!p && p.status !== 'suspended'),
      creeParAdmin: profilParId.get(e.cree_par ?? '')?.role === 'admin_etablissement',
    }))
    // Un rendez-vous qui n'a plus personne (tous les participants supprimés) n'a plus rien à
    // montrer — il disparaît de l'agenda plutôt que d'apparaître vide.
    .filter((e) => e.obligatoires.length + e.optionnels.length > 0)
}

/** Rendez-vous créés directement par l'admin (voir api/admin/creer-evenement.ts), avec leurs
    participants résolus en profils affichables — `participants_obligatoires`/`participants_optionnels`
    ne portent que des identifiants, jamais lus par une jointure PostgREST classique puisque ce
    sont de simples tableaux, pas des clés étrangères. Le rôle de chacun (déjà inclus dans le
    profil résolu) sert ensuite à déterminer la couleur de la pastille dans l'agenda — voir
    RendezVousAdmin.tsx. */
export function useEvenementsAdmin() {
  // Sondage périodique en filet de sécurité (couche 3 de la stratégie temps réel du 2026-09-29) :
  // un événement créé/annulé par un autre admin ne déclenche pas encore de notification, voir
  // le commentaire d'en-tête de useCacheRequete.ts.
  const { valeur, loading, erreur, recharger } = useCacheRequete('evenements-admin', chargerEvenements, { intervalleSondageMs: 25_000 })
  return { evenements: valeur ?? [], loading, erreur, recharger }
}

/** Même chose côté professeur (demande client du 2026-09-23) : ses rendez-vous « autre », créés
    depuis son propre agenda (voir api/professeur/creer-evenement.ts) ou dont il est participant. */
export function useEvenementsProfesseur() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('evenements-professeur', chargerEvenements, { intervalleSondageMs: 25_000 })
  return { evenements: valeur ?? [], loading, erreur, recharger }
}
