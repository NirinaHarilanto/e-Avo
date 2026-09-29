/* Téléchargement d'un document (facture, reçu, devis, contrat) en PDF à partir de sa vue
   imprimable. Les deux bibliothèques ne sont chargées qu'au premier clic, jamais au démarrage
   de l'application. */
export async function telechargerPdf(element: HTMLElement, nomFichier: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])

  const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
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
