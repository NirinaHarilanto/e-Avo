import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

export type EmailTemplate = Database['public']['Tables']['email_templates']['Row']
export type EmailVariable = Database['public']['Tables']['email_variables']['Row']
export type EmailEnvoi = Database['public']['Tables']['email_envois']['Row']

/* Modèles d'e-mails (0091) groupés par catégorie, dans l'ordre du document source. */
export function useEmailTemplates() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('email-templates', async () => {
    const { data, error } = await supabase.from('email_templates').select('*').order('ordre')
    if (error) throw new Error(error.message)
    return data ?? []
  })

  const templates = valeur ?? []
  const parCategorie = new Map<string, EmailTemplate[]>()
  for (const t of templates) {
    parCategorie.set(t.categorie, [...(parCategorie.get(t.categorie) ?? []), t])
  }

  return { templates, parCategorie: [...parCategorie.entries()], loading, erreur, recharger }
}

/* Constantes de la maison (0093) : injectées dans tout aperçu avant les valeurs du destinataire. */
export function useEmailVariables() {
  const { valeur, loading, recharger } = useCacheRequete('email-variables', async () => {
    const { data, error } = await supabase.from('email_variables').select('*').order('ordre')
    if (error) throw new Error(error.message)
    return data ?? []
  })

  const variables = valeur ?? []
  const valeurs: Record<string, string> = {}
  for (const v of variables) {
    if (v.valeur?.trim()) valeurs[v.cle] = v.valeur.trim()
  }

  return { variables, valeurs, loading, recharger }
}

/* Journal des envois et brouillons. Les brouillons remontent en premier : c'est ce qui attend
   une action, le reste est de l'historique. */
export function useEmailEnvois() {
  const { valeur, loading, recharger } = useCacheRequete('email-envois', async () => {
    const { data, error } = await supabase.from('email_envois').select('*').order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  })

  const envois = valeur ?? []
  return {
    brouillons: envois.filter((e) => e.statut === 'brouillon'),
    historique: envois.filter((e) => e.statut !== 'brouillon'),
    loading,
    recharger,
  }
}
