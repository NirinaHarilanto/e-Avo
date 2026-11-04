import { describe, expect, it } from 'vitest'
import { filtreDiagnostic } from '../useDossierEtudiant'

/* Un diagnostic se rattache à UNE personne, par l'une de deux colonnes exclusives depuis 0158 :
   `prospect_id` pour qui vient du pipeline commercial, `student_id` pour un élève créé à la main
   par l'assistant (il n'a aucun prospect derrière lui).

   Le dossier ne cherchait que par `prospect_id`. Conséquence, trouvée en relisant ce chemin après
   avoir branché la saisie du diagnostic dans l'assistant : un diagnostic enregistré pour un élève
   créé à la main partait bien en base, puis restait INVISIBLE partout — le parcours pédagogique
   n'en montrait rien, et l'assistant continuait d'en réclamer un, prêt à en écrire un second à
   chaque passage. Ce fichier garde les deux branches. */

describe('filtreDiagnostic', () => {
  it('cherche sur le prospect ET sur l’élève quand la personne vient du pipeline', () => {
    const filtre = filtreDiagnostic({ id: 'eleve-1', prospect_id: 'prospect-9' })

    // Les deux chemins, parce qu'un élève converti garde son diagnostic sur son prospect d'origine
    // alors qu'une réévaluation ultérieure peut être posée sur lui-même.
    expect(filtre).toContain('student_id.eq.eleve-1')
    expect(filtre).toContain('prospect_id.eq.prospect-9')
  })

  it('ne cherche que sur l’élève quand il n’a aucun prospect', () => {
    const filtre = filtreDiagnostic({ id: 'eleve-2', prospect_id: null })

    expect(filtre).toBe('student_id.eq.eleve-2')
    /* Jamais `prospect_id.eq.null` : PostgREST le comprendrait comme la chaîne « null » et la
       requête ne renverrait rien, ce qui ramènerait exactement le défaut corrigé ici. */
    expect(filtre).not.toContain('prospect_id')
  })
})
