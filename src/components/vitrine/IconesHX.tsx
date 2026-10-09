/* Pictogrammes des maquettes, repris trait pour trait (même `viewBox`, mêmes chemins, mêmes
   épaisseurs). Deux familles : au trait (la plupart) et en aplat (LinkedIn, WhatsApp), d'où le
   `aplat` qui bascule `fill`/`stroke`. */

export type NomIcoHX =
  | 'fleche-diagonale'
  | 'fleche-gauche'
  | 'fleche-droite'
  | 'utilisateur'
  | 'burger'
  | 'globe'
  | 'medaille'
  | 'horloge'
  | 'linkedin'
  | 'enveloppe'
  | 'telephone'
  | 'whatsapp'
  | 'avion'
  | 'document'

const CHEMINS: Record<NomIcoHX, { d: string[]; cercles?: { cx: number; cy: number; r: number }[]; rect?: boolean; aplat?: boolean; epaisseur?: number }> = {
  'fleche-diagonale': { d: ['M7 17 17 7M8 7h9v9'], epaisseur: 2.4 },
  'fleche-gauche': { d: ['M19 12H5M11 6l-6 6 6 6'], epaisseur: 2.4 },
  'fleche-droite': { d: ['M5 12h14M13 6l6 6-6 6'], epaisseur: 2.4 },
  utilisateur: { d: ['M4 21a8 8 0 0 1 16 0'], cercles: [{ cx: 12, cy: 8, r: 4 }], epaisseur: 2.2 },
  burger: { d: ['M4 8h16M4 16h16'], epaisseur: 2.4 },
  globe: { d: ['M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20'], cercles: [{ cx: 12, cy: 12, r: 10 }], epaisseur: 2.2 },
  medaille: { d: ['M8.2 13.3 7 22l5-3 5 3-1.2-8.7'], cercles: [{ cx: 12, cy: 8, r: 6 }], epaisseur: 2.2 },
  horloge: { d: ['M12 6v6l4 2'], cercles: [{ cx: 12, cy: 12, r: 10 }], epaisseur: 2.2 },
  linkedin: {
    d: ['M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.5c0-1.3-.02-3-1.83-3-1.83 0-2.1 1.43-2.1 2.9V21H9z'],
    aplat: true,
  },
  enveloppe: { d: ['m22 7-10 6L2 7'], rect: true, epaisseur: 2.2 },
  telephone: {
    d: ['M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z'],
    epaisseur: 2.2,
  },
  whatsapp: {
    d: ['M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.2 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.3 0 .5l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.6 2.1 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.1.1.6-.1 1.2z'],
    aplat: true,
  },
  avion: { d: ['m22 2-7 20-4-9-9-4z', 'M22 2 11 13'], epaisseur: 2.2 },
  document: { d: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6M12 18v-6M9 15l3-3 3 3'], epaisseur: 2 },
}

export function IcoHX({ nom }: { nom: NomIcoHX }) {
  const forme = CHEMINS[nom]

  if (forme.aplat) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        {forme.d.map((trace) => (
          <path key={trace} d={trace} />
        ))}
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={forme.epaisseur ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {forme.rect && <rect x="2" y="4" width="20" height="16" rx="3" />}
      {forme.cercles?.map((cercle) => (
        <circle key={`${cercle.cx}-${cercle.cy}-${cercle.r}`} cx={cercle.cx} cy={cercle.cy} r={cercle.r} />
      ))}
      {forme.d.map((trace) => (
        <path key={trace} d={trace} />
      ))}
    </svg>
  )
}

/* Flèche diagonale des boutons pilule : toujours dans sa pastille ronde, qui pivote de 45° au
   survol du bouton parent. */
export function FlecheBouton() {
  return (
    <span className="ar">
      <IcoHX nom="fleche-diagonale" />
    </span>
  )
}
