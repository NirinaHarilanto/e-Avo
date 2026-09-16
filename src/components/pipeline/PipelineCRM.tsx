import { useEffect, useState, type DragEvent, type FormEvent } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import type { ProspectStatut, TypeProgrammeProspect } from '../../types/database.types'
import { COLONNES_PIPELINE, useProspectsPipeline, type ProspectAvecDiagnostic } from '../../hooks/useProspectsPipeline'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { Modale } from '../ui/Modale'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { champStyle } from '../ui/Champ'
import { Icone } from '../ui/Icones'

const COULEUR_COLONNE: Record<string, string> = {
  prospect: '#8b96b8',
  diagnostic_planifie: '#e9cf94',
  diagnostic_fait: '#5eb3ff',
  etudiant: '#6fe3c0',
}

export function PipelineCRM() {
  const { profile, session } = useProfileContext()
  const { prospects, loading, erreur, recharger } = useProspectsPipeline()
  const [calendlyUrl, setCalendlyUrl] = useState<string | null>(null)
  const [colonneSurvolee, setColonneSurvolee] = useState<ProspectStatut | null>(null)
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)

  useEffect(() => {
    if (!profile) return
    supabase
      .from('etablissements')
      .select('calendly_url')
      .eq('id', profile.etablissement_id)
      .maybeSingle()
      .then(({ data }) => setCalendlyUrl(data?.calendly_url ?? null))
  }, [profile])

  // Mutation de statut centralisée : utilisée aussi bien par le glisser-déposer que par les
  // actions rapides des cartes, pour ne jamais dupliquer la logique de transition (conversion
  // étudiant, création à la volée d'une ligne diagnostic_calls manquante).
  async function changerStatut(prospect: ProspectAvecDiagnostic, nouveauStatut: ProspectStatut) {
    if (nouveauStatut === prospect.statut) return

    if (nouveauStatut === 'etudiant') {
      if (!session) return
      if (
        !confirm(
          `Convertir ${prospect.prenom} ${prospect.nom} en étudiant ? Un e-mail d'invitation sera envoyé à ${prospect.email} pour qu'il/elle crée son mot de passe.`,
        )
      ) {
        return
      }
      const reponse = await fetch('/api/admin/convert-prospect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ prospectId: prospect.id }),
      })
      if (!reponse.ok) {
        const corps = await reponse.json().catch(() => null)
        alert(corps?.error ?? 'La conversion a échoué.')
        return
      }
      recharger()
      return
    }

    // Un diagnostic_calls doit exister pour qu'on puisse plus tard y noter niveau/rythme —
    // s'il n'y en a pas encore (prospect arrivé ici par glisser-déposer, ou déjà auto-confirmé
    // depuis la landing via une réservation en ligne), on en crée un minimal à la volée.
    if (nouveauStatut === 'diagnostic_fait' && !prospect.diagnostic && profile) {
      await supabase.from('diagnostic_calls').insert({
        etablissement_id: prospect.etablissement_id,
        prospect_id: prospect.id,
        mene_par: profile.id,
        date_appel: new Date().toISOString(),
      })
    }

    await supabase.from('prospects').update({ statut: nouveauStatut }).eq('id', prospect.id)
    recharger()
  }

  function onDropColonne(e: DragEvent, statutCible: ProspectStatut) {
    e.preventDefault()
    setColonneSurvolee(null)
    const prospectId = e.dataTransfer.getData('text/plain')
    /* La mutation d'état (et donc le rechargement qui déplace immédiatement la carte vers une
       autre colonne) est reportée après la fin du cycle natif de glisser-déposer du navigateur —
       demande client du 2026-09-16, « ça bloque et fait planter l'application ». `drop` survient
       AVANT `dragend` : muter l'état React ici démontait le nœud DOM d'origine (déplacé vers une
       autre colonne au prochain rendu) alors que le navigateur tenait encore une référence active
       dessus pour terminer son propre geste de glisser-déposer, ce qui plantait l'interaction. Un
       délai de 0 ms suffit à laisser `dragend` se terminer d'abord — il s'exécute forcément avant,
       puisqu'il fait partie de la même file d'événements synchrones que `drop`, alors qu'un
       `setTimeout` est toujours placé après dans la file. */
    setTimeout(() => {
      const prospect = prospects.find((p) => p.id === prospectId)
      if (prospect) changerStatut(prospect, statutCible)
    }, 0)
  }

  return (
    <AdminLayout actif="Prospects">
      <EnTetePage
        compact
        titre="Prospects"
        description="Le parcours d’un candidat, de sa demande initiale jusqu’à sa conversion en étudiant. Chaque colonne est une étape : faites glisser une carte vers la colonne suivante pour faire avancer le dossier."
        actions={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setFormulaireOuvert(true)} className="btn-shine" style={boutonPrimaireStyle}>
              <Icone nom="plus" taille={15} />
              Ajouter un prospect
            </button>
            <button onClick={() => recharger()} className="btn-shine" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--border)', color: 'var(--ink-2)' }}>
              Actualiser
            </button>
          </div>
        }
      />

      <GuidePage
        id="admin-prospects"
        compact
        etapes={[
          <>
            Les nouveaux dossiers arrivent seuls dans la première colonne : ils viennent du formulaire de contact de
            votre page vitrine publique, ou de <strong>Ajouter un prospect</strong> si vous les saisissez vous-même
            (un candidat pas encore passé par un appel diagnostic ou de positionnement).
          </>,
          <>
            <strong>Glissez une carte</strong> d’une colonne à l’autre pour changer son statut, ou utilisez les boutons
            de la carte si vous préférez ne pas faire de glisser-déposer.
          </>,
          <>
            Dépliez une carte pour planifier l’appel diagnostic, puis y noter le <strong>niveau évalué</strong> et le
            rythme convenu : ces informations suivront l’élève dans son dossier. Un rendez-vous réservé en ligne par
            le prospect lui-même affiche sa date, son lien de visioconférence et son statut de validation.
          </>,
          <>
            En déposant une carte dans <strong>Étudiant</strong>, une invitation par e-mail est envoyée automatiquement
            et le dossier bascule vers la page Étudiants. Cette action vous est confirmée avant d’être exécutée.
          </>,
        ]}
      />

      {erreur && (
        <div style={{ marginBottom: 16 }}>
          <MessageErreur>{erreur}</MessageErreur>
        </div>
      )}

      {!loading && prospects.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <GrilleStats min={160} compact>
            <Stat compact libelle="Dossiers en cours" valeur={prospects.length} ton="or" />
            <Stat
              compact
              libelle="Appels à planifier"
              valeur={prospects.filter((p) => p.statut === 'prospect').length}
              ton="alerte"
              aide="En attente d’une première prise de contact"
            />
            <Stat
              compact
              libelle="Diagnostics réalisés"
              valeur={prospects.filter((p) => p.statut === 'diagnostic_fait').length}
              ton="bleu"
              aide="Prêts à être convertis en étudiant"
            />
            <Stat
              compact
              libelle="Taux de conversion"
              valeur={`${Math.round((prospects.filter((p) => p.statut === 'etudiant').length / prospects.length) * 100)} %`}
              ton="teal"
              aide={`${prospects.filter((p) => p.statut === 'etudiant').length} dossier(s) devenu(s) étudiant`}
            />
          </GrilleStats>
        </div>
      )}

      {loading ? (
        <EtatChargement lignes={3} hauteur={120} />
      ) : (
        <div className="grille-pipeline">
          {COLONNES_PIPELINE.map((colonne) => {
            const items = prospects.filter((p) => p.statut === colonne.statut)
            const survolee = colonneSurvolee === colonne.statut
            return (
              <div
                key={colonne.statut}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (colonneSurvolee !== colonne.statut) setColonneSurvolee(colonne.statut)
                }}
                onDragLeave={() => setColonneSurvolee((courante) => (courante === colonne.statut ? null : courante))}
                onDrop={(e) => onDropColonne(e, colonne.statut)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  borderRadius: 14,
                  padding: 5,
                  border: survolee ? `1px dashed ${COULEUR_COLONNE[colonne.statut]}` : '1px dashed transparent',
                  background: survolee ? 'rgba(255,255,255,.03)' : 'transparent',
                  transition: 'background .15s, border-color .15s',
                  minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 4px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: COULEUR_COLONNE[colonne.statut] }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-2)', minWidth: 0 }}>{colonne.titre}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink-2)', background: 'rgba(255,255,255,.06)', borderRadius: 999, padding: '1px 8px', flexShrink: 0 }}>
                    {items.length}
                  </span>
                </div>
                {items.length === 0 && (
                  <span
                    style={{
                      textAlign: 'center',
                      fontSize: 11,
                      lineHeight: 1.4,
                      color: 'var(--muted-2)',
                      border: '1px dashed rgba(255,255,255,.14)',
                      borderRadius: 12,
                      padding: '11px 10px',
                    }}
                  >
                    Aucun dossier
                    <br />
                    <span style={{ fontSize: 10.5, opacity: 0.8 }}>Déposez une carte ici</span>
                  </span>
                )}
                {items.map((prospect) => (
                  <CarteProspect key={prospect.id} prospect={prospect} calendlyUrl={calendlyUrl} onChange={recharger} onChangerStatut={changerStatut} />
                ))}
              </div>
            )
          })}
        </div>
      )}

      {formulaireOuvert && profile && (
        <FormulaireNouveauProspect
          etablissementId={profile.etablissement_id}
          onFermer={() => setFormulaireOuvert(false)}
          onCree={() => {
            setFormulaireOuvert(false)
            recharger()
          }}
        />
      )}
    </AdminLayout>
  )
}

