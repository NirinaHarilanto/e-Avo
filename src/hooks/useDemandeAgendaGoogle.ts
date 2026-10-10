import { supabase } from '../lib/supabaseClient'
import { useProfileContext } from '../context/ProfileContext'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Demande = Database['public']['Tables']['demandes_agenda_google']['Row']
type DemandeAdmin = Database['public']['Views']['demandes_agenda_google_admin']['Row']

/* Demande de changement du compte Google relié à son agenda (0112), vue par son auteur.

   Seule la demande VIVANTE compte pour l'écran : « en attente » (le professeur attend l'admin) ou
   « approuvée » (il peut lancer la connexion). Un index unique partiel garantit qu'il n'en existe
   jamais plus d'une (0112), d'où le `maybeSingle`. Les demandes refusées sont lues à part, pour
   pouvoir annoncer le refus une fois — sinon le professeur relancerait la même demande sans savoir
   qu'elle a déjà été tranchée. */
export function useDemandeAgendaGoogle() {
  const { profile } = useProfileContext()
  const { valeur, loading, recharger } = useCacheRequete(
    profile ? `demande-agenda-google-${profile.id}` : null,
    async () => {
      const [vivante, derniereRefusee] = await Promise.all([
        supabase
          .from('demandes_agenda_google')
          .select('*')
          .in('statut', ['en_attente', 'approuvee'])
          .maybeSingle(),
        supabase
          .from('demandes_agenda_google')
          .select('*')
          .eq('statut', 'refusee')
          .order('decide_le', { ascending: false })
          .limit(1),
      ])
      return {
        vivante: (vivante.data ?? null) as Demande | null,
        refusee: ((derniereRefusee.data ?? [])[0] ?? null) as Demande | null,
      }
    },
  )

  return {
    demande: valeur?.vivante ?? null,
    derniereRefusee: valeur?.refusee ?? null,
    loading,
    recharger,
  }
}

/* Les mêmes demandes, côté administration : toutes celles de l'établissement, avec le nom du
   professeur (vue `demandes_agenda_google_admin`, restreinte aux admins par sa clause WHERE). */
export function useDemandesAgendaGoogleAdmin() {
  const { profile } = useProfileContext()
  const { valeur, loading, recharger } = useCacheRequete(profile ? 'demandes-agenda-google-admin' : null, async () => {
    const { data } = await supabase
      .from('demandes_agenda_google_admin')
      .select('*')
      .order('created_at', { ascending: false })
    return (data ?? []) as DemandeAdmin[]
  })

  const demandes = valeur ?? []
  return { demandes, enAttente: demandes.filter((d) => d.statut === 'en_attente'), loading, recharger }
}
