import { describe, expect, it } from 'vitest'
import { creerLienJitsi, DOMAINE_JITSI, estLienReel, fournisseurDepuisLien, getJoinUrl, getRecordingUrl, libelleFournisseur, nomCourtEleve, titreEvenementCours } from '../visio'

describe('getJoinUrl', () => {
  it('renvoie le lien Jitsi tel quel quand la séance en a un', () => {
    expect(getJoinUrl({ provider: 'jitsi', room_ref: 'https://meet.jit.si/hoc-abc' })).toBe('https://meet.jit.si/hoc-abc')
  })

  it('renvoie encore les liens Meet des séances créées avant la bascule', () => {
    expect(getJoinUrl({ provider: 'google_meet', room_ref: 'https://meet.google.com/abc-defg-hij' })).toBe(
      'https://meet.google.com/abc-defg-hij',
    )
  })

  it('retombe sur le lien interne quand aucune visio réelle n’a pu être créée', () => {
    expect(getJoinUrl({ provider: 'stub', room_ref: 'id-de-seance' })).toBe('https://meet.hari-online-club.example/salle/id-de-seance')
    expect(getJoinUrl({ provider: null, room_ref: 'id-de-seance' })).toBe('https://meet.hari-online-club.example/salle/id-de-seance')
  })

  it('ne présente jamais un lien vide comme réel', () => {
    // Cas d'une ligne à moitié écrite : le fournisseur est renseigné mais l'URL manque.
    expect(estLienReel({ provider: 'jitsi', room_ref: null })).toBe(false)
    expect(estLienReel({ provider: 'google_meet', room_ref: null })).toBe(false)
    expect(estLienReel({ provider: 'jitsi', room_ref: 'https://meet.jit.si/hoc-abc' })).toBe(true)
    expect(estLienReel({ provider: 'google_meet', room_ref: 'https://meet.google.com/abc' })).toBe(true)
    expect(estLienReel({ provider: 'stub', room_ref: 'id' })).toBe(false)
  })
})

describe('creerLienJitsi', () => {
  it('produit une salle du domaine Jitsi, préfixée pour être reconnaissable', () => {
    expect(creerLienJitsi()).toMatch(new RegExp(`^${DOMAINE_JITSI}/hoc[a-z]{24}$`))
  })

  it('n’utilise que des lettres, jamais de chiffre', () => {
    // Jitsi affiche le nom de la salle en gros et le découpe à chaque passage lettre/chiffre :
    // un identifiant mixte s'afficherait « Hoc 1 A 9 B 3822 5 A 91 », illisible pour les élèves.
    for (let i = 0; i < 50; i++) {
      expect(creerLienJitsi().split('/').pop()).toMatch(/^[a-z]+$/)
    }
  })

  it('ne redonne jamais deux fois la même salle', () => {
    // Le nom de salle est le seul secret qui protège la réunion : une collision rendrait deux
    // cours différents accessibles l'un depuis l'autre.
    const salles = new Set(Array.from({ length: 500 }, () => creerLienJitsi()))
    expect(salles.size).toBe(500)
  })

  it('tire chaque lettre sans privilégier le début de l’alphabet', () => {
    // Un simple `octet % 26` rendrait a–h plus probables que i–z, ce qui réduirait l'entropie
    // réelle du seul secret protégeant la salle. On vérifie que les deux moitiés de l'alphabet
    // sortent à peu près autant.
    const lettres = Array.from({ length: 400 }, () => creerLienJitsi().split('/').pop()!.slice(3)).join('')
    const premiereMoitie = [...lettres].filter((l) => l < 'n').length
    expect(premiereMoitie / lettres.length).toBeGreaterThan(0.44)
    expect(premiereMoitie / lettres.length).toBeLessThan(0.56)
  })

  it('génère un lien directement ouvrable, sans paramètre ni compte requis', () => {
    const url = new URL(creerLienJitsi())
    expect(url.protocol).toBe('https:')
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
  })

  it('n’utilise pas meet.jit.si ni 8x8.vc', () => {
    // Ces deux instances exigent qu'un modérateur AUTHENTIFIÉ arrive en premier, sinon les
    // participants restent en salle d'attente — ce qui réintroduirait l'obligation de compte que
    // toute cette bascule sert à supprimer. Vérifié le 2026-10-07 sur les deux.
    expect(DOMAINE_JITSI).not.toMatch(/meet\.jit\.si|8x8\.vc/)
  })

  it('accepte une instance différente, pour en changer sans toucher au code', () => {
    expect(creerLienJitsi('https://visio.exemple.org')).toMatch(/^https:\/\/visio\.exemple\.org\/hoc[a-z]{24}$/)
    // Une barre finale ne doit pas produire une double barre dans le lien.
    expect(creerLienJitsi('https://visio.exemple.org/')).toMatch(/^https:\/\/visio\.exemple\.org\/hoc[a-z]{24}$/)
  })
})

describe('getRecordingUrl', () => {
  it('rend l’enregistrement seulement s’il existe', () => {
    expect(getRecordingUrl({ enregistrement_url: null })).toBeNull()
    expect(getRecordingUrl({ enregistrement_url: 'https://exemple/x' })).toBe('https://exemple/x')
  })
})

