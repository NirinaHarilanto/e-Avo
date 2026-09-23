/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'

export const config = { runtime: 'edge' }

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Première étape de l'écran de connexion : avant d'afficher un champ mot de passe, on vérifie
 * si l'e-mail correspond à un compte existant et, si oui, si son utilisateur a déjà défini son
 * propre mot de passe (voir migration 0043). Endpoint public — l'écran de connexion doit
 * pouvoir distinguer les trois cas avant toute authentification.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !serviceKey) {
    return Response.json({ error: 'Configuration Supabase serveur manquante.' }, { status: 500 })
  }

  try {
    const corps = (await request.json()) as { email?: string }
    const email = corps.email?.trim().toLowerCase()
    if (!email || !EMAIL_VALIDE.test(email)) {
      return Response.json({ error: 'Adresse e-mail invalide.' }, { status: 400 })
    }

    const serviceClient = createClient<Database>(url, serviceKey)
    /* `.neq('status', 'suspended')` AVANT `.maybeSingle()`, pas après : un compte supprimé garde
       (gardait, voir le correctif de api/admin/supprimer-utilisateur.ts) le même e-mail que le
       compte réel qui le remplace après une nouvelle inscription — deux lignes `profiles` pour
       la même adresse font échouer `.maybeSingle()` (qui n'accepte qu'au plus une ligne), pas
       juste renvoyer une valeur inattendue. Filtrer en amont retombe alors sur une seule ligne
       (l'e-mail Auth d'un compte actif est unique) au lieu de casser la recherche entière — bug
       réel rencontré le 2026-09-23, l'écran de connexion répondait « adresse inconnue » à un
       compte pourtant bien réel. */
    const { data: profil } = await serviceClient
      .from('profiles')
      .select('mot_de_passe_defini, status')
      .eq('email', email)
      .neq('status', 'suspended')
      .maybeSingle()

    if (!profil) {
      return Response.json({ statut: 'inconnu' })
    }
    return Response.json({ statut: profil.mot_de_passe_defini ? 'pret' : 'sans_mot_de_passe' })
  } catch {
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
