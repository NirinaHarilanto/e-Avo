import { useEffect, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { libelleCategorie } from './UploaderDocument'
import { PartagerDocumentModale } from './PartagerDocumentModale'
import { Modale } from '../ui/Modale'
import { ModaleConfirmation } from '../ui/ModaleConfirmation'
import { LigneInfo } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { boutonSecondaireStyle, boutonDangerStyle, boutonPrimaireStyle } from '../ui/Boutons'

type Document = Database['public']['Tables']['documents']['Row']

function formatTaille(octets: number) {
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

/* Pop-up ouvert au clic d'un document (demande client du 2026-09-22) : ses informations et ses
   trois actions (télécharger, partager, supprimer) vivent toutes ici plutôt que dans des boutons
   éparpillés sur la ligne de liste — un seul endroit où retrouver ce qu'on peut faire d'un
   fichier, cohérent avec le reste de l'application (fenêtres de détail des paiements, des
   rendez-vous...). Le partage lui-même reste porté par PartagerDocumentModale, ouvert par-dessus
   celui-ci (même précédent que les pop-up imbriquées déjà en place ailleurs).

   Suppression à trois visages (règle client du 2026-10-10) :
     1. PROPRIÉTAIRE (`document.owner_profile_id`) : peut TOUJOURS supprimer le document pour de
        bon, quel que soit `peutSupprimer` — mais avant de valider, une confirmation liste qui
        partage la vue du document, et ces personnes reçoivent une notification une fois le
        document réellement supprimé (api/documents/supprimer.ts).
     2. DESTINATAIRE D'UN PARTAGE sur CE document précis (déterminé ici par une lecture directe de
        `document_partages`, PAS depuis `mention` — voir plus bas) : « Supprimer » ne retire QUE sa
        propre vue (sa ligne `document_partages`), jamais le document. Le propriétaire devra
        repartager s'il veut la lui redonner.
     3. Ni l'un ni l'autre : comportement INCHANGÉ, piloté par la prop `peutSupprimer` telle que
        l'appelant la calcule déjà (admin gérant le dossier d'un tiers, déposant d'un document dans
        SA PROPRE arborescence...) — ce cas est hors du périmètre de la règle ci-dessus, qui ne
        parle que de propriété et de partage, jamais de rôle. Le toucher casserait des capacités de
        gestion de dossier préexistantes et sans rapport avec le partage. */
export function DetailDocumentModale({
  document,
  peutSupprimer,
  peutPartager,
  mention,
  onFermer,
  onChange,
}: {
  document: Document
  peutSupprimer: boolean
  peutPartager: boolean
  mention: { par: string; message: string | null } | null
  onFermer: () => void
  onChange: () => void
}) {
  const { session, profile } = useProfileContext()
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [partageOuvert, setPartageOuvert] = useState(false)

  const sonProprietaire = !!profile && document.owner_profile_id === profile.id

  /* Mon propre partage reçu sur CE document, déterminé par une lecture directe — PAS depuis
     `mention`. `mention` reflète le destinataire de l'ESPACE PARCOURU (le prop de
     ExplorateurDocuments s'appelle `ownerProfileId`), qui n'est pas toujours moi : un admin qui
     consulte « Mes fichiers partagés » d'un étudiant depuis la fiche de ce dernier (PanneauDocuments
     dans DocumentsAdmin.tsx) verrait sinon « Supprimer » agir sur le partage de L'ÉTUDIANT en
     croyant retirer le sien. `undefined` tant que la réponse n'est pas connue : évite d'afficher
     un premier bouton pour le remplacer aussitôt par un autre. */
  const [monPartageId, setMonPartageId] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let vivant = true
    if (sonProprietaire || !profile) {
      setMonPartageId(null)
      return
    }
    supabase
      .from('document_partages')
      .select('id')
      .eq('document_id', document.id)
      .eq('destinataire_profile_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (vivant) setMonPartageId(data?.id ?? null)
      })
    return () => {
      vivant = false
    }
  }, [document.id, profile, sonProprietaire])

  // Confirmation du PROPRIÉTAIRE avant suppression réelle : qui partage la vue, lu à la demande
  // (policy document_partages_lecteur_select, 0113 — voir les destinataires sans égard à qui a
  // émis chaque partage).
  const [confirmationOuverte, setConfirmationOuverte] = useState(false)
  const [nomsPartages, setNomsPartages] = useState<string[] | null>(null)

  async function telecharger() {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(document.storage_path, 60)
    if (error || !data) {
      setErreur(error?.message ?? 'Téléchargement impossible.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noreferrer')
  }

  async function ouvrirConfirmationSuppression() {
    setErreur(null)
    setEnCours(true)
    const { data } = await supabase.from('document_partages').select('destinataire_nom').eq('document_id', document.id)
    setEnCours(false)
    setNomsPartages((data ?? []).map((p) => p.destinataire_nom ?? 'Personne'))
    setConfirmationOuverte(true)
  }

  async function confirmerSuppression() {
    if (!session) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/documents/supprimer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ documentId: document.id }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'La suppression a échoué.')
      return
    }
    setConfirmationOuverte(false)
    onChange()
    onFermer()
  }

  async function retirerMaVue() {
    if (!monPartageId) return
    if (
      !window.confirm(
        `Retirer « ${document.nom_original} » de votre espace ? Le fichier n'est pas supprimé : son propriétaire devra vous le repartager si vous voulez le revoir.`,
      )
    ) {
      return
    }
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('document_partages').delete().eq('id', monPartageId)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
    onFermer()
  }

  // Cas 3 : comportement préexistant, inchangé — admin gérant le dossier d'un tiers, déposant
  // d'un document dans sa propre arborescence, etc. Hors du périmètre de la règle propriétaire/
  // partage ci-dessus.
  async function supprimerExistant() {
    if (!session) return
    if (!window.confirm(`Supprimer « ${document.nom_original} » ?`)) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/documents/supprimer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ documentId: document.id }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'La suppression a échoué.')
      return
    }
    onChange()
    onFermer()
  }

  return (
    <Modale titre={document.nom_original} onFermer={onFermer} largeurMax={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <LigneInfo label="Catégorie" valeur={libelleCategorie(document)} />
        <LigneInfo label="Taille" valeur={formatTaille(document.taille_octets)} />
        <LigneInfo label="Déposé le" valeur={new Date(document.created_at).toLocaleDateString('fr-FR')} />

        {mention && (
          <div style={{ padding: '9px 11px', borderRadius: 10, background: 'rgba(111,227,192,.08)', border: '1px solid rgba(111,227,192,.28)' }}>
            <span style={{ fontSize: 12, color: 'var(--accent-teal)' }}>Partagé avec vous par {mention.par}</span>
            {mention.message && (
              <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', margin: '4px 0 0' }}>« {mention.message} »</p>
            )}
          </div>
        )}

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={telecharger} className="btn-shine" style={{ ...boutonPrimaireStyle, flexGrow: 1 }}>
            Télécharger
          </button>
          {peutPartager && (
            <button onClick={() => setPartageOuvert(true)} style={{ ...boutonSecondaireStyle, flexGrow: 1 }}>
              Partager
            </button>
          )}
          {sonProprietaire ? (
            <button onClick={ouvrirConfirmationSuppression} disabled={enCours} style={{ ...boutonDangerStyle, flexGrow: 1, opacity: enCours ? 0.6 : 1 }}>
              {enCours ? '…' : 'Supprimer'}
            </button>
          ) : monPartageId ? (
            <button onClick={retirerMaVue} disabled={enCours} style={{ ...boutonDangerStyle, flexGrow: 1, opacity: enCours ? 0.6 : 1 }}>
              {enCours ? 'Retrait…' : 'Retirer de mon espace'}
            </button>
          ) : (
            monPartageId === null &&
            peutSupprimer && (
              <button onClick={supprimerExistant} disabled={enCours} style={{ ...boutonDangerStyle, flexGrow: 1, opacity: enCours ? 0.6 : 1 }}>
                {enCours ? 'Suppression…' : 'Supprimer'}
              </button>
            )
          )}
        </div>
      </div>

      {partageOuvert && (
        <PartagerDocumentModale document={document} onFermer={() => setPartageOuvert(false)} onChange={onChange} />
      )}

      {confirmationOuverte && (
        <ModaleConfirmation
          titre="Supprimer ce document ?"
          description={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span>
                « {document.nom_original} » sera définitivement supprimé de Hari Online Club — action irréversible.
              </span>
              {nomsPartages && nomsPartages.length > 0 ? (
                <div>
                  <span style={{ display: 'block', marginBottom: 4 }}>
                    {nomsPartages.length === 1
                      ? 'Une personne a actuellement la vue de ce document :'
                      : `${nomsPartages.length} personnes ont actuellement la vue de ce document :`}
                  </span>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {nomsPartages.map((nom, index) => (
                      <li key={`${nom}-${index}`}>{nom}</li>
                    ))}
                  </ul>
                  <span style={{ display: 'block', marginTop: 8 }}>
                    En poursuivant, le document disparaît de Hari Online Club et ces personnes reçoivent une
                    notification de suppression — elles ne pourront plus y accéder.
                  </span>
                </div>
              ) : (
                <span>Personne d’autre n’a actuellement la vue de ce document.</span>
              )}
            </div>
          }
          libelleConfirmer="Supprimer définitivement"
          libelleEnCours="Suppression…"
          enCours={enCours}
          erreur={erreur}
          onConfirmer={confirmerSuppression}
          onFermer={() => setConfirmationOuverte(false)}
        />
      )}
    </Modale>
  )
}
