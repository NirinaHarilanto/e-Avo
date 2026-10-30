/// <reference types="node" />
import { libelleVague } from '../../src/lib/cohortes.js'
import { EMAIL_OFFICIEL_HOC } from '../../src/lib/etablissement.js'

/**
 * Envoi d'e-mails transactionnels via Resend.
 *
 * Volontairement inerte tant que `RESEND_API_KEY` n'est pas posée sur Vercel : la fonction rend
 * `{ envoye: false }` au lieu de lever, et aucun appelant ne traite ce cas comme une erreur. Un
 * e-mail de confort ne doit jamais faire échouer la réservation qu'il accompagne — le prospect a
 * son rendez-vous en base et l'admin sa notification interne, e-mail ou pas. Le jour où la clé
 * est renseignée, les envois partent sans changer une ligne de code appelant.
 */

interface ParamsEmail {
  /* Un destinataire, ou plusieurs : l'envoi depuis un modèle (0091) adresse le même mail à
     plusieurs personnes à la fois. Les deux formes sont acceptées pour ne pas avoir à retoucher
     les neuf appelants existants, qui n'en visent qu'une. */
  destinataire: string | string[]
  /* Destinataires en copie — les « participants optionnels » du pop-up d'envoi. */
  copies?: string[]
  sujet: string
  html: string
  /* Pièce jointe unique (brochure, procédure, facture…), contenu déjà encodé en base64. */
  piecesJointes?: { nom: string; contenuBase64: string }[]
  /* Coordonnées de l'établissement (section « Profil HOC »), ajoutées en pied de message —
     demande client du 2026-10-19 : « dans tous les messages automatiques il faut rajouter le
     numéro de téléphone et l'adresse mail admin se trouvant dans la section Profil HOC de
     l'espace admin ». Posées ICI, au seul point de passage de TOUS les envois (gabarits de code
     comme modèles de la base), plutôt que recopiées dans chaque texte : un modèle que l'admin
     réécrit depuis son écran ne doit pas pouvoir perdre le moyen de nous joindre. */
  contact?: { telephone?: string | null; email?: string | null }
  /* Remplace l'adresse de réponse par défaut (toujours HOC, voir plus bas) — seul cas d'usage
     actuel : le formulaire de contact de la vitrine, où le message part VERS l'administration et
     doit permettre à l'admin de répondre directement au visiteur en un clic « Répondre », plutôt
     que de se répondre à elle-même. */
  replyTo?: string
}

/* Pied de page de contact. Rend une chaîne vide si le Profil HOC n'a ni téléphone ni e-mail :
   mieux vaut pas de pied de page qu'un pied de page vide annonçant « Nous joindre : ». */
export function piedDePageContact(contact: ParamsEmail['contact']): string {
  const lignes = [
    contact?.telephone?.trim() ? `Téléphone : ${echapper(contact.telephone.trim())}` : null,
    contact?.email?.trim() ? `E-mail : ${echapper(contact.email.trim())}` : null,
  ].filter((l): l is string => !!l)
  if (lignes.length === 0) return ''
  return `<div style="margin-top:22px;padding-top:14px;border-top:1px solid #e5daf8;font-size:12.5px;line-height:1.7;color:#6b6580">
  <div style="font-weight:700;color:#4A306D;margin-bottom:4px">Une question ? Nous sommes joignables</div>
  ${lignes.join('<br />')}
</div>`
}

