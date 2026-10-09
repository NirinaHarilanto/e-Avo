import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useApparitions, useBarreSolidifiee, useFondVitrine, useProjecteur } from './animations'
import { ContexteContact } from './contexteContact'
import { FenetreContact } from './FenetreContact'
import { IcoHX } from './IconesHX'
import { CHEMIN_CANDIDATURE } from './candidature'

/* Les cinq entrées de la barre, dans l'ordre des maquettes. Les chemins sont ceux qu'elles
   écrivent, à une exception près : la candidature formateur garde `/rejoignez-nous`, l'adresse
   déjà en service et déjà partagée (les maquettes écrivaient `/devenir-formateur`). */
const ENTREES = [
  { chemin: '/', libelle: 'Accueil' },
  { chemin: '/cours', libelle: 'Cours & tarifs' },
  { chemin: '/professeurs', libelle: 'Professeurs' },
  { chemin: '/temoignages', libelle: 'Témoignages' },
  { chemin: '/a-propos', libelle: 'À propos' },
]


/* Enveloppe commune aux cinq pages de la vitrine : conteneur `.hx` qui porte les variables du
   thème, barre fixe, pied de page et fenêtre « Nous contacter ».

   La connexion et la candidature formateur ne passent pas par ici : les maquettes leur donnent
   leur propre en-tête (aucune pour la première, une barre allégée pour la seconde). */
export function CoquilleVitrine({ fond, children }: { fond: string; children: ReactNode }) {
  const conteneur = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  const [contactOuvert, setContactOuvert] = useState(false)
  const [menuOuvert, setMenuOuvert] = useState(false)
  const solide = useBarreSolidifiee()
  const ouvrirContact = useCallback(() => setContactOuvert(true), [])

  useFondVitrine(fond)
  useApparitions(conteneur, pathname)
  useProjecteur(conteneur, pathname)

  const classesBarre = ['hx-nav', solide && 'solid', menuOuvert && 'open'].filter(Boolean).join(' ')

  return (
    <div className="hx" ref={conteneur}>
      <header className={classesBarre}>
        <div className="in">
          <Link className="logo" to="/" onClick={() => setMenuOuvert(false)}>
            <img src="/logo-hoc-blanc.png" alt="Hari Online Club" />
          </Link>
          <nav>
            {ENTREES.map((entree) => (
              <Link
                key={entree.chemin}
                to={entree.chemin}
                className={pathname === entree.chemin ? 'on' : undefined}
                aria-current={pathname === entree.chemin ? 'page' : undefined}
                onClick={() => setMenuOuvert(false)}
              >
                {entree.libelle}
              </Link>
            ))}
          </nav>
          <div className="act">
            <a className="login" href="/connexion">
              <IcoHX nom="utilisateur" />
              Se connecter
            </a>
            <button type="button" className="cta" onClick={ouvrirContact}>
              Nous contacter <i>↗</i>
            </button>
          </div>
          <button type="button" className="burger" aria-label="Menu" aria-expanded={menuOuvert} onClick={() => setMenuOuvert((v) => !v)}>
            <IcoHX nom="burger" />
          </button>
        </div>
      </header>

      <ContexteContact.Provider value={ouvrirContact}>{children}</ContexteContact.Provider>

      <PiedVitrine onContact={ouvrirContact} />

      <FenetreContact ouverte={contactOuvert} onFermer={() => setContactOuvert(false)} />
    </div>
  )
}

/* Aucune maquette ne dessine de pied de page, mais les liens de confidentialité et de conditions
   d'utilisation conditionnent l'accès Google Calendar de l'établissement : ils doivent rester
   atteignables depuis la vitrine. Habillage repris du vocabulaire du thème. */
function PiedVitrine({ onContact }: { onContact: () => void }) {
  return (
    <footer className="hx-pied">
      <div className="in">
        <span>© {new Date().getFullYear()} Hari Online Club</span>
        <nav>
          <a href="/confidentialite">Confidentialité</a>
          <a href="/conditions-utilisation">Conditions d’utilisation</a>
          <a href={CHEMIN_CANDIDATURE}>Devenir formateur</a>
          <button type="button" onClick={onContact}>
            Nous contacter
          </button>
        </nav>
      </div>
    </footer>
  )
}
