import { describe, expect, it } from 'vitest'
import { PAGES_VITRINE, SITE, baliseSeo, donneesStructureesCours, planDuSite, sansBaliseSeoGabarit } from '../seoVitrine'

/* Brief SEO du client du 2026-10-30. Ce que ces tests tiennent, et qu'aucun écran ne montre :
   le défaut d'origine était SIX pages partageant le même titre et la même description. Une
   régression ici ne se verrait nulle part — ni à l'écran, ni dans les autres tests — et ne se
   rattraperait qu'au prochain audit, des semaines plus tard. */

describe('PAGES_VITRINE', () => {
  it('donne à chaque page un titre et une description qui lui sont propres', () => {
    const titres = PAGES_VITRINE.map((p) => p.titre)
    const descriptions = PAGES_VITRINE.map((p) => p.description)
    expect(new Set(titres).size).toBe(PAGES_VITRINE.length)
    expect(new Set(descriptions).size).toBe(PAGES_VITRINE.length)
  })

  it('écrit un fichier distinct par adresse, la racine gardant index.html', () => {
    const fichiers = PAGES_VITRINE.map((p) => p.fichier)
    expect(new Set(fichiers).size).toBe(PAGES_VITRINE.length)
    expect(PAGES_VITRINE.find((p) => p.chemin === '/')?.fichier).toBe('index.html')
  })

  it('porte le nom officiel dans chaque titre, jamais « CHILLY » (exigence explicite du brief)', () => {
    for (const page of PAGES_VITRINE) {
      expect(page.titre).toContain('Hari Online Club')
      expect(`${page.titre} ${page.description}`.toLowerCase()).not.toContain('chilly')
    }
  })

  it('reprend mot pour mot le titre et la description d’accueil validés par le client', () => {
    const accueil = PAGES_VITRINE.find((p) => p.chemin === '/')!
    expect(accueil.titre).toBe('Cours d’anglais en ligne à Madagascar | Hari Online Club')
    expect(accueil.description).toBe(
      'Découvrez Hari Online Club : des cours d’anglais en ligne individuels, en duo ou en groupe. Développez votre expression orale et gagnez en confiance grâce à un apprentissage axé sur la pratique.',
    )
  })
})

describe('sansBaliseSeoGabarit', () => {
  it('retire le titre et la description du gabarit', () => {
    const html = '<head>\n    <title>Hari Online Club</title>\n    <meta name="description" content="Vieux texte" />\n  </head>'
    const resultat = sansBaliseSeoGabarit(html)
    expect(resultat).not.toContain('<title>')
    expect(resultat).not.toContain('name="description"')
  })

  it('ne touche pas à une balise de vérification qui suit, même citée en commentaire juste avant — incident du 2026-10-30', () => {
    /* Reproduction exacte de l'incident réel : un commentaire HTML nommant `<title>` et
       `<meta name="description">` en prose, suivi de la vraie balise de vérification Search
       Console, elle-même suivie des vraies balises de titre et de description. Avant le
       correctif, le second `.replace` dévorait tout depuis son texte dans le commentaire
       jusqu'au PREMIER `/>` du document — celui de la balise de vérification — l'effaçant avec
       le reste. */
    const html = [
      '<head>',
      '    <!-- Un commentaire qui nomme <title> et <meta name="description"> en passant. -->',
      '    <meta name="google-site-verification" content="abc123" />',
      '    <title>Cours d’anglais en ligne à Madagascar | Hari Online Club</title>',
      '    <meta name="description" content="Vieux texte" />',
      '  </head>',
    ].join('\n')

    const resultat = sansBaliseSeoGabarit(html)

    // Le commentaire reste (on ne le touche pas) : il contient légitimement « <title> » en
    // prose. C'est la VRAIE balise, avec son VRAI contenu, qui doit avoir disparu.
    expect(resultat).toContain('<!-- Un commentaire qui nomme')
    expect(resultat).toContain('<meta name="google-site-verification" content="abc123" />')
    expect(resultat).not.toContain('Cours d’anglais en ligne à Madagascar | Hari Online Club')
    expect(resultat).not.toContain('content="Vieux texte"')
  })

  it('ne retire qu’une seule occurrence de chaque, la première', () => {
    const html = '<title>Un</title><title>Deux</title>'
    expect(sansBaliseSeoGabarit(html)).toBe('<title>Deux</title>')
  })
})

