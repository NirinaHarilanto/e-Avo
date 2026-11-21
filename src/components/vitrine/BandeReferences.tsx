/* « Ils ont formé leurs équipes avec Hari Online Club » — bande de références en bas de la page
   À propos, demandée par le client le 2026-11-21 avec une maquette et la liste des six sociétés.

   Les logos sont servis depuis `public/references/`, et non chargés depuis les sites d'origine :
   un logo distant disparaît le jour où son propriétaire refait son site, et chaque visite de la
   page irait sonner chez six serveurs tiers, en leur signalant au passage qui consulte la
   vitrine. Ils ont été normalisés à une hauteur commune pour qu'aucun ne paraisse deux fois plus
   gros que son voisin — voir le commentaire de chaque entrée pour ce qu'il a fallu reprendre.

   Les logos ne sont PAS cliquables : la maquette ne les montre pas ainsi, et six liens sortants
   en bas de page feraient partir le visiteur juste au moment où on lui demande de rester. */

interface Reference {
  nom: string
  fichier: string
  /* Largeur maximale, en pixels de rendu. Les logos n'ont pas la même géométrie : « concentrix »
     est un mot long et bas, « SOLIDIS » un carré. À hauteur égale, le premier écraserait les
     autres ; on le borne donc par sa largeur. */
  largeurMax: number
}

const REFERENCES: Reference[] = [
  // Diffusé uniquement en blanc sur transparent : ses pixels ont été inversés pour la bande claire.
  { nom: 'Tana Boutique Hotel', fichier: 'tana.png', largeurMax: 158 },
  { nom: 'Carrefour', fichier: 'carrefour.svg', largeurMax: 152 },
  // Blanc sur transparent lui aussi ; le lettrage a été recoloré de leur bleu de marque, l'accent turquoise conservé.
  { nom: 'Concentrix', fichier: 'concentrix.png', largeurMax: 196 },
  { nom: 'L.O.I Confection', fichier: 'loi.png', largeurMax: 78 },
  { nom: 'Foundever', fichier: 'foundever.svg', largeurMax: 176 },
  // Livré en portrait avec de larges marges blanches : rendues transparentes, puis recadré.
  { nom: 'Solidis', fichier: 'solidis.png', largeurMax: 58 },
]

export function BandeReferences({ dossierAssets }: { dossierAssets: string }) {
  return (
    <section className="light refs" aria-labelledby="refs-titre">
      <div className="wrap reveal">
        <h2 className="h-l rv" id="refs-titre">
          Ils ont formé leurs équipes avec <span className="refs-marque">Hari Online Club</span>
        </h2>

        <ul className="refs-bande rv">
          {REFERENCES.map((reference) => (
            <li key={reference.fichier}>
              <img
                src={`${dossierAssets}/references/${reference.fichier}`}
                alt={reference.nom}
                title={reference.nom}
                loading="lazy"
                style={{ maxWidth: reference.largeurMax }}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
