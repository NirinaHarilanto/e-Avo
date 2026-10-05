import { useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useDevis, type DevisAvecEtudiant } from '../../hooks/useDevis'
import { useFactures, type FactureAvecDestinataire } from '../../hooks/useFactures'
import { usePaiementsEtudiants } from '../../hooks/usePaiementsEtudiants'
import { supabase } from '../../lib/supabaseClient'
import { CreerDevis } from '../facturation/CreerDevis'
import { CreerFacture } from '../facturation/CreerFacture'
import { DevisImprimable } from '../facturation/DevisImprimable'
import type { ActionImpression } from '../facturation/OverlayImpression'
import { FactureImprimable, estRecu } from '../facturation/FactureImprimable'
import type { StatutDevis, StatutFacture } from '../../types/database.types'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { Onglets } from '../ui/Onglets'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

type Onglet = 'devis' | 'factures' | 'recus'

/* Intitulé au-dessus de chaque zone d'information d'une ligne de devis (demande client du
   2026-09-29) : numéro/étudiant, objet, montant et statut s'affichaient sans aucun libellé. */
function ZoneDevis({ intitule, children, grandit = false }: { intitule: string; children: React.ReactNode; grandit?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexGrow: grandit ? 1 : 0, minWidth: grandit ? 180 : undefined }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted-2)' }}>{intitule}</span>
      {children}
    </div>
  )
}

const LABELS_DEVIS: Record<StatutDevis, string> = { brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé', expire: 'Expiré' }
const LABELS_FACTURE: Record<StatutFacture, string> = { emise: 'Émise', envoyee: 'Envoyée', payee: 'Payée', en_retard: 'En retard', annulee: 'Annulée' }

async function supprimerLigne(table: 'quotes' | 'invoices', id: string, accessToken: string) {
  return fetch('/api/admin/supprimer-ligne-financiere', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ table, id }),
  })
}

