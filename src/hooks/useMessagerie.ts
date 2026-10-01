import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Message = Database['public']['Tables']['messages']['Row']
type Annuaire = Database['public']['Views']['annuaire_etablissement']['Row']

export interface MessageAvecPersonnes extends Message {
  expediteur: Annuaire | null
  destinataire: Annuaire | null
}

/* Annuaire des personnes à qui écrire (0090). La vue ne rend que nom et rôle, filtrés sur
   l'établissement courant : un élève y voit tout le monde sans voir les coordonnées de personne. */
export function useAnnuaire() {
  const { valeur, loading, erreur } = useCacheRequete('annuaire-etablissement', async () => {
    const { data, error } = await supabase
      .from('annuaire_etablissement')
      .select('*')
      .order('role')
      .order('nom')
    if (error) throw new Error(error.message)
    return data ?? []
  })
  return { personnes: valeur ?? [], loading, erreur }
}

/* Messages reçus et envoyés de la personne connectée. Un seul `select *` : la RLS
   (`messages_participant_select`) ne laisse passer que les messages dont on est expéditeur ou
   destinataire, il n'y a donc rien à filtrer ici — et surtout rien à oublier de filtrer. */
export function useMessagerie(profileId: string | undefined) {
  const { valeur, loading, erreur, recharger } = useCacheRequete(
    profileId && `messagerie-${profileId}`,
    async () => {
      const { data: messages, error } = await supabase.from('messages').select('*').order('created_at', { ascending: false })
      if (error) throw new Error(error.message)

      /* Les noms viennent de l'annuaire, pas de `profiles` : un élève ne peut pas lire la ligne
         `profiles` de son correspondant (0004/0017), il verrait « Expéditeur inconnu » sur chaque
         message reçu. */
      const { data: annuaire } = await supabase.from('annuaire_etablissement').select('*')
      const parId = new Map((annuaire ?? []).map((p) => [p.id, p]))

      return (messages ?? []).map((m): MessageAvecPersonnes => ({
        ...m,
        expediteur: parId.get(m.expediteur_profile_id) ?? null,
        destinataire: parId.get(m.destinataire_profile_id) ?? null,
      }))
    },
  )

  const messages = valeur ?? []
  const recus = messages.filter((m) => m.destinataire_profile_id === profileId)
  const envoyes = messages.filter((m) => m.expediteur_profile_id === profileId)

  return {
    recus,
    envoyes,
    /* Un message que l'on s'écrit à soi-même apparaît dans les deux listes : il ne doit pas
       compter deux fois dans le badge de non-lus. */
    nonLus: recus.filter((m) => !m.lu && m.expediteur_profile_id !== profileId).length,
    loading,
    erreur,
    recharger,
  }
}

export async function marquerMessageLu(id: string) {
  await supabase.from('messages').update({ lu: true }).eq('id', id)
}

export async function supprimerMessage(id: string) {
  const { error } = await supabase.from('messages').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export function nomPersonne(personne: Annuaire | null, repli = 'Personne inconnue'): string {
  if (!personne) return repli
  return [personne.prenom, personne.nom].filter(Boolean).join(' ') || repli
}

export const LIBELLE_ROLE: Record<string, string> = {
  admin_etablissement: 'Administration',
  professeur: 'Professeur',
  etudiant: 'Élève',
}
