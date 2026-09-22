/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { memeNom, nomComplet } from '../../src/lib/nomDuplique.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

const LIBELLE_ROLE: Record<string, string> = {
  etudiant: 'étudiant',
  professeur: 'professeur',
}

/**
 * Empêche deux personnes du même nom d'apparaître dans la liste des étudiants ou des
 * professeurs d'un établissement. La comparaison se fait en JS (voir src/lib/nomDuplique.ts)
 * plutôt qu'en SQL : elle doit ignorer accents, casse et tirets, ce que `=` ne fait pas et ce
 * que `unaccent` ne garantit pas (extension non activée sur ce projet).
 *
 * Renvoie le profil en conflit, ou `null` si le nom est libre. À appeler AVANT toute création
 * de compte Auth, pour ne pas laisser d'utilisateur orphelin derrière un refus.
 *
 * Les comptes supprimés (`status = 'suspended'`, suppression douce — voir
 * api/admin/supprimer-utilisateur.ts) sont ignorés : ils ne figurent plus dans aucune liste
 * (`useEtudiants`/`useProfesseurs`) ni à la connexion, donc leur nom ne peut plus créer la
 * confusion que cette garde existe pour éviter. Sans ce filtre, supprimer un élève réservait son
 * nom à vie — c'est ce qui bloquait la conversion d'un prospect homonyme d'un compte supprimé,
 * et faisait éclater un binôme DUO dont un seul membre passait (2026-09-22).
 */
export async function trouverProfilHomonyme(
  serviceClient: ServiceClient,
  params: {
    etablissementId: string
    role: 'etudiant' | 'professeur'
    nom: string
    prenom: string
    exclureId?: string
  },
) {
  const { data: profils } = await serviceClient
    .from('profiles')
    .select('id, nom, prenom')
    .eq('etablissement_id', params.etablissementId)
    .eq('role', params.role)
    .neq('status', 'suspended')

  return (
    (profils ?? []).find(
      (p) => p.id !== params.exclureId && memeNom(p, { nom: params.nom, prenom: params.prenom }),
    ) ?? null
  )
}

export function messageHomonyme(role: 'etudiant' | 'professeur', personne: { nom?: string | null; prenom?: string | null }) {
  return `Un ${LIBELLE_ROLE[role]} nommé ${nomComplet(personne)} existe déjà dans cet établissement. Utilisez un nom qui le distingue (second prénom, initiale) pour éviter deux fiches identiques dans la liste.`
}
