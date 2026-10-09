import { useMemo, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import {
  LIBELLE_ROLE,
  marquerMessageLu,
  nomPersonne,
  supprimerMessage,
  useAnnuaire,
  useMessagerie,
  type MessageAvecPersonnes,
} from '../../hooks/useMessagerie'
import { Modale } from '../ui/Modale'
import { Onglets } from '../ui/Onglets'
import { SelecteurPersonnes } from '../ui/SelecteurPersonnes'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur, MessageSucces } from '../ui/Etats'
import { Icone } from '../ui/Icones'
import { champStyle, etiquetteStyle } from '../ui/Champ'
import { boutonDangerStyle, boutonNeutreStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'

type Onglet = 'recus' | 'envoyes'

function dateLisible(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

/* Fenêtre de rédaction, partagée par le bouton « Nouveau message » et par « Répondre » — d'où
   `destinatairesInitiaux` et `objetInitial` : répondre, c'est rédiger avec le champ déjà rempli,
   pas un autre formulaire. */
function RedigerMessage({
  destinatairesInitiaux = [],
  objetInitial = '',
  parentId,
  onFermer,
  onEnvoye,
}: {
  destinatairesInitiaux?: string[]
  objetInitial?: string
  parentId?: string
  onFermer: () => void
  onEnvoye: () => void
}) {
  const { session, profile } = useProfileContext()
  const { personnes, loading: chargementAnnuaire } = useAnnuaire()
  const [destinataires, setDestinataires] = useState<string[]>(destinatairesInitiaux)
  const [objet, setObjet] = useState(objetInitial)
  const [corps, setCorps] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  /* Soi-même retiré des destinataires proposés : s'écrire une note est permis par la base, mais
     n'a pas sa place dans une liste de correspondants. */
  const candidats = useMemo(
    () =>
      personnes
        .filter((p) => p.id !== profile?.id)
        .map((p) => ({ id: p.id, nom: p.nom, prenom: p.prenom, role: LIBELLE_ROLE[p.role] ?? p.role })),
    [personnes, profile?.id],
  )

  async function envoyer() {
    if (!session || destinataires.length === 0 || !objet.trim() || !corps.trim()) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/messages/envoyer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ destinataireIds: destinataires, objet: objet.trim(), corps: corps.trim(), parentId }),
    }).catch(() => null)
    setEnCours(false)
    if (!reponse || !reponse.ok) {
      const detail = reponse ? await reponse.json().catch(() => null) : null
      setErreur(detail?.error ?? "L'envoi a échoué. Vérifiez votre connexion et réessayez.")
      return
    }
    onEnvoye()
  }

  return (
    <Modale titre={parentId ? 'Répondre' : 'Nouveau message'} onFermer={onFermer} largeurMax={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {chargementAnnuaire ? (
          <EtatChargement lignes={1} hauteur={40} />
        ) : (
          <SelecteurPersonnes
            etiquette="Destinataire(s)"
            placeholder="Rechercher une personne…"
            candidats={candidats}
            selectionnes={destinataires}
            onChange={setDestinataires}
          />
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={etiquetteStyle}>Objet</span>
          <input value={objet} onChange={(e) => setObjet(e.target.value)} style={champStyle} placeholder="Objet du message" />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={etiquetteStyle}>Message</span>
          <textarea
            value={corps}
            onChange={(e) => setCorps(e.target.value)}
            rows={8}
            style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55 }}
            placeholder="Votre message…"
          />
        </label>

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onFermer} style={boutonNeutreStyle}>
            Annuler
          </button>
          <button
            type="button"
            onClick={envoyer}
            disabled={enCours || destinataires.length === 0 || !objet.trim() || !corps.trim()}
            className="btn-shine"
            style={{
              ...boutonPrimaireStyle,
              fontSize: 12.5,
              padding: '9px 18px',
              opacity: enCours || destinataires.length === 0 || !objet.trim() || !corps.trim() ? 0.6 : 1,
            }}
          >
            {enCours ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
      </div>
    </Modale>
  )
}

function FicheMessage({
  message,
  estRecu,
  onFermer,
  onChange,
}: {
  message: MessageAvecPersonnes
  estRecu: boolean
  onFermer: () => void
  onChange: () => void
}) {
  const [repondreOuvert, setRepondreOuvert] = useState(false)
  const [suppressionEnCours, setSuppressionEnCours] = useState(false)
  const correspondant = estRecu ? message.expediteur : message.destinataire

  async function supprimer() {
    setSuppressionEnCours(true)
    try {
      await supprimerMessage(message.id)
      onFermer()
      onChange()
    } finally {
      setSuppressionEnCours(false)
    }
  }

  return (
    <>
      <Modale titre={message.objet} onFermer={onFermer} largeurMax={560}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
              {estRecu ? 'De' : 'À'} <strong>{nomPersonne(correspondant)}</strong>
              {correspondant && ` · ${LIBELLE_ROLE[correspondant.role] ?? correspondant.role}`}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{dateLisible(message.created_at)}</span>
          </div>

          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{message.corps}</p>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--border-soft)', paddingTop: 13 }}>
            <button type="button" onClick={supprimer} disabled={suppressionEnCours} style={boutonDangerStyle}>
              {suppressionEnCours ? 'Suppression…' : 'Supprimer'}
            </button>
            {estRecu && correspondant && (
              <button type="button" onClick={() => setRepondreOuvert(true)} style={boutonSecondaireStyle}>
                <Icone nom="plus" taille={13} />
                Répondre
              </button>
            )}
          </div>
        </div>
      </Modale>

      {repondreOuvert && correspondant && (
        <RedigerMessage
          destinatairesInitiaux={[correspondant.id]}
          objetInitial={message.objet.startsWith('Re : ') ? message.objet : `Re : ${message.objet}`}
          parentId={message.parent_id ?? message.id}
          onFermer={() => setRepondreOuvert(false)}
          onEnvoye={() => {
            setRepondreOuvert(false)
            onFermer()
            onChange()
          }}
        />
      )}
    </>
  )
}

