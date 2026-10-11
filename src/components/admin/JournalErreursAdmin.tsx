import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useCacheRequete } from '../../hooks/useCacheRequete'
import { supabase } from '../../lib/supabaseClient'
import { Section } from '../ui/Section'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement } from '../ui/Etats'
import type { Database } from '../../types/database.types'

type LigneJournal = Database['public']['Tables']['journal_erreurs']['Row']

const LIBELLE_SOURCE: Record<string, string> = {
  rendu: 'Écran planté',
  promesse: 'Traitement interrompu',
  navigateur: 'Erreur navigateur',
}

/* Lecture du journal des erreurs (migration 0121) — sans cet écran, la table ne servirait à
   personne : un journal qu'on ne consulte pas ne vaut pas mieux que pas de journal du tout.

   Volontairement sobre : les 50 dernières lignes, regroupées par message pour que dix occurrences
   du même incident ne masquent pas les neuf autres incidents distincts. Pas de graphique, pas de
   filtre : ce que l'administration a besoin de savoir, c'est « est-ce que quelque chose casse
   chez mes utilisateurs en ce moment », et le cas échéant quoi et où. */
export function JournalErreursAdmin() {
  const { profile } = useProfileContext()
  const [detailOuvert, setDetailOuvert] = useState<string | null>(null)

  const { valeur: lignes, loading } = useCacheRequete(
    profile?.etablissement_id ? `journal-erreurs-${profile.etablissement_id}` : null,
    async () => {
      const { data, error } = await supabase
        .from('journal_erreurs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw new Error(error.message)
      return (data ?? []) as LigneJournal[]
    },
  )

  /* Regroupement par message : la clé d'un incident, c'est son message, pas son occurrence. On
     garde la plus récente pour la date et le chemin, et on compte le reste. */
  const groupes = (lignes ?? []).reduce<{ cle: string; derniere: LigneJournal; occurrences: number }[]>((acc, ligne) => {
    const existant = acc.find((g) => g.cle === ligne.message)
    if (existant) {
      existant.occurrences += 1
      return acc
    }
    acc.push({ cle: ligne.message, derniere: ligne, occurrences: 1 })
    return acc
  }, [])

  return (
    <Section
      titre="Journal des erreurs"
      description="Les incidents rencontrés par vos utilisateurs, enregistrés automatiquement. Vide, c’est bon signe."
      compteur={groupes.length || undefined}
    >
      {loading && !lignes ? (
        <EtatChargement lignes={2} hauteur={48} />
      ) : groupes.length === 0 ? (
        <EtatVide
          compact
          icone="valide"
          titre="Aucune erreur enregistrée"
          description="Rien n’a planté chez vos utilisateurs sur les 30 derniers jours."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {groupes.map(({ cle, derniere, occurrences }) => {
            const ouvert = detailOuvert === derniere.id
            return (
              <div key={derniere.id} className="card" style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                <button
                  onClick={() => setDetailOuvert(ouvert ? null : derniere.id)}
                  style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
                >
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--warning)', background: 'rgba(233,207,148,.12)', border: '1px solid rgba(233,207,148,.32)', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                    {LIBELLE_SOURCE[derniere.source] ?? derniere.source}
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--ink)', flexGrow: 1, minWidth: 0 }}>{cle}</span>
                  {occurrences > 1 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>×{occurrences}</span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--muted-2)', whiteSpace: 'nowrap' }}>
                    {new Date(derniere.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </button>

                {ouvert && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
                    <LigneDetail label="Écran" valeur={derniere.chemin ?? '—'} />
                    <LigneDetail label="Navigateur" valeur={derniere.navigateur ?? '—'} />
                    {derniere.pile && (
                      <pre style={{ margin: 0, fontSize: 10.5, lineHeight: 1.5, color: 'var(--muted)', background: 'rgba(0,0,0,.24)', borderRadius: 8, padding: '8px 10px', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                        {derniere.pile}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

function LigneDetail({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 11.5 }}>
      <span style={{ color: 'var(--muted-2)', minWidth: 80 }}>{label}</span>
      <span style={{ color: 'var(--ink-2)', wordBreak: 'break-word', minWidth: 0 }}>{valeur}</span>
    </div>
  )
}
