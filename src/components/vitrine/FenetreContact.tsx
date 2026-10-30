import { useEffect, useRef, useState, type FormEvent } from 'react'
import { IcoHX } from './IconesHX'
import { CHEMIN_CANDIDATURE } from './candidature'
import { EMAIL_OFFICIEL_HOC } from '../../lib/etablissement'

/* Coordonnées reprises telles quelles de la maquette (hoc-contact.html), à la demande du client. */
const EMAIL = EMAIL_OFFICIEL_HOC
const TELEPHONE_AFFICHE = '+261 38 05 716 65'
const TELEPHONE_WHATSAPP = '261380571665'

/* Le message part désormais directement par l'API (api/vitrine/contact.ts), envoyé par Resend à
   l'administration — plus de bouton WhatsApp ni de lien `mailto:` remis au visiteur : l'un comme
   l'autre ne partaient que si son appareil avait l'app ou le client de messagerie voulu déjà
   configuré, ce qui n'a rien de garanti (demande client du 2026-10-30). Le numéro WhatsApp reste
   affiché ci-dessous comme coordonnée directe, pour qui préfère ce canal de lui-même. */
export function FenetreContact({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [email, setEmail] = useState('')
  const [projet, setProjet] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [envoye, setEnvoye] = useState(false)
  const champNom = useRef<HTMLInputElement>(null)
  const champProjet = useRef<HTMLTextAreaElement>(null)

  /* La maquette bloque le défilement de la page derrière la fenêtre et donne le focus au premier
     champ après l'animation d'ouverture (250 ms). Une réouverture repart aussi d'un écran propre :
     sans ça, rouvrir après un envoi réussi laisserait voir l'ancien message de confirmation. */
  useEffect(() => {
    if (!ouverte) return
    setEnvoye(false)
    setErreur(null)
    document.documentElement.style.overflow = 'hidden'
    const miseAuPoint = setTimeout(() => champNom.current?.focus(), 250)
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') onFermer()
    }
    document.addEventListener('keydown', surTouche)
    return () => {
      document.documentElement.style.overflow = ''
      clearTimeout(miseAuPoint)
      document.removeEventListener('keydown', surTouche)
    }
  }, [ouverte, onFermer])

  if (!ouverte) return null

  async function envoyer(evenement: FormEvent) {
    evenement.preventDefault()
    const nomSaisi = nom.trim()
    const projetSaisi = projet.trim()
    if (!nomSaisi || !projetSaisi) {
      setErreur('Merci d’indiquer votre nom et votre projet.')
      ;(nomSaisi ? champProjet : champNom).current?.focus()
      return
    }
    setErreur(null)
    setEnvoiEnCours(true)
    try {
      const reponse = await fetch('/api/vitrine/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: nomSaisi,
          telephone: telephone.trim() || undefined,
          email: email.trim() || undefined,
          projet: projetSaisi,
        }),
      }).then((r) => r.json())
      if (reponse.error) throw new Error(reponse.error)
      setEnvoye(true)
    } catch (erreurEnvoi) {
      setErreur(erreurEnvoi instanceof Error ? erreurEnvoi.message : 'L’envoi a échoué, réessayez.')
    } finally {
      setEnvoiEnCours(false)
    }
  }

  return (
    <div className="hx-ct open" role="dialog" aria-modal="true" aria-label="Nous contacter" onClick={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="box">
        <button type="button" className="x" aria-label="Fermer" onClick={onFermer}>
          ×
        </button>
        <div className="side">
          <div className="eyebrow">Nous contacter</div>
          <h2>
            Une question&nbsp;? <span className="it">Parlez-nous de votre projet.</span>
          </h2>
          <a className="coord" href={`mailto:${EMAIL}`}>
            <i>
              <IcoHX nom="enveloppe" />
            </i>
            <span>
              <small>E-mail</small>
              <b>{EMAIL}</b>
            </span>
          </a>
          <a className="coord" href={`https://wa.me/${TELEPHONE_WHATSAPP}`} target="_blank" rel="noopener noreferrer">
            <i>
              <IcoHX nom="telephone" />
            </i>
            <span>
              <small>Téléphone / WhatsApp</small>
              <b>{TELEPHONE_AFFICHE}</b>
            </span>
          </a>
          {/* Déplacé depuis la barre de navigation (2026-10-09, demande client) : même pastille
              `.coord` que l'e-mail et le téléphone juste au-dessus — même style, même animation
              au survol — pour que la candidature formateur se lise comme une troisième façon de
              joindre l'établissement plutôt que comme un bouton à part. */}
          <a className="coord" href={CHEMIN_CANDIDATURE}>
            <i>
              <IcoHX nom="diplome" />
            </i>
            <span>
              <small>Vous êtes professeur ?</small>
              <b>Devenir professeur chez HOC</b>
            </span>
          </a>
        </div>
        <form noValidate onSubmit={envoyer}>
          {envoye ? (
            <div className="confirmation">
              <h3>Message envoyé</h3>
              <p>
                Merci{nom.trim() ? `, ${nom.trim()}` : ''} ! Votre message est bien arrivé, nous vous répondons
                rapidement{email.trim() ? ` à ${email.trim()}` : ''}.
              </p>
              <button type="button" className="b gold" onClick={onFermer}>
                Fermer
              </button>
            </div>
          ) : (
            <>
              <div className="row">
                <label className="f">
                  Nom <span className="req">*</span>
                  <input ref={champNom} name="nom" type="text" autoComplete="name" value={nom} onChange={(e) => setNom(e.target.value)} />
                </label>
                <label className="f">
                  Téléphone / WhatsApp
                  <input name="tel" type="tel" autoComplete="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
                </label>
              </div>
              <label className="f">
                E-mail
                <input name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="f">
                Votre projet <span className="req">*</span>
                <textarea ref={champProjet} name="projet" value={projet} onChange={(e) => setProjet(e.target.value)} />
              </label>
              <div className="send">
                <button type="submit" className="b gold" disabled={envoiEnCours}>
                  <IcoHX nom="avion" />
                  {envoiEnCours ? 'Envoi…' : 'Envoyer le message'}
                </button>
              </div>
              <div className={erreur ? 'err show' : 'err'}>{erreur}</div>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
