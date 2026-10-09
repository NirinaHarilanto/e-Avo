import { createContext, useContext } from 'react'

/* La fenêtre « Nous contacter » vit dans la coquille, mais s'ouvre depuis n'importe quelle page
   (bouton du hero, boutons de section). Un contexte évite de faire descendre le déclencheur de
   page en page. Hors de la coquille, ouvrir ne fait rien plutôt que de lever une erreur : la
   candidature et la connexion réutilisent des boutons du thème sans porter la fenêtre. */
export const ContexteContact = createContext<() => void>(() => {})

export function useContact() {
  return useContext(ContexteContact)
}
