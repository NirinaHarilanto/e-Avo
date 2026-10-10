import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import {
  googleEstConfigure,
  memeAdresseGoogle,
  signerState,
  urlAutorisation,
  SCOPE_GOOGLE_PERSONNEL,
  GoogleError,
} from '../_lib/google.js'

export const config = { runtime: 'edge' }

interface Corps {
  /* Adresse confirmée par la personne dans le pop-up, avant le départ vers Google. Exigée depuis
     le 2026-10-10 : elle voyage dans l'état signé et le callback refuse l'enregistrement si Google
     renvoie une autre adresse (voir `memeAdresseGoogle`). */
  adresseAttendue?: string
}

/**
 * Première étape de la connexion du Google Calendar PERSONNEL d'un professeur ou d'un admin
 * (0098) — même mécanique que api/admin/google-oauth-demarrer.ts (état signé côté serveur pour
 * rattacher le retour de Google à la bonne personne), ouverte aux deux rôles
 * (`requireTeacherOrAdmin`, pas `requireAdmin`).
 *
 * Deux règles ajoutées le 2026-10-10 (0112), à la demande du client :
 *
 *  1. l'adresse visée doit être CONFIRMÉE avant de partir. Un professeur connecté à plusieurs
 *     comptes Google dans le même navigateur autorise très facilement le mauvais, et chaque compte
 *     distinct consomme définitivement une place du quota de 100 utilisateurs de l'application
 *     Google non vérifiée.
 *  2. la PREMIÈRE connexion est libre, mais un CHANGEMENT d'adresse par un professeur exige une
 *     autorisation de l'administration — « le professeur [...] ne pourra pas modifier son adresse
 *     gmail déjà connectée à HOC sans l'autorisation et la validation de l'admin ». L'autorisation
 *     porte sur UNE adresse précise, pas sur un droit général de reconnexion.
 *
 * L'admin n'est pas concerné par la règle 2 : c'est lui qui valide, il ne peut pas se demander la
 * permission à lui-même.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId, roles } = await requireTeacherOrAdmin(request)

    if (!googleEstConfigure()) {
      return Response.json(
        { error: "L'intégration Google n'est pas encore configurée sur le serveur (identifiants OAuth manquants)." },
        { status: 503 },
      )
    }

    const corps = (await request.json().catch(() => ({}))) as Corps
    const adresseAttendue = corps.adresseAttendue?.trim().toLowerCase()
    if (!adresseAttendue || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresseAttendue)) {
      return Response.json({ error: 'Confirmez l’adresse Gmail à connecter avant de continuer.' }, { status: 400 })
    }

    const estAdmin = roles.includes('admin_etablissement')
    if (!estAdmin) {
      const { data: existante } = await serviceClient
        .from('google_integrations_personnelles')
        .select('google_email')
        .eq('profile_id', profileId)
        .maybeSingle()

      /* Reconnecter LA MÊME adresse reste libre : c'est le geste de réparation quand un jeton a
         été révoqué ou qu'un compte est resté en lecture seule (0107). Ce n'est pas un changement,
         et l'interdire enfermerait le professeur dans une intégration cassée. */
      if (existante && !memeAdresseGoogle(existante.google_email, adresseAttendue)) {
        const { data: autorisation } = await serviceClient
          .from('demandes_agenda_google')
          .select('id, google_email_souhaite')
          .eq('profile_id', profileId)
          .eq('statut', 'approuvee')
          .maybeSingle()

        if (!autorisation) {
          return Response.json(
            {
              error:
                'Votre agenda est déjà relié à ' +
                existante.google_email +
                '. Le changement d’adresse doit être validé par l’administration : faites-en la demande depuis « Mon profil ».',
              changementARequerir: true,
              googleEmailActuel: existante.google_email,
            },
            { status: 409 },
          )
        }
        if (!memeAdresseGoogle(autorisation.google_email_souhaite, adresseAttendue)) {
          return Response.json(
            {
              error: `L’administration a autorisé le passage à ${autorisation.google_email_souhaite}, pas à ${adresseAttendue}. Connectez l’adresse autorisée, ou déposez une nouvelle demande.`,
            },
            { status: 409 },
          )
        }
      }
    }

    const state = await signerState('personnel', { etablissementId, profileId, adresseAttendue })
    return Response.json({ url: urlAutorisation(state, SCOPE_GOOGLE_PERSONNEL) })
  } catch (error) {
    if (error instanceof TeacherAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof GoogleError) {
      return Response.json({ error: error.message }, { status: 503 })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
