import { createContext, useContext, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useAuth, type InscriptionInfos } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useEtablissement } from '../hooks/useEtablissement'
import { usePlatformAdmin } from '../hooks/usePlatformAdmin'
import type { Database } from '../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Etablissement = Database['public']['Tables']['etablissements']['Row']
type PlatformAdmin = Database['public']['Tables']['platform_admins']['Row']

interface ProfileContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  /* Établissement du profil connecté et statut d'admin plateforme, résolus une seule fois ici
     plutôt que dans chaque layout — voir le commentaire sur leur récupération plus bas. */
  etablissement: Etablissement | null
  platformAdmin: PlatformAdmin | null
  platformAdminLoading: boolean
  seConnecter: (email: string, motDePasse: string) => ReturnType<ReturnType<typeof useAuth>['seConnecter']>
  sInscrire: (infos: InscriptionInfos) => ReturnType<ReturnType<typeof useAuth>['sInscrire']>
  seDeconnecter: () => ReturnType<ReturnType<typeof useAuth>['seDeconnecter']>
  rafraichirProfil: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading, seConnecter, sInscrire, seDeconnecter } = useAuth()
  const { profile, loading: profileLoading, rafraichir: rafraichirProfil } = useProfile(session, authLoading)
  const loading = authLoading || profileLoading

  /* Récupérés ici plutôt que dans EspaceLayout/PlateformeLayout/EspacePersonnel : ce Provider
     enveloppe tout le routeur et ne se démonte jamais entre deux pages, contrairement à ces
     trois composants qui sont remontés à chaque navigation (React Router remplace l'élément de
     route entier). Chacun relançait donc sa propre requête Supabase — établissement et statut
     d'admin plateforme — à chaque clic dans la navigation, ce qui ralentissait sensiblement le
     passage d'une page à l'autre pour une donnée qui ne change jamais en cours de session. */
  const etablissement = useEtablissement(profile?.etablissement_id)
  const { platformAdmin, loading: platformAdminLoading } = usePlatformAdmin(session, loading)

  const value: ProfileContextValue = {
    session,
    profile,
    loading,
    etablissement,
    platformAdmin,
    platformAdminLoading,
    seConnecter,
    sInscrire,
    seDeconnecter,
    rafraichirProfil,
  }

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfileContext() {
  const context = useContext(ProfileContext)
  if (!context) {
    throw new Error('useProfileContext doit être utilisé sous <ProfileProvider>.')
  }
  return context
}
