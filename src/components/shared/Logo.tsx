/* Logo Hari Online Club, réutilisé dans tous les en-têtes. La version blanche du fichier
   source (encre violette détourée puis recolorée) est la seule lisible sur le fond marine
   du thème ; la version violette `/logo-hoc.png` reste disponible pour les fonds clairs
   (documents imprimables). `taille` est la hauteur rendue, en pixels. */
/* `fond` dit sur quoi le logo est posé, pas de quelle couleur il est : le fichier blanc disparaît
   sur un fond clair, et le fichier sombre sur un fond foncé. Les espaces connectés restent en
   thème sombre, d'où la valeur par défaut ; la page de connexion est passée en clair le
   2026-10-08 et demande donc `fond="clair"`. */
export function Logo({ taille = 48, fond = 'sombre' }: { taille?: number; fond?: 'sombre' | 'clair' }) {
  const clair = fond === 'clair'
  return (
    <img
      src={clair ? '/logo-hoc.png' : '/logo-hoc-blanc.png'}
      alt="Hari Online Club"
      style={{
        height: taille,
        width: 'auto',
        display: 'block',
        filter: clair ? 'none' : 'drop-shadow(0 0 12px rgba(199,156,255,.45))',
      }}
    />
  )
}
