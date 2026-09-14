import { useEffect, useState, type DragEvent } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import type { ProspectStatut } from '../../types/database.types'
import { COLONNES_PIPELINE, useProspectsPipeline, type ProspectAvecDiagnostic } from '../../hooks/useProspectsPipeline'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { Modale } from '../ui/Modale'

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
    // depuis la landing via Calendly), on en crée un minimal à la volée.
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
    const prospect = prospects.find((p) => p.id === prospectId)
    if (prospect) changerStatut(prospect, statutCible)
  }

  return (
    <AdminLayout actif="Prospects">
      <EnTetePage
        compact
        titre="Prospects"
        description="Le parcours d’un candidat, de sa demande initiale jusqu’à sa conversion en étudiant. Chaque colonne est une étape : faites glisser une carte vers la colonne suivante pour faire avancer le dossier."
        actions={
          <button onClick={() => recharger()} className="btn-shine" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--border)', color: 'var(--ink-2)' }}>
            Actualiser
          </button>
        }
      />

      <GuidePage
        id="admin-prospects"
        compact
        etapes={[
          <>
            Les nouveaux dossiers arrivent seuls dans la première colonne : ils viennent du formulaire de contact de
            votre page vitrine publique.
          </>,
          <>
            <strong>Glissez une carte</strong> d’une colonne à l’autre pour changer son statut, ou utilisez les boutons
            de la carte si vous préférez ne pas faire de glisser-déposer.
          </>,
          <>
            Dépliez une carte pour planifier l’appel diagnostic, puis y noter le <strong>niveau évalué</strong> et le
            rythme convenu : ces informations suivront l’élève dans son dossier.
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
    </AdminLayout>
  )
}

const LABEL_PROGRAMME: Record<string, string> = {
  individuel: 'Individuel',
  duo: 'Duo',
  collectif: 'Collectif',
}

interface CarteProspectProps {
  prospect: ProspectAvecDiagnostic
  calendlyUrl: string | null
  onChange: () => void
  onChangerStatut: (prospect: ProspectAvecDiagnostic, nouveauStatut: ProspectStatut) => Promise<void>
}

function CarteProspect({ prospect, calendlyUrl, onChange, onChangerStatut }: CarteProspectProps) {
  const { profile } = useProfileContext()
  const estPositionnement = prospect.type_programme === 'collectif'
  const [ouvert, setOuvert] = useState(false)
  const [dateAppel, setDateAppel] = useState('')
  const [niveauEvalue, setNiveauEvalue] = useState('')
  const [rythmeConvenu, setRythmeConvenu] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enGlissement, setEnGlissement] = useState(false)
  const [detailOuvert, setDetailOuvert] = useState(false)

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
      .update({ niveau_evalue: niveauEvalue || null, rythme_convenu: rythmeConvenu || null })
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
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{prospect.langue_visee || 'Langue non précisée'}</span>

            {prospect.objectif && (
              <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)', background: 'rgba(0,0,0,.24)', borderRadius: 10, padding: '10px 12px', margin: 0 }}>
                « {prospect.objectif} »
              </p>
            )}

            {prospect.statut === 'diagnostic_planifie' &&
              (prospect.diagnostic ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, borderRadius: 10, border: '1px solid rgba(233,207,148,.28)', background: 'rgba(233,207,148,.1)', padding: '10px 12px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)' }}>
                    {new Date(prospect.diagnostic.date_appel).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
              ) : (
                <span style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)' }}>Réservé via Calendly</span>
              ))}

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
        </Modale>
      )}
    </>
  )
}
