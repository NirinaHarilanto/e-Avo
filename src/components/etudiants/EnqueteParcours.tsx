import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { CONTEXTE_JALON, LIBELLE_JALON } from '../../lib/jalonsParcours'
import { repondreAuJalon, useJalonsParcours, type JalonParcoursLigne } from '../../hooks/useJalonsParcours'
import { Modale } from '../ui/Modale'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { champStyle } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { Etoiles } from './Etoiles'

/* Enquête de satisfaction du PARCOURS — demande client du 2026-10-19 (point 8) : « il faut que
   l'étudiant renseigne l'enquête de satisfaction au milieu de son parcours (ou à la moitié de son
   forfait d'heures) et à 3 heures de fin de son parcours. Il ne faut donc plus que l'enquête de
   satisfaction soit systématiquement à la fin de chaque séance. »

   Elle remplace entièrement l'enquête par séance (`session_satisfaction`, 0068) : deux enquêtes
   par parcours au lieu d'une par cours. Les jalons sont posés côté serveur à la clôture d'une
   séance, quand un seuil est franchi (api/_lib/jalonsParcours.ts) ; ici, on ne fait que remplir
   ce qui attend une réponse. */

function Formulaire({
  jalon,
  onFermer,
  onEnregistre,
}: {
  jalon: JalonParcoursLigne
  onFermer: () => void
  onEnregistre: () => void
}) {
  const [noteGlobale, setNoteGlobale] = useState(0)
  const [notePedagogie, setNotePedagogie] = useState(0)
  const [commentaire, setCommentaire] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function enregistrer() {
    setEnCours(true)
    setErreur(null)
    const { erreur: echec } = await repondreAuJalon(jalon.id, {
      noteGlobale,
      notePedagogie: notePedagogie || null,
      commentaire: commentaire.trim() || null,
    })
    setEnCours(false)
    if (echec) {
      setErreur(echec)
      return
    }
    onEnregistre()
  }

  return (
    <Modale titre={`Votre avis — ${LIBELLE_JALON[jalon.jalon].toLowerCase()}`} onFermer={onFermer} largeurMax={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Pourquoi maintenant : sans ce rappel, une enquête qui s'ouvre d'elle-même ressemble à
            une sollicitation arbitraire. L'élève voit où il en est de ses heures. */}
        <p
          style={{
            margin: 0,
            padding: '11px 13px',
            borderRadius: 10,
            background: 'var(--surface-alt)',
            border: '1px solid var(--border-soft, var(--border))',
            fontSize: 12.5,
            lineHeight: 1.6,
            color: 'var(--ink-2)',
          }}
        >
          {CONTEXTE_JALON[jalon.jalon]} C’est le bon moment pour nous dire ce qui marche et ce qui pourrait être
          amélioré — votre formateur et l’administration en tiennent compte pour la suite.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Votre satisfaction globale (obligatoire)</label>
          <Etoiles valeur={noteGlobale} onChange={setNoteGlobale} taille={24} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Qualité pédagogique (facultatif)</label>
          <Etoiles valeur={notePedagogie} onChange={setNotePedagogie} taille={24} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Votre commentaire (facultatif)</label>
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            rows={4}
            placeholder="Ce que vous appréciez, ce que vous souhaiteriez voir changer…"
            style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>
        {erreur && <MessageErreur>{erreur}</MessageErreur>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onFermer} style={boutonNeutreStyle}>
            Plus tard
          </button>
          <button
            type="button"
            onClick={enregistrer}
            disabled={enCours || noteGlobale === 0}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, fontSize: 12.5, padding: '9px 16px', opacity: enCours || noteGlobale === 0 ? 0.6 : 1 }}
          >
            {enCours ? 'Envoi…' : 'Envoyer mon avis'}
          </button>
        </div>
      </div>
    </Modale>
  )
}

/* Monté une fois dans EtudiantLayout, donc présent sur toutes les pages de l'espace élève — comme
   l'était EnqueteSatisfactionAuto avant elle. Ouvre le jalon le plus ancien en attente : si les
   deux jalons sont tombés ensemble (séance longue sur un forfait court), l'élève répond au
   premier, et le second s'ouvre à sa prochaine visite plutôt que d'enchaîner deux pop-up.

   `studentId` reste l'identité CONNECTÉE (`profile.id`), jamais `idEtudiantEffectif` : dans un
   binôme DUO, chaque membre a son propre jalon et son propre avis à donner (même choix que pour
   l'enquête par séance qu'elle remplace, et que le serveur applique déjà en posant une ligne par
   membre). */
export function EnqueteParcoursAuto() {
  const { profile } = useProfileContext()
  const { jalons, recharger } = useJalonsParcours(profile?.id)
  /* Un jalon fermé sans y répondre ne revient pas tant que l'onglet reste ouvert — il
     réapparaîtra au prochain chargement de page, tant qu'il n'a pas reçu de réponse. Même
     comportement que l'enquête par séance : « Plus tard » doit vouloir dire plus tard.
     En état et non en `ref` : c'est bien une donnée dont le rendu dépend, et un `ref` lu pendant
     le rendu obligerait à provoquer soi-même le réaffichage. */
  const [ignores, setIgnores] = useState<string[]>([])

  const cible = jalons
    .filter((j) => j.repondu_le === null && !ignores.includes(j.id))
    .sort((a, b) => a.declenche_le.localeCompare(b.declenche_le))[0]

  if (!cible) return null

  return <Formulaire jalon={cible} onFermer={() => setIgnores((liste) => [...liste, cible.id])} onEnregistre={recharger} />
}

/* Rappel discret dans l'espace de l'élève, pour revenir à une enquête refermée : la pop-up ne
   s'ouvre qu'une fois par chargement de page, il faut un moyen de la rouvrir. Ne s'affiche que
   s'il y a quelque chose à remplir. */
export function RappelEnqueteParcours() {
  const { profile } = useProfileContext()
  const { jalons, recharger } = useJalonsParcours(profile?.id)
  const [ouvert, setOuvert] = useState<JalonParcoursLigne | null>(null)
  const enAttente = jalons.filter((j) => j.repondu_le === null)

  if (enAttente.length === 0) return null

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          padding: '12px 14px',
          borderRadius: 12,
          border: '1px solid rgba(233,207,148,.34)',
          background: 'rgba(233,207,148,.1)',
        }}
      >
        <span style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-2)', minWidth: 0 }}>
          {enAttente.length > 1
            ? `${enAttente.length} enquêtes de satisfaction attendent votre réponse.`
            : `Votre avis est attendu : ${CONTEXTE_JALON[enAttente[0].jalon].toLowerCase()}`}
        </span>
        <button type="button" onClick={() => setOuvert(enAttente[enAttente.length - 1])} className="btn-shine btn-secondary">
          Donner mon avis
        </button>
      </div>

      {ouvert && (
        <Formulaire
          jalon={ouvert}
          onFermer={() => setOuvert(null)}
          onEnregistre={() => {
            setOuvert(null)
            recharger()
          }}
        />
      )}
    </>
  )
}
