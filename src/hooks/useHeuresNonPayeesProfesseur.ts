import { supabase } from '../lib/supabaseClient'
import { LIBELLE_TYPE_PRESTATION } from '../lib/prestationsExternes'
import { useCacheRequete } from './useCacheRequete'

export interface LigneHeureNonPayee {
  id: string
  heures: number
  sessionDebut: string | null
  /* Type figé à la clôture (0126) — null pour une écriture antérieure, traitée comme
     'individuel' par src/lib/remuneration.ts. */
  typeFacturation: string | null
  /* Intitulé de la ligne pour une prestation externe (0131) : « Corporate · Acme ». Null pour une
     séance HOC, dont l'intitulé se lit déjà dans son type et sa date. */
  libellePrestation: string | null
}

/* Écritures hour_ledger de type credit_professeur non encore rattachées à un paiement
   (teacher_payment_id is null) — le détail des heures enseignées non payées demandé pour le
   règlement au forfait horaire.
   Depuis 0131, une écriture peut venir d'une séance OU d'une prestation externe (corporate,
   chat & chill) : les deux se déclarent sur le même TimeSheet, et c'est bien le but. */
export function useHeuresNonPayeesProfesseur(teacherId: string | undefined) {
  const { valeur, loading, recharger } = useCacheRequete(teacherId && `heures-non-payees-${teacherId}`, async () => {
    const { data: ecritures } = await supabase
      .from('hour_ledger')
      .select('id, heures, session_id, prestation_externe_id, type_facturation')
      .eq('teacher_id', teacherId as string)
      .eq('type_ecriture', 'credit_professeur')
      .is('teacher_payment_id', null)
      // Heures déjà déclarées sur un TimeSheet en attente : payées par sa validation (0081).
      .is('timesheet_id', null)

    const sessionIds = [...new Set((ecritures ?? []).map((e) => e.session_id).filter((id): id is string => id !== null))]
    const prestationIds = [
      ...new Set((ecritures ?? []).map((e) => e.prestation_externe_id).filter((id): id is string => id !== null)),
    ]

    const [{ data: sessions }, { data: prestations }] = await Promise.all([
      sessionIds.length
        ? supabase.from('sessions').select('id, debut').in('id', sessionIds)
        : Promise.resolve({ data: [] as { id: string; debut: string }[] }),
      prestationIds.length
        ? supabase.from('prestations_externes').select('id, debut, type, client').in('id', prestationIds)
        : Promise.resolve({ data: [] as { id: string; debut: string; type: 'corporate' | 'chat_chill'; client: string }[] }),
    ])

    const debutParSession = new Map((sessions ?? []).map((s) => [s.id, s.debut]))
    const prestationParId = new Map((prestations ?? []).map((p) => [p.id, p]))

    return (ecritures ?? [])
      .map((e): LigneHeureNonPayee => {
        const prestation = e.prestation_externe_id ? prestationParId.get(e.prestation_externe_id) : null
        return {
          id: e.id,
          heures: e.heures,
          sessionDebut: prestation ? prestation.debut : e.session_id ? (debutParSession.get(e.session_id) ?? null) : null,
          typeFacturation: e.type_facturation,
          libellePrestation: prestation ? `${LIBELLE_TYPE_PRESTATION[prestation.type]} · ${prestation.client}` : null,
        }
      })
      .sort((a, b) => (a.sessionDebut ?? '').localeCompare(b.sessionDebut ?? ''))
  })

  return { lignes: valeur ?? [], loading, recharger }
}
