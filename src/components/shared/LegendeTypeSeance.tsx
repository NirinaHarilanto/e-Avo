/* Légende des couleurs d'une grille d'agenda (0068, demande client du 2026-09-23) — mêmes teintes
   que `versEvenementSeance`/`versEvenementPrestation` (lib/agendaEvenements.ts) et que le
   vocabulaire de couleur déjà établi ailleurs dans l'application pour Duo/Collectif
   (TagProgramme, EtudiantsAdmin.tsx : or = duo, étendu à violet pour collectif faute d'un
   troisième ton déjà associé).

   Extraite de CalendrierProfesseur.tsx le 2026-10-20 : l'agenda de l'administration montre
   désormais les mêmes prestations corporate / chat & chill que celui du professeur, il doit donc
   porter la même légende — « il faut que les deux agendas soient synchronisés ». */
export function LegendeTypeSeance() {
  const puces: { libelle: string; couleur: string }[] = [
    { libelle: 'Individuel', couleur: 'var(--accent-blue)' },
    { libelle: 'Duo', couleur: 'var(--accent-gold)' },
    { libelle: 'Collectif', couleur: 'var(--accent-violet)' },
    { libelle: 'Corporate / chat & chill', couleur: 'var(--accent-teal)' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {puces.map((puce) => (
        <span key={puce.libelle} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--muted)' }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: puce.couleur, flexShrink: 0 }} />
          {puce.libelle}
        </span>
      ))}
    </div>
  )
}
