/// <reference types="node" />

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
  destinataire: string
  sujet: string
  html: string
}

export async function envoyerEmail(params: ParamsEmail): Promise<{ envoye: boolean; erreur?: string }> {
  const cle = process.env.RESEND_API_KEY
  const expediteur = process.env.RESEND_FROM
  if (!cle || !expediteur) {
    return { envoye: false, erreur: 'Resend non configuré.' }
  }

  try {
    const reponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: expediteur,
        to: [params.destinataire],
        subject: params.sujet,
        html: params.html,
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
function coquille(contenu: string): string {
  return `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;color:#1b1630">
  <div style="font-size:20px;font-weight:700;letter-spacing:1px;color:#4A306D;margin-bottom:22px">HARI Online Club</div>
  ${contenu}
  <p style="margin-top:28px;font-size:12px;color:#8b8698">Ce message vous est envoyé par Hari Online Club suite à votre demande sur notre site.</p>
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

/* Les valeurs viennent d'un formulaire public : elles se retrouvent dans du HTML envoyé par
   e-mail, donc échappées comme n'importe quelle donnée non maîtrisée. */
function echapper(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
