import { useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useProfileContext } from '../context/ProfileContext'
import { ajouterJours } from '../lib/agenda'
import { versEvenementGooglePersonnel, type EvenementGoogle } from '../lib/agendaEvenements'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type StatutGooglePersonnel = Database['public']['Views']['google_integration_personnelle_statut']['Row']

/* État de connexion du Google Calendar personnel (0098) : lu directement par le navigateur via la
   vue dédiée, qui n'expose ni jeton ni rien de sensible (même garantie que
   google_integration_statut pour l'établissement, voir la migration 0098). Utilisé par la carte
   de connexion dans « Mon profil ». */
export function useStatutGoogleCalendarPersonnel() {
  const { profile } = useProfileContext()
  const { valeur, loading, recharger } = useCacheRequete(profile ? 'google-personnel-statut' : null, async () => {
    const { data } = await supabase.from('google_integration_personnelle_statut').select('*').maybeSingle()
    return data as StatutGooglePersonnel | null
  })
  return { statut: valeur ?? null, loading, recharger }
}

/* Événements du Google Calendar personnel de la semaine affichée, au format EvenementAgenda — à
   fusionner par l'appelant dans le tableau qu'il passe à AgendaHebdo. Vide (jamais une erreur) si
   rien n'est connecté : c'est l'état normal de la plupart des comptes, pas un problème à signaler
   à l'écran de l'agenda lui-même (l'écran « Mon profil » affiche l'état de la connexion, lui). */
export function useEvenementsGoogleCalendarPersonnel(semaineDebut: Date) {
  const { profile, session } = useProfileContext()
  const cle = profile && session ? `google-personnel-evenements-${semaineDebut.toISOString().slice(0, 10)}` : null

  const { valeur, recharger } = useCacheRequete(cle, async () => {
    const debut = semaineDebut
    const fin = ajouterJours(semaineDebut, 7)
    const parametres = new URLSearchParams({ debut: debut.toISOString(), fin: fin.toISOString() })
    const reponse = await fetch(`/api/google-personnel/evenements?${parametres}`, {
      headers: { Authorization: `Bearer ${session!.access_token}` },
    }).catch(() => null)
    if (!reponse?.ok) return []
    const corps = (await reponse.json().catch(() => null)) as { evenements?: EvenementGoogle[] } | null
    return corps?.evenements ?? []
  })

  const bruts = useMemo<EvenementGoogle[]>(() => valeur ?? [], [valeur])
  /* Les deux formes sont rendues : celui que l'agenda place dans sa grille, et l'événement complet
     que sa fiche affiche au clic (description, invités, droit de modification). */
  const evenements = useMemo(() => bruts.map(versEvenementGooglePersonnel), [bruts])
  const parId = useMemo(() => new Map(bruts.map((e) => [e.id, e])), [bruts])

  return { evenements, parId, recharger }
}