describe('fournisseurDepuisLien', () => {
  // Demande client du 2026-10-11 : le pop-up d'un événement d'agenda Google ne connaît que
  // l'URL brute (`lieu`), jamais un `provider` structuré comme sur video_sessions.
  it('reconnaît un lien Google Meet', () => {
    expect(fournisseurDepuisLien('https://meet.google.com/abc-defg-hij')).toBe('google_meet')
  })

  it('retombe sur Jitsi pour tout le reste — seuls ces deux fournisseurs existent', () => {
    expect(fournisseurDepuisLien(DOMAINE_JITSI + '/hocabcdefghijklmnopqrstu')).toBe('jitsi')
    expect(fournisseurDepuisLien('https://visio.exemple.org/hocxyz')).toBe('jitsi')
  })
})

describe('libelleFournisseur', () => {
  it('rend un nom lisible pour chaque fournisseur', () => {
    expect(libelleFournisseur('google_meet')).toBe('Google Meet')
    expect(libelleFournisseur('jitsi')).toBe('Jitsi')
  })
})

/* Format des titres d'agenda fixé par le client le 2026-11-04, capture à l'appui : dans Google
   Agenda, toutes les séances HOC s'affichaient « Hari Online Club » et rien d'autre — le titre
   complet (« Hari Online Club · Cours · <élève> · <professeur> ») ne tient pas sur la ligne
   unique qu'une séance d'une heure laisse au titre, et se fait tronquer par la fin.
   On ne voyait donc ni l'élève, ni le type de cours. */
describe('titreEvenementCours', () => {
  it('nomme un cours individuel par le prénom et l’initiale du nom', () => {
    expect(titreEvenementCours({ estCollectif: false, eleves: [{ prenom: 'Sitrakiniaina', nom: 'MANANJARA' }] })).toBe(
      'HOC - Sitrakiniaina M.',
    )
  })

  /* La raison d'être de l'initiale, demandée par le client le 2026-11-04 après que je lui aie
     signalé le cas : deux de ses élèves s'appellent Aina, chez la même formatrice. Sans
     l'initiale, leurs deux cours portaient exactement le même titre dans son agenda. */
  it('distingue deux élèves qui partagent leur prénom', () => {
    const aina = titreEvenementCours({ estCollectif: false, eleves: [{ prenom: 'Aina', nom: 'NOELIARIVELO' }] })
    const autreAina = titreEvenementCours({ estCollectif: false, eleves: [{ prenom: 'Aina', nom: 'SAHY' }] })
    expect(aina).toBe('HOC - Aina N.')
    expect(autreAina).toBe('HOC - Aina S.')
    expect(aina).not.toBe(autreAina)
  })

  it('nomme un cours collectif par le niveau de sa classe', () => {
    expect(titreEvenementCours({ estCollectif: true, niveauClasse: 'Intermediate' })).toBe('HOC - Cours co Intermediate')
  })

  /* Un binôme DUO suit la même séance (0054) et reste un cours « individuel » : les deux élèves
     doivent apparaître, sinon le professeur ne voit qu'un des deux attendus. */
  it('nomme un duo par les deux élèves', () => {
    expect(
      titreEvenementCours({
        estCollectif: false,
        eleves: [
          { prenom: 'Ravaka', nom: 'RANDRIARIVONY' },
          { prenom: 'Mialy', nom: 'RAKOTONDRAPARANY' },
        ],
      }),
    ).toBe('HOC - Ravaka R. & Mialy R.')
  })

  /* Un niveau manquant ne doit pas produire « HOC - Cours co  » avec une espace en trop, ni un
     « undefined » : une classe de vague legacy n'en porte pas toujours. */
  it('se passe du niveau quand la classe n’en a pas', () => {
    expect(titreEvenementCours({ estCollectif: true, niveauClasse: null })).toBe('HOC - Cours co')
    expect(titreEvenementCours({ estCollectif: true, niveauClasse: '  ' })).toBe('HOC - Cours co')
  })

  /* Aucun inscrit résolu (profil supprimé, séance vide) : un titre générique plutôt qu'un
     « HOC - » suspendu, qui passerait pour un défaut d'affichage. */
  it('reste lisible quand aucun élève n’est résolu', () => {
    expect(titreEvenementCours({ estCollectif: false, eleves: [] })).toBe('HOC - Cours')
    expect(titreEvenementCours({ estCollectif: false })).toBe('HOC - Cours')
  })
})

describe('nomCourtEleve', () => {
  it('n’ajoute ni initiale ni point quand le nom de famille manque', () => {
    expect(nomCourtEleve({ prenom: 'Aina', nom: null })).toBe('Aina')
    expect(nomCourtEleve({ prenom: 'Aina', nom: '   ' })).toBe('Aina')
  })

  it('met l’initiale en majuscule, quelle que soit la casse saisie', () => {
    expect(nomCourtEleve({ prenom: 'Mialy', nom: 'rakotondraparany' })).toBe('Mialy R.')
  })

  it('retombe sur le nom de famille quand le prénom manque', () => {
    expect(nomCourtEleve({ prenom: null, nom: 'SAHY' })).toBe('SAHY')
  })

  it('rend une chaîne vide pour un profil sans aucun nom, que l’appelant écarte', () => {
    expect(nomCourtEleve({ prenom: null, nom: null })).toBe('')
  })
})
