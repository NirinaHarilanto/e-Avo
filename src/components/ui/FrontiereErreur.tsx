import { Component, type ErrorInfo, type ReactNode } from 'react'
import { signalerErreur } from '../../lib/journalErreurs'
import { boutonPrimaireStyle, boutonNeutreStyle } from './Boutons'

/* Filet de sécurité du rendu React — revue du 2026-10-11 : l'application n'en avait aucun. Une
   erreur levée pendant le rendu d'un composant démontait l'arbre entier, laissant l'utilisateur
   devant une PAGE BLANCHE, sans message, sans action possible, et sans la moindre trace côté
   établissement.

   Deux choses manquaient donc, et ce composant les apporte toutes les deux : un écran lisible
   avec une porte de sortie, et un signalement dans `journal_erreurs` (migration 0121) pour que
   l'administration sache qu'un écran a planté sans dépendre du bon vouloir de l'utilisateur à
   le raconter.

   Classe et non fonction : `componentDidCatch` / `getDerivedStateFromError` n'ont toujours pas
   d'équivalent sous forme de hook, c'est la seule classe de l'application. */

interface Etat {
  erreur: Error | null
}

export class FrontiereErreur extends Component<{ children: ReactNode }, Etat> {
  state: Etat = { erreur: null }

  static getDerivedStateFromError(erreur: Error): Etat {
    return { erreur }
  }

  componentDidCatch(erreur: Error, infos: ErrorInfo) {
    void signalerErreur('rendu', erreur, infos.componentStack ?? undefined)
  }

  render() {
    if (!this.state.erreur) return this.props.children

    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg-page)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div className="card" style={{ maxWidth: 480, padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h1 className="brand-font" style={{ fontSize: 20, color: 'var(--ink)', margin: 0 }}>
            Cet écran n’a pas pu s’afficher
          </h1>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)', margin: 0 }}>
            Le problème a été enregistré automatiquement : l’administration de votre établissement le verra sans que
            vous ayez à le signaler. Vos données ne sont pas affectées.
          </p>
          <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--muted)', margin: 0 }}>
            Recharger la page suffit le plus souvent à repartir.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => window.location.reload()} className="btn-shine" style={boutonPrimaireStyle}>
              Recharger la page
            </button>
            {/* Retour à l'accueil par une vraie navigation, pas `navigate()` : l'arbre React est
                dans un état cassé, le routeur n'est plus fiable. */}
            <button onClick={() => (window.location.href = '/')} style={boutonNeutreStyle}>
              Revenir à l’accueil
            </button>
          </div>
        </div>
      </div>
    )
  }
}
