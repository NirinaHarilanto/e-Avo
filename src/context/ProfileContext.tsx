import { createContext, useContext, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useAuth, type InscriptionInfos } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import type { Database } from '../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

interface ProfileContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  seConnecter: (email: string, motDePasse: string) => ReturnType<ReturnType<typeof useAuth>['seConnecter']>
  sInscrire: (infos: InscriptionInfos) => ReturnType<ReturnType<typeof useAuth>['sInscrire']>
  seDeconnecter: () => ReturnType<ReturnType<typeof useAuth>['seDeconnecter']>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading, seConnecter, sInscrire, seDeconnecter } = useAuth()
  const { profile, loading: profileLoading } = useProfile(session)

  const value: ProfileContextValue = {
    session,
    profile,
    loading: authLoading || profileLoading,
    seConnecter,
    sInscrire,
    seDeconnecter,
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
