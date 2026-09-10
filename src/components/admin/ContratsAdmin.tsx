import { useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useContratsTypes } from '../../hooks/useContratsTypes'
import { useContrats, type ContratAvecDestinataire } from '../../hooks/useContrats'
import { supabase } from '../../lib/supabaseClient'
import { CreerContratTemplate } from '../contrats/CreerContratTemplate'
import { GenererContrat } from '../contrats/GenererContrat'
import { ContratImprimable } from '../contrats/ContratImprimable'
import { UploaderDocument } from '../documents/UploaderDocument'
import type { Database, StatutContrat } from '../../types/database.types'

type Onglet = 'modeles' | 'contrats'

const LABELS_STATUT: Record<StatutContrat, string> = { brouillon: 'Brouillon', envoye: 'Envoyé', signe: 'Signé', resilie: 'Résilié' }

export function ContratsAdmin() {
  const { profile } = useProfileContext()
  const [onglet, setOnglet] = useState<Onglet>('modeles')
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [contratAImprimer, setContratAImprimer] = useState<ContratAvecDestinataire | null>(null)

  const { modeles, loading: chargementModeles, erreur: erreurModeles, recharger: rechargerModeles } = useContratsTypes()
  const { contrats, loading: chargementContrats, erreur: erreurContrats, recharger: rechargerContrats } = useContrats()

  async function supprimerModele(id: string) {
    if (!window.confirm('Supprimer ce modèle ?')) return
    await supabase.from('contract_templates').delete().eq('id', id)
    rechargerModeles()
  }

  async function basculerActif(id: string, actif: boolean) {
    await supabase.from('contract_templates').update({ actif: !actif }).eq('id', id)
    rechargerModeles()
  }

  return (
    <AdminLayout actif="Contrats">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 28, color: '#fff' }}>Contrats</h1>
        <button onClick={() => setFormulaireOuvert((v) => !v)} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510' }}>
          {onglet === 'modeles' ? 'Nouveau modèle' : 'Générer un contrat'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {(['modeles', 'contrats'] as const).map((o) => (
          <button
            key={o}
            onClick={() => {
              setOnglet(o)
              setFormulaireOuvert(false)
            }}
            className={`nav-item${onglet === o ? ' nav-item-active' : ''}`}
            style={{
              padding: '9px 16px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: onglet === o ? 800 : 600,
              color: onglet === o ? '#1b1510' : 'var(--ink-2)',
              background: onglet === o ? 'var(--accent-gradient)' : undefined,
              cursor: 'pointer',
            }}
          >
            {o === 'modeles' ? 'Modèles' : 'Contrats générés'}
          </button>
        ))}
      </div>

      {formulaireOuvert && profile && onglet === 'modeles' && (
        <CreerContratTemplate
          etablissementId={profile.etablissement_id}
          onAnnuler={() => setFormulaireOuvert(false)}
          onCree={() => {
            setFormulaireOuvert(false)
            rechargerModeles()
          }}
        />
      )}
      {formulaireOuvert && profile && onglet === 'contrats' && (
        <GenererContrat
          etablissementId={profile.etablissement_id}
          modeles={modeles.filter((m) => m.actif)}
          onAnnuler={() => setFormulaireOuvert(false)}
          onCree={() => {
            setFormulaireOuvert(false)
            rechargerContrats()
          }}
        />
      )}

      {onglet === 'modeles' ? (
        chargementModeles ? (
          <p style={{ color: 'var(--muted)' }}>Chargement…</p>
        ) : erreurModeles ? (
          <p style={{ color: 'var(--danger)' }}>{erreurModeles}</p>
        ) : modeles.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Aucun modèle de contrat.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {modeles.map((m) => (
              <div key={m.id} className="card card-lift" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flexGrow: 1, minWidth: 200 }}>
                  <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)' }}>
                    {m.nom}
                  </span>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Pour les {m.public_cible === 'professeur' ? 'professeurs' : 'étudiants'}</div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: m.actif ? 'var(--accent-teal)' : 'var(--muted)',
                    background: m.actif ? 'rgba(111,227,192,.14)' : 'rgba(255,255,255,.05)',
                    border: `1px solid ${m.actif ? 'rgba(111,227,192,.3)' : 'var(--border)'}`,
                    borderRadius: 999,
                    padding: '4px 10px',
                  }}
                >
                  {m.actif ? 'Actif' : 'Inactif'}
                </span>
                <button
                  onClick={() => basculerActif(m.id, m.actif)}
                  style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}
                >
                  {m.actif ? 'Désactiver' : 'Activer'}
                </button>
                <button
                  onClick={() => supprimerModele(m.id)}
                  style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )
      ) : chargementContrats ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : erreurContrats ? (
        <p style={{ color: 'var(--danger)' }}>{erreurContrats}</p>
      ) : contrats.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Aucun contrat généré.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {contrats.map((c) => (
            <LigneContrat key={c.contrat.id} item={c} onImprimer={() => setContratAImprimer(c)} onChange={rechargerContrats} />
          ))}
        </div>
      )}

      {contratAImprimer && (
        <ContratImprimable contrat={contratAImprimer.contrat} destinataire={contratAImprimer.destinataire} onFermer={() => setContratAImprimer(null)} />
      )}
    </AdminLayout>
  )
}

