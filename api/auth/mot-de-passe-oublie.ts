/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { envoyerEmail, modeleReinitialisationMotDePasse } from '../_lib/email.js'

export const config = { runtime: 'edge' }

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Envoie le lien de définition/réinitialisation du mot de passe, que ce soit la toute première
 * connexion (compte créé par un admin, jamais de mot de passe choisi — voir migration 0043) ou
 * un « mot de passe oublié » classique : les deux cas utilisent le même lien de recovery
 * Supabase, envoyé via Resend plutôt que par le système d'e-mail natif de Supabase (non
 * configuré ici, cf. api/_lib/creerCompte.ts).
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
    const { data: profil } = await serviceClient
      .from('profiles')
      .select('mot_de_passe_defini, status')
      .eq('email', email)
      .maybeSingle()

    // Compte supprimé (voir api/admin/supprimer-utilisateur.ts) : aucun lien à envoyer, comme
    // s'il n'existait pas.
    if (!profil || profil.status === 'suspended') {
      return Response.json({ error: 'Adresse e-mail non reconnue.' }, { status: 404 })
    }

    const origine = new URL(request.url).origin
    const { data: lienData, error: erreurLien } = await serviceClient.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${origine}/auth/reinitialiser` },
    })
    if (erreurLien || !lienData?.properties?.action_link) {
      return Response.json({ error: "Le lien de réinitialisation n'a pas pu être généré." }, { status: 500 })
    }

    const premiereConnexion = !profil.mot_de_passe_defini
    await envoyerEmail({
      destinataire: email,
      sujet: premiereConnexion ? 'Définissez votre mot de passe Hari Online Club' : 'Réinitialisation de votre mot de passe',
      html: modeleReinitialisationMotDePasse({ premiereConnexion, lien: lienData.properties.action_link }),
    })

    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
