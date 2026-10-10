import { supabase } from './supabaseClient'

/* Vérification d'unicité du numéro d'un devis ou d'une facture AVANT d'enregistrer — demande
   client du 2026-10-10 : « il faudra quand même faire une vérification d'unicité du numéro [...]
   avant de le valider. Il faudrait bloquer la validation [...] si le numéro [...] existe déjà. »

   La contrainte `unique (etablissement_id, numero)` posée en base (0020, sur `quotes` comme sur
   `invoices` — une facture et un reçu partagent la même table, voir estRecu()) reste le filet de
   sécurité ultime : elle seule est fiable face à une vraie concurrence (deux admins qui valident
   au même instant). Mais attendre son erreur Postgres (23505) pour prévenir l'utilisateur est une
   UX tardive — taper, valider, échouer, recommencer. Cette fonction vérifie À L'AVANCE, pour
   bloquer la validation avant même de tenter l'écriture ; le code appelant garde néanmoins la
   gestion du code 23505 en secours, pour cette même rare concurrence. */
export async function numeroDejaUtilise(
  table: 'invoices' | 'quotes',
  etablissementId: string,
  numero: string,
  /* Identifiant de la ligne qu'on est en train de modifier. Sans lui, renommer un document en
     retouchant son numéro puis en revenant à l'identique — ou simplement le valider sans y avoir
     touché — se détecterait à tort comme un conflit avec lui-même. */
  excluId?: string,
): Promise<boolean> {
  const valeur = numero.trim()
  if (!valeur) return false
  let requete = supabase.from(table).select('id').eq('etablissement_id', etablissementId).eq('numero', valeur)
  if (excluId) requete = requete.neq('id', excluId)
  const { data } = await requete.maybeSingle()
  return !!data
}

/* Message partagé entre la vérification préalable (ci-dessus) et le secours sur l'erreur 23505,
   pour que l'admin lise exactement la même phrase quel que soit le moment où le doublon a été
   détecté. */
export function messageNumeroDejaUtilise(numero: string): string {
  return `Le numéro « ${numero} » est déjà utilisé par un autre document de cet établissement. Choisissez-en un autre.`
}
