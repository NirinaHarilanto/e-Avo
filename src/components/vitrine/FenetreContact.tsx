import { useEffect, useRef, useState } from 'react'
import { IcoHX } from './IconesHX'
import { EMAIL_OFFICIEL_HOC } from '../../lib/etablissement'

/* Coordonnées reprises telles quelles de la maquette (hoc-contact.html), à la demande du client. */
const EMAIL = EMAIL_OFFICIEL_HOC
const TELEPHONE_AFFICHE = '+261 38 05 716 65'
const TELEPHONE_WHATSAPP = '261380571665'

/* La maquette n'envoie rien à un serveur : elle compose le message et le remet à WhatsApp ou au
   client de messagerie du visiteur. Rien à brancher côté application, donc, et aucune donnée
   personnelle qui transite par HOC avant que le visiteur n'appuie lui-même sur « envoyer ». */
export function FenetreContact({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [email, setEmail] = useState('')
  const [projet, setProjet] = useState('')
  const [erreur, setErreur] = useState(false)
  const champNom = useRef<HTMLInputElement>(null)
  const champProjet = useRef<HTMLTextAreaElement>(null)

  /* La maquette bloque le défilement de la page derrière la fenêtre et donne le focus au premier
     champ après l'animation d'ouverture (250 ms). */
  useEffect(() => {
    if (!ouverte) return
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

  function envoyer(canal: 'whatsapp' | 'email') {
    const nomSaisi = nom.trim()
    const projetSaisi = projet.trim()
    if (!nomSaisi || !projetSaisi) {
      setErreur(true)
      ;(nomSaisi ? champProjet : champNom).current?.focus()
      return
    }
    setErreur(false)

    const coordonnees = [
      `Nom : ${nomSaisi}`,
      telephone.trim() && `Téléphone : ${telephone.trim()}`,
      email.trim() && `E-mail : ${email.trim()}`,
    ].filter(Boolean)
    const texte = `Bonjour Hari Online Club,\n\n${coordonnees.join('\n')}\n\nMon projet :\n${projetSaisi}`

    if (canal === 'whatsapp') {
      window.open(`https://wa.me/${TELEPHONE_WHATSAPP}?text=${encodeURIComponent(texte)}`, '_blank', 'noopener')
    } else {
      window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(`Mon projet – ${nomSaisi}`)}&body=${encodeURIComponent(texte)}`
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
        </div>
        <form noValidate onSubmit={(e) => e.preventDefault()}>
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
            <button type="button" className="b gold" onClick={() => envoyer('whatsapp')}>
              <IcoHX nom="whatsapp" />
              Envoyer sur WhatsApp
            </button>
            <button type="button" className="b ghost" onClick={() => envoyer('email')}>
              <IcoHX nom="avion" />
              Envoyer par e-mail
            </button>
          </div>
          <div className={erreur ? 'err show' : 'err'}>Merci d’indiquer votre nom et votre projet.</div>
        </form>
      </div>
    </div>
  )
}