function LigneMessage({
  message,
  estRecu,
  onOuvrir,
}: {
  message: MessageAvecPersonnes
  estRecu: boolean
  onOuvrir: () => void
}) {
  const correspondant = estRecu ? message.expediteur : message.destinataire
  const nonLu = estRecu && !message.lu
  return (
    <button
      type="button"
      onClick={onOuvrir}
      className="carte-ligne"
      style={{
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '13px 15px',
        borderRadius: 12,
        border: nonLu ? '1px solid rgba(169,140,255,.4)' : '1px solid var(--border-soft)',
        background: nonLu ? 'rgba(169,140,255,.06)' : 'var(--surface)',
        cursor: 'pointer',
        color: 'inherit',
        width: '100%',
      }}
    >
      {nonLu && <span aria-label="Non lu" style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--accent-blue)', flexShrink: 0 }} />}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flexGrow: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: nonLu ? 800 : 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {message.objet}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          {estRecu ? 'De' : 'À'} {nomPersonne(correspondant)}
          {correspondant ? ` · ${LIBELLE_ROLE[correspondant.role] ?? correspondant.role}` : ''}
        </span>
      </span>
      <span style={{ fontSize: 11, color: 'var(--muted-2)', flexShrink: 0 }}>{dateLisible(message.created_at)}</span>
    </button>
  )
}

/* Messagerie interne, strictement identique dans les trois espaces (demande client du
   2026-10-01) : seul le layout qui l'entoure change. Les droits ne sont pas gérés ici mais par la
   RLS (0090/0092) — tout le monde peut écrire à tout le monde au sein de l'établissement, et ne
   lit que ses propres messages. */
export function Messagerie() {
  const { profile } = useProfileContext()
  const { recus, envoyes, nonLus, loading, erreur, recharger } = useMessagerie(profile?.id)
  const [onglet, setOnglet] = useState<Onglet>('recus')
  const [redactionOuverte, setRedactionOuverte] = useState(false)
  const [ouvertId, setOuvertId] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)

  const liste = onglet === 'recus' ? recus : envoyes
  const ouvert = liste.find((m) => m.id === ouvertId) ?? null

  async function ouvrir(message: MessageAvecPersonnes) {
    setOuvertId(message.id)
    // Lu à l'ouverture, et seulement côté réception : la boîte d'envoi n'a pas d'état de lecture.
    if (onglet === 'recus' && !message.lu) {
      await marquerMessageLu(message.id)
      recharger()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Onglets
          etiquette="Boîtes de messages"
          actif={onglet}
          onChange={(valeur) => {
            setOnglet(valeur)
            setOuvertId(null)
          }}
          onglets={[
            { value: 'recus', label: nonLus > 0 ? `Reçus (${nonLus})` : 'Reçus' },
            { value: 'envoyes', label: 'Envoyés' },
          ]}
          compact
        />
        <button
          type="button"
          onClick={() => setRedactionOuverte(true)}
          className="btn-shine"
          style={{ ...boutonPrimaireStyle, marginLeft: 'auto', fontSize: 12.5, padding: '9px 16px' }}
        >
          <Icone nom="plus" taille={14} />
          Nouveau message
        </button>
      </div>

      {succes && <MessageSucces>{succes}</MessageSucces>}
      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {loading ? (
        <EtatChargement lignes={4} hauteur={62} />
      ) : liste.length === 0 ? (
        <EtatVide
          icone="documents"
          titre={onglet === 'recus' ? 'Aucun message reçu' : 'Aucun message envoyé'}
          description={
            onglet === 'recus'
              ? 'Les messages qui vous sont adressés par l’administration, un professeur ou un élève apparaîtront ici.'
              : 'Utilisez « Nouveau message » pour écrire à n’importe quelle personne de Hari Online Club.'
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {liste.map((message) => (
            <LigneMessage key={message.id} message={message} estRecu={onglet === 'recus'} onOuvrir={() => ouvrir(message)} />
          ))}
        </div>
      )}

      {redactionOuverte && (
        <RedigerMessage
          onFermer={() => setRedactionOuverte(false)}
          onEnvoye={() => {
            setRedactionOuverte(false)
            setSucces('Message envoyé.')
            window.setTimeout(() => setSucces(null), 3000)
            recharger()
          }}
        />
      )}

      {ouvert && (
        <FicheMessage message={ouvert} estRecu={onglet === 'recus'} onFermer={() => setOuvertId(null)} onChange={recharger} />
      )}
    </div>
  )
}
