import { supabase } from './supabaseClient'
import { jourDansFuseauEtablissement } from './etablissement'
import { echeancierCollectif, premiereMensualite, type FraisInscription } from './paiementCollectif'

/* Écriture des frais d'inscription au collectif : la ligne de paiement, et son échéancier quand
   l'élève a choisi de régler mois par mois (demande client du 2026-10-31).

   Posée ici et pas dans chaque écran : trois chemins mènent à cette même écriture — la fiche d'un
   candidat (FicheCandidatCollectifModale), la réévaluation de fin de parcours
   (ReevaluerEtudiantCollectif) et la conversion d'un candidat, qui passe elle par le serveur
   (api/admin/convert-prospect.ts, qui refait la même chose côté service). Les laisser diverger
   ferait qu'un élève aurait son échéancier et un autre non, selon l'écran d'où il a été saisi.

   `montant` est le TOTAL du cycle dans les deux modalités : c'est l'engagement signé. Seul
   `montant_regle` distingue le paiement intégral de la première mensualité ; le statut
   ('paye' / 'partiel' / 'attendu') est recalculé par le trigger d'acomptes (0049) à partir de
   lui. */
export async function enregistrerFraisCollectif(params: {
  etablissementId: string
  studentId: string
  prospectId: string | null
  frais: FraisInscription
  creeParProfileId: string
  notesParDefaut: string
}): Promise<{ error: string | null }> {
  const { frais } = params
  const { data: paiement, error } = await supabase
    .from('student_payments')
    .insert({
      etablissement_id: params.etablissementId,
      student_id: params.studentId,
      prospect_id: params.prospectId,
      montant: frais.montant,
      montant_regle: frais.montantRegle,
      /* Deux statuts et non trois : l'enum `statut_paiement` n'a jamais eu de valeur 'partiel'
         (choix de 0049, qui l'explique) — un règlement partiel se lit de `montant_regle`, et
         src/lib/paiements.ts en déduit « Payé partiellement » à l'affichage. */
      statut: frais.montantRegle >= frais.montant ? 'paye' : 'attendu',
      date_paiement: frais.montantRegle > 0 ? jourDansFuseauEtablissement() : null,
      moyen_paiement: frais.moyenPaiement || null,
      reference: frais.reference || null,
      notes: frais.notes || params.notesParDefaut,
      created_by_profile_id: params.creeParProfileId,
    })
    .select('id')
    .single()

  if (error || !paiement) {
    return { error: error?.message ?? "L'enregistrement des frais a échoué." }
  }

  if (frais.modalite !== 'mensuel') return { error: null }

  /* Une échéance par mois du cycle. La première est marquée réglée si elle vient d'être
     encaissée : sans cela, le cron de relance (0070) écrirait à l'élève le jour même pour une
     mensualité qu'il vient de payer — exactement le défaut rencontré lors de l'import du
     2026-10-29. */
  const echeances = echeancierCollectif(frais.montant, new Date())
  const premiereReglee = frais.montantRegle >= premiereMensualite(frais.montant)
  const { error: erreurEcheances } = await supabase.from('paiement_echeances').insert(
    echeances.map((echeance, index) => ({
      etablissement_id: params.etablissementId,
      student_payment_id: paiement.id,
      libelle: echeance.libelle,
      montant: echeance.montant,
      date_echeance: echeance.date_echeance,
      reglee_le: index === 0 && premiereReglee ? echeance.date_echeance : null,
      created_by_profile_id: params.creeParProfileId,
    })),
  )

  /* L'échéancier manquant n'annule pas le paiement déjà écrit : il se recrée à la main depuis la
     page Paiements, alors qu'un encaissement perdu ne se retrouve pas. */
  return { error: erreurEcheances ? `Les frais sont enregistrés, mais l'échéancier n'a pas pu être créé : ${erreurEcheances.message}` : null }
}
