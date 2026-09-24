import type { Database } from '../types/database.types'

type DiagnosticCall = Database['public']['Tables']['diagnostic_calls']['Row']
type NiveauEvaluation = Database['public']['Tables']['niveau_evaluations']['Row']

/* Niveau « définitif » d'un étudiant, à afficher IDENTIQUE partout dans l'app (dossier étudiant,
   Cours collectifs…) — demande client du 2026-09-24, suite à un niveau incohérent entre les deux
   pages pour un même élève : « le niveau définitif ... est celui déterminé par l'admin
   manuellement après le test oral ».

   Priorité : la dernière réévaluation de progression (`niveau_evaluations`, ajoutée à la main par
   l'admin depuis le dossier — HistoriqueNiveauModale.tsx) si elle existe, sinon le niveau que
   l'admin a lui-même arrêté à l'appel diagnostic ou au test oral (`diagnostic_calls.niveau_evalue`
   — voir CreneauxTestVague.tsx). JAMAIS l'estimation automatique du quiz écrit
   (`test_positionnement_inscriptions.niveau_estime`) : purement indicative avant l'oral, elle
   n'est ni saisie ni validée par l'admin et ne doit pas se faire passer pour le niveau retenu. */
export function niveauDefinitif(
  diagnostic: Pick<DiagnosticCall, 'niveau_evalue'> | null | undefined,
  reevaluations: Pick<NiveauEvaluation, 'niveau'>[] | null | undefined,
): string | null {
  return reevaluations?.[reevaluations.length - 1]?.niveau ?? diagnostic?.niveau_evalue ?? null
}
