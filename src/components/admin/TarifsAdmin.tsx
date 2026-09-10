import { useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useTarifs } from '../../hooks/useTarifs'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import type { TypeProgrammeProspect } from '../../types/database.types'

type Tarif = Database['public']['Tables']['tarifs']['Row']

const PROGRAMMES_LABEL: Record<TypeProgrammeProspect, string> = {
  individuel: 'Individuel',
  duo: 'Duo',
  collectif: 'Collectif',
}

const champStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 13,
  color: 'var(--ink)',
  background: 'rgba(0,0,0,.22)',
  width: '100%',
  fontFamily: 'inherit',
}

export function TarifsAdmin() {
  const { profile } = useProfileContext()
  const { tarifs, loading, recharger } = useTarifs(profile?.etablissement_id)

  return (
    <AdminLayout actif="Tarifs">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 28, color: '#fff', marginBottom: 6 }}>Tarifs</h1>
          <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>
            Grille tarifaire affichée dans la section « Tarifs » de votre landing — l'apparence des
            brochures ne change pas, seuls ces chiffres et textes s'y reflètent.
          </p>
        </div>
        <button
          onClick={async () => {
            if (!profile) return
            await supabase.from('tarifs').insert({
              etablissement_id: profile.etablissement_id,
              type_programme: 'individuel',
              titre: 'Nouveau tarif',
              prix: 0,
              unite: 'Ar',
              ordre: tarifs.length,
            })
            recharger()
          }}
          className="btn-shine"
          style={{ background: 'var(--accent-gradient)', color: '#1b1510' }}
        >
          + Ajouter un tarif
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : tarifs.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Aucun tarif renseigné pour le moment.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tarifs.map((tarif) => (
            <LigneTarif key={tarif.id} tarif={tarif} onChange={recharger} />
          ))}
        </div>
      )}
    </AdminLayout>
  )
}

function LigneTarif({ tarif, onChange }: { tarif: Tarif; onChange: () => void }) {
  const [typeProgramme, setTypeProgramme] = useState(tarif.type_programme)
  const [titre, setTitre] = useState(tarif.titre)
  const [prix, setPrix] = useState(String(tarif.prix))
  const [unite, setUnite] = useState(tarif.unite)
  const [description, setDescription] = useState(tarif.description ?? '')
  const [ordre, setOrdre] = useState(String(tarif.ordre))
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function enregistrer() {
    setEnregistrement(true)
    setErreur(null)
    const { error } = await supabase
      .from('tarifs')
      .update({
        type_programme: typeProgramme,
        titre,
        prix: Number(prix) || 0,
        unite,
        description: description || null,
        ordre: Number(ordre) || 0,
      })
      .eq('id', tarif.id)
    setEnregistrement(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  async function supprimer() {
    if (!confirm(`Supprimer le tarif « ${titre} » ?`)) return
    await supabase.from('tarifs').delete().eq('id', tarif.id)
    onChange()
  }

  return (
    <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>Programme</label>
          <select value={typeProgramme} onChange={(e) => setTypeProgramme(e.target.value as TypeProgrammeProspect)} style={champStyle}>
            {Object.entries(PROGRAMMES_LABEL).map(([valeur, label]) => (
              <option key={valeur} value={valeur}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>Titre</label>
          <input value={titre} onChange={(e) => setTitre(e.target.value)} style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>Prix</label>
          <input type="number" step="0.01" value={prix} onChange={(e) => setPrix(e.target.value)} style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>Unité</label>
          <input value={unite} onChange={(e) => setUnite(e.target.value)} placeholder="Ar, Ar/mois, Ar/heure…" style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>Ordre</label>
          <input type="number" value={ordre} onChange={(e) => setOrdre(e.target.value)} style={champStyle} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>Description (visible sur la brochure)</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} style={champStyle} />
      </div>

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erreur}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={enregistrer}
          disabled={enregistrement}
          className="btn-shine"
          style={{ fontSize: 12.5, padding: '9px 16px', background: 'var(--accent-gradient)', color: '#1b1510', opacity: enregistrement ? 0.7 : 1 }}
        >
          {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          onClick={supprimer}
          style={{ fontSize: 12.5, padding: '9px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, color: 'var(--danger)', cursor: 'pointer' }}
        >
          Supprimer
        </button>
      </div>
    </div>
  )
}