export async function envoyerEmail(params: ParamsEmail): Promise<{ envoye: boolean; erreur?: string }> {
  const cle = process.env.RESEND_API_KEY
  const expediteur = process.env.RESEND_FROM
  if (!cle || !expediteur) {
    return { envoye: false, erreur: 'Resend non configuré.' }
  }

  /* Toute réponse part vers la boîte officielle de l'administration, quelle que soit l'adresse
     technique d'envoi (demande du 2026-10-09). Les deux diffèrent nécessairement tant que seul
     `harionlineclub.app` est vérifié chez Resend : un `from` sur un domaine non vérifié fait
     refuser l'envoi, un `reply_to` n'a lui aucune contrainte de domaine. Le jour où
     `harionlineclub.com` est vérifié, il suffit de poser `RESEND_FROM` sur l'adresse officielle —
     ce `reply_to` devient alors redondant, sans rien casser. */
  const adresseDeReponse = params.replyTo || process.env.RESEND_REPLY_TO || EMAIL_OFFICIEL_HOC

  const destinataires = (Array.isArray(params.destinataire) ? params.destinataire : [params.destinataire]).filter(Boolean)
  if (destinataires.length === 0) {
    return { envoye: false, erreur: 'Aucun destinataire.' }
  }

  try {
    const reponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: expediteur,
        to: destinataires,
        reply_to: adresseDeReponse,
        ...(params.copies?.length ? { cc: params.copies } : {}),
        subject: params.sujet,
        html: params.html + piedDePageContact(params.contact),
        ...(params.piecesJointes?.length
          ? { attachments: params.piecesJointes.map((p) => ({ filename: p.nom, content: p.contenuBase64 })) }
          : {}),
      }),
    })
    if (!reponse.ok) {
      const corps = (await reponse.text().catch(() => '')) || `HTTP ${reponse.status}`
      return { envoye: false, erreur: corps.slice(0, 300) }
    }
    return { envoye: true }
  } catch (erreur) {
    return { envoye: false, erreur: erreur instanceof Error ? erreur.message : 'Envoi impossible.' }
  }
}

/* Gabarits en HTML inline : les clients de messagerie ignorent les feuilles de style externes,
   et la moitié d'entre eux retirent aussi les balises <style> en en-tête. */
function coquille(contenu: string, piedDePage = 'Ce message vous est envoyé par Hari Online Club suite à votre demande sur notre site.'): string {
  return `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;color:#1b1630">
  <div style="font-size:20px;font-weight:700;letter-spacing:1px;color:#4A306D;margin-bottom:22px">HARI Online Club</div>
  ${contenu}
  <p style="margin-top:28px;font-size:12px;color:#8b8698">${piedDePage}</p>
</div>`
}

export function modeleDemandeRecue(params: { prenom: string; etablissement: string; quand: string }): string {
  return coquille(`
  <h1 style="font-size:19px;margin:0 0 14px">Votre demande est bien arrivée</h1>
  <p style="font-size:14px;line-height:1.65;margin:0 0 14px">Bonjour ${echapper(params.prenom)},</p>
  <p style="font-size:14px;line-height:1.65;margin:0 0 14px">
    Nous avons bien reçu votre demande d'appel diagnostic pour le <strong>${echapper(params.quand)}</strong>.
    ${echapper(params.etablissement)} vous confirme ce créneau très vite : vous recevrez alors une invitation
    avec le lien de visioconférence.
  </p>`)
}

export function modeleRendezVousConfirme(params: {
  prenom: string
  etablissement: string
  quand: string
  lienMeet: string | null
}): string {
  const bloclien = params.lienMeet
    ? `<p style="margin:0 0 18px"><a href="${echapper(params.lienMeet)}" style="display:inline-block;background:#4A306D;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px">Rejoindre la visioconférence</a></p>
       <p style="font-size:12.5px;color:#6b6580;margin:0 0 14px">Lien : ${echapper(params.lienMeet)}</p>`
    : `<p style="font-size:14px;line-height:1.65;margin:0 0 14px">Le lien de visioconférence vous sera transmis avant l'appel.</p>`

  return coquille(`
  <h1 style="font-size:19px;margin:0 0 14px">Votre appel est confirmé</h1>
  <p style="font-size:14px;line-height:1.65;margin:0 0 14px">Bonjour ${echapper(params.prenom)},</p>
  <p style="font-size:14px;line-height:1.65;margin:0 0 18px">
    ${echapper(params.etablissement)} confirme votre appel diagnostic du <strong>${echapper(params.quand)}</strong>.
  </p>
  ${bloclien}`)
}

export function modeleRendezVousRefuse(params: {
  prenom: string
  etablissement: string
  quand: string
  motif: string | null
}): string {
  return coquille(`
  <h1 style="font-size:19px;margin:0 0 14px">Votre créneau n'est plus disponible</h1>
  <p style="font-size:14px;line-height:1.65;margin:0 0 14px">Bonjour ${echapper(params.prenom)},</p>
  <p style="font-size:14px;line-height:1.65;margin:0 0 14px">
    Le créneau du ${echapper(params.quand)} ne peut finalement pas être tenu par ${echapper(params.etablissement)}.
    ${params.motif ? echapper(params.motif) : 'Nous vous invitons à choisir un autre horaire sur notre site.'}
  </p>`)
}

