import { useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { COLONNES_PIPELINE, useProspectsPipeline, type ProspectAvecDiagnostic } from '../../hooks/useProspectsPipeline'

const COULEUR_COLONNE: Record<string, string> = {
  prospect: '#8b96b8',
  diagnostic_planifie: '#e9cf94',
  diagnostic_fait: '#5eb3ff',
  etudiant: '#6fe3c0',
}

export function PipelineCRM() {
  const { prospects, loading, erreur, recharger } = useProspectsPipeline()

  return (
    <AdminLayout actif="Prospects">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ fontSize: 28, color: '#fff' }}>Prospects</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>{prospects.length} dossier{prospects.length > 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => recharger()} className="btn-shine" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--border)', color: 'var(--ink-2)' }}>
          Actualiser
        </button>
      </div>

      {erreur && <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{erreur}</p>}
      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
          {COLONNES_PIPELINE.map((colonne) => {
            const items = prospects.filter((p) => p.statut === colonne.statut)
            return (
              <div key={colonne.statut} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 4px' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: COULEUR_COLONNE[colonne.statut] }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-2)' }}>{colonne.titre}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-2)', background: 'rgba(255,255,255,.06)', borderRadius: 999, padding: '2px 9px' }}>
                    {items.length}
                  </span>
                </div>
                {items.length === 0 && (
                  <span style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted-2)', border: '1px dashed rgba(255,255,255,.14)', borderRadius: 14, padding: 16 }}>
                    Aucun dossier
                  </span>
                )}
                {items.map((prospect) => (
                  <CarteProspect key={prospect.id} prospect={prospect} onChange={recharger} />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </AdminLayout>
  )
}

const LABEL_PROGRAMME: Record<string, string> = {
  individuel: 'Individuel',
  duo: 'Duo',
  collectif: 'Collectif',
}

function CarteProspect({ prospect, onChange }: { prospect: ProspectAvecDiagnostic; onChange: () => void }) {
  const { profile, session } = useProfileContext()
  const estPositionnement = prospect.type_programme === 'collectif'
  const [ouvert, setOuvert] = useState(false)
  const [dateAppel, setDateAppel] = useState('')
  const [niveauEvalue, setNiveauEvalue] = useState('')
  const [rythmeConvenu, setRythmeConvenu] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function planifierAppel() {
    if (!profile || !dateAppel) return
    setEnCours(true)
    setErreur(null)
    const { error: insertError } = await supabase.from('diagnostic_calls').insert({
      etablissement_id: prospect.etablissement_id,
      prospect_id: prospect.id,
      mene_par: profile.id,
      date_appel: new Date(dateAppel).toISOString(),
    })
    if (insertError) {
      setErreur(insertError.message)
      setEnCours(false)
      return
    }
    const { error: updateError } = await supabase
      .from('prospects')
      .update({ statut: 'diagnostic_planifie' })
      .eq('id', prospect.id)
    setEnCours(false)
    if (updateError) {
      setErreur(updateError.message)
      return
    }
    setOuvert(false)
    onChange()
  }

  async function marquerRealise() {
    if (!prospect.diagnostic) return
    setEnCours(true)
    setErreur(null)
    const { error: updateDiagError } = await supabase
      .from('diagnostic_calls')
      .update({ niveau_evalue: niveauEvalue || null, rythme_convenu: rythmeConvenu || null })
      .eq('id', prospect.diagnostic.id)
    if (updateDiagError) {
      setErreur(updateDiagError.message)
      setEnCours(false)
      return
    }
    const { error: updateProspectError } = await supabase
      .from('prospects')
      .update({ statut: 'diagnostic_fait' })
      .eq('id', prospect.id)
    setEnCours(false)
    if (updateProspectError) {
      setErreur(updateProspectError.message)
      return
    }
    setOuvert(false)
    onChange()
  }

  async function convertirEnEtudiant() {
    if (!session) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/convert-prospect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ prospectId: prospect.id }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'La conversion a échoué.')
      return
    }
    onChange()
  }

  return (
    <div className="card card-lift" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 38, height: 38, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
          {(prospect.prenom[0] ?? '').toUpperCase()}
          {(prospect.nom[0] ?? '').toUpperCase()}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
            {prospect.prenom} {prospect.nom}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{prospect.langue_visee || 'Langue non précisée'}</span>
        </div>
      </div>

      {prospect.type_programme && (
        <span
          style={{
            alignSelf: 'flex-start',
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            color: 'var(--muted-2)',
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '3px 10px',
          }}
        >
          {LABEL_PROGRAMME[prospect.type_programme]}
        </span>
      )}

      {prospect.objectif && (
        <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)', background: 'rgba(0,0,0,.24)', borderRadius: 10, padding: '10px 12px' }}>
          « {prospect.objectif} »
        </p>
      )}

      {prospect.statut === 'diagnostic_planifie' && prospect.diagnostic && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, borderRadius: 10, border: '1px solid rgba(233,207,148,.28)', background: 'rgba(233,207,148,.1)', padding: '10px 12px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)' }}>
            {new Date(prospect.diagnostic.date_appel).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        </div>
      )}

      {prospect.statut === 'diagnostic_fait' && prospect.diagnostic?.niveau_evalue && (
        <span style={{ alignSelf: 'flex-start', fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)', background: 'rgba(94,179,255,.14)', border: '1px solid rgba(94,179,255,.3)', borderRadius: 999, padding: '5px 11px' }}>
          Niveau évalué {prospect.diagnostic.niveau_evalue}
        </span>
      )}

      <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>
        {new Date(prospect.created_at).toLocaleDateString('fr-FR')}
      </span>

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{erreur}</p>}

      {prospect.statut === 'prospect' && !ouvert && (
        <button onClick={() => setOuvert(true)} className="btn-shine" style={{ width: '100%', fontSize: 12.5, padding: 10, background: 'var(--accent-gradient)', color: '#1b1510' }}>
          Planifier {estPositionnement ? 'le test de positionnement' : "l'appel diagnostic"}
        </button>
      )}
      {prospect.statut === 'prospect' && ouvert && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
            {estPositionnement ? 'Test de positionnement' : 'Appel diagnostic'}
          </span>
          <input
            type="datetime-local"
            value={dateAppel}
            onChange={(e) => setDateAppel(e.target.value)}
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
          />
          <button onClick={planifierAppel} disabled={enCours || !dateAppel} className="btn-shine" style={{ fontSize: 12.5, padding: 9, background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours ? 0.7 : 1 }}>
            Confirmer
          </button>
        </div>
      )}

      {prospect.statut === 'diagnostic_planifie' && !ouvert && (
        <button onClick={() => setOuvert(true)} className="btn-shine btn-secondary" style={{ width: '100%', fontSize: 12.5, padding: 10 }}>
          Marquer {estPositionnement ? 'le test' : 'le diagnostic'} comme fait
        </button>
      )}
      {prospect.statut === 'diagnostic_planifie' && ouvert && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            placeholder="Niveau évalué (ex. B1)"
            value={niveauEvalue}
            onChange={(e) => setNiveauEvalue(e.target.value)}
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
          />
          <input
            placeholder="Rythme convenu (ex. 2h / semaine)"
            value={rythmeConvenu}
            onChange={(e) => setRythmeConvenu(e.target.value)}
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
          />
          <button onClick={marquerRealise} disabled={enCours} className="btn-shine btn-secondary" style={{ fontSize: 12.5, padding: 9, opacity: enCours ? 0.7 : 1 }}>
            Confirmer
          </button>
        </div>
      )}

      {prospect.statut === 'diagnostic_fait' && (
        <button onClick={convertirEnEtudiant} disabled={enCours} className="btn-shine" style={{ width: '100%', fontSize: 12.5, padding: 10, background: 'var(--accent-blue-gradient)', color: '#fff', opacity: enCours ? 0.7 : 1 }}>
          Convertir en étudiant
        </button>
      )}
    </div>
  )
}
