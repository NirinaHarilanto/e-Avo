import { describe, expect, it } from 'vitest'
import { indexPartenairesDuo } from '../profilsEtablissement'
import type { Database } from '../../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

function profil(id: string, champs: Partial<Profile> = {}): Profile {
  return { id, status: 'active', duo_partenaire_id: null, ...champs } as Profile
}

/* Le lien DUO est ASYMÉTRIQUE (migration 0054) : seul le membre secondaire porte
   `duo_partenaire_id`. Les deux sens doivent se résoudre, sinon le principal n'affiche pas son
   binôme — c'est précisément ce que les deux requêtes supprimées faisaient en réseau. */
describe('indexPartenairesDuo', () => {
  it('trouve le partenaire désigné depuis le membre secondaire', () => {
    const partenaireDe = indexPartenairesDuo([
      profil('principal'),
      profil('secondaire', { duo_partenaire_id: 'principal' }),
    ])
    expect(partenaireDe('secondaire')?.id).toBe('principal')
  })

  it('trouve le partenaire en sens inverse, depuis le membre principal qui ne porte rien', () => {
    const partenaireDe = indexPartenairesDuo([
      profil('principal'),
      profil('secondaire', { duo_partenaire_id: 'principal' }),
    ])
    expect(partenaireDe('principal')?.id).toBe('secondaire')
  })

  it('ne renvoie rien pour un élève sans binôme', () => {
    const partenaireDe = indexPartenairesDuo([profil('seul'), profil('autre')])
    expect(partenaireDe('seul')).toBeNull()
  })

  it('ignore un partenaire supprimé, dans les deux sens', () => {
    const partenaireDe = indexPartenairesDuo([
      profil('principal', { status: 'suspended' }),
      profil('secondaire', { duo_partenaire_id: 'principal' }),
      profil('principal2'),
      profil('secondaire2', { duo_partenaire_id: 'principal2', status: 'suspended' }),
    ])
    expect(partenaireDe('secondaire')).toBeNull()
    expect(partenaireDe('principal2')).toBeNull()
  })

  it('ne renvoie rien pour un identifiant inconnu', () => {
    const partenaireDe = indexPartenairesDuo([profil('a')])
    expect(partenaireDe('fantome')).toBeNull()
  })

  it('tolère un `duo_partenaire_id` qui pointe vers un profil absent de la liste', () => {
    const partenaireDe = indexPartenairesDuo([profil('secondaire', { duo_partenaire_id: 'hors-liste' })])
    expect(partenaireDe('secondaire')).toBeNull()
  })
})
