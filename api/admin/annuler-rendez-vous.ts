/// <reference types="node" />
import { AdminAuthError, requireAdmin } from '../_lib/adminAuth.js'
import { integrationDeLEtablissement, supprimerEvenement } from '../_lib/google.js'
import { envoyerEmail, modeleRendezVousAnnule } from '../_lib/email.js'

export const config = { runtime: 'edge' }

interface Corps {
  rendezVousId?: string
}

/**
 * Annulation d'un rendez-vous déjà confirmé (ou encore en attente), depuis la fenêtre
 * « Planifier un appel diagnostic » — demande client du 2026-09-21. Distinct de
 * `valider-rendez-vous.ts` (decision: 'refuser'), qui traite un refus AVANT confirmation : ici
 * le rendez-vous existait, l'admin revient dessus. Le prospect retombe en simple prospect,
 * comme pour un refus — un rendez-vous annulé n'est pas une perte de contact.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps
    if (!corps.rendezVousId) {
      return Response.json({ error: 'rendezVousId est requis.' }, { status: 400 })
    }

    const { data: rendezVous } = await serviceClient
      .from('rendez_vous')
      .select('id, etablissement_id, debut, statut, google_event_id, prospect_id, prospects(nom, prenom, email)')
      .eq('id', corps.rendezVousId)
      .maybeSingle()
    if (!rendezVous || rendezVous.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Rendez-vous introuvable.' }, { status: 404 })
    }
    if (rendezVous.statut === 'annule' || rendezVous.statut === 'refuse') {
      return Response.json({ error: 'Ce rendez-vous est déjà clos.' }, { status: 409 })
    }

    if (rendezVous.google_event_id) {
      const integration = await integrationDeLEtablissement(serviceClient, etablissementId).catch(() => null)
      if (integration) {
        await supprimerEvenement(integration, rendezVous.google_event_id).catch(() => {})
      }
    }

    const { error } = await serviceClient
      .from('rendez_vous')
      .update({ statut: 'annule', valide_par: profileId, valide_le: new Date().toISOString() })
      .eq('id', rendezVous.id)
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    await serviceClient.from('prospects').update({ statut: 'prospect' }).eq('id', rendezVous.prospect_id)

    const prospect = rendezVous.prospects as unknown as { nom: string; prenom: string; email: string } | null
    if (prospect) {
      const { data: etablissement } = await serviceClient.from('etablissements').select('nom').eq('id', etablissementId).maybeSingle()
      const { data: parametres } = await serviceClient
        .from('reservation_parametres')
        .select('fuseau')
        .eq('etablissement_id', etablissementId)
        .maybeSingle()
      const quand = new Intl.DateTimeFormat('fr-FR', {
        timeZone: parametres?.fuseau ?? 'Indian/Antananarivo',
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(new Date(rendezVous.debut))

      await envoyerEmail({
        destinataire: prospect.email,
        sujet: `Votre rendez-vous avec ${etablissement?.nom ?? 'Hari Online Club'} est annulé`,
        html: modeleRendezVousAnnule({ prenom: prospect.prenom, etablissement: etablissement?.nom ?? 'Hari Online Club', quand }),
      })
    }

    return Response.json({ ok: true })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
