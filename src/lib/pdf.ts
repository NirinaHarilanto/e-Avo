/* Téléchargement d'un document (facture, reçu, devis, contrat) en PDF à partir de sa vue
   imprimable. Les deux bibliothèques ne sont chargées qu'au premier clic, jamais au démarrage
   de l'application. */
export async function telechargerPdf(element: HTMLElement, nomFichier: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])

  /* html2canvas ne connaît pas la propriété CSS `zoom` : or <body> porte un `zoom` (0.9 sur la
     vitrine, 0.82 puis 0.74 dans les espaces connectés, voir index.css). Le navigateur mesure les
     textes à l'échelle réduite, html2canvas les redessine à pleine échelle dans des boîtes
     restées réduites — lettres et colonnes se chevauchent (signalé par le client le 2026-09-29 :
     « les informations sont illisibles et se superposent » sur reçus et factures téléchargés).
     La capture travaille sur un CLONE du document : on y neutralise le zoom (`!important`, pour
     passer devant les règles `body.echelle-*`), l'aperçu affiché à l'écran n'est pas touché. */
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    onclone: (documentClone) => {
      documentClone.body.style.setProperty('zoom', '1', 'important')
      documentClone.documentElement.style.setProperty('zoom', '1', 'important')
    },
  })
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const marge = 10
  const largeurPage = pdf.internal.pageSize.getWidth() - marge * 2
  const hauteurPage = pdf.internal.pageSize.getHeight() - marge * 2

  // Découpe l'image en tranches d'une page A4 pour qu'un long contrat tienne sur plusieurs pages.
  const pixelsParMm = canvas.width / largeurPage
  const hauteurTranchePx = Math.floor(hauteurPage * pixelsParMm)
  let y = 0
  let premiere = true
  while (y < canvas.height) {
    const hauteur = Math.min(hauteurTranchePx, canvas.height - y)
    const tranche = document.createElement('canvas')
    tranche.width = canvas.width
    tranche.height = hauteur
    tranche.getContext('2d')?.drawImage(canvas, 0, y, canvas.width, hauteur, 0, 0, canvas.width, hauteur)
    if (!premiere) pdf.addPage()
    pdf.addImage(tranche.toDataURL('image/jpeg', 0.92), 'JPEG', marge, marge, largeurPage, hauteur / pixelsParMm)
    premiere = false
    y += hauteur
  }

  pdf.save(`${nomFichier.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`)
}