export function FacturationAdmin() {
  const { profile, session } = useProfileContext()
  const [onglet, setOnglet] = useState<Onglet>('factures')
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [devisAImprimer, setDevisAImprimer] = useState<DevisAvecEtudiant | null>(null)
  const [factureAImprimer, setFactureAImprimer] = useState<FactureAvecDestinataire | null>(null)
  const [actionImpression, setActionImpression] = useState<ActionImpression>('voir')

  const { devis, loading: chargementDevis, erreur: erreurDevis, recharger: rechargerDevis } = useDevis()
  const { factures: toutesLesFactures, loading: chargementFactures, erreur: erreurFactures, recharger: rechargerFactures } = useFactures()
  const { paiements } = usePaiementsEtudiants()

  const devisAcceptes = devis.filter((d) => d.devis.statut === 'accepte')
  /* Une transaction réglée porte à la fois une facture et un reçu (généré automatiquement au
     solde complet, trigger 0030/0080) : les compter ensemble double le montant affiché — bug
     signalé par le client le 2026-09-30, corrigé par ces deux listes désormais distinctes plutôt
     qu'une seule mêlant les deux types de document. */
  const factures = toutesLesFactures.filter((f) => !estRecu(f.facture))
  const recus = toutesLesFactures.filter((f) => estRecu(f.facture))
  const listeActive = onglet === 'recus' ? recus : factures

  return (
    <AdminLayout actif="Facturation">
      <EnTetePage
        titre="Facturation"
        description="Les devis proposés aux étudiants et les factures émises. Un devis accepté se transforme en facture en un clic, sans ressaisir les lignes."
        actions={
          // Un reçu s'ajoute tout seul au solde complet d'un paiement (trigger 0030/0080) —
          // rien à créer à la main pour cet onglet, contrairement aux devis et aux factures.
          onglet !== 'recus' ? (
            <button onClick={() => setFormulaireOuvert((v) => !v)} className="btn-shine" style={boutonPrimaireStyle}>
              <Icone nom="plus" taille={15} />
              {formulaireOuvert ? 'Fermer' : onglet === 'devis' ? 'Nouveau devis' : 'Nouvelle facture'}
            </button>
          ) : undefined
        }
      />

      <GuidePage
        id="admin-facturation"
        etapes={[
          <>
            Créez un <strong>devis</strong> avec ses lignes détaillées, puis passez-le à « Envoyé ». Le bouton
            « Imprimer » ouvre une version propre à remettre ou à enregistrer en PDF depuis votre navigateur.
          </>,
          <>
            Quand le devis est <strong>accepté</strong>, allez dans l’onglet Factures et créez la facture : les devis
            acceptés y sont proposés pour reprendre leur contenu automatiquement.
          </>,
          <>
            Rattachez ensuite un <strong>paiement</strong> à la facture depuis sa ligne : c’est ce lien qui fait la
            correspondance entre le document émis et l’encaissement suivi dans la page Paiements.
          </>,
          <>
            Les factures de vos professeurs apparaissent aussi dans cet onglet : elles sont générées automatiquement au
            moment du versement de leur rémunération.
          </>,
        ]}
      />

      <div style={{ marginBottom: 18 }}>
        <Onglets
          etiquette="Type de document"
          actif={onglet}
          onChange={(valeur) => {
            setOnglet(valeur)
            setFormulaireOuvert(false)
          }}
          onglets={[
            { value: 'factures', label: 'Factures', compteur: factures.length },
            { value: 'recus', label: 'Reçus', compteur: recus.length },
            { value: 'devis', label: 'Devis', compteur: devis.length },
          ]}
        />
      </div>

      {onglet === 'devis' && !chargementDevis && devis.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <GrilleStats min={180}>
            <Stat libelle="Devis émis" valeur={devis.length} ton="or" />
            <Stat libelle="En attente de réponse" valeur={devis.filter((d) => d.devis.statut === 'envoye').length} ton="bleu" />
            <Stat libelle="Acceptés" valeur={devisAcceptes.length} ton="teal" aide="Prêts à être convertis en facture" />
            <Stat
              libelle="Montant accepté"
              valeur={devisAcceptes.reduce((total, d) => total + d.devis.montant_ttc, 0).toFixed(2)}
              unite="Ar"
              ton="teal"
            />
          </GrilleStats>
        </div>
      )}

      {onglet === 'factures' && !chargementFactures && factures.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <GrilleStats min={180}>
            <Stat
              libelle="Total facturé"
              valeur={factures.reduce((total, f) => (f.facture.statut === 'annulee' ? total : total + f.facture.montant_ttc), 0).toFixed(2)}
              unite="Ar"
              ton="or"
              aide="Hors factures annulées"
            />
            <Stat
              libelle="Réglé"
              valeur={factures.filter((f) => f.facture.statut === 'payee').reduce((total, f) => total + f.facture.montant_ttc, 0).toFixed(2)}
              unite="Ar"
              ton="teal"
            />
            <Stat
              libelle="En retard"
              valeur={factures.filter((f) => f.facture.statut === 'en_retard').reduce((total, f) => total + f.facture.montant_ttc, 0).toFixed(2)}
              unite="Ar"
              ton={factures.some((f) => f.facture.statut === 'en_retard') ? 'alerte' : 'neutre'}
            />
            <Stat libelle="Factures émises" valeur={factures.length} ton="neutre" />
          </GrilleStats>
        </div>
      )}

      {onglet === 'recus' && !chargementFactures && recus.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <GrilleStats min={180}>
            <Stat
              libelle="Total reçu"
              valeur={recus.reduce((total, f) => (f.facture.statut === 'annulee' ? total : total + f.facture.montant_ttc), 0).toFixed(2)}
              unite="Ar"
              ton="or"
              aide="Hors reçus annulés"
            />
            <Stat libelle="Reçus émis" valeur={recus.length} ton="neutre" />
          </GrilleStats>
        </div>
      )}

      {formulaireOuvert && profile && onglet === 'devis' && (
        <CreerDevis
          etablissementId={profile.etablissement_id}
          onAnnuler={() => setFormulaireOuvert(false)}
          onCree={() => {
            setFormulaireOuvert(false)
            rechargerDevis()
          }}
        />
      )}
      {formulaireOuvert && profile && onglet === 'factures' && (
        <CreerFacture
          etablissementId={profile.etablissement_id}
          devisAcceptes={devisAcceptes}
          onAnnuler={() => setFormulaireOuvert(false)}
          onCree={() => {
            setFormulaireOuvert(false)
            rechargerFactures()
          }}
        />
      )}

      {onglet === 'devis' ? (
        chargementDevis ? (
          <EtatChargement lignes={3} hauteur={84} />
        ) : erreurDevis ? (
          <MessageErreur>{erreurDevis}</MessageErreur>
        ) : devis.length === 0 ? (
          <EtatVide
            icone="facturation"
            titre="Aucun devis enregistré"
            description="Créez un devis pour proposer une formule chiffrée à un étudiant. Une fois accepté, il servira de base à la facture, sans ressaisie."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {devis.map((d) => (
              <LigneDevis key={d.devis.id} item={d} onImprimer={(action) => {
                  setActionImpression(action)
                  setDevisAImprimer(d)
                }} onChange={rechargerDevis} accessToken={session?.access_token} />
            ))}
          </div>
        )
      ) : chargementFactures ? (
        <EtatChargement lignes={3} hauteur={84} />
      ) : erreurFactures ? (
        <MessageErreur>{erreurFactures}</MessageErreur>
      ) : listeActive.length === 0 ? (
        <EtatVide
          icone="facturation"
          titre={onglet === 'recus' ? 'Aucun reçu enregistré' : 'Aucune facture enregistrée'}
          description={
            onglet === 'recus'
              ? 'Un reçu est ajouté automatiquement dès qu’un règlement est intégralement soldé — rien à créer à la main ici.'
              : 'Créez une facture depuis un devis accepté, ou directement si vous n’êtes pas passé par un devis. Les factures de rémunération des professeurs apparaîtront aussi ici.'
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {listeActive.map((f) => (
            <LigneFacture
              key={f.facture.id}
              item={f}
              paiementsEtudiant={paiements.filter((p) => p.paiement.student_id === f.facture.student_id)}
              onImprimer={(action) => {
                setActionImpression(action)
                setFactureAImprimer(f)
              }}
              onChange={rechargerFactures}
              accessToken={session?.access_token}
            />
          ))}
        </div>
      )}

      {devisAImprimer && <DevisImprimable devis={devisAImprimer.devis} etudiant={devisAImprimer.etudiant} action={actionImpression} onFermer={() => setDevisAImprimer(null)} />}
      {factureAImprimer && <FactureImprimable facture={factureAImprimer.facture} destinataire={factureAImprimer.destinataire} action={actionImpression} onFermer={() => setFactureAImprimer(null)} />}
    </AdminLayout>
  )
}

