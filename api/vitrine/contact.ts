/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { EMAIL_OFFICIEL_HOC } from '../../src/lib/etablissement.js'
import { envoyerEmail, modeleMessageContact } from '../_lib/email.js'
import { verifierDebit } from '../_lib/limiteDebit.js'

export const config = { runtime: 'edge' }

interface Corps {
  nom?: string
  telephone?: string
  email?: string
  projet?: string
}

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Formulaire « Nous contacter » de la vitrine (FenetreContact.tsx). Envoie directement à
 * l'administration par Resend, au lieu de remettre un lien `mailto:` au visiteur : ce lien
 * n'aboutissait qu'à condition que l'appareil du visiteur ait lui-même un client de messagerie
 * configuré, ce qui n'a rien de garanti (demande client du 2026-10-30).
 *
 * Aucune table dédiée : un message de contact n'est pas un prospect (il ne mène pas forcément à
 * une inscription) ni un dossier à instruire, juste un texte ponctuel à transmettre tel quel.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !serviceKey) {
    return Response.json({ error: 'Configuration serveur manquante.' }, { status: 500 })
  }

  try {
    const c = (await request.json()) as Corps
    const nom = c.nom?.trim()
    const projet = c.projet?.trim()
    const telephone = c.telephone?.trim() || null
    const email = c.email?.trim().toLowerCase() || null
    if (!nom || !projet) {
      return Response.json({ error: 'Merci d’indiquer votre nom et votre projet.' }, { status: 400 })
    }
    if (nom.length > 150 || (telephone?.length ?? 0) > 40) {
      return Response.json({ error: 'Un champ dépasse la longueur acceptée.' }, { status: 400 })
    }
    if (projet.length > 5000) {
      return Response.json({ error: 'Votre message est limité à 5 000 caractères.' }, { status: 400 })
    }
    if (email && !EMAIL_VALIDE.test(email)) {
      return Response.json({ error: 'Adresse e-mail invalide.' }, { status: 400 })
    }

    const serviceClient = createClient<Database>(url, serviceKey)
    const refus = await verifierDebit(request, serviceClient, { route: 'contact', max: 5, fenetreSecondes: 3600 })
    if (refus) return refus

    const { envoye, erreur } = await envoyerEmail({
      destinataire: EMAIL_OFFICIEL_HOC,
      sujet: `Nouveau message depuis le site – ${nom}`,
      html: modeleMessageContact({ nom, telephone, email, projet }),
      ...(email ? { replyTo: email } : {}),
    })
    // Ici, contrairement aux autres appelants d'envoyerEmail, l'e-mail EST le mécanisme de
    // transmission — pas un confort à côté d'un enregistrement en base. Le masquer comme un
    // succès laisserait le visiteur croire son message parti alors que l'admin ne reçoit rien.
    if (!envoye) {
      return Response.json({ error: erreur ?? 'Envoi impossible pour le moment, réessayez.' }, { status: 502 })
    }

    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