export function modeleRendezVousDeplace(params: { prenom: string; etablissement: string; quand: string; lienMeet: string | null }): string {
  const bloclien = params.lienMeet
    ? `<p style="margin:0 0 18px"><a href="${echapper(params.lienMeet)}" style="display:inline-block;background:#4A306D;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px">Rejoindre la visioconférence</a></p>
       <p style="font-size:12.5px;color:#6b6580;margin:0 0 14px">Lien : ${echapper(params.lienMeet)}</p>`
    : ''
  return coquille(`
  <h1 style="font-size:19px;margin:0 0 14px">Votre appel a été déplacé</h1>
  <p style="font-size:14px;line-height:1.65;margin:0 0 14px">Bonjour ${echapper(params.prenom)},</p>
  <p style="font-size:14px;line-height:1.65;margin:0 0 18px">
    ${echapper(params.etablissement)} a reprogrammé votre appel diagnostic au <strong>${echapper(params.quand)}</strong>.
  </p>
  ${bloclien}`)
}

export function modeleRendezVousAnnule(params: { prenom: string; etablissement: string; quand: string }): string {
  return coquille(`
  <h1 style="font-size:19px;margin:0 0 14px">Votre rendez-vous a été annulé</h1>
  <p style="font-size:14px;line-height:1.65;margin:0 0 14px">Bonjour ${echapper(params.prenom)},</p>
  <p style="font-size:14px;line-height:1.65;margin:0 0 14px">
    ${echapper(params.etablissement)} a annulé votre appel du ${echapper(params.quand)}. N'hésitez pas à reprendre
    contact ou à choisir un autre créneau sur notre site.
  </p>`)
}

export function modeleRelanceProspect(params: { prenom: string; etablissement: string }): string {
  return coquille(`
  <h1 style="font-size:19px;margin:0 0 14px">On vous attend chez ${echapper(params.etablissement)} !</h1>
  <p style="font-size:14px;line-height:1.65;margin:0 0 14px">Bonjour ${echapper(params.prenom)},</p>
  <p style="font-size:14px;line-height:1.65;margin:0 0 14px">
    Suite à votre appel diagnostic, il ne reste que deux petites choses à trancher pour démarrer vos cours d'anglais :
  </p>
  <ul style="font-size:14px;line-height:1.75;margin:0 0 14px;padding-left:20px">
    <li><strong>Le forfait</strong> qui vous convient le mieux, selon vos objectifs et votre budget.</li>
    <li><strong>Le rythme</strong> de vos séances (nombre d'heures par semaine, durée des sessions).</li>
  </ul>
  <p style="font-size:14px;line-height:1.65;margin:0 0 14px">
    Un petit rappel de ce que ${echapper(params.etablissement)} vous apporte : des cours en visioconférence avec un
    professeur attitré, un accompagnement individualisé à votre niveau réel, des créneaux flexibles autour de votre
    emploi du temps, et un suivi de votre progression à chaque séance.
  </p>
  <p style="font-size:14px;line-height:1.65;margin:0 0 14px">
    Répondez simplement à cet e-mail ou contactez-nous pour finaliser votre inscription — nous sommes là pour vous
    aider à choisir.
  </p>`)
}

export function modeleReinitialisationMotDePasse(params: { premiereConnexion: boolean; lien: string }): string {
  const titre = params.premiereConnexion ? 'Définissez votre mot de passe' : 'Réinitialisez votre mot de passe'
  const intro = params.premiereConnexion
    ? "Votre compte Hari Online Club vient d'être créé. Pour vous connecter pour la première fois, choisissez votre mot de passe :"
    : 'Vous avez demandé la réinitialisation de votre mot de passe Hari Online Club :'
  const libelleBouton = params.premiereConnexion ? 'Définir mon mot de passe' : 'Réinitialiser mon mot de passe'
  return coquille(`
  <h1 style="font-size:19px;margin:0 0 14px">${titre}</h1>
  <p style="font-size:14px;line-height:1.65;margin:0 0 18px">${intro}</p>
  <p style="margin:0 0 18px">
    <a href="${echapper(params.lien)}" style="display:inline-block;background:#4A306D;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px">${libelleBouton}</a>
  </p>
  <p style="font-size:12.5px;color:#6b6580;margin:0 0 14px">
    Ce lien est à usage unique et expire rapidement. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.
  </p>`)
}