const styleActionDocument = { fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' } as const

/* Voir, imprimer ou télécharger en PDF — les trois ouvrent la même vue imprimable. */
function ActionsDocument({ onAction }: { onAction: (action: ActionImpression) => void }) {
  return (
    <>
      <button onClick={() => onAction('voir')} style={styleActionDocument}>
        Voir
      </button>
      <button onClick={() => onAction('imprimer')} style={styleActionDocument}>
        Imprimer
      </button>
      <button onClick={() => onAction('telecharger')} style={styleActionDocument}>
        Télécharger
      </button>
    </>
  )
}

function LigneDevis({
  item,
  onImprimer,
  onChange,
  accessToken,
}: {
  item: DevisAvecEtudiant
  onImprimer: (action: ActionImpression) => void
  onChange: () => void
  accessToken: string | undefined
}) {
  const { devis, etudiant } = item
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function changerStatut(nouveau: StatutDevis) {
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('quotes').update({ statut: nouveau }).eq('id', devis.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  async function supprimer() {
    if (!accessToken) return
    if (!window.confirm(`Supprimer le devis ${devis.numero} ?`)) return
    setEnCours(true)
    setErreur(null)
    const reponse = await supprimerLigne('quotes', devis.id, accessToken)
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'La suppression a échoué.')
      return
    }
    onChange()
  }

  return (
    <div className="card card-lift" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <ZoneDevis intitule="Devis · Étudiant" grandit>
        <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)' }}>
          {devis.numero} — {etudiant ? `${etudiant.prenom} ${etudiant.nom}` : 'Étudiant inconnu'}
        </span>
      </ZoneDevis>
      <ZoneDevis intitule="Objet" grandit>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{devis.objet || '—'}</span>
      </ZoneDevis>
      <ZoneDevis intitule="Montant TTC">
        <span className="brand-font" style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)', flexShrink: 0 }}>
          {devis.montant_ttc.toFixed(2)} Ar
        </span>
      </ZoneDevis>
      <ZoneDevis intitule="Statut">
      <select
        value={devis.statut}
        disabled={enCours}
        onChange={(e) => changerStatut(e.target.value as StatutDevis)}
        style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
      >
        {(Object.keys(LABELS_DEVIS) as StatutDevis[]).map((s) => (
          <option key={s} value={s}>
            {LABELS_DEVIS[s]}
          </option>
        ))}
      </select>
      </ZoneDevis>
      <ZoneDevis intitule="Document">
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <ActionsDocument onAction={onImprimer} />
        </span>
      </ZoneDevis>
      <ZoneDevis intitule="Suppression">
        <button onClick={supprimer} disabled={enCours} style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}>
          Supprimer
        </button>
      </ZoneDevis>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 11.5, width: '100%' }}>{erreur}</p>}
    </div>
  )
}

