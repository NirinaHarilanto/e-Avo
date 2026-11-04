import { requireAdmin, AdminAuthError } from '../_lib/adminAuth.js'

export const config = { runtime: 'edge' }

interface Corps {
  packageId?: string
  /* Heures DÉJÀ suivies hors application, à débiter du forfait. L'écran, lui, demande à l'admin
     les heures RESTANTES et fait la soustraction : c'est ce chiffre-là qu'il a sous les yeux. */
  heuresDejaSuivies?: number
}

/**
 * Reprise des heures déjà suivies avant la mise en service (0140) — demande client du 2026-11-04,
 * dans le cadre de l'assistant de création d'un étudiant : « son heure de cours restantes ».
 *
 * 0140 avait posé la colonne, les contraintes et l'affichage (« dont suivies avant la mise en
 * service »), mais RIEN pour écrire la reprise : sa propre note le disait, « rien d'autre ne bouge
 * dans le code ». Les seules reprises existantes ont été écrites par script lors de l'import de
 * 2026-10-29. Cette route est ce qui manquait.
 *
 * Pourquoi une route serveur et pas une écriture directe : `hour_ledger` n'a QUE des policies
 * SELECT (0011, 0061, 0072) — rien ne s'y écrit depuis le navigateur, par construction. Le ledger
 * est la source des heures facturées et payées : il ne se modifie que depuis le serveur, avec la
 * clé de service.
 *
 * Le piège que 0140 nomme explicitement : ne JAMAIS retrancher ces heures de
 * `packages.total_heures`. `total_heures` est ce que l'élève a SOUSCRIT ; les heures restantes se
 * déduisent du ledger. Les confondre est exactement le bug que 0140 corrige.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { serviceClient, etablissementId } = await requireAdmin(request)
    const corps = (await request.json()) as Corps
    const packageId = corps.packageId?.trim()
    const heures = Number(corps.heuresDejaSuivies)

    if (!packageId) {
      return Response.json({ error: 'Forfait manquant.' }, { status: 400 })
    }
    if (!Number.isFinite(heures) || heures <= 0) {
      return Response.json({ error: 'Indiquez un nombre d’heures déjà suivies supérieur à zéro.' }, { status: 400 })
    }

    const { data: forfait } = await serviceClient
      .from('packages')
      .select('id, student_id, total_heures, type_programme, etablissement_id')
      .eq('id', packageId)
      .eq('etablissement_id', etablissementId)
      .maybeSingle()

    if (!forfait) {
      return Response.json({ error: 'Forfait introuvable dans votre établissement.' }, { status: 404 })
    }
    if (!forfait.student_id) {
      return Response.json({ error: 'Ce forfait n’est rattaché à aucun élève.' }, { status: 409 })
    }
    if (heures > forfait.total_heures) {
      return Response.json(
        { error: `Ce forfait ne compte que ${forfait.total_heures} h : on ne peut pas en avoir déjà suivi ${heures}.` },
        { status: 400 },
      )
    }

    /* `hour_ledger_reprise_unique` (0140) n'autorise qu'une reprise par forfait. On le vérifie
       avant d'insérer pour renvoyer une phrase lisible plutôt que l'erreur brute de l'index — un
       assistant rejoué, ou deux onglets ouverts, arrivent vite ici. */
    const { data: dejaRepris } = await serviceClient
      .from('hour_ledger')
      .select('id, heures')
      .eq('package_id', packageId)
      .maybeSingle()

    if (dejaRepris) {
      return Response.json(
        { error: `Une reprise de ${dejaRepris.heures} h est déjà enregistrée sur ce forfait.` },
        { status: 409 },
      )
    }

    const { error } = await serviceClient.from('hour_ledger').insert({
      etablissement_id: etablissementId,
      package_id: packageId,
      student_id: forfait.student_id,
      /* Jamais `credit_professeur` : créditer un professeur d'heures données hors application le
         ferait payer une seconde fois (contrainte `hour_ledger_reprise_debit_etudiant`). */
      type_ecriture: 'debit_etudiant',
      heures,
      type_facturation: forfait.type_programme,
    })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ ok: true, heuresReprises: heures, heuresSouscrites: forfait.total_heures })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
