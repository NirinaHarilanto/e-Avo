import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'
import type { Database } from '../../src/types/database.types.js'

type EcritureHeures = Database['public']['Tables']['hour_ledger']['Insert']

export const config = { runtime: 'edge' }

interface Corps {
  studentId?: string
  /* Le NOUVEAU TOTAL d'heures suivies, pas l'écart — c'est le chiffre que l'admin lit sur la
     fiche (« 10h / 15h »), celui qu'il corrige. Choix du client, 2026-11-04. L'écart se calcule
     ici, à partir du compteur réel relu en base au moment de l'écriture. */
  heuresApres?: number
  justification?: string
  /* Répercuter la correction sur les heures enseignées du professeur ? Le professeur est
     DÉSIGNÉ par l'admin, jamais deviné : un élève peut en avoir plusieurs (0138). */
  teacherId?: string | null
}

/**
 * Corrige à la main le compteur d'heures suivies d'un élève — demande client du 2026-11-05.
 *
 * Rien n'est jamais réécrit : la correction ajoute UNE écriture de plus au grand livre (0159),
 * positive ou négative, et, si l'admin le demande, une seconde pour le professeur. C'est ce qui
 * protège une fiche de paie déjà émise — elle n'est pas touchée, la correction se présente
 * simplement comme une ligne de plus dans les heures à régler — et ce qui permet de tout relire
 * après coup dans `ajustements_heures`.
 *
 * Une route serveur et non une écriture directe : `hour_ledger` n'a QUE des policies de lecture
 * (0011), rien ne s'y écrit depuis le navigateur, par construction.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId, profileId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps

    const studentId = corps.studentId?.trim()
    const justification = corps.justification?.trim()
    const heuresApres = Number(corps.heuresApres)
    const teacherId = corps.teacherId?.trim() || null

    if (!studentId) {
      return Response.json({ error: 'Élève manquant.' }, { status: 400 })
    }
    if (!justification) {
      return Response.json({ error: 'La justification est obligatoire.' }, { status: 400 })
    }
    if (!Number.isFinite(heuresApres) || heuresApres < 0) {
      return Response.json({ error: 'Indiquez un nombre d’heures suivies positif ou nul.' }, { status: 400 })
    }

    const { data: eleve } = await serviceClient
      .from('profiles')
      .select('id, prenom, nom, etablissement_id, role')
      .eq('id', studentId)
      .eq('etablissement_id', etablissementId)
      .maybeSingle()
    if (!eleve || eleve.role !== 'etudiant') {
      return Response.json({ error: 'Élève introuvable dans votre établissement.' }, { status: 404 })
    }

    /* Le compteur est relu MAINTENANT, et non repris de ce que l'écran affichait : entre
       l'ouverture du pop-up et sa validation, une séance a pu être clôturée. Sans cette
       relecture, la correction partirait d'un total périmé et réintroduirait l'écart qu'elle
       prétend corriger. */
    const { data: resume } = await serviceClient
      .from('student_hours_summary')
      .select('heures_consommees')
      .eq('student_id', studentId)
      .maybeSingle()
    const heuresAvant = Number(resume?.heures_consommees ?? 0)

    /* Arrondi au centième : les heures se saisissent en quarts d'heure (0,25) et la soustraction
       de deux décimaux binaires donne sinon 0,30000000000000004. */
    const ecart = Math.round((heuresApres - heuresAvant) * 100) / 100
    if (ecart === 0) {
      return Response.json(
        { error: `Le compteur vaut déjà ${heuresAvant} h : il n’y a rien à corriger.` },
        { status: 400 },
      )
    }

    /* Le programme du forfait courant décide du taux applicable (0126/0127) : `type_facturation`
       est obligatoire à l'insertion depuis 0127, et le déduire au hasard sous-paierait une
       séance collective. Repli sur « individuel » pour un élève sans forfait — le cas d'un
       compteur corrigé avant toute souscription. */
    const { data: forfait } = await serviceClient
      .from('packages')
      .select('type_programme')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const typeFacturation = forfait?.type_programme ?? 'individuel'

    let professeur: { id: string; prenom: string | null; nom: string | null } | null = null
    if (teacherId) {
      const { data } = await serviceClient
        .from('profiles')
        .select('id, prenom, nom, role, etablissement_id')
        .eq('id', teacherId)
        .eq('etablissement_id', etablissementId)
        .maybeSingle()
      if (!data || data.role !== 'professeur') {
        return Response.json({ error: 'Professeur introuvable dans votre établissement.' }, { status: 404 })
      }
      professeur = data
    }

    const { data: ajustement, error: erreurAjustement } = await serviceClient
      .from('ajustements_heures')
      .insert({
        etablissement_id: etablissementId,
        student_id: studentId,
        teacher_id: professeur?.id ?? null,
        heures_avant: heuresAvant,
        heures_apres: heuresApres,
        justification,
        ajuste_par: profileId,
      })
      .select('id')
      .single()

    if (erreurAjustement || !ajustement) {
      return Response.json({ error: erreurAjustement?.message ?? 'Enregistrement impossible.' }, { status: 500 })
    }

    /* Une écriture pour l'élève, et une pour le professeur si l'admin l'a demandé — les deux
       rattachées au MÊME ajustement, pour que l'historique montre un geste et non deux. */
    const ecritures: EcritureHeures[] = [
      {
        etablissement_id: etablissementId,
        ajustement_id: ajustement.id,
        student_id: studentId,
        type_ecriture: 'debit_etudiant',
        heures: ecart,
        type_facturation: typeFacturation,
      },
    ]
    if (professeur) {
      ecritures.push({
        etablissement_id: etablissementId,
        ajustement_id: ajustement.id,
        teacher_id: professeur.id,
        type_ecriture: 'credit_professeur',
        heures: ecart,
        type_facturation: typeFacturation,
      })
    }

    const { error: erreurLedger } = await serviceClient.from('hour_ledger').insert(ecritures)
    if (erreurLedger) {
      /* L'historique sans son écriture mentirait : on retire la ligne qu'on vient de poser
         plutôt que de laisser une correction qui n'a rien corrigé. */
      await serviceClient.from('ajustements_heures').delete().eq('id', ajustement.id)
      return Response.json({ error: erreurLedger.message }, { status: 500 })
    }

    return Response.json({
      ok: true,
      heuresAvant,
      heuresApres,
      ecart,
      professeurImpacte: professeur ? `${professeur.prenom ?? ''} ${professeur.nom ?? ''}`.trim() : null,
    })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
