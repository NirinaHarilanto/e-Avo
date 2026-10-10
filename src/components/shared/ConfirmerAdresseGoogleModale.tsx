import { useState } from 'react'
import { Modale } from '../ui/Modale'
import { Champ, champStyle } from '../ui/Champ'
import { MessageAvertissement, MessageInfo } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'

/* Pop-up de confirmation de l'adresse Gmail avant de partir vers l'écran de consentement Google —
   exigence client du 2026-10-10 : « un professeur est libre de faire la synchronisation de son
   compte gmail, avec un pop-up pour bien vérifier son adresse mail avant la validation de la
   synchronisation ».

   Ce n'est pas une simple politesse. Deux raisons concrètes :

   1. connecté à plusieurs comptes Google dans le même navigateur, on autorise le mauvais d'un
      clic. L'intégration s'installe alors parfaitement valide sur une adresse qui n'est pas celle
      voulue, et rien ne le signale : l'agenda affiché est bien un agenda, simplement pas le bon.
   2. chaque compte Google distinct qui passe l'écran de consentement consomme DÉFINITIVEMENT une
      place du quota de 100 utilisateurs de l'application Google tant qu'elle n'est pas vérifiée.
      Ce compteur ne redescend jamais, même si le compte est ensuite déconnecté ou supprimé de HOC.

   L'adresse saisie est envoyée au serveur, qui la fait voyager dans l'état OAuth signé puis la
   compare à celle que Google renvoie réellement : un décalage fait échouer la connexion sans rien
   enregistrer (voir api/admin/google-oauth-callback.ts). La saisie n'est donc pas déclarative, elle
   est vérifiée. */
export function ConfirmerAdresseGoogleModale({
  adresseSuggeree,
  adresseActuelle,
  onConfirmer,
  onFermer,
  enCours,
  erreur,
}: {
  /* Pré-remplissage : l'adresse de connexion HOC de la personne, le plus souvent la bonne. Jamais
     imposée — beaucoup utilisent une adresse professionnelle différente de leur Gmail. */
  adresseSuggeree?: string | null
  /* Adresse déjà reliée, s'il y en a une : la reconnecter est libre, en changer ne l'est pas. */
  adresseActuelle?: string | null
  onConfirmer: (adresse: string) => void
  onFermer: () => void
  enCours?: boolean
  erreur?: string | null
}) {
  const [adresse, setAdresse] = useState(adresseActuelle ?? adresseSuggeree ?? '')
  const valide = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresse.trim())

  return (
    <Modale titre="Quelle adresse Gmail connecter ?" onFermer={onFermer} largeurMax={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <MessageInfo>
          Saisissez l’adresse du compte Google que vous allez autoriser à l’écran suivant. Elle sera comparée au compte
          réellement autorisé : en cas de différence, <strong>rien ne sera enregistré</strong> et vous pourrez
          recommencer.
        </MessageInfo>

        <Champ label="Adresse Gmail à connecter">
          <input
            autoFocus
            type="email"
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valide && !enCours) onConfirmer(adresse.trim())
            }}
            placeholder="prenom.nom@gmail.com"
            style={champStyle}
          />
        </Champ>

        <MessageAvertissement>
          <strong>Vérifiez bien cette adresse.</strong> Chaque compte Google différent connecté à Hari Online Club
          occupe une place définitive dans l’autorisation Google de l’application — une place qui n’est pas rendue si le
          compte est ensuite déconnecté. Si plusieurs comptes Google sont ouverts dans ce navigateur,{' '}
          <strong>déconnectez-vous des autres</strong> avant de continuer, ou choisissez bien le bon compte sur l’écran
          de Google.
        </MessageAvertissement>

        {adresseActuelle && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.55 }}>
            Votre agenda est actuellement relié à <strong>{adresseActuelle}</strong>. Reconnecter cette même adresse est
            libre — c’est le geste à faire pour réparer une synchronisation. En changer demande l’accord de
            l’administration.
          </p>
        )}

        {erreur && <MessageAvertissement>{erreur}</MessageAvertissement>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onFermer} disabled={enCours} style={boutonNeutreStyle}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirmer(adresse.trim())}
            disabled={!valide || enCours}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, opacity: !valide || enCours ? 0.6 : 1 }}
          >
            {enCours ? 'Ouverture de Google…' : 'Continuer vers Google'}
          </button>
        </div>
      </div>
    </Modale>
  )
}
