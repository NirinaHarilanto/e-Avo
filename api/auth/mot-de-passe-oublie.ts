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

    /* Origine FIGÉE plutôt que déduite de `request.url` — bug signalé par le client le 2026-09-16 :
       un utilisateur venu de www.harionlineclub.app recevait un lien qui le renvoyait sur le Hero
       au lieu de la page de réinitialisation. En cause : Supabase Auth ne redirige vers
       `redirectTo` que si cette URL figure dans sa liste blanche (Authentication → URL
       Configuration → Redirect URLs) ; hors liste, il retombe SILENCIEUSEMENT sur la Site URL
       configurée (sans le moindre message d'erreur), qui pointe sur la racine du domaine Vercel
       par défaut — d'où l'atterrissage sur le Hero. L'application répond sur plusieurs domaines
       (harionlineclub.app, www.harionlineclub.app, e-avo.vercel.app) : `request.url` reflète celui
       par lequel la REQUÊTE API est arrivée, qui n'est pas forcément dans la liste blanche même
       quand le domaine lui-même sert bien l'application. Un seul domaine canonique, garanti dans
       la liste blanche, supprime cette dépendance au domaine d'origine.

       harionlineclub.app (SANS www) est le domaine dans la liste blanche — vérifié empiriquement,
       www.harionlineclub.app n'y est PAS et retombe sur le Hero. Le domaine réellement servi est
       www.harionlineclub.app (harionlineclub.app fait une redirection 308 permanente vers lui) :
       partir de l'apex fonctionne quand même, un navigateur reportant le fragment `#access_token=…`
       d'une redirection HTTP vers la suivante quand celle-ci n'en spécifie pas elle-même —
       Supabase redirige donc vers harionlineclub.app/auth/reinitialiser#…, puis Vercel vers
       www.harionlineclub.app/auth/reinitialiser en conservant ce même fragment. */
    const origine = 'https://harionlineclub.app'
    const { data: lienData, error: erreurLien } = await serviceClient.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${origine}/auth/reinitialiser` },
    })
    if (erreurLien || !lienData?.properties?.action_link) {
      return Response.json({ error: "Le lien de réinitialisation n'a pas pu être généré." }, { status: 500 })
    }

    const premiereConnexion = !profil.mot_de_passe_defini
    const envoi = await envoyerEmail({
      destinataire: email,
      sujet: premiereConnexion ? 'Définissez votre mot de passe Hari Online Club' : 'Réinitialisation de votre mot de passe',
      html: modeleReinitialisationMotDePasse({ premiereConnexion, lien: lienData.properties.action_link }),
    })

    /* Le résultat de l'envoi était ignoré : l'écran annonçait « e-mail envoyé » même quand Resend
       avait refusé le message, et l'utilisateur attendait indéfiniment un lien qui n'existait pas.
       C'est le premier défaut signalé par le client le 2026-09-16. */
    if (!envoi.envoye) {
      console.error('[mot-de-passe-oublie] envoi refusé :', envoi.erreur)
      return Response.json(
        { error: "Le lien n'a pas pu être envoyé. Réessayez dans un instant ou contactez contact@harionlineclub.app." },
        { status: 502 },
      )
    }

    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