const LABEL_PROGRAMME: Record<string, string> = {
  individuel: 'Individuel',
  duo: 'Duo',
  collectif: 'Collectif',
}

/* Saisie manuelle d'un prospect qui n'est jamais passé par le formulaire public — démarché
   directement, recommandé par un élève, etc. (demande client du 2026-09-16). Insertion directe
   depuis le client : la policy `prospects_admin_all` (migration 0005) autorise déjà tout admin de
   l'établissement à écrire dans `prospects`, pas besoin d'un endpoint dédié. Le dossier entre
   toujours dans la première colonne (« pas encore passé un appel diagnostic ou de
   positionnement »), exactement comme un prospect arrivé par la landing. */
function FormulaireNouveauProspect({
  etablissementId,
  onFermer,
  onCree,
}: {
  etablissementId: string
  onFermer: () => void
  onCree: () => void
}) {
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [langueVisee, setLangueVisee] = useState('')
  const [objectif, setObjectif] = useState('')
  const [typeProgramme, setTypeProgramme] = useState<TypeProgrammeProspect>('individuel')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function creer(e: FormEvent) {
    e.preventDefault()
    if (!nom.trim() || !prenom.trim() || !email.trim()) {
      setErreur('Nom, prénom et e-mail sont obligatoires.')
      return
    }
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('prospects').insert({
      etablissement_id: etablissementId,
      statut: 'prospect',
      nom: nom.trim(),
      prenom: prenom.trim(),
      email: email.trim().toLowerCase(),
      telephone: telephone.trim() || null,
      langue_visee: langueVisee.trim() || null,
      objectif: objectif.trim() || null,
      type_programme: typeProgramme,
    })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onCree()
  }

  return (
    <Modale titre="Ajouter un prospect" onFermer={onFermer} largeurMax={460}>
      <form onSubmit={creer} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)', margin: 0 }}>
          Pour un candidat pas encore passé par un appel diagnostic ou de positionnement — démarché directement,
          recommandé, ou rencontré hors ligne. Le dossier entre dans la colonne « Nouveaux prospects ».
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <input required placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} style={{ ...champStyle, flex: 1 }} />
          <input required placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} style={{ ...champStyle, flex: 1 }} />
        </div>
        <input required type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} style={champStyle} />
        <input placeholder="Téléphone (facultatif)" value={telephone} onChange={(e) => setTelephone(e.target.value)} style={champStyle} />
        <input placeholder="Langue visée (facultatif)" value={langueVisee} onChange={(e) => setLangueVisee(e.target.value)} style={champStyle} />
        <textarea
          placeholder="Objectif (facultatif)"
          value={objectif}
          onChange={(e) => setObjectif(e.target.value)}
          rows={2}
          style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Programme visé</label>
          <select value={typeProgramme} onChange={(e) => setTypeProgramme(e.target.value as TypeProgrammeProspect)} style={champStyle}>
            <option value="individuel">Individuel</option>
            <option value="duo">Duo</option>
            <option value="collectif">Collectif</option>
          </select>
        </div>
        {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erreur}</p>}
        <button type="submit" disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, opacity: enCours ? 0.7 : 1 }}>
          {enCours ? 'Création…' : 'Créer le dossier'}
        </button>
      </form>
    </Modale>
  )
}

