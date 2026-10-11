import { describe, expect, it } from 'vitest'
import { resoudreGroupeEtudiant } from '../groupeCollectifEtudiant'

/* Capture client du 2026-10-11 : deux classes d'une même vague, confiées à deux professeurs
   différents, ne doivent jamais afficher le même nom aux élèves des deux groupes — ce qui
   produirait exactement ce qu'on vérifie ici, dans un sens ou dans l'autre. */

function inscription(studentId: string, classeId: string | null): { student_id: string; cohort_class_id: string | null } {
  return { student_id: studentId, cohort_class_id: classeId }
}

describe('resoudreGroupeEtudiant', () => {
  it('résout le professeur depuis la CLASSE de l’élève, pas depuis la promotion entière', () => {
    const toutes = [inscription('moi', 'classe-beginner'), inscription('autre', 'classe-advanced')]
    const resultat = resoudreGroupeEtudiant('moi', inscription('moi', 'classe-beginner'), toutes, 'prof-beginner', 'prof-vague')
    expect(resultat.professeurId).toBe('prof-beginner')
  })

  it('deux classes d’une même vague montrent deux professeurs différents à leurs élèves respectifs', () => {
    const toutes = [inscription('eleve-a', 'classe-1'), inscription('eleve-b', 'classe-2')]
    const pourA = resoudreGroupeEtudiant('eleve-a', inscription('eleve-a', 'classe-1'), toutes, 'prof-1', 'prof-vague')
    const pourB = resoudreGroupeEtudiant('eleve-b', inscription('eleve-b', 'classe-2'), toutes, 'prof-2', 'prof-vague')
    expect(pourA.professeurId).toBe('prof-1')
    expect(pourB.professeurId).toBe('prof-2')
    expect(pourA.professeurId).not.toBe(pourB.professeurId)
  })

  it('retombe sur le professeur de la promotion entière tant qu’il n’y a pas de classe', () => {
    const resultat = resoudreGroupeEtudiant('moi', inscription('moi', null), [inscription('moi', null)], 'prof-classe', 'prof-vague')
    expect(resultat.professeurId).toBe('prof-vague')
  })

  it('rend null plutôt qu’un professeur inventé quand la classe n’en a pas encore', () => {
    const resultat = resoudreGroupeEtudiant('moi', inscription('moi', 'classe-1'), [inscription('moi', 'classe-1')], null, 'prof-vague')
    expect(resultat.professeurId).toBeNull()
  })

  it('limite les camarades à ceux de la MÊME classe, pas toute la promotion', () => {
    const toutes = [inscription('moi', 'classe-1'), inscription('camarade', 'classe-1'), inscription('autre-classe', 'classe-2')]
    const resultat = resoudreGroupeEtudiant('moi', inscription('moi', 'classe-1'), toutes, 'prof-1', 'prof-vague')
    expect(resultat.camaradeIds).toEqual(['camarade'])
  })

  it('étend les camarades à toute la promotion quand elle n’a pas de classes', () => {
    const toutes = [inscription('moi', null), inscription('a', null), inscription('b', null)]
    const resultat = resoudreGroupeEtudiant('moi', inscription('moi', null), toutes, null, 'prof-vague')
    expect(resultat.camaradeIds.sort()).toEqual(['a', 'b'])
  })

  it('ne se compte jamais soi-même parmi ses camarades', () => {
    const toutes = [inscription('moi', 'classe-1')]
    const resultat = resoudreGroupeEtudiant('moi', inscription('moi', 'classe-1'), toutes, 'prof-1', 'prof-vague')
    expect(resultat.camaradeIds).toEqual([])
  })

  it('traite une inscription absente comme sans classe, sans planter', () => {
    const resultat = resoudreGroupeEtudiant('moi', undefined, [], 'prof-classe', 'prof-vague')
    expect(resultat.professeurId).toBe('prof-vague')
    expect(resultat.camaradeIds).toEqual([])
  })
})
