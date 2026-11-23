import { useCallback, useEffect, useState } from 'react'
import { Modale } from '../ui/Modale'
import { boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'
import {
  dejaInstallee,
  estIOS,
  estUnTelephone,
  invitationDisponible,
  proposerInstallation,
  surChangementInvitation,
} from '../../lib/installationApp'

/* « Installer l'application » — demande client du 2026-11-23, pour les trois espaces.
 *
 * Une bannière en bas d'écran plutôt qu'un bouton dans la barre latérale : sur téléphone, cette
 * barre est un tiroir fermé, et personne ne l'ouvre pour y chercher une offre qu'il ignore.
 *
 * Elle ne revient pas une fois écartée. Une proposition d'installation qui reparaît à chaque
 * page cesse d'être une proposition : le refus est gardé dans ce navigateur, et l'offre reste
 * accessible — le jour où le besoin se fait sentir, le navigateur propose lui-même
 * l'installation depuis son propre menu.
 *
 * Trois conditions, toutes exigées par la demande : un TÉLÉPHONE (« uniquement lorsque
 * l'utilisateur utilise uniquement son téléphone »), un ESPACE PERSONNEL (ce composant n'est
 * monté que par EspaceLayout, donc jamais sur la vitrine), et une application PAS ENCORE
 * installée. */

const CLE_REFUS = 'hoc:installation-ecartee'

export function InvitationInstallation() {
  const [visible, setVisible] = useState(false)
  const [instructionsIOS, setInstructionsIOS] = useState(false)

  const reevaluer = useCallback(() => {
    if (dejaInstallee() || !estUnTelephone()) {
      setVisible(false)
      return
    }
    let ecartee = false
    try {
      ecartee = localStorage.getItem(CLE_REFUS) === '1'
    } catch {
      /* Navigation privée ou stockage bloqué : on considère que rien n'a été écarté. Au pire,
         l'offre reparaît — jamais une erreur à l'écran. */
    }
    if (ecartee) {
      setVisible(false)
      return
    }
    /* Sur iPhone, aucun événement n'annonce l'installabilité : aucun navigateur d'iOS n'en
       émet. On propose donc dès qu'on reconnaît l'appareil, et le clic explique le geste. */
    setVisible(invitationDisponible() || estIOS())
  }, [])

  useEffect(() => {
    /* L'agent de service n'est PAS enregistré ici : il l'est au démarrage de l'application
       (main.tsx). L'enregistrer depuis ce composant arrivait trop tard — le navigateur n'évalue
       l'installabilité qu'une fois l'agent en place, et l'offre ne venait jamais. */
    reevaluer()
    const desabonner = surChangementInvitation(reevaluer)
    /* La largeur décide si l'on a affaire à un téléphone : une rotation d'écran peut changer la
       réponse. */
    window.addEventListener('resize', reevaluer)
    return () => {
      desabonner()
      window.removeEventListener('resize', reevaluer)
    }
  }, [reevaluer])

  function ecarter() {
    try {
      localStorage.setItem(CLE_REFUS, '1')
    } catch {
      // Stockage indisponible : la bannière disparaît pour cette visite, c'est déjà l'essentiel.
    }
    setVisible(false)
  }

  async function installer() {
    if (estIOS() && !invitationDisponible()) {
      setInstructionsIOS(true)
      return
    }
    const accepte = await proposerInstallation()
    if (accepte) setVisible(false)
  }

  if (!visible) return null

  return (
    <>
      <div className="invitation-installation" role="complementary" aria-label="Installer l’application">
        <img src="/icone-192.png" alt="" width={40} height={40} aria-hidden="true" />
        <span className="invitation-installation-texte">
          <strong>Installer Hari Online Club</strong>
          <span>Votre espace sur l’écran d’accueil, comme une application.</span>
        </span>
        <button type="button" onClick={() => void installer()} style={boutonPrimaireStyle} className="btn-shine">
          Installer
        </button>
        <button
          type="button"
          onClick={ecarter}
          className="invitation-installation-fermer"
          aria-label="Ne plus proposer l’installation"
          title="Ne plus proposer"
        >
          ×
        </button>
      </div>

      {instructionsIOS && (
        /* Aucun navigateur d'iOS n'ouvre de fenêtre d'installation : le geste est manuel et se
           trouve dans un menu que rien ne signale. On le décrit, plutôt que de laisser un bouton
           sans effet. Le chemin est le même dans Safari, Chrome et Firefox, qui partagent tous
           le moteur imposé par Apple. */
        <Modale titre="Installer sur votre iPhone" onFermer={() => setInstructionsIOS(false)} largeurMax={420}>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5, lineHeight: 1.6 }}>
            <li>
              Touchez l’icône <strong>Partager</strong> — un carré avec une flèche vers le haut, en bas de l’écran
              dans Safari, en haut à droite dans Chrome.
            </li>
            <li>
              Faites défiler, puis choisissez <strong>« Sur l’écran d’accueil »</strong>.
            </li>
            <li>
              Touchez <strong>Ajouter</strong> : l’icône HOC rejoint vos applications.
            </li>
          </ol>
          <button
            type="button"
            onClick={() => setInstructionsIOS(false)}
            style={{ ...boutonSecondaireStyle, marginTop: 16 }}
          >
            J’ai compris
          </button>
        </Modale>
      )}
    </>
  )
}
