import type { Database } from '../../types/database.types'
import { useCinDirectrice } from '../../hooks/useEtablissement'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

/* Mentions légales de l'établissement, sous son nom dans l'en-tête des documents imprimables
   (facture/reçu, devis, contrat) — demande client du 2026-10-05 : les informations de la section
   « Profil HOC » doivent être « utilisées sur les factures, devis, reçus, contrats qui
   mentionnent Hari Online Club ».

   Deux présentations, selon `variante` :
   - 'standard' (contrat) : inchangée depuis la première version — une seule ligne, spécialité et
     « Directrice : Nom » compris, jamais le CIN.
   - 'document-financier' (facture/reçu/devis) : demande client du 2026-10-05, affinée après un
     premier retour — sans la spécialité (« Langues vivantes » n'avait rien à faire sur une
     facture), une information par ligne plutôt que tout sur une seule (plus lisible sur un
     document qu'on imprime), le nom de la directrice SANS l'étiquette « Directrice : » qui le
     précédait, et désormais SUIVI de son CIN. Revient sur la règle initiale « le CIN n'apparaît
     jamais sur un document » : décision explicite du client, qui en a précisé l'usage exact sur
     ces documents-là — voir la vue dédiée `etablissement_cin_directrice` (0099), qui n'ouvre le CIN
     qu'aux personnes authentifiées de l'établissement (jamais à un visiteur anonyme de la page
     vitrine, là où le reste du Profil HOC est public depuis l'origine).

   Dans les deux cas : ne montre que ce qui est renseigné — un établissement qui n'a encore rempli
   ni NIF ni STAT ne doit pas afficher une ligne à moitié vide ou pleine de tirets. */
export function MentionsEtablissement({
  etablissement,
  variante = 'standard',
}: {
  etablissement: Etablissement | null
  variante?: 'standard' | 'document-financier'
}) {
  // Toujours appelé (règle des hooks) — `useCinDirectrice` reste sans effet tant que
  // `etablissementId` est `undefined`, ce qui est le cas pour la variante 'standard'.
  const cin = useCinDirectrice(variante === 'document-financier' ? (etablissement?.id ?? undefined) : undefined)

  if (!etablissement) return null

  const style = { fontSize: 10.5, color: '#777', lineHeight: 1.5 }

  if (variante === 'document-financier') {
    const lignes = [
      etablissement.adresse,
      etablissement.telephone,
      etablissement.email,
      etablissement.site_web,
      etablissement.directrice,
      etablissement.nif ? `NIF ${etablissement.nif}` : null,
      etablissement.stat ? `STAT ${etablissement.stat}` : null,
      cin ? `CIN ${cin}` : null,
    ].filter((v): v is string => Boolean(v?.trim()))

    if (lignes.length === 0) return null

    return (
      <div>
        {lignes.map((ligne, index) => (
          <p key={index} style={{ ...style, margin: index === 0 ? '2px 0 0' : '1px 0 0' }}>
            {ligne}
          </p>
        ))}
      </div>
    )
  }

  const champs = [
    etablissement.adresse,
    etablissement.telephone,
    etablissement.email,
    etablissement.site_web,
    etablissement.directrice ? `Directrice : ${etablissement.directrice}` : null,
    etablissement.nif ? `NIF ${etablissement.nif}` : null,
    etablissement.stat ? `STAT ${etablissement.stat}` : null,
  ].filter((v): v is string => Boolean(v?.trim()))

  if (champs.length === 0) return null

  return <p style={{ ...style, margin: '2px 0 0' }}>{champs.join(' · ')}</p>
}
