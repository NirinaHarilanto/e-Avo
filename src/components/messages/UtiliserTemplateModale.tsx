import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useProfileContext } from '../../context/ProfileContext'
import { preparerEmail } from '../../lib/templatesEmail'
import { LIBELLE_ROLE, useAnnuaire } from '../../hooks/useMessagerie'
import { useEmailVariables, type EmailEnvoi, type EmailTemplate } from '../../hooks/useEmailTemplates'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { Modale } from '../ui/Modale'
import { SelecteurPersonnes } from '../ui/SelecteurPersonnes'
import { EtatChargement, MessageErreur, MessageInfo, MessageSucces } from '../ui/Etats'
import { champStyle, etiquetteStyle } from '../ui/Champ'
import { boutonNeutreStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'
import { EMAIL_OFFICIEL_HOC } from '../../lib/etablissement'

const TAILLE_MAX_PIECE_JOINTE = 10 * 1024 * 1024

/* Valeurs déduites du PREMIER destinataire obligatoire : un modèle du parcours apprenant
   s'adresse à une personne (« Bonjour {{prenom}} »), et l'envoyer à plusieurs reste l'exception
   (une classe prévenue d'un même changement). Le prénom du premier destinataire est donc celui
   qui sert à l'aperçu, et l'admin voit exactement ce qui partira — plutôt qu'un aperçu
   « générique » qui ne correspondrait au courrier de personne. */
function valeursDuDestinataire(
  destinataireId: string | undefined,
  etudiants: { id: string; prenom: string | null; nom: string | null }[],
  professeurs: { id: string; prenom: string | null; nom: string | null; email: string | null }[],
  annuaire: { id: string; prenom: string | null; nom: string | null }[],
): Record<string, string> {
  if (!destinataireId) return {}
  const personne =
    etudiants.find((e) => e.id === destinataireId) ??
    professeurs.find((p) => p.id === destinataireId) ??
    annuaire.find((a) => a.id === destinataireId)
  if (!personne) return {}
  return { prenom: personne.prenom ?? '' }
}

export function UtiliserTemplateModale({
  template,
  brouillon,
  onFermer,
  onEnvoye,
  onEnregistre,
}: {
  template: EmailTemplate | null
  /* Reprise d'un brouillon : l'objet et le corps viennent alors de ce qui avait été préparé, pas
     du modèle — l'admin retrouve son texte tel qu'il l'avait laissé. */
  brouillon?: EmailEnvoi | null
  onFermer: () => void
  /* `avertissement` : le mail est bien parti (Resend l'a accepté) mais la journalisation dans
     `email_envois` a échoué — l'appelant doit le signaler puisque cette ligne n'apparaîtra pas
     dans « Derniers envois ». */
  onEnvoye: (avertissement?: string) => void
  onEnregistre: () => void
}) {
  const { session, profile } = useProfileContext()
  const { personnes, loading: chargementAnnuaire } = useAnnuaire()
  const { valeurs: constantes, loading: chargementConstantes } = useEmailVariables()
  const { etudiants } = useEtudiants()
  const { professeurs } = useProfesseurs()

  const [obligatoires, setObligatoires] = useState<string[]>(brouillon?.destinataires_profile_ids ?? [])
  const [optionnels, setOptionnels] = useState<string[]>(brouillon?.copies_profile_ids ?? [])
  const [objet, setObjet] = useState('')
  const [corps, setCorps] = useState('')
  const [manquantes, setManquantes] = useState<string[]>([])
  const [lignesRetirees, setLignesRetirees] = useState<string[]>([])
  const [piece, setPiece] = useState<File | null>(null)
  const [enCours, setEnCours] = useState<'envoi' | 'enregistrement' | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)
  /* Vrai dès que l'admin a touché au texte : l'aperçu ne doit plus être recalculé derrière lui
     quand il ajoute un destinataire, sinon il perd ses corrections sans comprendre pourquoi. */
  const [texteRetouche, setTexteRetouche] = useState(false)

  const candidats = useMemo(
    () => personnes.map((p) => ({ id: p.id, nom: p.nom, prenom: p.prenom, role: LIBELLE_ROLE[p.role] ?? p.role })),
    [personnes],
  )

  /* Aperçu recalculé tant que l'admin n'a pas pris la main sur le texte. Les constantes de la
     maison passent d'abord, les valeurs du destinataire ensuite (elles l'emportent). */
  useEffect(() => {
    if (texteRetouche) return
    if (brouillon) {
      setObjet(brouillon.objet)
      setCorps(brouillon.corps)
      setManquantes([])
      setLignesRetirees([])
      return
    }
    if (!template) return
    const prepare = preparerEmail(template, {
      ...constantes,
      ...valeursDuDestinataire(obligatoires[0], etudiants, professeurs, personnes),
    })
    setObjet(prepare.objet)
    setCorps(prepare.corps)
    setManquantes(prepare.manquantes)
    setLignesRetirees(prepare.lignesRetirees)
  }, [template, brouillon, constantes, obligatoires, etudiants, professeurs, personnes, texteRetouche])

  async function deposerPiece(): Promise<{ nom: string; chemin: string } | null | 'erreur'> {
    if (!piece) return null
    if (piece.size > TAILLE_MAX_PIECE_JOINTE) {
      setErreur('La pièce jointe dépasse 10 Mo. La plupart des messageries refuseraient le message.')
      return 'erreur'
    }
    const chemin = `${profile?.etablissement_id}/${crypto.randomUUID()}-${piece.name}`
    const { error } = await supabase.storage.from('pieces-jointes-emails').upload(chemin, piece)
    if (error) {
      setErreur(`Le dépôt de la pièce jointe a échoué : ${error.message}`)
      return 'erreur'
    }
    return { nom: piece.name, chemin }
  }

  async function appeler(action: 'envoi' | 'enregistrement') {
    /* Avant correctif (signalé par le client le 2026-10-10) : une session absente sortait
       silencieusement ici, sans la moindre trace à l'écran — le bouton « Envoyer » redevenait
       cliquable, et rien n'indiquait qu'aucune requête n'était jamais partie. Le même filet
       (try/catch/finally) couvre aussi toute exception imprévue plus bas : l'admin doit toujours
       finir avec un statut visible, succès ou échec, jamais un silence. */
    if (!session) {
      setErreur('Votre session a expiré. Rechargez la page et réessayez.')
      return
    }
    setErreur(null)
    setSucces(null)
    setEnCours(action)

    try {
      const pieceDeposee = await deposerPiece()
      if (pieceDeposee === 'erreur') {
        return
      }

      if (action === 'enregistrement') {
        /* Brouillon écrit directement par le navigateur : la policy `email_envois_admin_all`
           (0091) l'autorise, il n'y a ni e-mail à expédier ni adresse à résoudre. */
        const ligne = {
          etablissement_id: profile!.etablissement_id,
          template_id: template?.id ?? brouillon?.template_id ?? null,
          destinataires_profile_ids: obligatoires,
          copies_profile_ids: optionnels,
          objet: objet.trim(),
          corps: corps.trim(),
          piece_jointe_nom: pieceDeposee?.nom ?? brouillon?.piece_jointe_nom ?? null,
          piece_jointe_chemin: pieceDeposee?.chemin ?? brouillon?.piece_jointe_chemin ?? null,
          statut: 'brouillon' as const,
          cree_par_profile_id: profile!.id,
        }
        const { error } = brouillon
          ? await supabase.from('email_envois').update(ligne).eq('id', brouillon.id)
          : await supabase.from('email_envois').insert(ligne)
        if (error) {
          setErreur(`L'enregistrement a échoué : ${error.message}`)
          return
        }
        setSucces('Brouillon enregistré. Vous le retrouverez dans « Brouillons ».')
        onEnregistre()
        return
      }

      const reponse = await fetch('/api/admin/envoyer-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          envoiId: brouillon?.id,
          templateId: template?.id ?? brouillon?.template_id ?? undefined,
          destinataireIds: obligatoires,
          copieIds: optionnels,
          objet: objet.trim(),
          corps: corps.trim(),
          pieceJointeNom: pieceDeposee?.nom ?? brouillon?.piece_jointe_nom ?? undefined,
          pieceJointeChemin: pieceDeposee?.chemin ?? brouillon?.piece_jointe_chemin ?? undefined,
        }),
      }).catch(() => null)

      if (!reponse || !reponse.ok) {
        const detail = reponse ? await reponse.json().catch(() => null) : null
        setErreur(detail?.error ?? "L'envoi a échoué. Vérifiez votre connexion et réessayez.")
        return
      }
      const resultat = await reponse.json().catch(() => null)
      onEnvoye(resultat?.avertissement)
    } catch (erreurInattendue) {
      setErreur(
        `Une erreur inattendue est survenue : ${erreurInattendue instanceof Error ? erreurInattendue.message : 'réessayez.'}`,
      )
    } finally {
      setEnCours(null)
    }
  }

  const titre = brouillon ? 'Reprendre un brouillon' : (template?.nom ?? 'Nouvel e-mail')
  const pret = obligatoires.length > 0 && !!objet.trim() && !!corps.trim()

  return (
    <Modale titre={titre} onFermer={onFermer} largeurMax={720} fermetureExterieureDesactivee>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        {template?.quand && <MessageInfo>Quand l’utiliser : {template.quand}</MessageInfo>}

        {/* L'admin doit voir de quelle adresse part le message avant de l'envoyer — et surtout à
            laquelle les réponses lui reviendront. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={etiquetteStyle}>Expéditeur</span>
          <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
            Hari Online Club — réponses vers <strong>{EMAIL_OFFICIEL_HOC}</strong>
          </span>
        </div>

        {chargementAnnuaire || chargementConstantes ? (
          <EtatChargement lignes={2} hauteur={44} />
        ) : (
          <>
            <SelecteurPersonnes
              etiquette="Destinataires obligatoires"
              placeholder="Rechercher une personne…"
              candidats={candidats}
              selectionnes={obligatoires}
              onChange={setObligatoires}
              exclure={optionnels}
            />
            <SelecteurPersonnes
              etiquette="Destinataires optionnels (en copie)"
              placeholder="Rechercher une personne…"
              candidats={candidats}
              selectionnes={optionnels}
              onChange={setOptionnels}
              exclure={obligatoires}
            />
          </>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={etiquetteStyle}>
            Pièce jointe{template?.piece_jointe_attendue ? ` — attendue : ${template.piece_jointe_attendue}` : ' (facultative)'}
          </span>
          <input type="file" onChange={(e) => setPiece(e.target.files?.[0] ?? null)} style={{ fontSize: 12.5, color: 'var(--ink)' }} />
          {brouillon?.piece_jointe_nom && !piece && (
            <span style={{ fontSize: 11.5, color: 'var(--accent-teal)' }}>Déjà joint : {brouillon.piece_jointe_nom}</span>
          )}
        </div>

        {manquantes.length > 0 && (
          <MessageInfo>
            À compléter dans l’aperçu : {manquantes.map((m) => m.replace(/_/g, ' ')).join(', ')}.
          </MessageInfo>
        )}
        {lignesRetirees.length > 0 && (
          <MessageInfo>
            {lignesRetirees.length} ligne{lignesRetirees.length > 1 ? 's' : ''} retirée{lignesRetirees.length > 1 ? 's' : ''} faute
            de valeur (lien ou numéro non renseigné dans les réglages) : {lignesRetirees.join(' · ')}
          </MessageInfo>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={etiquetteStyle}>Objet</span>
          <input
            value={objet}
            onChange={(e) => {
              setObjet(e.target.value)
              setTexteRetouche(true)
            }}
            style={champStyle}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={etiquetteStyle}>Aperçu du message — modifiable avant envoi</span>
          <textarea
            value={corps}
            onChange={(e) => {
              setCorps(e.target.value)
              setTexteRetouche(true)
            }}
            rows={16}
            style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, fontSize: 13 }}
          />
        </label>

        {erreur && <MessageErreur>{erreur}</MessageErreur>}
        {succes && <MessageSucces>{succes}</MessageSucces>}

        {/* Les trois boutons sont actifs d'emblée (demande client), à la seule réserve qu'il faut
            un destinataire et un texte : envoyer un mail vide à personne n'a pas de sens. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
          <button type="button" onClick={onFermer} style={boutonNeutreStyle}>
            Annuler
          </button>
          <button type="button" onClick={() => appeler('enregistrement')} disabled={enCours !== null || !pret} style={boutonSecondaireStyle}>
            {enCours === 'enregistrement' ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            type="button"
            onClick={() => appeler('envoi')}
            disabled={enCours !== null || !pret}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, fontSize: 12.5, padding: '9px 18px', opacity: enCours !== null || !pret ? 0.6 : 1 }}
          >
            {enCours === 'envoi' ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>

        {obligatoires.length > 1 && (
          <span style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
            {obligatoires.length} destinataires obligatoires : le même texte part à tous. L’aperçu utilise le prénom du
            premier — vérifiez qu’il n’y a pas de « Bonjour {'{prénom}'} » à adapter.
          </span>
        )}
      </div>
    </Modale>
  )
}