export function modeleTestPositionnementInscrit(params: {
  prenom: string
  etablissement: string
  quand: string
  vague: string
  score: number
  total: number
  niveau: string
  /* Généré automatiquement à l'ouverture du créneau par l'admin (creer-creneau-test.ts), en
     tâche de fond : `null` tant que la génération n'a pas abouti (établissement sans Google
     connecté, ou inscription arrivée avant la fin de cette tâche de fond) — repli identique à
     `modeleRendezVousConfirme`, jamais une erreur bloquante pour autant. Avant le 2026-10-16, ce
     lien n'était JAMAIS envoyé au candidat : il ne vivait que dans l'écran admin (Cours
     collectifs › Session orale), malgré la promesse « vous transmet le lien de visioconférence
     avant la séance » que ce modèle affichait déjà — demande client explicite pour tenir cette
     promesse. */
  lienVisio: string | null
}): string {
  const blocLien = params.lienVisio
    ? `<p style="margin:0 0 18px"><a href="${echapper(params.lienVisio)}" style="display:inline-block;background:#4A306D;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px">Rejoindre la visioconférence</a></p>
       <p style="font-size:12.5px;color:#6b6580;margin:0 0 14px">Lien : ${echapper(params.lienVisio)}</p>`
    : `<p style="font-size:14px;line-height:1.65;margin:0 0 14px">${echapper(params.etablissement)} vous transmet le lien de visioconférence avant la séance.</p>`

  return coquille(`
  <h1 style="font-size:19px;margin:0 0 14px">Votre test oral est réservé</h1>
  <p style="font-size:14px;line-height:1.65;margin:0 0 14px">Bonjour ${echapper(params.prenom)},</p>
  <p style="font-size:14px;line-height:1.65;margin:0 0 14px">
    Votre questionnaire écrit est enregistré : <strong>${params.score}/${params.total}</strong>,
    niveau estimé <strong>${echapper(params.niveau)}</strong>. Ce résultat est indicatif, il sera confirmé
    lors de l'oral.
  </p>
  <p style="font-size:14px;line-height:1.65;margin:0 0 14px">
    Votre place est retenue pour le test oral du <strong>${echapper(params.quand)}</strong>
    (${echapper(libelleVague(params.vague))}).
  </p>
  ${blocLien}`)
}

/* Les valeurs viennent d'un formulaire public : elles se retrouvent dans du HTML envoyé par
   e-mail, donc échappées comme n'importe quelle donnée non maîtrisée. */
function echapper(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function modeleCandidatureRecue(params: { prenom: string; etablissement: string }): string {
  return coquille(`
  <h1 style="font-size:19px;margin:0 0 14px">Votre candidature est bien arrivée</h1>
  <p style="font-size:14px;line-height:1.65;margin:0 0 14px">Bonjour ${echapper(params.prenom)},</p>
  <p style="font-size:14px;line-height:1.65;margin:0 0 14px">
    Merci pour votre intérêt : ${echapper(params.etablissement)} a bien reçu votre dossier de candidature formateur.
    Notre équipe l'examine et revient vers vous pour un premier appel si votre profil correspond à nos besoins.
  </p>`)
}

/* Seul gabarit actuel adressé à l'ADMINISTRATION plutôt qu'à un visiteur ou un étudiant — d'où le
   pied de page dédié : « suite à votre demande sur notre site » n'aurait aucun sens pour l'admin,
   qui n'a rien demandé. `replyTo` (voir envoyerEmail) permet de répondre directement au visiteur
   depuis ce message, sans ressaisir son adresse. */
export function modeleMessageContact(params: { nom: string; telephone: string | null; email: string | null; projet: string }): string {
  const coordonnees = [
    `<p style="font-size:14px;line-height:1.65;margin:0 0 6px"><strong>Nom :</strong> ${echapper(params.nom)}</p>`,
    params.telephone
      ? `<p style="font-size:14px;line-height:1.65;margin:0 0 6px"><strong>Téléphone :</strong> ${echapper(params.telephone)}</p>`
      : '',
    params.email ? `<p style="font-size:14px;line-height:1.65;margin:0 0 6px"><strong>E-mail :</strong> ${echapper(params.email)}</p>` : '',
  ].join('')
  return coquille(
    `
  <h1 style="font-size:19px;margin:0 0 14px">Nouveau message depuis le site</h1>
  ${coordonnees}
  <p style="font-size:14px;line-height:1.75;margin:18px 0 0;white-space:pre-wrap">${echapper(params.projet)}</p>`,
    'Message transmis automatiquement depuis le formulaire « Nous contacter » du site.',
  )
}
