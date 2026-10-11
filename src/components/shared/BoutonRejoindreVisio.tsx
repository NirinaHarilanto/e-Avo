import { libelleFournisseur } from '../../lib/visio'

/* Bouton de visioconférence unifié — demande client du 2026-10-11 : « mets le bouton Google Meet
   ou Jitsi selon le cas, précise si c'est Google Meet ou Jitsi ». Remplace les liens ad hoc
   (« Rejoindre », « Ouvrir le lien de visioconférence », « Lien de visioconférence ») qui ne
   disaient jamais lequel des deux services allait s'ouvrir, et étaient chacun stylés séparément
   dans FicheEvenementGoogle.tsx, DetailSeanceModale.tsx, CalendrierProfesseur.tsx,
   AgendaEtudiant.tsx et PopupEvenementAdmin.tsx. */
export function BoutonRejoindreVisio({
  lien,
  fournisseur,
  // 'primaire' : grand bouton plein, pour une fiche à l'action unique (agenda de l'élève).
  // 'secondaire' : petit bouton bordé, à côté d'autres actions (listes et fiches admin/professeur).
  variante = 'secondaire',
}: {
  lien: string
  fournisseur: 'jitsi' | 'google_meet'
  variante?: 'primaire' | 'secondaire'
}) {
  const libelle = `Rejoindre via ${libelleFournisseur(fournisseur)}`

  if (variante === 'primaire') {
    return (
      <a
        href={lien}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-shine"
        style={{ textAlign: 'center', padding: '11px 18px', background: 'var(--accent-blue-gradient)', color: '#fff', fontSize: 13, fontWeight: 700 }}
      >
        {libelle}
      </a>
    )
  }

  return (
    <a href={lien} target="_blank" rel="noopener noreferrer" className="btn-shine btn-secondary" style={{ fontSize: 12.5, padding: '9px 16px' }}>
      {libelle}
    </a>
  )
}
