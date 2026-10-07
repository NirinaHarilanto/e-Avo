/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { verifierDebit } from '../_lib/limiteDebit.js'

export const config = { runtime: 'edge' }

interface Corps {
  etablissementSlug?: string
  fichiers?: { nom?: string; type?: string; taille?: number }[]
}

const TYPES_ACCEPTES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const TAILLE_MAX = 10 * 1024 * 1024
const FICHIERS_MAX = 6

/**
 * Première étape d'une candidature formateur (0082) : le candidat n'a pas de compte, il ne peut
 * donc pas écrire dans le stockage lui-même. Le serveur réserve un identifiant de dossier et
 * émet une URL de dépôt signée par fichier, rangée sous `<établissement>/<dossier>/`. Le dossier
 * lui-même n'est créé qu'à la seconde étape (candidater.ts), une fois les fichiers déposés.
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
    const corps = (await request.json()) as Corps
    const fichiers = corps.fichiers ?? []
    if (!corps.etablissementSlug || fichiers.length === 0) {
      return Response.json({ error: 'Joignez au moins votre CV.' }, { status: 400 })
    }
    if (fichiers.length > FICHIERS_MAX) {
      return Response.json({ error: `${FICHIERS_MAX} fichiers au maximum.` }, { status: 400 })
    }
    for (const f of fichiers) {
      if (!f.nom || !f.type || !TYPES_ACCEPTES.has(f.type)) {
        return Response.json({ error: `Format non accepté pour « ${f.nom ?? 'fichier'} » : PDF, Word, JPEG ou PNG uniquement.` }, { status: 400 })
      }
      if (!f.taille || f.taille > TAILLE_MAX) {
        return Response.json({ error: `« ${f.nom} » dépasse 10 Mo.` }, { status: 400 })
      }
    }

    const serviceClient = createClient<Database>(url, serviceKey)
    /* La route la plus sensible des neuf : chaque appel délivre jusqu'à 6 autorisations de dépôt
       de 10 Mo, sans qu'aucun compte ni aucune candidature n'existe encore. Sans limite, c'était
       la porte ouverte la plus large vers une saturation du stockage Supabase. */
    const refus = await verifierDebit(request, serviceClient, { route: 'preparer-envoi', max: 5, fenetreSecondes: 3600 })
    if (refus) return refus

    const { data: etablissement } = await serviceClient.from('etablissements').select('id').eq('slug', corps.etablissementSlug).maybeSingle()
    if (!etablissement) {
      return Response.json({ error: 'Établissement introuvable.' }, { status: 404 })
    }

    const dossierId = crypto.randomUUID()
    const uploads: { nom: string; chemin: string; token: string }[] = []
    for (const [index, f] of fichiers.entries()) {
      const extension = (f.nom!.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
      const chemin = `${etablissement.id}/${dossierId}/${index + 1}.${extension}`
      const { data, error } = await serviceClient.storage.from('candidatures').createSignedUploadUrl(chemin)
      if (error || !data) {
        return Response.json({ error: error?.message ?? 'Dépôt de fichier impossible.' }, { status: 500 })
      }
      uploads.push({ nom: f.nom!, chemin, token: data.token })
    }

    return Response.json({ dossierId, uploads })
  } catch {
    return Response.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}
