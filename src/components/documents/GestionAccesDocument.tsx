import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { initiales } from '../etudiants/DossierEtudiantVue'
import type { Database } from '../../types/database.types'
import { EtatChargement } from '../ui/Etats'

type DocumentPermission = Database['public']['Tables']['document_permissions']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

const LABEL_NIVEAU: Record<DocumentPermission['niveau'], string> = { lecture: 'Lecture', ecriture: 'Écriture' }

/* Gestion des accès d'un document confidentiel — liste blanche (document_permissions, 0033) :
   sans ligne ici, une personne (admin inclus) ne voit pas le document, quel que soit son rôle. */
export function GestionAccesDocument({ documentId }: { documentId: string }) {
  const { etudiants } = useEtudiants()
  const { professeurs } = useProfesseurs()
  const [permissions, setPermissions] = useState<DocumentPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [profileId, setProfileId] = useState('')
  const [niveau, setNiveau] = useState<DocumentPermission['niveau']>('lecture')
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('document_permissions').select('*').eq('document_id', documentId)
    setPermissions(data ?? [])
    setLoading(false)
  }, [documentId])

  useEffect(() => {
    charger()
  }, [charger])

  const personnes: Profile[] = [...etudiants, ...professeurs]
  const personneParId = new Map(personnes.map((p) => [p.id, p]))
  const disponibles = personnes.filter((p) => !permissions.some((perm) => perm.profile_id === p.id))

  async function ajouter() {
    if (!profileId) return
    setErreur(null)
    const { error } = await supabase.from('document_permissions').insert({ document_id: documentId, profile_id: profileId, niveau })
    if (error) {
      setErreur(error.message)
      return
    }
    setProfileId('')
    charger()
  }

  async function retirer(id: string) {
    await supabase.from('document_permissions').delete().eq('id', id)
    charger()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-soft)', paddingTop: 10, marginTop: 8 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Accès (liste blanche — personne d'autre ne voit ce document)</span>
      {loading ? (
        <EtatChargement lignes={2} hauteur={28} />
      ) : (
        <>
          {permissions.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>Personne d'autre que vous n'a accès pour l'instant.</p>
          ) : (
            permissions.map((perm) => {
              const personne = personneParId.get(perm.profile_id)
              return (
                <div key={perm.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                    {personne ? initiales(personne) : '?'}
                  </span>
                  <span style={{ flexGrow: 1, color: 'var(--ink)' }}>{personne ? `${personne.prenom} ${personne.nom}` : 'Personne inconnue'}</span>
                  <span style={{ color: 'var(--muted)' }}>{LABEL_NIVEAU[perm.niveau]}</span>
                  <button onClick={() => retirer(perm.id)} style={{ fontSize: 11.5, color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                    Retirer
                  </button>
                </div>
              )
            })
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              style={{ flexGrow: 1, fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, padding: '7px 9px', color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
            >
              <option value="">Ajouter une personne…</option>
              {disponibles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.prenom} {p.nom}
                </option>
              ))}
            </select>
            <select
              value={niveau}
              onChange={(e) => setNiveau(e.target.value as DocumentPermission['niveau'])}
              style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, padding: '7px 9px', color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
            >
              <option value="lecture">Lecture</option>
              <option value="ecriture">Écriture</option>
            </select>
            <button onClick={ajouter} disabled={!profileId} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer', opacity: !profileId ? 0.6 : 1 }}>
              Ajouter
            </button>
          </div>
          {erreur && <p style={{ color: 'var(--danger)', fontSize: 11.5 }}>{erreur}</p>}
        </>
      )}
    </div>
  )
}
