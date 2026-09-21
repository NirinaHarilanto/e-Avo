/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { corriger, type ReponseCandidat } from '../../src/lib/quiz.js'
import { creerNotification } from '../_lib/notifications.js'
import { adminsDeLEtablissement } from '../_lib/reservation.js'
import { envoyerEmail, modeleTestPositionnementInscrit } from '../_lib/email.js'
import { creneauxTestOuverts } from './test-positionnement.js'

export const config = { runtime: 'edge' }

interface CorpsInscription {
  etablissementSlug?: string
  creneauId?: string
  nom?: string
  prenom?: string
  email?: string
  telephone?: string
  objectif?: string
  reponses?: ReponseCandidat[]
}

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Inscription d'un candidat au test oral d'une vague, quiz écrit à l'appui — demande client du
 * 2026-09-21 (point 5). Trois choses se passent ici et nulle part ailleurs : la correction du
 * quiz (les bonnes réponses ne quittent jamais le serveur), la vérification qu'il reste une
 * place sur le créneau, et la génération du bilan rattaché au dossier du prospect.
 *
 * La réservation n'est validée que par le quiz : c'est la règle voulue par le client, un
 * candidat qui abandonne en cours de questionnaire ne bloque donc aucune place.
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
    const corps = (await request.json()) as CorpsInscription
    const nom = corps.nom?.trim()
    const prenom = corps.prenom?.trim()
    const email = corps.email?.trim().toLowerCase()

    if (!corps.etablissementSlug || !corps.creneauId || !nom || !prenom || !email) {
      return Response.json({ error: 'Nom, prénom, e-mail et créneau sont obligatoires.' }, { status: 400 })
    }
    if (!EMAIL_VALIDE.test(email)) {
      return Response.json({ error: 'Adresse e-mail invalide.' }, { status: 400 })
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

    const ouverts = await creneauxTestOuverts(serviceClient, etablissement.id)
    const creneau = ouverts.find((c) => c.id === corps.creneauId)
    if (!creneau) {
      return Response.json(
        { error: 'Ce créneau n’est plus disponible. Choisissez-en un autre.' },
        { status: 409 },
      )
    }

    const { data: questions } = await serviceClient
      .from('quiz_questions')
      .select('id, ordre, enonce, options, bonne_reponse')
      .eq('etablissement_id', etablissement.id)
      .eq('actif', true)
      .order('ordre')
    if (!questions || questions.length === 0) {
      return Response.json({ error: 'Aucun questionnaire n’est configuré pour le moment.' }, { status: 409 })
    }

    const resultat = corriger(questions, corps.reponses ?? [])

    const { data: prospect, error: erreurProspect } = await serviceClient
      .from('prospects')
      .insert({
        etablissement_id: etablissement.id,
        nom,
        prenom,
        email,
        telephone: corps.telephone?.trim() || null,
        langue_visee: 'Anglais',
        objectif: corps.objectif?.trim() || null,
        type_programme: 'collectif',
        statut: 'diagnostic_planifie',
      })
      .select('id')
      .single()
    if (erreurProspect || !prospect) {
      return Response.json({ error: "Votre inscription n'a pas pu être enregistrée." }, { status: 500 })
    }

    const { error: erreurInscription } = await serviceClient.from('test_positionnement_inscriptions').insert({
      etablissement_id: etablissement.id,
      creneau_id: creneau.id,
      prospect_id: prospect.id,
      reponses: corps.reponses ?? [],
      score: resultat.score,
      total: resultat.total,
      niveau_estime: resultat.niveau,
      bilan: resultat.bilan,
    })
    if (erreurInscription) {
      return Response.json({ error: "Votre inscription n'a pas pu être enregistrée." }, { status: 500 })
    }

    const admins = await adminsDeLEtablissement(serviceClient, etablissement.id)

    /* Le diagnostic porte déjà le niveau issu du quiz : l'admin retrouve la note sur la fiche
       du prospect sans avoir à ouvrir le détail du test, et le niveau suivra l'élève dans son
       dossier s'il est converti. `mene_par` référence un profil réel (contrainte de clé
       étrangère) : sans aucun admin approuvé, on s'en passe plutôt que d'inventer un auteur —
       l'inscription et son bilan restent enregistrés. */
    if (admins[0]) {
      await serviceClient.from('diagnostic_calls').insert({
        etablissement_id: etablissement.id,
        prospect_id: prospect.id,
        mene_par: admins[0],
        date_appel: creneau.debut,
        niveau_evalue: resultat.niveau,
        notes: resultat.bilan,
      })
    }

    const quand = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Indian/Antananarivo',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date(creneau.debut))

    await Promise.all(
      admins.map((destinataire) =>
        creerNotification(serviceClient, {
          etablissementId: etablissement.id,
          destinataireProfileId: destinataire,
          type: 'test_positionnement',
          titre: 'Nouveau candidat au test de positionnement',
          message: `${prenom} ${nom} a obtenu ${resultat.score}/${resultat.total} (${resultat.niveau}) et s'inscrit au test oral du ${quand}.`,
          lien: '/admin/vagues',
        }),
      ),
    )

    await envoyerEmail({
      destinataire: email,
      sujet: `Votre test de positionnement avec ${etablissement.nom}`,
      html: modeleTestPositionnementInscrit({
        prenom,
        etablissement: etablissement.nom,
        quand,
        vague: creneau.vague,
        score: resultat.score,
        total: resultat.total,
        niveau: resultat.niveau,
      }),
    })

    return Response.json({
      ok: true,
      score: resultat.score,
      total: resultat.total,
      niveau: resultat.niveau,
      quand,
      vague: creneau.vague,
    })
  } catch {
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
