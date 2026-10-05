import type { Database } from '../../types/database.types'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

/* Ligne de mentions légales de l'établissement, sous son nom dans l'en-tête des documents
   imprimables (facture/reçu, devis, contrat) — demande client du 2026-10-05 : les informations
   de la section « Profil HOC » doivent être « utilisées sur les factures, devis, reçus, contrats
   qui mentionnent Hari Online Club ».

   Ne montre que ce qui est renseigné, dans cet ordre : un établissement qui n'a encore rempli ni
   NIF ni STAT ne doit pas afficher une ligne à moitié vide ou pleine de tirets. Le CIN de la
   directrice n'apparaît JAMAIS ici (ni nulle part ailleurs sur un document) : c'est une pièce
   d'identité personnelle, pas une information propre à l'établissement — voir la migration 0097. */
export function MentionsEtablissement({ etablissement }: { etablissement: Etablissement | null }) {
  if (!etablissement) return null

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

  return <p style={{ fontSize: 10.5, color: '#777', margin: '2px 0 0', lineHeight: 1.5 }}>{champs.join(' · ')}</p>
}