function LigneFacture({
  item,
  paiementsEtudiant,
  onImprimer,
  onChange,
  accessToken,
}: {
  item: FactureAvecDestinataire
  paiementsEtudiant: ReturnType<typeof usePaiementsEtudiants>['paiements']
  onImprimer: (action: ActionImpression) => void
  onChange: () => void
  accessToken: string | undefined
}) {
  const { facture, destinataire } = item
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoyee, setEnvoyee] = useState(false)
  // Numéro modifiable (demande client du 2026-10-05) : édition en ligne, pas de pop-up séparée
  // pour un changement aussi ponctuel.
  const [editionNumero, setEditionNumero] = useState(false)
  const [nouveauNumero, setNouveauNumero] = useState(facture.numero)

  async function renommerNumero() {
    const valeur = nouveauNumero.trim()
    if (!valeur || valeur === facture.numero) {
      setEditionNumero(false)
      setNouveauNumero(facture.numero)
      return
    }
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('invoices').update({ numero: valeur }).eq('id', facture.id)
    setEnCours(false)
    if (error) {
      // 23505 : contrainte d'unicité (etablissement_id, numero) — voir 0020. Un autre document
      // porte déjà ce numéro dans cet établissement.
      setErreur(error.code === '23505' ? `Le numéro « ${valeur} » est déjà utilisé par un autre document.` : error.message)
      return
    }
    setEditionNumero(false)
    onChange()
  }

  async function changerStatut(nouveau: StatutFacture) {
    setEnCours(true)
    setErreur(null)
    const datePaiement = nouveau === 'payee' ? new Date().toISOString().slice(0, 10) : undefined
    const { error } = await supabase
      .from('invoices')
      .update({ statut: nouveau, ...(datePaiement && { date_paiement: datePaiement }) })
      .eq('id', facture.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  async function rattacherPaiement(paymentId: string) {
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('invoices').update({ payment_id: paymentId || null }).eq('id', facture.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  async function supprimer() {
    if (!accessToken) return
    if (!window.confirm(`Supprimer la facture ${facture.numero} ?`)) return
    setEnCours(true)
    setErreur(null)
    const reponse = await supprimerLigne('invoices', facture.id, accessToken)
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'La suppression a échoué.')
      return
    }
    onChange()
  }

  async function envoyer() {
    if (!accessToken || !destinataire) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/notifier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        destinataireProfileId: destinataire.id,
        type: 'facture',
        titre: `Nouvelle facture · ${facture.numero}`,
        message: facture.objet,
        lien: facture.teacher_id ? '/professeur/factures' : '/mon-espace/paiements',
      }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? "L'envoi a échoué.")
      return
    }
    setEnvoyee(true)
  }

  return (
    <div className="card card-lift" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flexGrow: 1, minWidth: 200 }}>
        <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {editionNumero ? (
            <input
              autoFocus
              value={nouveauNumero}
              disabled={enCours}
              onChange={(e) => setNouveauNumero(e.target.value)}
              onBlur={renommerNumero}
              onKeyDown={(e) => {
                if (e.key === 'Enter') renommerNumero()
                if (e.key === 'Escape') {
                  setEditionNumero(false)
                  setNouveauNumero(facture.numero)
                }
              }}
              style={{
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--ink)',
                background: 'rgba(0,0,0,.28)',
                border: '1px solid var(--accent-blue)',
                borderRadius: 6,
                padding: '2px 6px',
                width: `${Math.max(10, nouveauNumero.length + 1)}ch`,
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditionNumero(true)}
              title="Modifier le numéro"
              style={{ font: 'inherit', fontWeight: 700, color: 'var(--ink)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}
            >
              {facture.numero}
            </button>
          )}
          {' '}— {destinataire ? `${destinataire.prenom} ${destinataire.nom}` : 'Destinataire inconnu'}
          {facture.teacher_id && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-blue)', marginLeft: 8 }}>PROFESSEUR</span>}
        </span>
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{facture.objet}</div>
      </div>
      <span className="brand-font" style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)', flexShrink: 0 }}>
        {facture.montant_ttc.toFixed(2)} Ar
      </span>
      <select
        value={facture.statut}
        disabled={enCours}
        onChange={(e) => changerStatut(e.target.value as StatutFacture)}
        style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
      >
        {(Object.keys(LABELS_FACTURE) as StatutFacture[]).map((s) => (
          <option key={s} value={s}>
            {LABELS_FACTURE[s]}
          </option>
        ))}
      </select>
      {paiementsEtudiant.length > 0 && (
        <select
          value={facture.payment_id ?? ''}
          disabled={enCours}
          onChange={(e) => rattacherPaiement(e.target.value)}
          style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
        >
          <option value="">Aucun paiement rattaché</option>
          {paiementsEtudiant.map(({ paiement }) => (
            <option key={paiement.id} value={paiement.id}>
              {paiement.montant} {paiement.devise} · {paiement.statut}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={envoyer}
        disabled={enCours || envoyee || !destinataire}
        style={{ fontSize: 12, fontWeight: 700, color: envoyee ? 'var(--accent-teal)' : 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: envoyee ? 'default' : 'pointer' }}
      >
        {envoyee ? 'Envoyée ✓' : 'Envoyer'}
      </button>
      <ActionsDocument onAction={onImprimer} />
      <button onClick={supprimer} disabled={enCours} style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}>
        Supprimer
      </button>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 11.5, width: '100%' }}>{erreur}</p>}
    </div>
  )
}
