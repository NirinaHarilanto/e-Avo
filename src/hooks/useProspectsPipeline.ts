import { supabase } from '../lib/supabaseClient'
import type { Database, ProspectStatut } from '../types/database.types'
import { useCacheRequete } from './useCacheRequete'

type Prospect = Database['public']['Tables']['prospects']['Row']
type DiagnosticCall = Database['public']['Tables']['diagnostic_calls']['Row']
type RendezVous = Database['public']['Tables']['rendez_vous']['Row']
type TestPositionnement = Database['public']['Tables']['test_positionnement_inscriptions']['Row']
type StudentPayment = Database['public']['Tables']['student_payments']['Row']

export interface ProspectAvecDiagnostic extends Prospect {
  diagnostic: DiagnosticCall | null
  /* Rendez-vous le plus récent réservé par ce prospect depuis la page publique (voir
     api/prospects/reserver.ts) — distinct de `diagnostic`, qui ne représente que la note prise
     par l'admin APRÈS l'appel. Un prospect qui a réservé lui-même a un rendez-vous mais pas
     encore de `diagnostic_calls` : avant ce champ, la fiche affichait alors le texte figé
     « Réservé via Calendly », devenu faux depuis que la réservation se fait dans l'application
     elle-même (demande client du 2026-09-16 : « la vraie date, l'heure, le lien Meet et le
     statut de validation »). */
  rendezVous: RendezVous | null
  /* Candidature au test oral d'une vague, pour les prospects venus par le parcours collectif
     (0051) : note au questionnaire écrit, niveau estimé et bilan généré automatiquement. */
  testPositionnement: TestPositionnement | null
  /* Nom complet du partenaire DUO (0054), résolu depuis duo_partenaire_id — évite à chaque carte
     d'aller chercher elle-même le prospect lié pour un simple affichage. */
  duoPartenaireNom: string | null
  /* Paiement du forfait choisi encaissé avant la conversion (0056). `null` tant que l'admin n'a
     rien enregistré — c'est précisément ce qui bloque le bouton « Convertir en étudiant ». */
  paiement: StudentPayment | null
}

export const COLONNES_PIPELINE: { statut: ProspectStatut; titre: string }[] = [
  { statut: 'prospect', titre: 'Nouveaux prospects' },
  { statut: 'diagnostic_planifie', titre: 'Appel diagnostic planifié' },
  { statut: 'diagnostic_fait', titre: 'Diagnostic réalisé' },
  { statut: 'etudiant', titre: 'Étudiant' },
]

export function useProspectsPipeline() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('prospects-pipeline', async () => {
    const [
      { data: prospectsData, error: prospectsError },
      { data: diagnosticsData, error: diagnosticsError },
      { data: rendezVousData, error: rendezVousError },
      { data: testsData },
      { count: totalConvertis },
      { data: paiementsData },
    ] = await Promise.all([
      // Un prospect converti quitte définitivement ce tableau — demande client du 2026-09-21 :
      // il vit désormais dans l'espace Étudiants, avec les informations recueillies pendant la
      // phase prospect (téléphone copié, diagnostic visible dans son dossier via prospect_id).
      // Le garder ici ne ferait que dupliquer un dossier déjà ouvert ailleurs.
      supabase.from('prospects').select('*').neq('statut', 'etudiant').order('created_at', { ascending: false }),
      supabase.from('diagnostic_calls').select('*').order('created_at', { ascending: false }),
      supabase.from('rendez_vous').select('*').order('debut', { ascending: false }),
      supabase.from('test_positionnement_inscriptions').select('*').order('created_at', { ascending: false }),
      // Comptage séparé : le taux de conversion doit rester juste même si les dossiers déjà
      // convertis ne sont plus renvoyés par la requête ci-dessus.
      supabase.from('prospects').select('id', { count: 'exact', head: true }).eq('statut', 'etudiant'),
      // Paiements de forfait encaissés à l'étape prospect (0056). `supprime_le is null` : une
      // ligne supprimée en douceur ne doit pas continuer à débloquer la conversion.
      supabase
        .from('student_payments')
        .select('*')
        .not('prospect_id', 'is', null)
        .is('supprime_le', null)
        .order('created_at', { ascending: false }),
    ])
    if (prospectsError || diagnosticsError || rendezVousError) {
      throw new Error((prospectsError ?? diagnosticsError ?? rendezVousError)?.message ?? 'Erreur de chargement.')
    }

    const diagnosticParProspect = new Map<string, DiagnosticCall>()
    for (const diagnostic of diagnosticsData ?? []) {
      if (!diagnosticParProspect.has(diagnostic.prospect_id)) {
        diagnosticParProspect.set(diagnostic.prospect_id, diagnostic)
      }
    }
    const rendezVousParProspect = new Map<string, RendezVous>()
    for (const rdv of rendezVousData ?? []) {
      if (!rendezVousParProspect.has(rdv.prospect_id)) {
        rendezVousParProspect.set(rdv.prospect_id, rdv)
      }
    }

    const testParProspect = new Map<string, TestPositionnement>()
    for (const test of testsData ?? []) {
      if (!testParProspect.has(test.prospect_id)) {
        testParProspect.set(test.prospect_id, test)
      }
    }

    // Le partenaire d'un binôme DUO reste, tant qu'il n'est pas converti, dans ce même tableau
    // `prospectsData` : pas besoin d'une requête séparée pour résoudre son nom.
    const nomParProspect = new Map((prospectsData ?? []).map((p) => [p.id, `${p.prenom} ${p.nom}`]))

    const paiementParProspect = new Map<string, StudentPayment>()
    for (const paiement of paiementsData ?? []) {
      if (paiement.prospect_id && !paiementParProspect.has(paiement.prospect_id)) {
        paiementParProspect.set(paiement.prospect_id, paiement)
      }
    }

    const prospects = (prospectsData ?? []).map((prospect): ProspectAvecDiagnostic => ({
      ...prospect,
      diagnostic: diagnosticParProspect.get(prospect.id) ?? null,
      rendezVous: rendezVousParProspect.get(prospect.id) ?? null,
      testPositionnement: testParProspect.get(prospect.id) ?? null,
      duoPartenaireNom: prospect.duo_partenaire_id ? (nomParProspect.get(prospect.duo_partenaire_id) ?? null) : null,
      paiement: paiementParProspect.get(prospect.id) ?? null,
    }))

    return { prospects, totalConvertis: totalConvertis ?? 0 }
  })

  return { prospects: valeur?.prospects ?? [], totalConvertis: valeur?.totalConvertis ?? 0, loading, erreur, recharger }
}
