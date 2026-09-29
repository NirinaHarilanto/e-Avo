/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database, FichierCandidature } from '../../src/types/database.types.js'
import { creerNotification } from '../_lib/notifications.js'
import { adminsDeLEtablissement } from '../_lib/reservation.js'
import { envoyerEmail, modeleCandidatureRecue } from '../_lib/email.js'

export const config = { runtime: 'edge' }

interface Corps {
  etablissementSlug?: string
  dossierId?: string
  prenom?: string
  nom?: string
  email?: string
  telephone?: string
  ville?: string
  motivation?: string
  experiences?: string
  diplomeDeclare?: string
  fichiers?: { chemin?: string; nom?: string; type?: string }[]
}

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const DIPLOMES = new Set(['licence_anglais', 'tefl', 'licence_et_tefl', 'autre'])

/**
 * Dépôt d'une candidature formateur depuis « Rejoignez-nous ! » (0082), sans authentification.
 * Chaque fichier annoncé doit exister réellement dans le stockage, sous le dossier réservé par
 * preparer-envoi.ts pour cet établissement — sans quoi on pourrait rattacher le fichier d'un
 * autre candidat à son dossier.
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
    const c = (await request.json()) as Corps
    const prenom = c.prenom?.trim()
    const nom = c.nom?.trim()
    const email = c.email?.trim().toLowerCase()
    const motivation = c.motivation?.trim()
    const experiences = c.experiences?.trim()
    if (!c.etablissementSlug || !c.dossierId || !UUID.test(c.dossierId)) {
      return Response.json({ error: 'Dossier invalide, recommencez l’envoi.' }, { status: 400 })
    }
    if (!prenom || !nom || !email || !motivation || !experiences || !c.diplomeDeclare) {
      return Response.json({ error: 'Merci de remplir tous les champs obligatoires.' }, { status: 400 })
    }
    if (!EMAIL_VALIDE.test(email)) {
      return Response.json({ error: 'Adresse e-mail invalide.' }, { status: 400 })
    }
    if (!DIPLOMES.has(c.diplomeDeclare)) {
      return Response.json({ error: 'Diplôme déclaré invalide.' }, { status: 400 })
    }
    if (motivation.length > 5000 || experiences.length > 5000) {
      return Response.json({ error: 'Texte trop long (5 000 caractères au maximum par champ).' }, { status: 400 })
    }

    const serviceClient = createClient<Database>(url, serviceKey)
    const { data: etablissement } = await serviceClient.from('etablissements').select('id, nom').eq('slug', c.etablissementSlug).maybeSingle()
    if (!etablissement) {
      return Response.json({ error: 'Établissement introuvable.' }, { status: 404 })
    }

    const dossier = `${etablissement.id}/${c.dossierId}`
    const { data: deposes } = await serviceClient.storage.from('candidatures').list(dossier)
    const presents = new Set((deposes ?? []).map((f) => `${dossier}/${f.name}`))
    const fichiers: FichierCandidature[] = []
    for (const f of c.fichiers ?? []) {
      if (!f.chemin || !presents.has(f.chemin) || (f.type !== 'cv' && f.type !== 'diplome')) {
        return Response.json({ error: 'Un fichier n’a pas été reçu, recommencez l’envoi.' }, { status: 400 })
      }
      fichiers.push({ chemin: f.chemin, nom: (f.nom ?? 'document').slice(0, 150), type: f.type })
    }
    if (!fichiers.some((f) => f.type === 'cv')) {
      return Response.json({ error: 'Le CV est obligatoire.' }, { status: 400 })
    }
    if (!fichiers.some((f) => f.type === 'diplome')) {
      return Response.json({ error: 'Joignez votre licence en études anglophones ou votre certificat TEFL.' }, { status: 400 })
    }

    const { data: dejaCandidat } = await serviceClient
      .from('candidatures_formateurs')
      .select('id')
      .eq('etablissement_id', etablissement.id)
      .eq('email', email)
      .in('statut', ['recue', 'preselection', 'tests', 'simulation', 'integration'])
      .limit(1)
      .maybeSingle()
    if (dejaCandidat) {
      return Response.json({ error: 'Une candidature est déjà en cours d’examen avec cette adresse e-mail.' }, { status: 409 })
    }

    const { data: candidature, error } = await serviceClient
      .from('candidatures_formateurs')
      .insert({
        id: c.dossierId,
        etablissement_id: etablissement.id,
        prenom,
        nom,
        email,
        telephone: c.telephone?.trim() || null,
        ville: c.ville?.trim() || null,
        motivation,
        experiences,
        diplome_declare: c.diplomeDeclare as 'licence_anglais' | 'tefl' | 'licence_et_tefl' | 'autre',
        fichiers,
      })
      .select('id')
      .single()
    if (error || !candidature) {
      return Response.json({ error: error?.message ?? 'La candidature n’a pas pu être enregistrée.' }, { status: 500 })
    }

    const admins = await adminsDeLEtablissement(serviceClient, etablissement.id)
    await Promise.all(
      admins.map((adminId) =>
        creerNotification(serviceClient, {
          etablissementId: etablissement.id,
          destinataireProfileId: adminId,
          type: 'candidature_formateur',
          titre: `Nouvelle candidature formateur · ${prenom} ${nom}`,
          message: 'Dossier reçu depuis « Rejoignez-nous ». À examiner dans Recrutement.',
          lien: '/admin/recrutement',
        }),
      ),
    )
    await envoyerEmail({
      destinataire: email,
      sujet: `Votre candidature chez ${etablissement.nom}`,
      html: modeleCandidatureRecue({ prenom, etablissement: etablissement.nom }),
    })

    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