interface CarteProspectProps {
  prospect: ProspectAvecDiagnostic
  calendlyUrl: string | null
  onChange: () => void
  onChangerStatut: (prospect: ProspectAvecDiagnostic, nouveauStatut: ProspectStatut) => Promise<void>
}

function CarteProspect({ prospect, calendlyUrl, onChange, onChangerStatut }: CarteProspectProps) {
  const { profile, session } = useProfileContext()
  const estPositionnement = prospect.type_programme === 'collectif'
  const [ouvert, setOuvert] = useState(false)
  const [dateAppel, setDateAppel] = useState('')
  const [niveauEvalue, setNiveauEvalue] = useState(prospect.diagnostic?.niveau_evalue ?? '')
  const [rythmeConvenu, setRythmeConvenu] = useState(prospect.diagnostic?.rythme_convenu ?? '')
  const [notes, setNotes] = useState(prospect.diagnostic?.notes ?? '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enGlissement, setEnGlissement] = useState(false)
  const [detailOuvert, setDetailOuvert] = useState(false)
  const [validationEnCours, setValidationEnCours] = useState(false)

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
    setEnCours(true)
    setErreur(null)

    let diagnosticId = prospect.diagnostic?.id ?? null
    if (!diagnosticId) {
      if (!profile) {
        setEnCours(false)
        return
      }
      const { data: inserted, error: insertError } = await supabase
        .from('diagnostic_calls')
        .insert({
          etablissement_id: prospect.etablissement_id,
          prospect_id: prospect.id,
          mene_par: profile.id,
          date_appel: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (insertError || !inserted) {
        setErreur(insertError?.message ?? "Impossible d'enregistrer le diagnostic.")
        setEnCours(false)
        return
      }
      diagnosticId = inserted.id
    }

    const { error: updateDiagError } = await supabase
      .from('diagnostic_calls')
      .update({ niveau_evalue: niveauEvalue || null, rythme_convenu: rythmeConvenu || null, notes: notes || null })
      .eq('id', diagnosticId)
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

  /* Enregistre niveau / rythme / notes SANS changer de colonne — contrairement à
     `marquerRealise()`, qui fait les deux à la fois au moment de la transition. Une fois dans
     « Diagnostic réalisé », ces trois champs doivent rester modifiables (demande client du
     2026-09-16 : « son niveau modifiable et les résultats de l'appel », avec une zone libre à
     l'écriture pour les notes de l'admin). */
  async function enregistrerDiagnostic() {
    if (!profile) return
    setEnCours(true)
    setErreur(null)

    let diagnosticId = prospect.diagnostic?.id ?? null
    if (!diagnosticId) {
      const { data: inserted, error: insertError } = await supabase
        .from('diagnostic_calls')
        .insert({
          etablissement_id: prospect.etablissement_id,
          prospect_id: prospect.id,
          mene_par: profile.id,
          date_appel: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (insertError || !inserted) {
        setErreur(insertError?.message ?? "Impossible d'enregistrer le diagnostic.")
        setEnCours(false)
        return
      }
      diagnosticId = inserted.id
    }

    const { error } = await supabase
      .from('diagnostic_calls')
      .update({ niveau_evalue: niveauEvalue || null, rythme_convenu: rythmeConvenu || null, notes: notes || null })
      .eq('id', diagnosticId)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  async function validerRendezVous() {
    if (!session || !prospect.rendezVous) return
    setValidationEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/valider-rendez-vous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ rendezVousId: prospect.rendezVous.id, decision: 'confirmer' }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
    setValidationEnCours(false)
    if (reponse.error) {
      setErreur(reponse.error)
      return
    }
    onChange()
  }

  async function convertirEnEtudiant() {
    setEnCours(true)
    await onChangerStatut(prospect, 'etudiant')
    setEnCours(false)
  }

  return (
    <>
      {/* Carte repliée : uniquement l'identité du prospect, pour qu'une colonne à forte
          affluence tienne sur une hauteur raisonnable — tout le reste (objectif, diagnostic,
          actions) est déplacé dans la fenêtre de détail ouverte au clic. Le drag-and-drop reste
          porté par cette carte : un vrai clic n'émet jamais l'événement `click` après un
          glissé, les deux interactions ne se marchent donc pas dessus. */}
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', prospect.id)
          e.dataTransfer.effectAllowed = 'move'
          setEnGlissement(true)
        }}
        onDragEnd={() => setEnGlissement(false)}
        onClick={() => setDetailOuvert(true)}
        className="card card-lift"
        style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 7, cursor: 'grab', opacity: enGlissement ? 0.4 : 1 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 30, height: 30, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 11.5, fontWeight: 800, flexShrink: 0 }}>
            {(prospect.prenom[0] ?? '').toUpperCase()}
            {(prospect.nom[0] ?? '').toUpperCase()}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
              {prospect.prenom} {prospect.nom}
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{prospect.langue_visee || 'Langue non précisée'}</span>
          </div>
        </div>

        {prospect.type_programme && (
          <span
            style={{
              alignSelf: 'flex-start',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              color: 'var(--muted-2)',
              border: '1px solid var(--border)',
              borderRadius: 999,
              padding: '2px 9px',
            }}
          >
            {LABEL_PROGRAMME[prospect.type_programme]}
          </span>
        )}
      </div>

      {detailOuvert && (
        <Modale titre={`${prospect.prenom} ${prospect.nom}`} onFermer={() => setDetailOuvert(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Informations personnelles — demandées explicitement par le client le 2026-09-16
                pour les fiches « Appel diagnostic planifié » et « Diagnostic réalisé », affichées
                ici pour toutes les étapes puisqu'elles ne coûtent rien à montrer plus tôt. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{prospect.langue_visee || 'Langue non précisée'}</span>
              <a href={`mailto:${prospect.email}`} style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                {prospect.email}
              </a>
              {prospect.telephone && (
                <a href={`tel:${prospect.telephone}`} style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                  {prospect.telephone}
                </a>
              )}
            </div>

            {prospect.objectif && (
              <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)', background: 'rgba(0,0,0,.24)', borderRadius: 10, padding: '10px 12px', margin: 0 }}>
                « {prospect.objectif} »
              </p>
            )}

            {prospect.statut === 'diagnostic_planifie' && (
              <PostItRendezVous
                prospect={prospect}
                validationEnCours={validationEnCours}
                onValider={validerRendezVous}
              />
            )}

            {prospect.statut === 'diagnostic_fait' && prospect.diagnostic?.niveau_evalue && (
              <span style={{ alignSelf: 'flex-start', fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)', background: 'rgba(94,179,255,.14)', border: '1px solid rgba(94,179,255,.3)', borderRadius: 999, padding: '5px 11px' }}>
                Niveau évalué {prospect.diagnostic.niveau_evalue}
              </span>
            )}

            <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>
              Dossier créé le {new Date(prospect.created_at).toLocaleDateString('fr-FR')}
            </span>

            {erreur && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{erreur}</p>}

            {prospect.statut === 'prospect' &&
              !ouvert &&
              (calendlyUrl ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <a
                    href={calendlyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-shine"
                    style={{ flex: 1, textAlign: 'center', fontSize: 12.5, padding: 10, background: 'var(--accent-gradient)', color: '#1b1510' }}
                  >
                    Ouvrir Calendly
                  </a>
                  <button
                    onClick={() => onChangerStatut(prospect, 'diagnostic_planifie')}
                    className="btn-shine btn-secondary"
                    title={`Marquer ${estPositionnement ? 'le test' : "l'appel"} comme planifié`}
                    style={{ fontSize: 12.5, padding: '0 14px' }}
                  >
                    ✓
                  </button>
                </div>
              ) : (
                <button onClick={() => setOuvert(true)} className="btn-shine" style={{ width: '100%', fontSize: 12.5, padding: 10, background: 'var(--accent-gradient)', color: '#1b1510' }}>
                  Planifier {estPositionnement ? 'le test de positionnement' : "l'appel diagnostic"}
                </button>
              ))}
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
                <textarea
                  placeholder="Résultats de l'appel, remarques… (facultatif)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)', fontFamily: 'inherit', resize: 'vertical' }}
                />
                <button onClick={marquerRealise} disabled={enCours} className="btn-shine btn-secondary" style={{ fontSize: 12.5, padding: 9, opacity: enCours ? 0.7 : 1 }}>
                  Confirmer
                </button>
              </div>
            )}

            {prospect.statut === 'diagnostic_fait' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  Niveau et résultats de l’appel
                </span>
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
                {/* Zone libre à l'écriture pour l'admin (demande client du 2026-09-16) : ce que le
                    prospect a dit pendant l'appel, ses freins, tout ce qui ne rentre pas dans les
                    deux champs ci-dessus. Persistée dans `diagnostic_calls.notes`, déjà prévue par
                    le schéma mais jamais exposée jusqu'ici. */}
                <textarea
                  placeholder="Résultats de l'appel, remarques…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)', fontFamily: 'inherit', resize: 'vertical' }}
                />
                <button onClick={enregistrerDiagnostic} disabled={enCours} className="btn-shine btn-secondary" style={{ fontSize: 12.5, padding: 9, opacity: enCours ? 0.7 : 1 }}>
                  {enCours ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button onClick={convertirEnEtudiant} disabled={enCours} className="btn-shine" style={{ width: '100%', fontSize: 12.5, padding: 10, background: 'var(--accent-blue-gradient)', color: '#fff', opacity: enCours ? 0.7 : 1 }}>
                  Convertir en étudiant
                </button>
              </div>
            )}
          </div>
        </Modale>
      )}
    </>
  )
}

/* Note « post-it » du rendez-vous réservé en ligne par le prospect lui-même (voir
   api/prospects/reserver.ts) — jaune tant que l'admin ne l'a pas validé, vert une fois validé,
   avec le lien Meet dès qu'il existe et un bouton de validation directement ici (demande client
   du 2026-09-16). Un prospect qui n'a jamais réservé en ligne (dossier saisi à la main, ou appel
   planifié directement par l'admin) n'a pas de `rendezVous` : rien ne s'affiche, le badge
   diagnostic_calls existant (voir CarteProspect) prend le relais. */
function PostItRendezVous({
  prospect,
  validationEnCours,
  onValider,
}: {
  prospect: ProspectAvecDiagnostic
  validationEnCours: boolean
  onValider: () => void
}) {
  if (!prospect.rendezVous) return null
  const rdv = prospect.rendezVous
  const valide = rdv.statut === 'confirme'
  const quand = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(rdv.debut))

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        borderRadius: 10,
        padding: '12px 14px',
        background: valide ? '#dff5e8' : '#faf0c2',
        border: `1px solid ${valide ? '#8fd6ac' : '#e3cf6d'}`,
        boxShadow: '0 4px 14px rgba(0,0,0,.18)',
      }}
    >
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: valide ? '#1c6b41' : '#8a6d0a' }}>
        {valide ? 'Rendez-vous validé' : 'À valider par l’admin'}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#241d05' }}>{quand}</span>
      <span style={{ fontSize: 11.5, color: '#4a3f10' }}>{rdv.duree_minutes} min</span>
      {rdv.lien_meet && (
        <a
          href={rdv.lien_meet}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, fontWeight: 700, color: valide ? '#1c6b41' : '#8a6d0a' }}
        >
          Lien de visioconférence →
        </a>
      )}
      {rdv.statut === 'refuse' && <span style={{ fontSize: 11.5, color: '#8a2f0a' }}>Rendez-vous refusé.</span>}
      {rdv.statut === 'annule' && <span style={{ fontSize: 11.5, color: '#6a5f10' }}>Rendez-vous annulé.</span>}
      {rdv.statut === 'en_attente' && (
        <button
          type="button"
          onClick={onValider}
          disabled={validationEnCours}
          style={{
            alignSelf: 'flex-start',
            fontSize: 12,
            fontWeight: 700,
            color: '#1b1510',
            background: 'linear-gradient(150deg, #f0d472, #d9b93f)',
            border: 'none',
            borderRadius: 999,
            padding: '7px 16px',
            cursor: 'pointer',
            opacity: validationEnCours ? 0.7 : 1,
          }}
        >
          {validationEnCours ? 'Validation…' : 'Valider le rendez-vous'}
        </button>
      )}
    </div>
  )
}
