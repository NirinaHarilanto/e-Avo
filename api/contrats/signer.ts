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

    const estDestinataire = contrat.destinataire_profile_id === profile.id
    if (!estAdmin && !estDestinataire) {
      return Response.json({ error: "Vous n'êtes pas partie prenante de ce contrat." }, { status: 403 })
    }

    const maintenant = new Date().toISOString()
    const update: Database['public']['Tables']['contracts']['Update'] = {}
    let notifierProfileId: string | null = null
    let notifierLien = '/admin/contrats'

    if (estAdmin) {
      if (contrat.signe_etablissement_at) return Response.json({ error: "Déjà signé pour l'établissement." }, { status: 409 })
      update.signe_etablissement_at = maintenant
      update.signe_etablissement_par = profile.id
      if (!contrat.signe_destinataire_at) {
        notifierProfileId = contrat.destinataire_profile_id
        notifierLien = contrat.destinataire_role === 'professeur' ? '/professeur/contrats' : '/mon-espace/contrats'
      }
    } else {
      if (contrat.signe_destinataire_at) return Response.json({ error: 'Vous avez déjà signé ce contrat.' }, { status: 409 })
      update.signe_destinataire_at = maintenant
      update.ip_signature_destinataire = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
      update.user_agent_signature_destinataire = request.headers.get('user-agent')
      if (!contrat.signe_etablissement_at) {
        notifierProfileId = contrat.created_by_profile_id
      }
    }

    const { error: updateError } = await serviceClient.from('contracts').update(update).eq('id', contrat.id)
    if (updateError) return Response.json({ error: updateError.message }, { status: 500 })

    if (notifierProfileId) {
      await creerNotification(serviceClient, {
        etablissementId: profile.etablissement_id,
        destinataireProfileId: notifierProfileId,
        type: 'contrat_signature',
        titre: `Signature en attente · ${contrat.titre}`,
        message: estAdmin ? "L'établissement a signé, à votre tour." : 'Le destinataire a signé, à votre tour.',
        lien: notifierLien,
      })
    }

    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
