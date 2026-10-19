import { requireTeacherOrAdmin, TeacherAuthError } from '../_lib/teacherAuth.js'
import { creerNotification } from '../_lib/notifications.js'
import { adminsDeLEtablissement } from '../_lib/reservation.js'
import { heuresDepuisMinutes, LIBELLE_TYPE_PRESTATION, peutEtreCloturee } from '../../src/lib/prestationsExternes.js'
import { formaterHeures } from '../../src/lib/heures.js'

export const config = { runtime: 'edge' }

interface Corps {
  prestationId?: string
}

/**
 * Clôture d'une prestation externe (corporate, chat & chill) — demande client du 2026-10-19 :
 * « une fois une séance terminée, la séance pourra être facturée dans la timesheet du
 * professeur ».
 *
 * Passe obligatoirement par le serveur : la clôture écrit dans `hour_ledger`, qui n'a aucune
 * policy d'écriture cliente (0011) — c'est précisément ce qui garantit qu'une heure créditée
 * correspond toujours à un événement métier réel, jamais à un `insert` depuis un navigateur.
 *
 * Ouverte au professeur concerné comme à l'admin : le professeur clôture déjà ses propres séances
 * HOC, il n'y a pas de raison qu'il doive attendre l'administration pour déclarer une prestation
 * qu'il vient de donner. L'admin est notifié dans les deux cas.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, profileId, etablissementId, roles } = await requireTeacherOrAdmin(request)
    const corps = (await request.json()) as Corps
    if (!corps.prestationId) {
      return Response.json({ error: 'prestationId est requis.' }, { status: 400 })
    }

    const { data: prestation } = await serviceClient
      .from('prestations_externes')
      .select('id, etablissement_id, teacher_id, type, client, debut, duree_minutes, statut')
      .eq('id', corps.prestationId)
      .maybeSingle()

    if (!prestation || prestation.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Prestation introuvable.' }, { status: 404 })
    }

    const estAdmin = roles.includes('admin_etablissement')
    if (!estAdmin && prestation.teacher_id !== profileId) {
      return Response.json({ error: 'Vous ne pouvez clôturer que vos propres prestations.' }, { status: 403 })
    }

    if (prestation.statut === 'terminee') {
      return Response.json({ error: 'Cette prestation est déjà clôturée.' }, { status: 409 })
    }
    if (prestation.statut === 'annulee') {
      return Response.json({ error: 'Une prestation annulée ne peut pas être clôturée.' }, { status: 409 })
    }
    if (!peutEtreCloturee(prestation, new Date())) {
      return Response.json({ error: 'Cette prestation n’a pas encore commencé.' }, { status: 409 })
    }

    const heures = heuresDepuisMinutes(prestation.duree_minutes)

    /* Le crédit d'heures AVANT le changement de statut : si l'écriture échoue, la prestation
       reste « planifiée » et la clôture peut être relancée. Dans l'ordre inverse, une prestation
       se retrouverait marquée terminée sans jamais créditer d'heures — donc jamais facturable, et
       sans aucun moyen de rattrapage depuis l'écran.
       Un double clic ne crédite pas deux fois : l'index unique partiel
       `hour_ledger_credit_prestation_unique` (0131) l'interdit en base. */
    const { error: erreurLedger } = await serviceClient.from('hour_ledger').insert({
      etablissement_id: etablissementId,
      session_id: null,
      prestation_externe_id: prestation.id,
      teacher_id: prestation.teacher_id,
      type_ecriture: 'credit_professeur',
      heures,
      type_facturation: prestation.type,
    })
    if (erreurLedger) {
      return Response.json({ error: erreurLedger.message }, { status: 500 })
    }

    const { error: erreurStatut } = await serviceClient
      .from('prestations_externes')
      .update({ statut: 'terminee', terminee_le: new Date().toISOString(), terminee_par: profileId })
      .eq('id', prestation.id)
      /* Garde contre deux clôtures simultanées : la seconde ne met à jour aucune ligne et
         repart en erreur plutôt que d'écraser la première. */
      .eq('statut', 'planifiee')
    if (erreurStatut) {
      return Response.json({ error: erreurStatut.message }, { status: 500 })
    }

    /* L'administration suit ces prestations depuis la fiche du professeur : elle doit savoir
       qu'une heure facturable vient de s'ajouter, surtout quand c'est le professeur qui a
       clôturé. Jamais bloquant : la clôture elle-même est déjà enregistrée. */
    if (!estAdmin) {
      const { data: professeur } = await serviceClient
        .from('profiles')
        .select('prenom, nom')
        .eq('id', prestation.teacher_id)
        .maybeSingle()
      const nom = [professeur?.prenom, professeur?.nom].filter(Boolean).join(' ') || 'Un professeur'
      for (const adminId of await adminsDeLEtablissement(serviceClient, etablissementId)) {
        await creerNotification(serviceClient, {
          etablissementId,
          destinataireProfileId: adminId,
          type: 'prestation_externe_terminee',
          titre: `Prestation ${LIBELLE_TYPE_PRESTATION[prestation.type].toLowerCase()} terminée`,
          message: `${nom} a clôturé sa prestation pour ${prestation.client} (${formaterHeures(heures)}). Elle est facturable sur son prochain TimeSheet.`,
          lien: `/admin/professeurs/${prestation.teacher_id}`,
        })
      }
    }

    return Response.json({ ok: true, heures })
  } catch (erreur) {
    if (erreur instanceof TeacherAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
