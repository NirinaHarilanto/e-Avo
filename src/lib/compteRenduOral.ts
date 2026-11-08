import { supabase } from './supabaseClient'
import type { ReponsesDiagnostic } from './diagnostic'

/* Compte rendu du TEST ORAL d'un candidat en cours collectif — demande client du 2026-11-08 :
   « à 5 min de la fin de la session orale [...] l'admin pourra enregistrer les informations sans
   directement convertir en étudiant ». Jusqu'ici ce compte rendu n'existait qu'AU MOMENT de la
   conversion (ConvertirCandidatCollectif) : un oral passé le matin ne laissait aucune trace tant
   que la décision d'inscrire la personne n'était pas prise, et l'admin devait se souvenir de ce
   qui s'était dit.

   Écrire ce compte rendu demande de résoudre un piège : un candidat collectif a DÉJÀ une ligne
   `diagnostic_calls`, créée automatiquement à son inscription au test (api/prospects/inscrire-
   test.ts) avec la note du quiz ÉCRIT et le niveau qu'elle donne. Reprendre « le dernier
   diagnostic du prospect » écraserait donc ce bilan et son niveau — or le quiz écrit est affiché
   tel quel dans la fiche du prospect (BlocResultatQuiz) et reste la trace de ce qu'il a
   réellement répondu, indicative mais jamais réécrite.

   Les deux lignes coexistent donc, distinguées comme le fait déjà la migration 0118 : celle du
   quiz commence toujours par le préfixe ci-dessous (lib/quiz.ts). Ce module est le point unique
   qui applique cette distinction — la saisie des résultats de session ET la conversion passent
   par lui, ce qui garantit qu'une conversion suivant un compte rendu déjà enregistré complète la
   MÊME ligne au lieu d'en créer une seconde, qui ferait diverger les écrans selon qu'ils lisent
   la plus récente ou la première. */

/** Début du bilan rédigé automatiquement par le quiz écrit (lib/quiz.ts) — jamais celui de l'oral. */
export const PREFIXE_BILAN_QUIZ = 'Test de positionnement écrit :'

export interface CompteRenduOral {
  etablissementId: string
  prospectId: string
  meneParProfileId: string
  niveau: string | null
  /* Trame structurée (sectionsCollectif) — absente quand l'appelant ne saisit que du texte
     libre, comme la fenêtre de conversion : ne rien passer laisse intactes les réponses déjà
     enregistrées lors de la session, au lieu de les remplacer par un objet vide. */
  reponses?: ReponsesDiagnostic
  /* Idem pour les notes libres : `undefined` ne touche pas à l'existant. */
  notes?: string | null
}

/**
 * Enregistre le compte rendu de l'oral sur la ligne `diagnostic_calls` de l'oral — celle qui
 * existe déjà si l'admin a saisi les résultats de la session, créée sinon. Ne touche jamais au
 * bilan du quiz écrit.
 */
export async function enregistrerCompteRenduOral(compteRendu: CompteRenduOral): Promise<{ error: string | null }> {
  const { data: existants, error: erreurLecture } = await supabase
    .from('diagnostic_calls')
    .select('id, notes')
    .eq('prospect_id', compteRendu.prospectId)
    .order('date_appel', { ascending: false })
  if (erreurLecture) return { error: erreurLecture.message }

  const ligneOral = (existants ?? []).find((d) => !(d.notes ?? '').startsWith(PREFIXE_BILAN_QUIZ))

  if (ligneOral) {
    const { error } = await supabase
      .from('diagnostic_calls')
      .update({
        niveau_evalue: compteRendu.niveau,
        ...(compteRendu.reponses ? { reponses: compteRendu.reponses } : {}),
        ...(compteRendu.notes !== undefined ? { notes: compteRendu.notes } : {}),
      })
      .eq('id', ligneOral.id)
    return { error: error?.message ?? null }
  }

  const { error } = await supabase.from('diagnostic_calls').insert({
    etablissement_id: compteRendu.etablissementId,
    prospect_id: compteRendu.prospectId,
    mene_par: compteRendu.meneParProfileId,
    date_appel: new Date().toISOString(),
    niveau_evalue: compteRendu.niveau,
    reponses: compteRendu.reponses ?? {},
    notes: compteRendu.notes ?? null,
  })
  return { error: error?.message ?? null }
}

/** Les réponses déjà enregistrées pour l'oral d'un candidat, pour rouvrir la saisie dessus. */
export async function lireCompteRenduOral(
  prospectId: string,
): Promise<{ reponses: ReponsesDiagnostic; niveau: string | null } | null> {
  const { data } = await supabase
    .from('diagnostic_calls')
    .select('notes, reponses, niveau_evalue')
    .eq('prospect_id', prospectId)
    .order('date_appel', { ascending: false })
  const ligneOral = (data ?? []).find((d) => !(d.notes ?? '').startsWith(PREFIXE_BILAN_QUIZ))
  if (!ligneOral) return null
  return { reponses: (ligneOral.reponses ?? {}) as ReponsesDiagnostic, niveau: ligneOral.niveau_evalue }
}
