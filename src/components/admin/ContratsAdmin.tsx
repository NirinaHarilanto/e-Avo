import { useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useContratsTypes } from '../../hooks/useContratsTypes'
import { useContrats, type ContratAvecDestinataire } from '../../hooks/useContrats'
import { supabase } from '../../lib/supabaseClient'
import { CreerContratTemplate } from '../contrats/CreerContratTemplate'
import { LancerApprobationContrat } from '../contrats/LancerApprobationContrat'
import { ContratImprimable } from '../contrats/ContratImprimable'
import { UploaderDocument } from '../documents/UploaderDocument'
import type { Database, StatutContrat } from '../../types/database.types'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { Onglets } from '../ui/Onglets'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

type Onglet = 'modeles' | 'contrats'
type ContractTemplate = Database['public']['Tables']['contract_templates']['Row']

const LABELS_STATUT: Record<StatutContrat, string> = { brouillon: 'Brouillon', envoye: 'Envoyé', signe: 'Signé', resilie: 'Résilié' }
// 'signe' n'est jamais choisi manuellement : posé automatiquement par le trigger
// contracts_maj_statut_signature (0031) dès que les deux parties ont signé.
const STATUTS_MODIFIABLES: StatutContrat[] = ['brouillon', 'envoye', 'resilie']

