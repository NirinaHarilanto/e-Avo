import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { PAGES_VITRINE, baliseSeo, planDuSite } from './src/lib/seoVitrine.js'

/* Une page HTML par adresse publique — brief SEO du client du 2026-10-30.
 *
 * Vite ne produit qu'un `index.html`, servi tel quel pour les six adresses de la vitrine : tous
 * les robots y lisaient donc le même titre et la même description. Ce plugin recopie ce fichier
 * autant de fois qu'il y a de pages, en remplaçant à chaque fois le bloc `<title>` + description
 * par celui de la page (voir src/lib/seoVitrine.ts), et `vercel.json` renvoie chaque route vers
 * son fichier.
 *
 * Volontairement un post-traitement, et non une entrée multiple de Rollup : le corps reste
 * identique partout (c'est React qui le remplit), seul l'en-tête change. Multiplier les points
 * d'entrée aurait multiplié les bundles pour rien.
 *
 * ATTENTION au couplage avec `vercel.json` (qui, étant du JSON, ne peut pas porter ce
 * commentaire) : chaque page listée ici a sa réécriture nommée, et TOUTES doivent rester AVANT la
 * réécriture attrape-tout `/((?!api/).*)` vers `/index.html`. Vercel applique la première règle
 * qui correspond : placée avant, l'attrape-tout renverrait tout le monde sur l'accueil et chaque
 * page retrouverait le titre de l'accueil. Ajouter une page publique = l'ajouter aux deux
 * endroits.
 *
 * Il s'exécute sur `writeBundle`, pas `closeBundle` : à cet instant `index.html` est écrit sur le
 * disque avec ses balises `<script>` définitives (hachage des bundles compris), ce qui permet de
 * le recopier sans rien reconstruire. */
function seoPagesVitrine(): Plugin {
  return {
    name: 'hoc-seo-pages-vitrine',
    apply: 'build',
    async writeBundle(options) {
      const dossier = options.dir ?? 'dist'
      const source = join(dossier, 'index.html')
      const html = await readFile(source, 'utf8')

      /* Le gabarit porte déjà un `<title>` et une `<meta name="description">` (index.html, à la
         racine du dépôt). Les retirer d'abord, sinon chaque page en aurait deux et le robot
         retiendrait la première — celle du gabarit, identique partout, c'est-à-dire le défaut
         qu'on corrige. */
      const sansSeo = html
        .replace(/[ \t]*<title>[\s\S]*?<\/title>\r?\n?/i, '')
        .replace(/[ \t]*<meta\s+name="description"[\s\S]*?\/>\r?\n?/i, '')

      for (const page of PAGES_VITRINE) {
        const avecSeo = sansSeo.replace('</head>', `  ${baliseSeo(page)}\n  </head>`)
        await writeFile(join(dossier, page.fichier), avecSeo, 'utf8')
      }

      /* Le plan du site, écrit ici plutôt que posé en fichier statique dans `public/` : la date de
         dernière modification doit suivre les déploiements, et un fichier figé l'aurait affichée
         fausse dès la première mise en ligne suivante. */
      await writeFile(join(dossier, 'sitemap.xml'), planDuSite(), 'utf8')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), seoPagesVitrine()],
})
