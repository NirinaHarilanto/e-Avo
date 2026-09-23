/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database, TypeProgrammeProspect } from '../../src/types/database.types.js'
import { creerNotification } from '../_lib/notifications.js'
import { adminsDeLEtablissement, creneauxLibres } from '../_lib/reservation.js'
import { envoyerEmail, modeleDemandeRecue } from '../_lib/email.js'

export const config = { runtime: 'edge' }

type TypeProgramme = TypeProgrammeProspect

interface CorpsDuo {
  prenom?: string
  nom?: string
  email?: string
  telephone?: string
  objectif?: string
  nomGroupe?: string
}

interface CorpsReservation {
  etablissementSlug?: string
  creneau?: string
  nom?: string
  prenom?: string
  email?: string
  telephone?: string
  langueVisee?: string
  objectif?: string
  typeProgramme?: TypeProgramme
  message?: string
  /* Présent uniquement pour typeProgramme === 'duo' — demande client du 2026-09-21 : les deux
     personnes du binôme réservent ensemble, un seul appel diagnostic pour les deux. */
  duo?: CorpsDuo
}

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Réservation d'un appel diagnostic depuis la page vitrine, sans authentification.
 *
 * Le créneau demandé est revérifié ici contre la liste réellement libre : la page a pu rester
 * ouverte plusieurs minutes, et rien n'empêche par ailleurs d'appeler ce endpoint à la main avec
 * n'importe quelle date. C'est aussi la raison pour laquelle `rendez_vous` n'a aucune policy
 * d'insertion cliente — tout passe obligatoirement par ici.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !serviceKey) {
    return Response.json({ error: 'Configuration Supabase serveur manquante.' }, { status: 500 })
  }

  try {
    const corps = (await request.json()) as CorpsReservation
    const nom = corps.nom?.trim()
    const prenom = corps.prenom?.trim()
    const email = corps.email?.trim().toLowerCase()
    const creneau = corps.creneau

    if (!corps.etablissementSlug || !creneau || !nom || !prenom || !email) {
      return Response.json({ error: 'Nom, prénom, e-mail et créneau sont obligatoires.' }, { status: 400 })
    }
    if (!EMAIL_VALIDE.test(email)) {
      return Response.json({ error: 'Adresse e-mail invalide.' }, { status: 400 })
    }
    if (Number.isNaN(new Date(creneau).getTime())) {
      return Response.json({ error: 'Créneau invalide.' }, { status: 400 })
    }

    const estDuo = corps.typeProgramme === 'duo'
    const nom2 = corps.duo?.nom?.trim()
    const prenom2 = corps.duo?.prenom?.trim()
    const email2 = corps.duo?.email?.trim().toLowerCase()
    if (estDuo) {
      if (!nom2 || !prenom2 || !email2) {
        return Response.json({ error: 'Le nom, le prénom et l’e-mail de la deuxième personne sont obligatoires pour un duo.' }, { status: 400 })
      }
      if (!EMAIL_VALIDE.test(email2)) {
        return Response.json({ error: 'Adresse e-mail de la deuxième personne invalide.' }, { status: 400 })
      }
    }

    const serviceClient = createClient<Database>(url, serviceKey)

    const { data: etablissement } = await serviceClient
      .from('etablissements')
      .select('id, nom')
      .eq('slug', corps.etablissementSlug)
      .maybeSingle()
    if (!etablissement) {
      return Response.json({ error: 'Établissement introuvable.' }, { status: 404 })
    }

    const { creneaux, dureeMinutes, fuseau } = await creneauxLibres(serviceClient, etablissement.id)
    const demande = new Date(creneau).toISOString()
    if (!creneaux.includes(demande)) {
      return Response.json(
        { error: "Ce créneau vient d'être pris ou n'est plus proposé. Choisissez-en un autre." },
        { status: 409 },
      )
    }

    const { data: prospect, error: erreurProspect } = await serviceClient
      .from('prospects')
      .insert({
        etablissement_id: etablissement.id,
        nom,
        prenom,
        email,
        telephone: corps.telephone?.trim() || null,
        langue_visee: corps.langueVisee?.trim() || null,
        objectif: corps.objectif?.trim() || null,
        type_programme: corps.typeProgramme ?? 'individuel',
        statut: 'diagnostic_planifie',
        duo_nom_groupe: estDuo ? corps.duo?.nomGroupe?.trim() || null : null,
      })
      .select('id')
      .single()

    if (erreurProspect || !prospect) {
      return Response.json({ error: "Votre demande n'a pas pu être enregistrée." }, { status: 500 })
    }

    // Second dossier du binôme, lié symétriquement au premier — demande client du 2026-09-21.
    // Un échec ici ne doit pas laisser le premier prospect orphelin d'un rendez-vous : on
    // continue avec ce qu'on a plutôt que d'annuler toute la réservation pour un second dossier
    // qui pourra être recréé/relié à la main par l'admin si besoin.
    let prospect2Id: string | null = null
    if (estDuo && nom2 && prenom2 && email2) {
      const { data: prospect2 } = await serviceClient
        .from('prospects')
        .insert({
          etablissement_id: etablissement.id,
          nom: nom2,
          prenom: prenom2,
          email: email2,
          telephone: corps.duo?.telephone?.trim() || null,
          langue_visee: corps.langueVisee?.trim() || null,
          // Chaque membre du duo a son propre objectif (demande client du 2026-09-23) — le champ
          // manquait ici, la première personne étant seule à l'avoir jusque-là.
          objectif: corps.duo?.objectif?.trim() || null,
          type_programme: 'duo',
          statut: 'diagnostic_planifie',
          duo_partenaire_id: prospect.id,
          duo_nom_groupe: corps.duo?.nomGroupe?.trim() || null,
        })
        .select('id')
        .single()
      if (prospect2) {
        prospect2Id = prospect2.id
        await serviceClient.from('prospects').update({ duo_partenaire_id: prospect2.id }).eq('id', prospect.id)
      }
    }

    const { data: rendezVous, error: erreurRdv } = await serviceClient
      .from('rendez_vous')
      .insert({
        etablissement_id: etablissement.id,
        prospect_id: prospect.id,
        debut: demande,
        duree_minutes: dureeMinutes,
        message: corps.message?.trim() || null,
      })
      .select('id')
      .single()

    if (erreurRdv || !rendezVous) {
      /* L'index unique partiel sur (etablissement_id, debut) a tranché entre deux visiteurs
         simultanés : le créneau était libre à la vérification, il ne l'est plus à l'écriture. */
      const conflit = erreurRdv?.code === '23505'
      return Response.json(
        {
          error: conflit
            ? "Ce créneau vient d'être réservé par quelqu'un d'autre. Choisissez-en un autre."
            : "Votre demande n'a pas pu être enregistrée.",
        },
        { status: conflit ? 409 : 500 },
      )
    }

    const quand = new Intl.DateTimeFormat('fr-FR', {
      timeZone: fuseau,
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date(demande))

    const nomDemandeur = prospect2Id ? `${prenom} ${nom} et ${prenom2} ${nom2}` : `${prenom} ${nom}`

    /* Notification interne à tous les admins : c'est elle qui rend l'établissement réactif, sans
       dépendre d'un e-mail qui peut se perdre ou attendre. */
    const admins = await adminsDeLEtablissement(serviceClient, etablissement.id)
    await Promise.all(
      admins.map((destinataire) =>
        creerNotification(serviceClient, {
          etablissementId: etablissement.id,
          destinataireProfileId: destinataire,
          type: 'rendez_vous_demande',
          titre: 'Nouvelle demande d’appel diagnostic',
          message: `${nomDemandeur} demande${prospect2Id ? 'nt' : ''} un appel le ${quand}.`,
          lien: '/admin/rendez-vous',
        }),
      ),
    )

    /* Accusé de réception aux deux personnes en duo, ou au seul prospect sinon. Sans clé Resend
       configurée, l'envoi est simplement ignoré et la réservation reste valide — l'e-mail est un
       confort, pas une étape du flux. */
    await envoyerEmail({
      destinataire: email,
      sujet: `Votre demande d’appel avec ${etablissement.nom}`,
      html: modeleDemandeRecue({ prenom, etablissement: etablissement.nom, quand }),
    })
    if (prospect2Id && email2 && prenom2) {
      await envoyerEmail({
        destinataire: email2,
        sujet: `Votre demande d’appel avec ${etablissement.nom}`,
        html: modeleDemandeRecue({ prenom: prenom2, etablissement: etablissement.nom, quand }),
      })
    }

    return Response.json({ ok: true, rendezVousId: rendezVous.id, quand })
  } catch {
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
