import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { memeAdresseGoogle } from '../_lib/google.js'
import { creerNotification } from '../_lib/notifications.js'

export const config = { runtime: 'edge' }

interface Corps {
  googleEmailSouhaite?: string
  motif?: string
}

/**
 * Demande, par un professeur, de changer l'adresse Gmail reliée à son agenda HOC — « le professeur
 * pourra faire une demande à l'admin depuis son espace personnel professeur, mais la validation
 * sera faite uniquement par l'admin » (exigence client du 2026-10-10, table en 0112).
 *
 * Passe par une route serveur et non par une écriture directe (la policy d'insert le permettrait)
 * pour une seule raison, mais décisive : PRÉVENIR LES ADMINISTRATEURS. Une demande qui dort sans
 * que personne ne le sache reproduirait le défaut relevé en 0107 — un écart réel, invisible à
 * l'usage, dont le professeur attend la résolution pendant que l'admin ignore son existence.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId } = await requireTeacherOrAdmin(request)
    const corps = (await request.json().catch(() => ({}))) as Corps

    const souhaitee = corps.googleEmailSouhaite?.trim().toLowerCase()
    if (!souhaitee || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(souhaitee)) {
      return Response.json({ error: 'Indiquez l’adresse Gmail que vous souhaitez relier.' }, { status: 400 })
    }

    const { data: integration } = await serviceClient
      .from('google_integrations_personnelles')
      .select('google_email')
      .eq('profile_id', profileId)
      .maybeSingle()

    /* Reconnecter la même adresse n'a jamais demandé d'autorisation (voir demarrer.ts) : rediriger
       vers le bon geste plutôt que de faire attendre une validation sans objet. */
    if (integration && memeAdresseGoogle(integration.google_email, souhaitee)) {
      return Response.json(
        {
          error:
            'Cette adresse est déjà celle reliée à votre agenda. Pour réparer une synchronisation, cliquez simplement « Reconnecter mon agenda » : aucune autorisation n’est nécessaire.',
        },
        { status: 409 },
      )
    }

    const { data: demande, error } = await serviceClient
      .from('demandes_agenda_google')
      .insert({
        etablissement_id: etablissementId,
        profile_id: profileId,
        google_email_actuel: integration?.google_email ?? null,
        google_email_souhaite: souhaitee,
        motif: corps.motif?.trim() || null,
      })
      .select('id')
      .single()

    if (error) {
      /* Index unique partiel `demandes_agenda_google_une_vivante` (0112) : une seule demande
         vivante par professeur, pour que l'admin n'ait jamais à arbitrer une pile de demandes
         contradictoires. */
      if (error.code === '23505') {
        return Response.json(
          { error: 'Vous avez déjà une demande en cours. Attendez la réponse de l’administration, ou annulez-la.' },
          { status: 409 },
        )
      }
      return Response.json({ error: error.message }, { status: 500 })
    }

    const { data: moi } = await serviceClient.from('profiles').select('prenom, nom').eq('id', profileId).maybeSingle()
    const nom = `${moi?.prenom ?? ''} ${moi?.nom ?? ''}`.trim() || 'Un professeur'

    const { data: admins } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('etablissement_id', etablissementId)
      .eq('role', 'admin_etablissement')
      .eq('status', 'approved')

    await Promise.all(
      (admins ?? []).map((admin) =>
        creerNotification(serviceClient, {
          etablissementId,
          destinataireProfileId: admin.id,
          type: 'demande_agenda_google',
          titre: 'Changement de compte Google demandé',
          message: `${nom} demande à relier son agenda à ${souhaitee}${integration?.google_email ? ` au lieu de ${integration.google_email}` : ''}.`,
          lien: '/admin/parametres',
        }).catch(() => undefined),
      ),
    )

    return Response.json({ ok: true, id: demande.id })
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
