import type { Database } from '../../types/database.types'
import { Etoiles } from '../etudiants/SatisfactionSeance'

type SessionSatisfaction = Database['public']['Tables']['session_satisfaction']['Row']

/* Résultats de l'enquête de satisfaction d'une séance — extrait de DetailSeanceModale.tsx
   (demande client du 2026-09-30 : « le professeur, l'étudiant et l'admin devraient pouvoir voir
   [...] les résultats de l'enquête de satisfaction [...] dans les agendas respectifs ») pour être
   réutilisable par la fiche de séance de CHAQUE espace, pas seulement celle de l'admin qui la
   montrait déjà. Ce que l'appelant reçoit dans `satisfactions` dépend déjà de la RLS (0068) :
   l'admin et le professeur de la séance voient tous les avis, un élève ne voit jamais que le
   sien (`session_satisfaction_student_select`, `student_id = auth.uid()`) — ce composant n'a donc
   besoin d'aucune logique de portée supplémentaire, il affiche tel quel ce qu'on lui donne. */
export function EnqueteSatisfactionAffichage({
  satisfactions,
  /* Nom affiché pour chaque avis — omis côté élève (un seul avis, forcément le sien : « Votre
     avis » suffit, pas besoin de résoudre un nom). Fourni côté admin/professeur pour distinguer
     les élèves d'une séance collective. */
  resoudreNom,
}: {
  satisfactions: SessionSatisfaction[]
  resoudreNom?: (studentId: string) => string
}) {
  if (satisfactions.length === 0) {
    return (
      <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0 }}>
        Aucun avis déposé pour le moment.{!resoudreNom && ' Vous pouvez le donner depuis cette fiche.'}
      </p>
    )
  }

  const moyenne = satisfactions.reduce((total, s) => total + s.note_globale, 0) / satisfactions.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {satisfactions.length > 1 && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--ink-2)' }}>
          Moyenne <Etoiles valeur={Math.round(moyenne)} taille={13} />
          <strong style={{ color: 'var(--accent-gold, #e9cf94)' }}>{Number.isInteger(moyenne) ? moyenne : moyenne.toFixed(1)}/5</strong>
        </span>
      )}
      {satisfactions.map((avis) => (
        <div key={avis.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--ink)' }}>{resoudreNom ? resoudreNom(avis.student_id) : 'Votre avis'}</span>
            <Etoiles valeur={avis.note_globale} taille={13} />
            {avis.note_pedagogie !== null && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Pédagogie {avis.note_pedagogie}/5</span>}
          </div>
          {avis.commentaire && <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{avis.commentaire}</p>}
        </div>
      ))}
    </div>
  )
}
