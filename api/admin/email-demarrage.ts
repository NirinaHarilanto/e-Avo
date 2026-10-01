import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import { dateHeureLisible, dateLisible, envoyerDepuisModele } from '../_lib/templatesEmail.js'

export const config = { runtime: 'edge' }

interface Corps {
  studentId?: string
}

/**
 * E-mail de démarrage ou de changement de formateur, envoyé automatiquement — demande client du
 * 2026-10-01 (« oui, les 6 maintenant »), textes repris des modèles 3.1, 3.4 et 4.5 du document
 * « HOC_Templates_emails_apprenants ».
 *
 * Appelé APRÈS l'attribution d'un professeur ou l'affectation à une vague, et volontairement
 * séparé de ces deux actions : l'attribution passe par une transaction SQL unique
 * (`attribuer_professeur`, 0039/0046) qu'il n'est pas question de reprendre pour y greffer un
 * e-mail. Si cet appel échoue, l'élève a quand même son professeur — l'inverse serait inacceptable.
 *
 * Le modèle est choisi ICI, à partir de l'état réel de l'élève, et non par l'écran appelant : lui
 * ne sait pas toujours s'il vient de faire une première attribution ou un changement.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps
    if (!corps.studentId) {
      return Response.json({ error: 'studentId est requis.' }, { status: 400 })
    }

    const { data: eleve } = await serviceClient
      .from('profiles')
      .select('id, prenom, email, etablissement_id')
      .eq('id', corps.studentId)
      .maybeSingle()
    if (!eleve || eleve.etablissement_id !== etablissementId) {
      return Response.json({ error: 'Élève introuvable pour cet établissement.' }, { status: 404 })
    }
    if (!eleve.email) {
      return Response.json({ error: 'Cet élève n’a pas d’adresse e-mail enregistrée.' }, { status: 400 })
    }

    /* Tout l'historique d'affectations, pas seulement l'active : c'est son nombre qui distingue
       une première attribution (modèle 3.1) d'un changement (modèle 4.5), et la plus récemment
       close qui donne le nom de l'ancien formateur. */
    const { data: affectations } = await serviceClient
      .from('teacher_assignments')
      .select('teacher_id, date_debut, date_fin')
      .eq('student_id', eleve.id)
      .order('date_debut', { ascending: false })

    const active = (affectations ?? []).find((a) => a.date_fin === null) ?? null
    const closes = (affectations ?? []).filter((a) => a.date_fin !== null)

    const { data: inscriptionVague } = await serviceClient
      .from('cohort_enrollments')
      .select('cohort_id')
      .eq('student_id', eleve.id)
      .limit(1)
      .maybeSingle()

    const idsProfesseurs = [active?.teacher_id, closes[0]?.teacher_id].filter((id): id is string => !!id)
    const { data: professeurs } = idsProfesseurs.length
      ? await serviceClient.from('profiles').select('id, prenom, nom, email').in('id', idsProfesseurs)
      : { data: [] as { id: string; prenom: string | null; nom: string | null; email: string | null }[] }
    const nomDe = (id: string | undefined) => {
      const p = (professeurs ?? []).find((x) => x.id === id)
      return p ? [p.prenom, p.nom].filter(Boolean).join(' ') : ''
    }
    const emailDe = (id: string | undefined) => (professeurs ?? []).find((x) => x.id === id)?.email ?? ''

    /* Prochaine séance planifiée avec le professeur actuel : c'est la date annoncée dans le mail.
       Absente, les lignes qui la mentionnent tombent plutôt que d'annoncer une date vide. */
    const { data: prochaineSeance } = active
      ? await serviceClient
          .from('sessions')
          .select('debut')
          .eq('teacher_id', active.teacher_id)
          .eq('statut', 'planifiee')
          .gte('debut', new Date().toISOString())
          .order('debut')
          .limit(1)
          .maybeSingle()
      : { data: null as { debut: string } | null }

    const { data: forfaits } = await serviceClient
      .from('packages')
      .select('total_heures')
      .eq('student_id', eleve.id)
    const volumeHeures = (forfaits ?? []).reduce((total, f) => total + f.total_heures, 0)

    let reference: '3.1' | '3.4' | '4.5'
    let valeurs: Record<string, string | null | undefined>

    if (inscriptionVague) {
      // Programme collectif : le planning est celui de la vague, pas une suite de rendez-vous.
      const { data: vague } = await serviceClient
        .from('cohorts')
        .select('nom, date_debut, date_fin')
        .eq('id', inscriptionVague.cohort_id)
        .maybeSingle()
      const { data: classe } = await serviceClient
        .from('cohort_classes')
        .select('niveau, creneau, teacher_id')
        .eq('cohort_id', inscriptionVague.cohort_id)
        .limit(1)
        .maybeSingle()
      reference = '3.4'
      valeurs = {
        prenom: eleve.prenom,
        niveau: classe?.niveau,
        creneau: classe?.creneau,
        nom_formateur: nomDe(classe?.teacher_id ?? active?.teacher_id),
        date_debut_vague: dateLisible(vague?.date_debut),
        date_fin_vague: dateLisible(vague?.date_fin),
        date_evaluation_finale: dateLisible(vague?.date_fin),
        premiere_session: dateHeureLisible(prochaineSeance?.debut),
      }
    } else if (closes.length === 0) {
      reference = '3.1'
      valeurs = {
        prenom: eleve.prenom,
        nom_formateur: nomDe(active?.teacher_id),
        email_formateur: emailDe(active?.teacher_id),
        volume_heures: volumeHeures > 0 ? String(volumeHeures) : undefined,
        date_debut_formation: dateLisible(prochaineSeance?.debut),
        heure_premier_cours: prochaineSeance
          ? new Date(prochaineSeance.debut).toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Indian/Antananarivo',
            })
          : undefined,
      }
    } else {
      reference = '4.5'
      valeurs = {
        prenom: eleve.prenom,
        nom_ancien_formateur: nomDe(closes[0]?.teacher_id),
        date_changement: dateLisible(closes[0]?.date_fin),
        nom_formateur: nomDe(active?.teacher_id),
        email_formateur: emailDe(active?.teacher_id),
        date_premier_cours: dateHeureLisible(prochaineSeance?.debut),
      }
    }

    const resultat = await envoyerDepuisModele(serviceClient, {
      etablissementId,
      reference,
      destinataires: [eleve.email],
      valeurs,
    })

    if (!resultat.envoye) {
      return Response.json({ error: resultat.erreur ?? "L'e-mail n'a pas pu être envoyé.", reference }, { status: 502 })
    }
    return Response.json({ ok: true, reference, manquantes: resultat.manquantes })
  } catch (erreur) {
    if (erreur instanceof AdminAuthError) {
      return Response.json({ error: erreur.message }, { status: erreur.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
