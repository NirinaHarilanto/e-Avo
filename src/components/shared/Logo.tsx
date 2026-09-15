/* Logo Hari Online Club, réutilisé dans tous les en-têtes. La version blanche du fichier
   source (encre violette détourée puis recolorée) est la seule lisible sur le fond marine
   du thème ; la version violette `/logo-hoc.png` reste disponible pour les fonds clairs
   (documents imprimables). `taille` est la hauteur rendue, en pixels. */
export function Logo({ taille = 48 }: { taille?: number }) {
  return (
    <img
      src="/logo-hoc-blanc.png"
      alt="Hari Online Club"
      style={{
        height: taille,
        width: 'auto',
        display: 'block',
        filter: 'drop-shadow(0 0 12px rgba(199,156,255,.45))',
      }}
    />
  )
}