function LigneContrat({ item, onImprimer, onChange }: { item: ContratAvecDestinataire; onImprimer: () => void; onChange: () => void }) {
  const { contrat, destinataire } = item
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [joindreOuvert, setJoindreOuvert] = useState(false)

  async function changerStatut(nouveau: StatutContrat) {
    setEnCours(true)
    setErreur(null)
    const update: Database['public']['Tables']['contracts']['Update'] = { statut: nouveau }
    if (nouveau === 'envoye') update.date_envoi = new Date().toISOString().slice(0, 10)
    if (nouveau === 'signe') update.date_signature = new Date().toISOString().slice(0, 10)
    if (nouveau === 'resilie') update.date_resiliation = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('contracts').update(update).eq('id', contrat.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  async function supprimer() {
    if (!window.confirm(`Supprimer le contrat « ${contrat.titre} » ?`)) return
    setEnCours(true)
    const { error } = await supabase.from('contracts').delete().eq('id', contrat.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  return (
    <div className="card card-lift" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flexGrow: 1, minWidth: 200 }}>
          <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)' }}>
            {contrat.titre}
          </span>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{destinataire ? `${destinataire.prenom} ${destinataire.nom}` : 'Destinataire inconnu'}</div>
        </div>
        <select
          value={contrat.statut}
          disabled={enCours}
          onChange={(e) => changerStatut(e.target.value as StatutContrat)}
          style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
        >
          {(Object.keys(LABELS_STATUT) as StatutContrat[]).map((s) => (
            <option key={s} value={s}>
              {LABELS_STATUT[s]}
            </option>
          ))}
        </select>
        {contrat.document_id ? (
          <span style={{ fontSize: 11.5, color: 'var(--accent-teal)' }}>Scan signé joint</span>
        ) : (
          <button
            onClick={() => setJoindreOuvert((v) => !v)}
            style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}
          >
            Joindre le scan signé
          </button>
        )}
        <button onClick={onImprimer} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}>
          Imprimer
        </button>
        <button onClick={supprimer} disabled={enCours} style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}>
          Supprimer
        </button>
      </div>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 11.5 }}>{erreur}</p>}
      {joindreOuvert && (
        <UploaderDocument
          ownerProfileId={contrat.destinataire_profile_id}
          etablissementId={contrat.etablissement_id}
          onUploade={async (document) => {
            await supabase.from('contracts').update({ document_id: document.id }).eq('id', contrat.id)
            setJoindreOuvert(false)
            onChange()
          }}
        />
      )}
    </div>
  )
}
