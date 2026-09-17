import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

/* `authLoading` retarde ce hook tant que `useAuth` n'a pas fini de résoudre la session au
   chargement de la page. Sans ça, ce hook voit `session === null` sur le tout premier rendu
   (avant que `getSession()` ait répondu) et pose `loading = false` avec `profile = null` —
   puis, dès que la vraie session arrive, il reste un rendu où `authLoading` est déjà passé à
   false mais où l'effet ci-dessous n'a pas encore eu la chance de repasser `loading` à true
   pour cette nouvelle session. Un composant consommateur (ex. AdminLayout) qui lit
   `!session || !profile` pendant cette fenêtre voit un utilisateur connecté sans profil et le
   redirige à tort vers /connexion, avant que la redirection inverse ne le renvoie plus loin —
   un aller-retour visible au moindre rechargement de page sur une route protégée. */
export function useProfile(session: Session | null, authLoading: boolean) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  /* Dépendre de l'identifiant plutôt que de l'objet session : un simple renouvellement de jeton
     (supabase-js en déclenche un au retour sur l'onglet) produit un nouvel objet session pour le
     même utilisateur. Avec `session` en dépendance, l'effet repartait à chaque fois, reposait
     `loading` à true et refaisait la requête — le profil ne change pourtant pas parce que le
     jeton a été rafraîchi. */
  const utilisateurId = session?.user.id ?? null

  useEffect(() => {
    if (authLoading) return

    if (!utilisateurId) {
      setProfile(null)
      setLoading(false)
      return
    }

    let annule = false
    setLoading(true)
    supabase
      .from('profiles')
      .select('*')
      .eq('id', utilisateurId)
      .single()
      .then(({ data }) => {
        if (!annule) {
          setProfile(data)
          setLoading(false)
        }
      })

    return () => {
      annule = true
    }
  }, [utilisateurId, authLoading])

  /* Exposé pour qu'un composant qui vient d'auto-éditer le profil connecté (coordonnées,
     signature…) puisse rafraîchir l'affichage sans attendre une déconnexion : ProfileProvider
     enveloppe tout le routeur et ne remonte jamais entre deux pages (voir son commentaire), donc
     sans ce recharger explicite, la donnée resterait périmée jusqu'à la prochaine connexion. */
  const rafraichir = useCallback(async () => {
    if (!utilisateurId) return
    const { data } = await supabase.from('profiles').select('*').eq('id', utilisateurId).single()
    setProfile(data)
  }, [utilisateurId])

  return { profile, loading, rafraichir }
}
