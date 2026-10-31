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
  /* Créneau du test ORAL auquel `testPositionnement` candidate — vit sur
     `creneaux_test_positionnement`, pas sur l'inscription elle-même, d'où la résolution à part.
     Affiché dans la fiche du prospect depuis le 2026-10-16 (demande client) : avant, seul
     l'onglet Session orale le montrait, pas le pipeline. `lienVisio` reste `null` tant que la
     génération en tâche de fond (creer-creneau-test.ts) n'a pas abouti, ou si l'établissement
     n'a aucun compte Google connecté — la date, elle, est toujours connue.
     La date et la durée ont rejoint le lien le 2026-10-16 : le test oral a désormais son propre
     bloc dans la fiche (« quand a lieu la séance », pas seulement « par où la rejoindre »), et
     une heure de rendez-vous sans date affichée obligeait l'admin à rouvrir Cours collectifs. */
  creneauTest: { debut: string; dureeMinutes: number; lienVisio: string | null } | null
  /* Nom complet du partenaire DUO (0054), résolu depuis duo_partenaire_id — évite à chaque carte
     d'aller chercher elle-même le prospect lié pour un simple affichage. */
  duoPartenaireNom: string | null
  /* Paiement du forfait choisi encaissé avant la conversion (0056). `null` tant que l'admin n'a
     rien enregistré — c'est précisément ce qui bloque le bouton « Convertir en étudiant ». */
  paiement: StudentPayment | null
  /* Somme des échéances PLANIFIÉES et NON RÉGLÉES sur ce paiement (0070) — signalé par le client
     le 2026-10-31 : sa fiche annonçait « Payé, 1 100 000 Ar réglé sur 1 100 000 Ar » alors qu'une
     échéance de 600 000 Ar restait planifiée et non cochée sur la même ligne. L'échéancier ne se
     lisait que dans la fenêtre de paiement ; il fallait l'ouvrir pour s'apercevoir que le dossier
     se contredisait. 0 quand il n'y a rien de planifié, le cas courant. */
  echeancesNonReglees: number
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
      { data: convertisData },
      { data: profilsSupprimesData },
      { data: paiementsData },
      { data: echeancesData },
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
      // convertis ne sont plus renvoyés par la requête ci-dessus. Les identifiants, et non un
      // simple `count` : il faut pouvoir en retirer les comptes supprimés depuis (voir plus bas),
      // sinon le taux compte comme converties des personnes qui n'existent plus — 21 dossiers sur
      // 22 dans ce cas en production le 2026-10-19.
      supabase.from('prospects').select('id').eq('statut', 'etudiant'),
      supabase.from('profiles').select('prospect_id').eq('status', 'suspended').not('prospect_id', 'is', null),
      // Paiements de forfait encaissés à l'étape prospect (0056). `supprime_le is null` : une
      // ligne supprimée en douceur ne doit pas continuer à débloquer la conversion.
      supabase
        .from('student_payments')
        .select('*')
        .not('prospect_id', 'is', null)
        .is('supprime_le', null)
        .order('created_at', { ascending: false }),
      /* Échéances encore dues, en un seul appel comme tout le reste de ce hook : une requête par
         carte aurait coûté un aller-retour par prospect affiché. */
      supabase.from('paiement_echeances').select('student_payment_id, montant').is('reglee_le', null),
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

    /* Seconde vague, dépendante de `testsData` (ses `creneau_id`) : impossible de la lancer dans
       le Promise.all ci-dessus, qui ne connaît pas encore ces identifiants. */
    const creneauIds = [...new Set((testsData ?? []).map((t) => t.creneau_id))]
    const { data: creneauxData } = creneauIds.length
      ? await supabase
          .from('creneaux_test_positionnement')
          .select('id, lien_visio, debut, duree_minutes')
          .in('id', creneauIds)
      : { data: [] as { id: string; lien_visio: string | null; debut: string; duree_minutes: number }[] }
    const creneauParId = new Map(
      (creneauxData ?? []).map((c) => [c.id, { debut: c.debut, dureeMinutes: c.duree_minutes, lienVisio: c.lien_visio }]),
    )

    // Le partenaire d'un binôme DUO reste, tant qu'il n'est pas converti, dans ce même tableau
    // `prospectsData` : pas besoin d'une requête séparée pour résoudre son nom.
    const nomParProspect = new Map((prospectsData ?? []).map((p) => [p.id, `${p.prenom} ${p.nom}`]))

    const paiementParProspect = new Map<string, StudentPayment>()
    for (const paiement of paiementsData ?? []) {
      if (paiement.prospect_id && !paiementParProspect.has(paiement.prospect_id)) {
        paiementParProspect.set(paiement.prospect_id, paiement)
      }
    }

    const echeancesParPaiement = new Map<string, number>()
    for (const echeance of echeancesData ?? []) {
      echeancesParPaiement.set(
        echeance.student_payment_id,
        (echeancesParPaiement.get(echeance.student_payment_id) ?? 0) + Number(echeance.montant),
      )
    }

    const prospects = (prospectsData ?? [])
      /* Un candidat au collectif qui a TERMINÉ son quiz de positionnement quitte ce tableau —
         demande client du 2026-10-19 : « pour les personnes qui s'inscrivent en cours collectifs
         via le quiz de positionnement, quand le quiz est terminé, il ne faut plus l'afficher dans
         la section prospect de l'espace admin. La personne apparaîtra uniquement dans la section
         cours collectifs. »

         L'existence d'une ligne `test_positionnement_inscriptions` EST la preuve que le quiz est
         terminé : elle n'est créée qu'à la toute fin du questionnaire, une fois les réponses
         corrigées (api/prospects/inscrire-test.ts, « la réservation n'est validée que par le
         quiz »). Un candidat qui abandonne en cours de route n'en a donc aucune, et reste visible
         ici — c'est voulu, il n'est nulle part ailleurs.
         Même raison pour un prospect collectif saisi à la main par l'admin, sans passer par le
         quiz : il n'apparaîtrait dans aucun écran s'il sortait d'ici. */
      .filter((prospect) => !(prospect.type_programme === 'collectif' && testParProspect.has(prospect.id)))
      .map((prospect): ProspectAvecDiagnostic => {
        const testPositionnement = testParProspect.get(prospect.id) ?? null
        return {
          ...prospect,
          diagnostic: diagnosticParProspect.get(prospect.id) ?? null,
          rendezVous: rendezVousParProspect.get(prospect.id) ?? null,
          testPositionnement,
          creneauTest: testPositionnement ? (creneauParId.get(testPositionnement.creneau_id) ?? null) : null,
          duoPartenaireNom: prospect.duo_partenaire_id ? (nomParProspect.get(prospect.duo_partenaire_id) ?? null) : null,
          paiement: paiementParProspect.get(prospect.id) ?? null,
          echeancesNonReglees: (() => {
            const paiement = paiementParProspect.get(prospect.id)
            return paiement ? (echeancesParPaiement.get(paiement.id) ?? 0) : 0
          })(),
        }
      })

    /* Un dossier dont le compte étudiant a été supprimé depuis n'est plus une conversion :
       le compter gonflerait un taux de réussite avec des personnes qui n'apparaissent plus nulle
       part (demande client du 2026-10-19 : une suppression ne doit laisser aucune trace, ni
       bloquante ni comptable). Le prospect lui-même part désormais avec le compte
       (api/admin/supprimer-utilisateur.ts) ; ce filtre couvre ceux d'avant ce correctif. */
    const prospectsFantomes = new Set((profilsSupprimesData ?? []).map((p) => p.prospect_id))
    const totalConvertis = (convertisData ?? []).filter((p) => !prospectsFantomes.has(p.id)).length

    return { prospects, totalConvertis }
    /* Filet de sécurité (couche 3 de la stratégie temps réel du 2026-09-29) : un déplacement de
       carte par glisser-déposer ne crée pas de notification métier (voir PipelineCRM.tsx,
       couche 2), donc pas de rafraîchissement automatique de CE côté-là si un autre admin
       déplace une carte pendant que la page reste ouverte — ce sondage discret couvre l'écart. */
  }, { intervalleSondageMs: 25_000 })

  return { prospects: valeur?.prospects ?? [], totalConvertis: valeur?.totalConvertis ?? 0, loading, erreur, recharger }
}