describe('baliseSeo', () => {
  it('pose une adresse canonique absolue, sans barre finale hors racine', () => {
    const accueil = baliseSeo(PAGES_VITRINE.find((p) => p.chemin === '/')!)
    const cours = baliseSeo(PAGES_VITRINE.find((p) => p.chemin === '/cours')!)
    expect(accueil).toContain(`<link rel="canonical" href="${SITE}/" />`)
    expect(cours).toContain(`<link rel="canonical" href="${SITE}/cours" />`)
  })

  it('n’émet qu’un seul titre et qu’une seule description', () => {
    const html = baliseSeo(PAGES_VITRINE[0])
    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html.match(/name="description"/g)).toHaveLength(1)
  })

  it('décrit les trois formats de cours sur la seule page /cours', () => {
    const cours = baliseSeo(PAGES_VITRINE.find((p) => p.chemin === '/cours')!)
    const accueil = baliseSeo(PAGES_VITRINE.find((p) => p.chemin === '/')!)
    expect(cours.match(/application\/ld\+json/g)).toHaveLength(2)
    expect(accueil.match(/application\/ld\+json/g)).toHaveLength(1)
    expect(cours).toContain('"@type":"Course"')
  })

  it('échappe les guillemets pour ne pas casser l’attribut qui les porte', () => {
    const html = baliseSeo({
      chemin: '/essai',
      fichier: 'essai.html',
      titre: 'Un "titre" piégé',
      description: 'Une <description> & un guillemet "ici"',
    })
    expect(html).toContain('content="Une &lt;description&gt; &amp; un guillemet &quot;ici&quot;"')
    expect(html).toContain('<title>Un &quot;titre&quot; piégé</title>')
  })

  it('produit un JSON-LD réellement analysable', () => {
    const html = baliseSeo(PAGES_VITRINE.find((p) => p.chemin === '/cours')!)
    const blocs = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => m[1])
    expect(blocs).toHaveLength(2)
    for (const bloc of blocs) expect(() => JSON.parse(bloc)).not.toThrow()
    expect(JSON.parse(blocs[0])['@type']).toBe('EducationalOrganization')
  })
})

describe('donneesStructureesCours', () => {
  it('décrit les trois formats, numérotés dans l’ordre', () => {
    const liste = donneesStructureesCours().itemListElement as { position: number; item: { name: string } }[]
    expect(liste.map((e) => e.position)).toEqual([1, 2, 3])
    expect(liste.map((e) => e.item.name).join(' ')).toMatch(/individuel.*duo.*collectif/i)
  })
})

describe('planDuSite', () => {
  it('liste exactement les pages publiques, en adresses absolues', () => {
    const xml = planDuSite('2026-10-30')
    expect(xml.match(/<loc>/g)).toHaveLength(PAGES_VITRINE.length)
    for (const page of PAGES_VITRINE) {
      const url = page.chemin === '/' ? `${SITE}/` : `${SITE}${page.chemin}`
      expect(xml).toContain(`<loc>${url}</loc>`)
    }
  })

  it('n’expose aucun espace connecté', () => {
    const xml = planDuSite('2026-10-30')
    for (const prive of ['/admin', '/professeur/', '/mon-espace', '/connexion', '/e/']) {
      expect(xml).not.toContain(`${SITE}${prive}`)
    }
  })

  it('met l’accueil et les cours en tête de priorité, les pages légales en dernier', () => {
    const xml = planDuSite('2026-10-30')
    const bloc = (chemin: string) => {
      const url = chemin === '/' ? `${SITE}/` : `${SITE}${chemin}`
      return xml.slice(xml.indexOf(`<loc>${url}</loc>`)).split('</url>')[0]
    }
    expect(bloc('/')).toContain('<priority>1.0</priority>')
    expect(bloc('/cours')).toContain('<priority>0.9</priority>')
    expect(bloc('/confidentialite')).toContain('<priority>0.3</priority>')
  })
})
