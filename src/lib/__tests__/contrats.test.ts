import { describe, expect, it } from 'vitest'
import { deduireSource, preparerVariables } from '../contrats'
import type { Database } from '../../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Etablissement = Database['public']['Tables']['etablissements']['Row']

const etudiant: Profile = {
  id: 'p1',
  etablissement_id: 'e1',
  prospect_id: null,
  role: 'etudiant',
  status: 'approved',
  nom: 'Rakoto',
  prenom: 'Miora',
  email: 'miora@example.mg',
  telephone: '+261 34 00 000 00',
  adresse: 'Lot II M 12, Antananarivo',
  taux_horaire: null,
  created_at: '2026-01-01T00:00:00Z',
}

const etablissement: Etablissement = {
  id: 'e1',
  nom: 'Hari Online Club',
  slug: 'hari-online-club',
  specialite: 'Langues',
  couleur_accent: null,
  logo_url: null,
  calendly_url: null,
  created_at: '2026-01-01T00:00:00Z',
}

/* Les libellés ci-dessous sont ceux du modèle réellement utilisé par l'établissement : ils ne
   suivent aucune convention de nommage, ce qui avait mis en échec une première version du
   pré-remplissage fondée sur la seule clé de la variable. */
describe('deduireSource', () => {
  it('reconnaît les champs de la personne concernée', () => {
    expect(deduireSource('nom_complet_etudiant', "Nom complet de l'étudiant")).toBe('nom_complet')
    expect(deduireSource('adresse_etudiant', "Adresse de l'étudiant")).toBe('adresse')
    expect(deduireSource('email_professeur', 'E-mail du professeur')).toBe('email')
    expect(deduireSource('tel', 'Téléphone du professeur')).toBe('telephone')
  })

  it('accepte une clé nue, qui ne peut désigner que la partie au contrat', () => {
    expect(deduireSource('adresse', 'Adresse')).toBe('adresse')
    expect(deduireSource('nom', 'Nom')).toBe('nom')
  })

  it("n'attribue pas les données du destinataire à un tiers nommé", () => {
    expect(deduireSource('nom_mediateur', 'Nom du médiateur de la consommation')).toBeUndefined()
    expect(deduireSource('coordonnees_mediateur', 'Coordonnées du médiateur (adresse ou site web)')).toBeUndefined()
    expect(
      deduireSource('mention_mineur', "Si l'étudiant est mineur, coller : « Représenté(e) par [Nom], en qualité de représentant légal, qui consent à la présente inscription »"),
    ).toBeUndefined()
  })

  it('distingue la date de signature des autres dates du contrat', () => {
    expect(deduireSource('date_signature', 'Date de signature')).toBe('date_du_jour')
    expect(deduireSource('date_naissance_etudiant', "Date de naissance de l'étudiant")).toBeUndefined()
    expect(deduireSource('date_debut', 'Date de début des cours')).toBeUndefined()
    expect(deduireSource('ville_signature', 'Ville de signature')).toBeUndefined()
  })

  it("rattache les champs d'établissement à l'établissement", () => {
    expect(deduireSource('nom_etablissement', "Nom de l'établissement")).toBe('etablissement_nom')
  })
})

describe('preparerVariables', () => {
  const corps = 'Entre {{nom_etablissement}} et {{nom_complet_etudiant}}, domicilié {{adresse_etudiant}}, né le {{date_naissance_etudiant}}. Modalités : {{modalites_paiement}}.'
  const declarees = [
    { cle: 'nom_etablissement', label: "Nom de l'établissement" },
    { cle: 'nom_complet_etudiant', label: "Nom complet de l'étudiant" },
    { cle: 'adresse_etudiant', label: "Adresse de l'étudiant" },
    { cle: 'date_naissance_etudiant', label: "Date de naissance de l'étudiant" },
    { cle: 'modalites_paiement', label: 'Modalités de paiement' },
  ]

  it('remplit seules les variables adossées à une fiche, sans paramétrage du modèle', () => {
    const resolues = preparerVariables(corps, declarees, etudiant, etablissement)
    const parCle = Object.fromEntries(resolues.map((v) => [v.cle, v]))

    expect(parCle.nom_complet_etudiant.valeurAuto).toBe('Miora Rakoto')
    expect(parCle.adresse_etudiant.valeurAuto).toBe('Lot II M 12, Antananarivo')
    expect(parCle.nom_etablissement.valeurAuto).toBe('Hari Online Club')
  })

  it('laisse en saisie ce quaucune fiche ne connaît, avec une valeur courante proposée', () => {
    const resolues = preparerVariables(corps, declarees, etudiant, etablissement)
    const parCle = Object.fromEntries(resolues.map((v) => [v.cle, v]))

    expect(parCle.date_naissance_etudiant.valeurAuto).toBeUndefined()
    expect(parCle.modalites_paiement.valeurAuto).toBeUndefined()
    expect(parCle.modalites_paiement.defaut).toMatch(/paiement/i)
  })

  it('fait primer une source explicite du modèle sur la déduction', () => {
    const resolues = preparerVariables('{{intitule}}', [{ cle: 'intitule', label: 'Intitulé', source: 'prenom' }], etudiant, etablissement)
    expect(resolues[0].valeurAuto).toBe('Miora')
  })

  it("respecte le choix explicite d'une saisie manuelle", () => {
    const resolues = preparerVariables('{{adresse}}', [{ cle: 'adresse', label: 'Adresse', source: 'manuel' }], etudiant, etablissement)
    expect(resolues[0].valeurAuto).toBeUndefined()
  })

  it('retombe sur la saisie quand la donnée est absente de la fiche', () => {
    const resolues = preparerVariables('{{taux_horaire}}', [{ cle: 'taux_horaire', label: 'Taux horaire' }], etudiant, etablissement)
    expect(resolues[0].valeurAuto).toBeUndefined()
  })
})
