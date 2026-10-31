import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { jetonAcces } from '../../lib/jetonAcces'
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
import { lienCompositionGmail, LONGUEUR_MAX_LIEN } from '../../lib/compositionEmail'
import { adresseDepuisId, estAdresseLibre } from '../../lib/invitations'

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
  /* Ne ferme pas la fenêtre (demande client du 2026-10-11) : seulement prévenir l'appelant pour
     qu'il rafraîchisse sa liste en arrière-plan. La fenêtre affiche sa propre confirmation (voir
     `succes` ci-dessous) et c'est l'admin qui la referme — jamais une fermeture instantanée qui
     ne laisse rien voir. */
  /* Le canal effectivement utilisé : l'appelant n'annonce pas « ouvert dans Gmail » quand le
     message vient d'être déposé dans les espaces personnels, et inversement. */
  onEnvoye: (canal: 'gmail' | 'interne' | 'email') => void
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
  const [enCours, setEnCours] = useState<'envoi' | 'enregistrement' | 'interne' | 'email' | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)
  /* Vrai dès que l'admin a touché au texte : l'aperçu ne doit plus être recalculé derrière lui
     quand il ajoute un destinataire, sinon il perd ses corrections sans comprendre pourquoi. */
  const [texteRetouche, setTexteRetouche] = useState(false)

  /* Vivier des destinataires. L'adresse vient des listes admin (élèves, professeurs) et non de
     l'annuaire, qui ne porte aucune coordonnée (0090) : elle ne sert qu'à RETROUVER la personne
     quand l'admin colle son adresse au lieu de taper son nom — elle n'est jamais affichée. */
  const candidats = useMemo(() => {
    const emailParId = new Map(
      [...etudiants, ...professeurs].filter((p) => p.email).map((p) => [p.id, p.email as string]),
    )
    return personnes.map((p) => ({
      id: p.id,
      nom: p.nom,
      prenom: p.prenom,
      role: LIBELLE_ROLE[p.role] ?? p.role,
      email: emailParId.get(p.id) ?? null,
    }))
  }, [personnes, etudiants, professeurs])

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

  /* Une sélection peut désormais mêler des personnes INSCRITES (un uuid de profil) et des
     adresses e-mail LIBRES, pour écrire à quelqu'un qui n'a pas de compte — un prospect, le plus
     souvent (demande client du 2026-10-31). Les deux ne vont pas aux mêmes endroits : seules les
     premières peuvent recevoir un message interne ou figurer dans les colonnes `uuid[]` de la
     base, alors que Gmail se moque de savoir qui est inscrit. */
  const profilsObligatoires = useMemo(() => obligatoires.filter((id) => !estAdresseLibre(id)), [obligatoires])
  const profilsOptionnels = useMemo(() => optionnels.filter((id) => !estAdresseLibre(id)), [optionnels])
  const adressesObligatoires = useMemo(() => obligatoires.filter(estAdresseLibre).map(adresseDepuisId), [obligatoires])
  const adressesOptionnelles = useMemo(() => optionnels.filter(estAdresseLibre).map(adresseDepuisId), [optionnels])

  /* Adresses des personnes choisies, lues au moment du clic plutôt que gardées en mémoire : la
     policy `profiles_admin_select_etablissement` (0004) autorise l'admin à lire les profils de
     son établissement, e-mail compris — l'annuaire utilisé par le sélecteur, lui, ne porte que
     les noms (vue `annuaire_etablissement`, 0090). Les comptes supprimés sont écartés, comme le
     faisait la route serveur qu'on remplace. */
  async function adressesDe(ids: string[]): Promise<{ emails: string[]; sansAdresse: string[] }> {
    if (ids.length === 0) return { emails: [], sansAdresse: [] }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, prenom, nom')
      .in('id', ids)
      .neq('status', 'suspended')
    if (error) throw new Error(error.message)
    const emails: string[] = []
    const sansAdresse: string[] = []
    for (const id of ids) {
      const personne = (data ?? []).find((p) => p.id === id)
      if (personne?.email) emails.push(personne.email)
      else sansAdresse.push(personne ? `${personne.prenom ?? ''} ${personne.nom ?? ''}`.trim() : 'un destinataire')
    }
    return { emails, sansAdresse }
  }

  async function appeler(action: 'envoi' | 'enregistrement' | 'interne' | 'email') {
    /* Avant correctif (signalé par le client le 2026-10-10) : une session absente sortait
       silencieusement ici, sans la moindre trace à l'écran — le bouton redevenait cliquable, et
       rien n'indiquait que rien ne s'était passé. Le même filet (try/catch/finally) couvre aussi
       toute exception imprévue plus bas : l'admin doit toujours finir avec un statut visible,
       succès ou échec, jamais un silence. */
    if (!session) {
      setErreur('Votre session a expiré. Rechargez la page et réessayez.')
      return
    }
    setErreur(null)
    setSucces(null)
    setEnCours(action)

    try {
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
          piece_jointe_nom: template?.piece_jointe_attendue ?? brouillon?.piece_jointe_nom ?? null,
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

      /* Envoi par E-MAIL depuis la boîte de HOC (0152, demande client du 2026-10-31). Seul
         chemin capable de joindre un fichier : Gmail n'accepte pas qu'on lui passe une pièce
         jointe par son URL de composition, et le modèle 2.1 annonce pourtant « la procédure en
         pièce jointe » depuis 0091. Il atteint aussi bien les inscrits que les adresses
         extérieures, et le serveur sait, lui, si l'envoi a abouti. */
      if (action === 'email') {
        const reponse = await fetch('/api/admin/envoyer-modele', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonAcces()}` },
          body: JSON.stringify({
            templateId: template?.id ?? brouillon?.template_id ?? null,
            objet: objet.trim(),
            corps: corps.trim(),
            destinatairesProfileIds: profilsObligatoires,
            copiesProfileIds: profilsOptionnels,
            adresses: adressesObligatoires,
            adressesCopies: adressesOptionnelles,
          }),
        })
          .then((r) => r.json())
          .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))

        if (reponse.error) {
          setErreur(`L'envoi a échoué : ${reponse.error}`)
          return
        }
        const combien = `${reponse.destinataires} destinataire${reponse.destinataires > 1 ? 's' : ''}`
        const jointe = reponse.pieceJointe ? ` La pièce jointe « ${reponse.pieceJointe} » est partie avec.` : ''
        setSucces(`Message envoyé par e-mail à ${combien}.${jointe}`)
        onEnvoye('email')
        return
      }

      /* Envoi INTERNE (0119, demande client du 2026-10-11) : le message ne sort pas de HOC, il est
         déposé dans la section Messages de chaque destinataire. Seul canal dont l'application
         puisse garantir l'aboutissement — c'est elle qui distribue. Les destinataires en copie
         reçoivent le même message : une messagerie personne-à-personne (0090) n'a pas de champ
         « copie », et les écarter ferait silencieusement moins que ce que l'admin a demandé. */
      if (action === 'interne') {
        /* Les comptes suspendus sont écartés AVANT l'insertion : la policy
           `messages_expediteur_insert` (0090) les refuse, et comme l'insert part en un seul lot,
           un seul destinataire suspendu ferait échouer l'envoi pour tout le monde, sur un message
           d'erreur RLS incompréhensible. */
        const demandes = [...new Set([...profilsObligatoires, ...profilsOptionnels])]
        const { data: joignables, error: erreurProfils } = await supabase
          .from('profiles')
          .select('id')
          .in('id', demandes)
          .neq('status', 'suspended')
        if (erreurProfils) {
          setErreur(`La liste des destinataires n'a pas pu être vérifiée : ${erreurProfils.message}`)
          return
        }
        const tous = (joignables ?? []).map((p) => p.id)
        if (tous.length === 0) {
          setErreur('Aucun destinataire joignable : leurs comptes sont suspendus.')
          return
        }
        const ecartes = demandes.length - tous.length

        const { error: erreurMessages } = await supabase.from('messages').insert(
          tous.map((destinataire) => ({
            etablissement_id: profile!.etablissement_id,
            expediteur_profile_id: profile!.id,
            destinataire_profile_id: destinataire,
            objet: objet.trim(),
            corps: corps.trim(),
          })),
        )
        if (erreurMessages) {
          setErreur(`L'envoi interne a échoué : ${erreurMessages.message}`)
          return
        }

        const ligneInterne = {
          etablissement_id: profile!.etablissement_id,
          template_id: template?.id ?? brouillon?.template_id ?? null,
          destinataires_profile_ids: obligatoires,
          copies_profile_ids: optionnels,
          objet: objet.trim(),
          corps: corps.trim(),
          piece_jointe_nom: template?.piece_jointe_attendue ?? brouillon?.piece_jointe_nom ?? null,
          statut: 'interne' as const,
          cree_par_profile_id: profile!.id,
        }
        const { error: erreurJournalInterne } = brouillon
          ? await supabase.from('email_envois').update(ligneInterne).eq('id', brouillon.id)
          : await supabase.from('email_envois').insert(ligneInterne)

        const combien = `${tous.length} destinataire${tous.length > 1 ? 's' : ''}`
        const suspendus = ecartes > 0 ? ` ${ecartes} compte${ecartes > 1 ? 's' : ''} suspendu${ecartes > 1 ? 's' : ''} écarté${ecartes > 1 ? 's' : ''}.` : ''
        setSucces(
          erreurJournalInterne
            ? `Message envoyé dans l'espace personnel de ${combien}.${suspendus} Il n'a pas pu être ajouté à l'historique (${erreurJournalInterne.message}).`
            : `Message envoyé dans l'espace personnel de ${combien}, section Messages.${suspendus}`,
        )
        onEnvoye('interne')
        return
      }

      /* Le message n'est plus POSTÉ par l'application : il est PRÉPARÉ dans la boîte Gmail de
         l'établissement, et c'est l'admin qui l'envoie après relecture (demande client du
         2026-10-11). Voir lib/compositionEmail.ts pour les conséquences de ce choix. */
      const [principaux, copies] = await Promise.all([adressesDe(profilsObligatoires), adressesDe(profilsOptionnels)])
      const sansAdresse = [...principaux.sansAdresse, ...copies.sansAdresse]
      if (sansAdresse.length > 0) {
        setErreur(`Aucune adresse e-mail enregistrée pour : ${sansAdresse.join(', ')}. Complétez sa fiche avant d'envoyer.`)
        return
      }

      const lien = lienCompositionGmail({
        expediteur: EMAIL_OFFICIEL_HOC,
        destinataires: principaux.emails,
        copies: copies.emails,
        objet: objet.trim(),
        corps: corps.trim(),
      })
      if (lien.length > LONGUEUR_MAX_LIEN) {
        setErreur(
          'Ce message est trop long pour être transmis à Gmail par un lien. Raccourcissez-le, ou copiez-collez le texte directement dans Gmail.',
        )
        return
      }

      /* Onglet neuf plutôt que la fenêtre courante : l'admin garde son brouillon à l'écran
         derrière Gmail, et peut y revenir si quelque chose ne va pas. Un bloqueur de pop-up peut
         refuser l'ouverture — le cas est dit explicitement plutôt que laissé sans réponse. */
      const onglet = window.open(lien, '_blank', 'noopener,noreferrer')
      if (!onglet) {
        setErreur(
          'Votre navigateur a bloqué l’ouverture de Gmail. Autorisez les fenêtres surgissantes pour ce site, puis réessayez.',
        )
        return
      }

      /* Journalisé « préparé », jamais « envoyé » : l'application ne peut pas savoir si l'admin a
         cliqué « Envoyer » dans Gmail (0117). Écrit directement par le navigateur, comme le
         brouillon — la policy `email_envois_admin_all` (0091) l'autorise. */
      const ligne = {
        etablissement_id: profile!.etablissement_id,
        template_id: template?.id ?? brouillon?.template_id ?? null,
        destinataires_profile_ids: obligatoires,
        copies_profile_ids: optionnels,
        destinataires_emails: [...principaux.emails, ...adressesObligatoires, ...copies.emails, ...adressesOptionnelles],
        objet: objet.trim(),
        corps: corps.trim(),
        piece_jointe_nom: template?.piece_jointe_attendue ?? brouillon?.piece_jointe_nom ?? null,
        statut: 'prepare' as const,
        cree_par_profile_id: profile!.id,
      }
      const { error: erreurJournal } = brouillon
        ? await supabase.from('email_envois').update(ligne).eq('id', brouillon.id)
        : await supabase.from('email_envois').insert(ligne)

      setSucces(
        erreurJournal
          ? `Message ouvert dans Gmail — relisez-le puis cliquez « Envoyer » dans Gmail. Il n’a pas pu être ajouté à l’historique (${erreurJournal.message}).`
          : 'Message ouvert dans Gmail — relisez-le puis cliquez « Envoyer » dans Gmail.',
      )
      onEnvoye('gmail')
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
  /* Ce qui manque, dit à l'écran. Les trois boutons partagent la condition `pret`, mais seul
     « Envoyer via gmail » en montrait quelque chose (son opacité) : l'admin voyait un bouton pâle
     qui ne réagissait pas, sans jamais savoir pourquoi — signalé le 2026-10-31, alors qu'une
     adresse avait bien été TAPÉE dans le champ des destinataires sans être SÉLECTIONNÉE dans la
     liste, laissant la sélection vide. */
  /* « Envoyer » dépose le message dans l'espace personnel du destinataire, et « Enregistrer »
     écrit un brouillon dont les colonnes de destinataires sont des `uuid[]` (0091) : les deux
     exigent donc un compte HOC. Gmail, lui, écrit à n'importe quelle adresse — c'est tout l'objet
     de la demande du 2026-10-31. */
  const pretInterne = pret && profilsObligatoires.length > 0
  const raisonBlocage = !pret
    ? obligatoires.length === 0
      ? 'Choisissez au moins un destinataire obligatoire : tapez son nom, ou une adresse e-mail complète pour quelqu’un qui n’est pas inscrit — puis cliquez sur la proposition.'
      : !objet.trim()
        ? 'Renseignez l’objet du message.'
        : 'Le message est vide.'
    : !pretInterne
      ? 'Destinataire externe à HOC : seul « Envoyer via gmail » peut l’atteindre. « Envoyer » dépose le message dans un espace personnel, et « Enregistrer » garde un brouillon — ni l’un ni l’autre n’existe pour une adresse sans compte.'
      : null

  return (
    <Modale titre={titre} onFermer={onFermer} largeurMax={720} fermetureExterieureDesactivee>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        {template?.quand && <MessageInfo>Quand l’utiliser : {template.quand}</MessageInfo>}

        {/* L'admin doit voir d'où partira le message — et comprendre que c'est LUI qui l'envoie
            depuis Gmail, l'application ne faisant que le préparer (demande client du
            2026-10-11). */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={etiquetteStyle}>Expéditeur</span>
          <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
            Le message s’ouvrira dans Gmail, depuis <strong>{EMAIL_OFFICIEL_HOC}</strong> — relisez-le, puis envoyez-le
            depuis Gmail.
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
              autoriserAdresseLibre
            />
            <SelecteurPersonnes
              etiquette="Destinataires optionnels (en copie)"
              placeholder="Rechercher une personne…"
              candidats={candidats}
              selectionnes={optionnels}
              onChange={setOptionnels}
              exclure={obligatoires}
              autoriserAdresseLibre
            />
          </>
        )}

        {/* Plus de sélecteur de fichier : aucun navigateur n'autorise une pièce jointe à être
            pré-attachée par un lien, quel qu'il soit (voir lib/compositionEmail.ts). Demander un
            fichier ici laisserait croire qu'il partira avec le message. On rappelle donc
            simplement ce que ce modèle attend, pour que l'admin le joigne dans Gmail. */}
        {/* Depuis 0152, un modèle peut porter un VRAI document (Documents › Partageables) :
            « Envoyer par e-mail » le joint lui-même. Gmail, lui, ne le peut toujours pas —
            aucun navigateur n'autorise une pièce jointe à être pré-attachée par un lien (voir
            lib/compositionEmail.ts) — d'où deux messages distincts. */}
        {template?.piece_jointe_document_id ? (
          <MessageInfo>
            Pièce jointe{template.piece_jointe_attendue ? ` « ${template.piece_jointe_attendue} »` : ''} : jointe
            automatiquement par <strong>Envoyer par e-mail</strong>. Par Gmail, joignez-la vous-même avant d’envoyer.
          </MessageInfo>
        ) : (
          template?.piece_jointe_attendue && (
            <MessageInfo>
              Pièce jointe attendue : <strong>{template.piece_jointe_attendue}</strong>. À joindre vous-même dans Gmail,
              avant d’envoyer.
            </MessageInfo>
          )
        )}

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

        {/* Une fois `succes` acquis (envoi ou brouillon), les boutons d'action laissent place à un
            simple « Fermer » — demande client du 2026-10-11. Avant ce correctif, « Envoyer » et
            « Enregistrer » restaient actifs après succès (seul `enCours` les désactivait
            temporairement) : rien n'empêchait un second clic sur « Envoyer » de renvoyer le même
            e-mail une seconde fois, et rien ne distinguait « c'est fait » de « c'est prêt à
            refaire ». */}
        {succes ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
            <button type="button" onClick={onFermer} className="btn-shine" style={boutonPrimaireStyle}>
              Fermer
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border-soft)', paddingTop: 14, flexWrap: 'wrap' }}>
            {raisonBlocage && (
              <span style={{ flexBasis: '100%', fontSize: 12, color: 'var(--warning)', lineHeight: 1.55, textAlign: 'right', marginBottom: 4 }}>
                {raisonBlocage}
              </span>
            )}
            <button type="button" onClick={onFermer} style={boutonNeutreStyle}>
              Annuler
            </button>
            {/* Opacité posée aussi sur ces deux-là : sans elle, ils paraissaient actifs alors
                qu'ils portent exactement la même condition que « Envoyer via gmail ». */}
            <button
              type="button"
              onClick={() => appeler('enregistrement')}
              disabled={enCours !== null || !pretInterne}
              style={{ ...boutonSecondaireStyle, opacity: enCours !== null || !pretInterne ? 0.6 : 1 }}
            >
              {enCours === 'enregistrement' ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            {/* Envoi interne (0119) : canal distinct de Gmail, d'où un bouton distinct plutôt
                qu'un choix caché dans un menu — les deux partent du même texte relu à l'écran. */}
            <button
              type="button"
              onClick={() => appeler('interne')}
              disabled={enCours !== null || !pretInterne}
              style={{ ...boutonSecondaireStyle, opacity: enCours !== null || !pretInterne ? 0.6 : 1 }}
            >
              {enCours === 'interne' ? 'Envoi…' : 'Envoyer'}
            </button>
            {/* Envoi réel depuis la boîte de HOC. Mêmes destinataires acceptés que Gmail —
                inscrits comme adresses extérieures — mais c'est le serveur qui expédie, donc il
                peut joindre la pièce du modèle et savoir si c'est parti. */}
            <button
              type="button"
              onClick={() => appeler('email')}
              disabled={enCours !== null || !pret}
              className="btn-shine"
              style={{ ...boutonPrimaireStyle, fontSize: 12.5, padding: '9px 18px', opacity: enCours !== null || !pret ? 0.6 : 1 }}
            >
              {enCours === 'email' ? 'Envoi…' : 'Envoyer par e-mail'}
            </button>
            <button
              type="button"
              onClick={() => appeler('envoi')}
              disabled={enCours !== null || !pret}
              style={{ ...boutonSecondaireStyle, opacity: enCours !== null || !pret ? 0.6 : 1 }}
            >
              {enCours === 'envoi' ? 'Ouverture…' : 'Envoyer via gmail'}
            </button>
          </div>
        )}

        {!succes && (
          <span style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.55, textAlign: 'right' }}>
            <strong style={{ color: 'var(--ink-2)' }}>Envoyer</strong> dépose le message dans l’application, section
            Messages de l’espace personnel de chaque destinataire — il ne part pas par e-mail.{' '}
            <strong style={{ color: 'var(--ink-2)' }}>Envoyer par e-mail</strong> l’expédie depuis la boîte de Hari
            Online Club, pièce jointe comprise.{' '}
            <strong style={{ color: 'var(--ink-2)' }}>Envoyer via gmail</strong> ouvre le message dans Gmail, où vous le
            relisez et l’envoyez vous-même.
          </span>
        )}

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
