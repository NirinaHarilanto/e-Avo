/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { creerNotification } from '../_lib/notifications.js'

export const config = { runtime: 'edge' }

interface Corps {
  contractId?: string
}

// Signature interne (pas de prestataire tiers) : un clic horodate signe_etablissement_at (côté
// admin) ou signe_destinataire_at (côté étudiant/professeur, avec IP/appareil comme preuve).
// La RLS ne donne au destinataire qu'un droit de LECTURE sur son contrat (contracts_destinataire_
// select, 0021) — signer passe donc obligatoirement par ici (clé service_role), jamais par un
// update direct depuis le client.
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const authHeader = request.headers.get('authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return Response.json({ error: 'Jeton manquant.' }, { status: 401 })

    const url = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SECRET_KEY
    if (!url || !serviceKey) return Response.json({ error: 'Configuration Supabase serveur manquante.' }, { status: 500 })
    const serviceClient = createClient<Database>(url, serviceKey)

    const { data: userData, error: userError } = await serviceClient.auth.getUser(token)
    if (userError || !userData.user) return Response.json({ error: 'Jeton invalide.' }, { status: 401 })

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('id, role, status, etablissement_id')
      .eq('id', userData.user.id)
      .single()
    if (!profile) return Response.json({ error: 'Profil introuvable.' }, { status: 403 })

    const { data: platformAdmin } = await serviceClient.from('platform_admins').select('id').eq('id', profile.id).maybeSingle()
    const estAdmin = !!platformAdmin || (profile.status === 'approved' && profile.role === 'admin_etablissement')

    const body = (await request.json()) as Corps
    if (!body.contractId) return Response.json({ error: 'Contrat requis.' }, { status: 400 })

    const { data: contrat } = await serviceClient.from('contracts').select('*').eq('id', body.contractId).single()
    if (!contrat || contrat.etablissement_id !== profile.etablissement_id) {
      return Response.json({ error: 'Contrat introuvable.' }, { status: 404 })
    }
    if (contrat.statut !== 'envoye') {
      return Response.json({ error: 'Ce contrat doit être envoyé avant de pouvoir être signé.' }, { status: 409 })
    }

    // Un contrat DUO (0066, demande client du 2026-09-23 : « les deux personnes formant le duo
    // doivent signer le même contrat ») a deux destinataires distincts, chacun avec son propre
    // jeu de champs de signature — ni l'un ni l'autre ne peut signer à la place de l'autre.
    const estDestinatairePrincipal = contrat.destinataire_profile_id === profile.id
    const estDestinataireSecondaire = !!contrat.destinataire_secondaire_profile_id && contrat.destinataire_secondaire_profile_id === profile.id
    if (!estAdmin && !estDestinatairePrincipal && !estDestinataireSecondaire) {
      return Response.json({ error: "Vous n'êtes pas partie prenante de ce contrat." }, { status: 403 })
    }

    const maintenant = new Date().toISOString()
    const update: Database['public']['Tables']['contracts']['Update'] = {}
    const notifications: { destinataireProfileId: string; lien: string; message: string }[] = []
    const lienDestinataire = contrat.destinataire_role === 'professeur' ? '/professeur/contrats' : '/mon-espace/contrats'

    if (estAdmin) {
      if (contrat.signe_etablissement_at) return Response.json({ error: "Déjà signé pour l'établissement." }, { status: 409 })
      update.signe_etablissement_at = maintenant
      update.signe_etablissement_par = profile.id
      const message = "L'établissement a signé, à votre tour."
      if (!contrat.signe_destinataire_at) {
        notifications.push({ destinataireProfileId: contrat.destinataire_profile_id, lien: lienDestinataire, message })
      }
      if (contrat.destinataire_secondaire_profile_id && !contrat.signe_destinataire_secondaire_at) {
        notifications.push({ destinataireProfileId: contrat.destinataire_secondaire_profile_id, lien: lienDestinataire, message })
      }
    } else {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
      const userAgent = request.headers.get('user-agent')

      if (estDestinatairePrincipal) {
        if (contrat.signe_destinataire_at) return Response.json({ error: 'Vous avez déjà signé ce contrat.' }, { status: 409 })
        update.signe_destinataire_at = maintenant
        update.ip_signature_destinataire = ip
        update.user_agent_signature_destinataire = userAgent
      } else {
        if (contrat.signe_destinataire_secondaire_at) return Response.json({ error: 'Vous avez déjà signé ce contrat.' }, { status: 409 })
        update.signe_destinataire_secondaire_at = maintenant
        update.ip_signature_destinataire_secondaire = ip
        update.user_agent_signature_destinataire_secondaire = userAgent
      }

      if (!contrat.signe_etablissement_at) {
        notifications.push({ destinataireProfileId: contrat.created_by_profile_id, lien: '/admin/contrats', message: 'Le destinataire a signé, à votre tour.' })
      }
      // Le partenaire DUO qui n'a pas encore signé est invité à son tour, dans l'un ou l'autre
      // sens (peu importe lequel des deux signe en premier).
      if (estDestinatairePrincipal && contrat.destinataire_secondaire_profile_id && !contrat.signe_destinataire_secondaire_at) {
        notifications.push({ destinataireProfileId: contrat.destinataire_secondaire_profile_id, lien: lienDestinataire, message: 'Votre partenaire a signé, à votre tour.' })
      }
      if (estDestinataireSecondaire && !contrat.signe_destinataire_at) {
        notifications.push({ destinataireProfileId: contrat.destinataire_profile_id, lien: lienDestinataire, message: 'Votre partenaire a signé, à votre tour.' })
      }
    }

    const { error: updateError } = await serviceClient.from('contracts').update(update).eq('id', contrat.id)
    if (updateError) return Response.json({ error: updateError.message }, { status: 500 })

    for (const notification of notifications) {
      await creerNotification(serviceClient, {
        etablissementId: profile.etablissement_id,
        destinataireProfileId: notification.destinataireProfileId,
        type: 'contrat_signature',
        titre: `Signature en attente · ${contrat.titre}`,
        message: notification.message,
        lien: notification.lien,
      })
    }

    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
