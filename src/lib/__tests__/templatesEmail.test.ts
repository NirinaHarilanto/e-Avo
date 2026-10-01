import { describe, expect, it } from 'vitest'
import { corpsEnHtml, preparerEmail } from '../templatesEmail'

/* La règle qui compte ici : un e-mail ne doit JAMAIS partir avec un « {{lien_drive}} » en clair ni
   avec une ligne qui promet un lien absent (« - Dossier Drive : »). C'est ce qui autorise les
   envois automatiques (demande client du 2026-10-01) sans relecture humaine. */
describe('preparerEmail', () => {
  it('remplace les variables connues dans l’objet et le corps', () => {
    const r = preparerEmail(
      { objet: 'Bienvenue {{prenom}}', corps: 'Bonjour {{prenom}},\n\nVotre formateur : {{nom_formateur}}.' },
      { prenom: 'Sandra', nom_formateur: 'Alice Martin' },
    )
    expect(r.objet).toBe('Bienvenue Sandra')
    expect(r.corps).toContain('Bonjour Sandra,')
    expect(r.corps).toContain('Votre formateur : Alice Martin.')
    expect(r.manquantes).toEqual([])
  })

  it('retire la ligne de liste dont la valeur manque, sans toucher aux autres', () => {
    const r = preparerEmail(
      {
        objet: 'Accès',
        corps: 'VOS ACCÈS\n- Dossier Drive : {{lien_drive}}\n- Feuille d’émargement : {{lien_emargement}}\n- Les cours ont lieu sur Google Meet.',
      },
      { lien_emargement: 'https://exemple.test/emargement' },
    )
    expect(r.corps).not.toContain('Dossier Drive')
    expect(r.corps).not.toContain('{{')
    expect(r.corps).toContain('Feuille d’émargement : https://exemple.test/emargement')
    expect(r.corps).toContain('Les cours ont lieu sur Google Meet.')
    expect(r.lignesRetirees).toHaveLength(1)
    expect(r.manquantes).toEqual([])
  })

  it('ne coupe pas une phrase dont une variable au milieu manque, et le signale', () => {
    const r = preparerEmail(
      { objet: 'Suivi', corps: 'Vous avez fait de beaux progrès, notamment {{point_fort}}.' },
      {},
    )
    // La phrase reste (on préfère un blanc à une phrase supprimée), mais l'appelant est averti.
    expect(r.corps).toContain('Vous avez fait de beaux progrès, notamment')
    expect(r.corps).not.toContain('{{point_fort}}')
    expect(r.manquantes).toEqual(['point_fort'])
    expect(r.lignesRetirees).toEqual([])
  })

  it('traite une valeur vide ou faite d’espaces comme manquante', () => {
    const r = preparerEmail(
      { objet: 'x', corps: '- Orange Money : {{orange_money}}\n- Mvola : {{mvola}}' },
      { orange_money: '   ', mvola: null },
    )
    expect(r.corps.trim()).toBe('')
    expect(r.lignesRetirees).toHaveLength(2)
  })

  it('signale une variable manquante restée dans l’objet', () => {
    const r = preparerEmail({ objet: 'Votre séance du {{date_seance}}', corps: 'Bonjour.' }, {})
    expect(r.manquantes).toEqual(['date_seance'])
  })

  it('ne laisse pas un trou de trois lignes quand une ligne tombe au milieu d’un bloc', () => {
    const r = preparerEmail(
      { objet: 'x', corps: 'Avant\n\n- Lien : {{absent}}\n\nAprès' },
      {},
    )
    expect(r.corps).not.toMatch(/\n{3,}/)
    expect(r.corps).toContain('Avant')
    expect(r.corps).toContain('Après')
  })

  it('garde une ligne de liste sans variable, même voisine d’une ligne retirée', () => {
    const r = preparerEmail(
      { objet: 'x', corps: '- Groupe WhatsApp : {{lien_whatsapp}}\n- Les places sont limitées à 7 personnes.' },
      {},
    )
    expect(r.corps).toContain('Les places sont limitées à 7 personnes.')
    expect(r.corps).not.toContain('WhatsApp')
  })
})

describe('corpsEnHtml', () => {
  it('met les intertitres en majuscules en valeur et indente les listes', () => {
    const html = corpsEnHtml('VOTRE FORMATION\n- Formateur : Alice\nTexte normal.')
    expect(html).toContain('font-weight:700')
    expect(html).toContain('margin:2px 0 2px 14px')
    expect(html).toContain('Texte normal.')
  })

  it('échappe le HTML du contenu', () => {
    expect(corpsEnHtml('Tarif <b>spécial</b> & remise')).toContain('&lt;b&gt;')
    expect(corpsEnHtml('Tarif <b>spécial</b> & remise')).toContain('&amp;')
  })
})
