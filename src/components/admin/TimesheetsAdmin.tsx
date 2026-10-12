import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import type { TimesheetAvecProfesseur } from '../../hooks/useTimesheets'
import { formaterHeures } from '../../lib/heures'
import { Modale } from '../ui/Modale'
import { Champ, champStyle } from '../ui/Champ'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonDangerStyle, boutonNeutreStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'
import { OverlayImpression, type ActionImpression } from '../facturation/OverlayImpression'
import { LABEL_STATUT_TIMESHEET, TimesheetDocument } from '../timesheets/TimesheetDocument'

const COULEUR_STATUT = { soumis: 'var(--accent-gold, #e9cf94)', valide: 'var(--accent-teal)', refuse: 'var(--danger)' } as const

const nomDe = (item: TimesheetAvecProfesseur) =>
  item.professeur ? [item.professeur.prenom, item.professeur.nom].filter(Boolean).join(' ') : 'Professeur supprimé'

/* TimeSheets envoyés par les professeurs (0081). Chacun s'ouvre comme une facture : valider
   crée la rémunération et la facture du professeur, refuser libère ses heures avec un motif. */
export function TimesheetsAdmin({
  timesheets,
  loading,
  erreur,
  onChange,
}: {
  timesheets: TimesheetAvecProfesseur[]
  loading: boolean
  erreur: string | null
  onChange: () => void
}) {
  const [ouvert, setOuvert] = useState<TimesheetAvecProfesseur | null>(null)
  const [impression, setImpression] = useState<{ item: TimesheetAvecProfesseur; action: ActionImpression } | null>(null)

  if (loading) return <EtatChargement lignes={3} hauteur={60} />
  if (erreur) return <MessageErreur>{erreur}</MessageErreur>
  if (timesheets.length === 0) {
    return (
      <EtatVide
        icone="timesheet"
        titre="Aucun TimeSheet reçu"
        description="Les professeurs envoient leurs heures depuis « Mes heures » de leur espace. Chaque envoi apparaîtra ici, prêt à être validé."
      />
    )
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {timesheets.map((item) => {
          const t = item.timesheet
          return (
            <button
              key={t.id}
              onClick={() => setOuvert(item)}
              className="card card-lift"
              style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
            >
              <div style={{ flexGrow: 1, minWidth: 200 }}>
                <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)' }}>
                  {t.numero} — {nomDe(item)}
                </span>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  Du {new Date(`${t.periode_debut}T12:00:00`).toLocaleDateString('fr-FR')} au {new Date(`${t.periode_fin}T12:00:00`).toLocaleDateString('fr-FR')} ·{' '}
                  {t.lignes.length} séance{t.lignes.length > 1 ? 's' : ''} · {formaterHeures(Number(t.total_heures))}
                </div>
              </div>
              <span className="brand-font" style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>
                {t.montant != null ? `${t.montant.toLocaleString('fr-FR')} Ar` : 'Taux à renseigner'}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: COULEUR_STATUT[t.statut] }}>{LABEL_STATUT_TIMESHEET[t.statut]}</span>
            </button>
          )
        })}
      </div>

      {ouvert && (
        <FenetreTimesheet
          item={ouvert}
          onFermer={() => setOuvert(null)}
          onImprimer={(action) => setImpression({ item: ouvert, action })}
          onTraite={() => {
            setOuvert(null)
            onChange()
          }}
        />
      )}
      {impression && (
        <OverlayImpression onFermer={() => setImpression(null)} nomFichier={`TimeSheet ${impression.item.timesheet.numero}`} actionInitiale={impression.action}>
          <TimesheetDocument timesheet={impression.item.timesheet} nomProfesseur={nomDe(impression.item)} />
        </OverlayImpression>
      )}
    </>
  )
}