export function ContratsAdmin() {
  const { profile } = useProfileContext()
  const [onglet, setOnglet] = useState<Onglet>('modeles')
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [modeleEnEdition, setModeleEnEdition] = useState<ContractTemplate | null>(null)
  const [contratAImprimer, setContratAImprimer] = useState<ContratAvecDestinataire | null>(null)

  const { modeles, loading: chargementModeles, erreur: erreurModeles, recharger: rechargerModeles } = useContratsTypes()
  const { contrats, loading: chargementContrats, erreur: erreurContrats, recharger: rechargerContrats } = useContrats()

  async function supprimerModele(id: string) {
    if (!window.confirm('Supprimer ce modèle ?')) return
    await supabase.from('contract_templates').delete().eq('id', id)
    setModeleEnEdition((actuel) => (actuel?.id === id ? null : actuel))
    rechargerModeles()
  }

  async function basculerActif(id: string, actif: boolean) {
    await supabase.from('contract_templates').update({ actif: !actif }).eq('id', id)
    rechargerModeles()
  }

  return (
    <AdminLayout actif="Contrats">
      <EnTetePage
        titre="Contrats"
        description="Vos modèles de contrat et les approbations lancées. Un contrat se génère à partir d'un modèle et de la fiche de la personne concernée ; la signature se fait directement dans l'application, sans prestataire externe."
        actions={
          <button
            onClick={() => {
              setModeleEnEdition(null)
              setFormulaireOuvert((v) => !v)
            }}
            className="btn-shine"
            style={boutonPrimaireStyle}
          >
            <Icone nom="plus" taille={15} />
            {formulaireOuvert ? 'Fermer' : onglet === 'modeles' ? 'Nouveau modèle' : "Lancer une approbation"}
          </button>
        }
      />

      <GuidePage
        id="admin-contrats"
        etapes={[
          <>
            Créez d'abord un <strong>modèle</strong> dans le premier onglet. Insérez-y des variables entre doubles
            accolades, comme <code>{'{{prenom_etudiant}}'}</code> : celles qui correspondent à un champ de fiche se
            remplissent seules, l'éditeur de modèle liste lesquelles.
          </>,
          <>
            <strong>Modifier</strong> un modèle existant change son texte pour les prochains contrats générés à partir
            de lui. Les contrats déjà émis gardent leur texte d'origine, figé au moment de leur émission.
          </>,
          <>
            Passez ensuite à <strong>Contrats</strong> et lancez une approbation : type de contrat, personne concernée,
            modèle. Nom, coordonnées, adresse, taux horaire et établissement sont repris des fiches existantes, sans
            ressaisie.
          </>,
          <>
            Le contrat part aussitôt en <strong>attente de signature</strong> : il apparaît dans l'espace du
            destinataire, qui est notifié. Signez de votre côté depuis la ligne du contrat ; le statut bascule seul sur
            « Signé » une fois les deux signatures posées.
          </>,
          <>
            Si vous préférez une signature papier, utilisez <strong>Joindre le scan signé</strong> sur la ligne du
            contrat pour archiver le document numérisé.
          </>,
        ]}
      />

      <div style={{ marginBottom: 18 }}>
        <Onglets
          etiquette="Type de contenu"
          actif={onglet}
          onChange={(valeur) => {
            setOnglet(valeur)
            setFormulaireOuvert(false)
            setModeleEnEdition(null)
          }}
          onglets={[
            { value: 'modeles', label: 'Modèles', compteur: modeles.length },
            { value: 'contrats', label: 'Contrats', compteur: contrats.length },
          ]}
        />
      </div>

      {onglet === 'contrats' && !chargementContrats && contrats.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <GrilleStats min={180}>
            <Stat libelle="Contrats émis" valeur={contrats.length} ton="or" />
            <Stat
              libelle="En attente de signature"
              valeur={contrats.filter((c) => c.contrat.statut === 'envoye').length}
              ton={contrats.some((c) => c.contrat.statut === 'envoye') ? 'alerte' : 'neutre'}
              aide="Côté établissement ou côté destinataire"
            />
            <Stat libelle="Signés" valeur={contrats.filter((c) => c.contrat.statut === 'signe').length} ton="teal" />
            <Stat libelle="Résiliés" valeur={contrats.filter((c) => c.contrat.statut === 'resilie').length} ton="neutre" />
          </GrilleStats>
        </div>
      )}

      {modeleEnEdition && profile && onglet === 'modeles' && (
        <CreerContratTemplate
          etablissementId={profile.etablissement_id}
          modele={modeleEnEdition}
          onAnnuler={() => setModeleEnEdition(null)}
          onEnregistre={() => {
            setModeleEnEdition(null)
            rechargerModeles()
          }}
        />
      )}
      {!modeleEnEdition && formulaireOuvert && profile && onglet === 'modeles' && (
        <CreerContratTemplate
          etablissementId={profile.etablissement_id}
          onAnnuler={() => setFormulaireOuvert(false)}
          onEnregistre={() => {
            setFormulaireOuvert(false)
            rechargerModeles()
          }}
        />
      )}
      {formulaireOuvert && profile && onglet === 'contrats' && (
        <LancerApprobationContrat
          etablissementId={profile.etablissement_id}
          modeles={modeles.filter((m) => m.actif)}
          onAnnuler={() => setFormulaireOuvert(false)}
          onLance={() => {
            setFormulaireOuvert(false)
            rechargerContrats()
          }}
        />
      )}

      {onglet === 'modeles' ? (
        chargementModeles ? (
          <EtatChargement lignes={3} hauteur={64} />
        ) : erreurModeles ? (
          <MessageErreur>{erreurModeles}</MessageErreur>
        ) : modeles.length === 0 ? (
          <EtatVide
            icone="contrats"
            titre="Aucun modèle de contrat"
            description="Créez un premier modèle pour pouvoir lancer une approbation. Sans modèle actif, l'onglet « Contrats » n'a rien à proposer."
          />
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
                  onClick={() => {
                    setFormulaireOuvert(false)
                    setModeleEnEdition(m)
                  }}
                  style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}
                >
                  Modifier
                </button>
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
        <EtatChargement lignes={3} hauteur={96} />
      ) : erreurContrats ? (
        <MessageErreur>{erreurContrats}</MessageErreur>
      ) : contrats.length === 0 ? (
        <EtatVide
          icone="contrats"
          titre="Aucune approbation lancée"
          description="Lancez une approbation en choisissant le type de contrat, la personne concernée et le modèle. Le contrat apparaît aussitôt dans son espace pour signature."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {contrats.map((c) => (
            <LigneContrat key={c.contrat.id} item={c} onImprimer={() => setContratAImprimer(c)} onChange={rechargerContrats} />
          ))}
        </div>
      )}

      {contratAImprimer && (
        <ContratImprimable
          contrat={contratAImprimer.contrat}
          destinataire={contratAImprimer.destinataire}
          signataireEtablissement={contratAImprimer.signataireEtablissement}
          onFermer={() => setContratAImprimer(null)}
        />
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
        {/* Demande client du 2026-09-16 : un bouton pour voir l'entièreté du contrat à l'état
            instantané (signé ou non). C'est la même fenêtre qu'ouvrait déjà « Imprimer » — elle
            propose toujours l'impression une fois ouverte — mais l'étiquette d'origine ne disait
            pas qu'on pouvait aussi simplement le relire à l'écran. */}
        <button
          onClick={onImprimer}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}
        >
          <Icone nom="oeil" taille={14} />
          Voir le contrat
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
