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
// 'signe' n'est jamais choisi manuellement : posé automatiquement par le trigger
// contracts_maj_statut_signature (0031) dès que les deux parties ont signé.
const STATUTS_MODIFIABLES: StatutContrat[] = ['brouillon', 'envoye', 'resilie']

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
  const { session } = useProfileContext()
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [joindreOuvert, setJoindreOuvert] = useState(false)
  const [rappelEnvoye, setRappelEnvoye] = useState(false)

  const enRetard = !!contrat.date_limite_signature && contrat.date_limite_signature < new Date().toISOString().slice(0, 10) && contrat.statut === 'envoye'

  async function changerStatut(nouveau: StatutContrat) {
    setEnCours(true)
    setErreur(null)
    const update: Database['public']['Tables']['contracts']['Update'] = { statut: nouveau }
    if (nouveau === 'envoye') update.date_envoi = new Date().toISOString().slice(0, 10)
    if (nouveau === 'resilie') update.date_resiliation = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('contracts').update(update).eq('id', contrat.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  async function signer() {
    if (!session) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/contrats/signer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ contractId: contrat.id }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'La signature a échoué.')
      return
    }
    onChange()
  }

  async function envoyerRappel() {
    if (!session) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/notifier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        destinataireProfileId: contrat.destinataire_profile_id,
        type: 'rappel_contrat',
        titre: `Rappel · signature attendue pour « ${contrat.titre} »`,
        lien: contrat.destinataire_role === 'professeur' ? '/professeur/contrats' : '/mon-espace/contrats',
      }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? "L'envoi a échoué.")
      return
    }
    setRappelEnvoye(true)
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
        {contrat.statut === 'signe' ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-teal)', background: 'rgba(111,227,192,.14)', border: '1px solid rgba(111,227,192,.3)', borderRadius: 999, padding: '4px 10px' }}>
            Signé
          </span>
        ) : (
          <select
            value={contrat.statut}
            disabled={enCours}
            onChange={(e) => changerStatut(e.target.value as StatutContrat)}
            style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
          >
            {STATUTS_MODIFIABLES.map((s) => (
              <option key={s} value={s}>
                {LABELS_STATUT[s]}
              </option>
            ))}
          </select>
        )}
        {enRetard && (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--danger)', background: 'rgba(255,138,112,.12)', border: '1px solid rgba(255,138,112,.3)', borderRadius: 999, padding: '4px 10px' }}>
            Rappel conseillé
          </span>
        )}
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
        {contrat.statut === 'envoye' && !contrat.signe_etablissement_at && (
          <button onClick={signer} disabled={enCours} className="btn-shine" style={{ fontSize: 12, padding: '7px 13px', background: 'var(--accent-gradient)', color: '#1b1510' }}>
            Signer pour l'établissement
          </button>
        )}
        {contrat.statut === 'envoye' && !contrat.signe_destinataire_at && (
          <button
            onClick={envoyerRappel}
            disabled={enCours || rappelEnvoye}
            style={{ fontSize: 12, fontWeight: 700, color: rappelEnvoye ? 'var(--accent-teal)' : 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: rappelEnvoye ? 'default' : 'pointer' }}
          >
            {rappelEnvoye ? 'Rappel envoyé ✓' : 'Envoyer un rappel'}
          </button>
        )}
        <button onClick={onImprimer} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}>
          Imprimer
        </button>
        <button onClick={supprimer} disabled={enCours} style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}>
          Supprimer
        </button>
      </div>

      {(contrat.date_envoi || contrat.signe_etablissement_at || contrat.signe_destinataire_at || contrat.date_limite_signature) && (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
          {contrat.date_envoi && <>Envoyé le {new Date(contrat.date_envoi).toLocaleDateString('fr-FR')} · </>}
          Établissement :{' '}
          {contrat.signe_etablissement_at ? `signé le ${new Date(contrat.signe_etablissement_at).toLocaleDateString('fr-FR')}` : 'en attente'} · Destinataire :{' '}
          {contrat.signe_destinataire_at ? `signé le ${new Date(contrat.signe_destinataire_at).toLocaleDateString('fr-FR')}` : 'en attente'}
          {contrat.date_limite_signature && <> · limite le {new Date(contrat.date_limite_signature).toLocaleDateString('fr-FR')}</>}
        </div>
      )}

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