function FenetreTimesheet({
  item,
  onFermer,
  onImprimer,
  onTraite,
}: {
  item: TimesheetAvecProfesseur
  onFermer: () => void
  onImprimer: (action: ActionImpression) => void
  onTraite: () => void
}) {
  const { session } = useProfileContext()
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [refus, setRefus] = useState(false)
  const [motif, setMotif] = useState('')
  /* Modification avant validation (0126, demande client du 2026-10-12) : seul l'admin peut
     retirer des lignes entières d'un TimeSheet, et uniquement à la validation — jamais une heure
     retouchée en douce. Justification obligatoire dès qu'au moins une ligne est décochée. */
  const [modificationOuverte, setModificationOuverte] = useState(false)
  const [lignesExclues, setLignesExclues] = useState<Set<string>>(new Set())
  const [justificatifModification, setJustificatifModification] = useState('')
  const t = item.timesheet

  function basculerLigne(id: string) {
    setLignesExclues((actuel) => {
      const suivant = new Set(actuel)
      if (suivant.has(id)) suivant.delete(id)
      else suivant.add(id)
      return suivant
    })
  }

  async function traiter(decision: 'valide' | 'refuse') {
    if (!session) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/traiter-timesheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        timesheetId: t.id,
        decision,
        motif,
        ...(lignesExclues.size > 0 ? { hourLedgerIdsExclus: [...lignesExclues], justificatifModification } : {}),
      }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
    setEnCours(false)
    if (reponse.error) {
      setErreur(reponse.error)
      return
    }
    onTraite()
  }

  return (
    <Modale titre={`TimeSheet ${t.numero} · ${nomDe(item)}`} onFermer={onFermer} largeurMax={760}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: '#fff', borderRadius: 8, padding: 28, maxHeight: '55vh', overflowY: 'auto' }}>
          <TimesheetDocument timesheet={t} nomProfesseur={nomDe(item)} />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['voir', 'imprimer', 'telecharger'] as const).map((a) => (
            <button key={a} onClick={() => onImprimer(a)} style={{ ...boutonSecondaireStyle, fontSize: 12, padding: '7px 13px' }}>
              {a === 'voir' ? 'Plein écran' : a === 'imprimer' ? 'Imprimer' : 'Télécharger'}
            </button>
          ))}
        </div>

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        {t.statut === 'soumis' &&
          (refus ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Champ label="Motif du refus" obligatoire aide="Transmis au professeur ; ses heures redeviennent disponibles pour un nouvel envoi.">
                <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Séance manquante, heure en trop…" style={champStyle} />
              </Champ>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setRefus(false)} style={boutonNeutreStyle}>
                  Annuler
                </button>
                <button onClick={() => traiter('refuse')} disabled={enCours || !motif.trim()} style={boutonDangerStyle}>
                  {enCours ? 'Envoi…' : 'Confirmer le refus'}
                </button>
              </div>
            </div>
          ) : modificationOuverte ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Décochez une ligne pour la retirer de ce relevé — elle redeviendra disponible pour un prochain TimeSheet.
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 180, overflowY: 'auto' }}>
                {t.lignes.map((l) => (
                  <label key={l.hour_ledger_id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer', padding: '5px 6px' }}>
                    <input type="checkbox" checked={!lignesExclues.has(l.hour_ledger_id)} onChange={() => basculerLigne(l.hour_ledger_id)} />
                    <span style={{ flexGrow: 1 }}>{l.debut ? new Date(l.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</span>
                    <span style={{ color: 'var(--muted)' }}>{l.eleves}</span>
                  </label>
                ))}
              </div>
              {lignesExclues.size > 0 && (
                <Champ label="Justification de la modification" obligatoire aide="Transmise au professeur sur son relevé.">
                  <input
                    value={justificatifModification}
                    onChange={(e) => setJustificatifModification(e.target.value)}
                    placeholder="Séance incluse à tort, déjà réglée autrement…"
                    style={champStyle}
                  />
                </Champ>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setModificationOuverte(false)
                    setLignesExclues(new Set())
                    setJustificatifModification('')
                  }}
                  style={boutonNeutreStyle}
                >
                  Annuler la modification
                </button>
                <button
                  onClick={() => traiter('valide')}
                  disabled={enCours || (lignesExclues.size > 0 && !justificatifModification.trim())}
                  className="btn-shine"
                  style={{ ...boutonPrimaireStyle, opacity: enCours || (lignesExclues.size > 0 && !justificatifModification.trim()) ? 0.6 : 1 }}
                >
                  {enCours ? 'Validation…' : 'Valider avec ces modifications'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button onClick={() => setRefus(true)} disabled={enCours} style={boutonDangerStyle}>
                Refuser
              </button>
              <button onClick={() => setModificationOuverte(true)} disabled={enCours} style={boutonSecondaireStyle}>
                Modifier avant de valider
              </button>
              <button onClick={() => traiter('valide')} disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, opacity: enCours ? 0.6 : 1 }}>
                {enCours ? 'Validation…' : 'Valider et générer la facture'}
              </button>
            </div>
          ))}
        {t.statut === 'valide' && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            Validé : la rémunération correspondante figure dans l’onglet Professeurs, avec sa facture.
          </p>
        )}
      </div>
    </Modale>
  )
}
