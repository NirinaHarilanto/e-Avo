import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import type { Candidature } from '../../hooks/useCandidatures'
import {
  CHECKLIST_INTEGRATION,
  CHECKLIST_PRESELECTION,
  CHECKLIST_SIMULATION,
  DIPLOMES_DECLARES,
  ETAPES,
  NIVEAU_MINIMUM,
  NIVEAUX_CECRL,
  TESTS_ANGLAIS,
  integrationComplete,
  moyenneSimulation,
  niveauGlobal,
  niveauGlobalPropose,
  testsReussis,
  type ChampChecklist,
  type EtatIntegration,
  type ResultatTest,
  type StatutCandidature,
  type ValeursChecklist,
  type ValeursTests,
} from '../../lib/recrutement'
import { formaterDansFuseauEtablissement } from '../../lib/etablissement'
import { Modale } from '../ui/Modale'
import { Champ, LigneInfo, champStyle } from '../ui/Champ'
import { MessageErreur, MessageSucces } from '../ui/Etats'
import { boutonDangerStyle, boutonNeutreStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'
import { ChampDate } from '../ui/ChampDate'

const ORDRE: StatutCandidature[] = ['recue', 'preselection', 'tests', 'simulation', 'integration', 'integre']

const titreSection = { fontSize: 12, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)', textTransform: 'uppercase' as const, letterSpacing: 0.5, margin: 0 }

/* Fiche d'un candidat formateur : dossier reçu, puis l'étape en cours à renseigner. Les étapes
   déjà franchies restent consultables, repliées. Chaque passage à l'étape suivante n'est permis
   que lorsque sa condition est remplie (documents vérifiés, C1 minimum, avis favorable…). */
export function FicheCandidat({
  candidature: c,
  contratSigne,
  contratEnvoye,
  onFermer,
  onChange,
}: {
  candidature: Candidature
  contratSigne: boolean
  contratEnvoye: boolean
  onFermer: () => void
  onChange: () => void
}) {
  const { session } = useProfileContext()
  const [preselection, setPreselection] = useState<ValeursChecklist>(c.preselection ?? {})
  const [tests, setTests] = useState<ValeursTests>((c.tests ?? {}) as ValeursTests)
  const [simulation, setSimulation] = useState<ValeursChecklist>(c.simulation ?? {})
  const [integration, setIntegration] = useState<EtatIntegration>(c.integration ?? {})
  const [notes, setNotes] = useState(c.notes ?? '')
  const [documentsVerifies, setDocumentsVerifies] = useState(c.documents_verifies)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)
  const [refus, setRefus] = useState(false)
  const [motif, setMotif] = useState('')

  const rangActuel = ORDRE.indexOf(c.statut)
  const passee = (s: StatutCandidature) => rangActuel > ORDRE.indexOf(s) || c.statut === 'refusee'

  async function enregistrer(champs: Partial<Candidature>, message = 'Enregistré.') {
    setEnCours(true)
    setErreur(null)
    setSucces(null)
    const { error } = await supabase
      .from('candidatures_formateurs')
      .update({ preselection, tests: tests as Record<string, unknown>, simulation, integration, notes: notes || null, documents_verifies: documentsVerifies, ...champs })
      .eq('id', c.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return false
    }
    setSucces(message)
    onChange()
    return true
  }

  async function ouvrirFichier(chemin: string) {
    const { data, error } = await supabase.storage.from('candidatures').createSignedUrl(chemin, 300)
    if (error || !data) {
      setErreur(error?.message ?? 'Fichier introuvable.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function passerEnIntegration() {
    if (!session) return
    const ok = await enregistrer({}, 'Compte rendu enregistré.')
    if (!ok) return
    setEnCours(true)
    const reponse = await fetch('/api/admin/integrer-candidat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ candidatureId: c.id }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
    setEnCours(false)
    if (reponse.error) {
      setErreur(reponse.error)
      return
    }
    setSucces('Espace professeur créé : le candidat apparaît dans Professeurs, en phase d’intégration. Lancez maintenant son contrat.')
    onChange()
  }

  async function validerIntegration() {
    if (!c.professeur_id) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('profiles').update({ statut_integration: null }).eq('id', c.professeur_id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    await enregistrer({ statut: 'integre' }, 'Intégration validée : le formateur fait désormais pleinement partie de l’équipe.')
  }

  const etapeCourante = ETAPES.find((e) => e.statut === c.statut)

  return (
    // La checklist se saisit dans l'état local et n'est écrite en base qu'au clic sur
    // « Enregistrer » (voir plus bas) — un clic accidentel en dehors de cette fenêtre ne doit
    // jamais faire perdre une évaluation en cours de remplissage (demande client du 2026-09-30 :
    // « le seul moyen de quitter la checklist [doit être] le petit croix en haut à droite »).
    <Modale titre={`${c.prenom} ${c.nom} · ${etapeCourante?.libelle ?? ''}`} onFermer={onFermer} largeurMax={820} fermetureExterieureDesactivee>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Frise statut={c.statut} />

        {erreur && <MessageErreur>{erreur}</MessageErreur>}
        {succes && <MessageSucces>{succes}</MessageSucces>}
        {c.statut === 'refusee' && c.motif_refus && <MessageErreur>Non retenu : {c.motif_refus}</MessageErreur>}

        {/* Réception */}
        <Bloc titre="Dossier de candidature" ouvertParDefaut={c.statut === 'recue'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <LigneInfo label="E-mail" valeur={c.email} />
            <LigneInfo label="Téléphone" valeur={c.telephone ?? '—'} />
            <LigneInfo label="Ville" valeur={c.ville ?? '—'} />
            <LigneInfo label="Diplôme déclaré" valeur={DIPLOMES_DECLARES.find((d) => d.valeur === c.diplome_declare)?.libelle ?? '—'} />
            <LigneInfo label="Reçu le" valeur={formaterDansFuseauEtablissement(c.created_at, { dateStyle: 'long', timeStyle: 'short' })} />
          </div>
          <TexteLong titre="Motivations" texte={c.motivation} />
          <TexteLong titre="Expériences professionnelles" texte={c.experiences} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {c.fichiers.map((f) => (
              <button key={f.chemin} onClick={() => ouvrirFichier(f.chemin)} style={{ ...boutonSecondaireStyle, fontSize: 12, padding: '6px 12px' }}>
                {f.type === 'cv' ? 'CV' : 'Diplôme'} · {f.nom}
              </button>
            ))}
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--ink-2)' }}>
            <input type="checkbox" checked={documentsVerifies} disabled={passee('recue')} onChange={(e) => setDocumentsVerifies(e.target.checked)} />
            Documents obligatoires vérifiés : licence en études anglophones OU certification TEFL reconnue
          </label>
          {c.statut === 'recue' && (
            <Actions>
              <button onClick={() => enregistrer({})} disabled={enCours} style={boutonNeutreStyle}>
                Enregistrer
              </button>
              <button
                onClick={() => enregistrer({ statut: 'preselection' }, 'Candidat passé à l’appel de pré-sélection.')}
                disabled={enCours || !documentsVerifies}
                className="btn-shine"
                style={{ ...boutonPrimaireStyle, opacity: documentsVerifies ? 1 : 0.55 }}
              >
                Passer à l’appel de pré-sélection →
              </button>
            </Actions>
          )}
        </Bloc>

        {/* Sélection 1 : pré-sélection */}
        {rangActuel >= ORDRE.indexOf('preselection') || (c.statut === 'refusee' && Object.keys(c.preselection ?? {}).length > 0) ? (
          <Bloc titre="Appel de pré-sélection" ouvertParDefaut={c.statut === 'preselection'}>
            <FormulaireChecklist champs={CHECKLIST_PRESELECTION} valeurs={preselection} onChange={setPreselection} lectureSeule={passee('preselection')} />
            {c.statut === 'preselection' && (
              <Actions>
                <button onClick={() => enregistrer({})} disabled={enCours} style={boutonNeutreStyle}>
                  Enregistrer
                </button>
                <button onClick={() => enregistrer({ statut: 'tests' }, 'Candidat passé aux tests d’anglais.')} disabled={enCours} className="btn-shine" style={boutonPrimaireStyle}>
                  Passer aux tests →
                </button>
              </Actions>
            )}
          </Bloc>
        ) : null}

        {/* Sélection 2 : tests */}
        {rangActuel >= ORDRE.indexOf('tests') || (c.statut === 'refusee' && Object.keys(c.tests ?? {}).length > 0) ? (
          <Bloc titre="Tests Reading, Listening, Grammar & Vocabulary" ouvertParDefaut={c.statut === 'tests'}>
            <FormulaireTests tests={tests} onChange={setTests} lectureSeule={passee('tests')} />
            {c.statut === 'tests' && (
              <Actions>
                <button onClick={() => enregistrer({})} disabled={enCours} style={boutonNeutreStyle}>
                  Enregistrer
                </button>
                <button
                  onClick={() => enregistrer({ statut: 'simulation' }, 'Candidat passé à la simulation de cours.')}
                  disabled={enCours || !testsReussis(tests)}
                  className="btn-shine"
                  style={{ ...boutonPrimaireStyle, opacity: testsReussis(tests) ? 1 : 0.55 }}
                >
                  Passer à la simulation de cours →
                </button>
              </Actions>
            )}
          </Bloc>
        ) : null}

        {/* Sélection 3 : simulation */}
        {rangActuel >= ORDRE.indexOf('simulation') || (c.statut === 'refusee' && Object.keys(c.simulation ?? {}).length > 0) ? (
          <Bloc titre="Simulation de cours sur Google Meet" ouvertParDefaut={c.statut === 'simulation'}>
            <FormulaireChecklist champs={CHECKLIST_SIMULATION} valeurs={simulation} onChange={setSimulation} lectureSeule={passee('simulation')} />
            {moyenneSimulation(simulation) != null && (
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                Moyenne des critères : <strong>{moyenneSimulation(simulation)} / 5</strong>
              </span>
            )}
            {c.statut === 'simulation' && (
              <Actions>
                <button onClick={() => enregistrer({})} disabled={enCours} style={boutonNeutreStyle}>
                  Enregistrer
                </button>
                <button
                  onClick={passerEnIntegration}
                  disabled={enCours || simulation.avis !== 'favorable'}
                  className="btn-shine"
                  style={{ ...boutonPrimaireStyle, opacity: simulation.avis === 'favorable' ? 1 : 0.55 }}
                >
                  Passer en intégration (créer son espace professeur) →
                </button>
              </Actions>
            )}
            {c.statut === 'simulation' && simulation.avis !== 'favorable' && (
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Un avis final « Favorable » est nécessaire pour passer en intégration.</span>
            )}
          </Bloc>
        ) : null}

        {/* Intégration */}
        {rangActuel >= ORDRE.indexOf('integration') && (
          <Bloc titre="Phase d’intégration" ouvertParDefaut>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CHECKLIST_INTEGRATION.map((item) =>
                item.automatique ? (
                  <div key={item.cle} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-2)', flexWrap: 'wrap' }}>
                    <input type="checkbox" checked={contratSigne} disabled readOnly />
                    <span style={{ flexGrow: 1 }}>{item.libelle}</span>
                    <span style={{ fontSize: 11.5, color: contratSigne ? 'var(--accent-teal)' : 'var(--muted)' }}>
                      {contratSigne ? 'Contrat signé' : contratEnvoye ? 'Contrat envoyé, en attente de signature' : 'Aucun contrat lancé'}
                    </span>
                    {!contratSigne && (
                      <Link to="/admin/contrats" style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)' }}>
                        {contratEnvoye ? 'Voir les contrats' : 'Lancer son contrat'}
                      </Link>
                    )}
                  </div>
                ) : (
                  <div key={item.cle} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-2)', flexWrap: 'wrap' }}>
                    <input
                      type="checkbox"
                      checked={!!integration[item.cle]?.fait}
                      disabled={c.statut === 'integre'}
                      onChange={(e) =>
                        setIntegration((v) => ({ ...v, [item.cle]: { ...v[item.cle], fait: e.target.checked, date: v[item.cle]?.date ?? (e.target.checked ? new Date().toISOString().slice(0, 10) : null) } }))
                      }
                    />
                    <span style={{ flexGrow: 1 }}>{item.libelle}</span>
                    <ChampDate
                      type="date"
                      value={integration[item.cle]?.date ?? ''}
                      disabled={c.statut === 'integre'}
                      onChange={(e) => setIntegration((v) => ({ ...v, [item.cle]: { ...v[item.cle], date: e.target.value || null } }))}
                      style={{ ...champStyle, padding: '5px 9px', fontSize: 12 }}
                    />
                  </div>
                ),
              )}
            </div>
            {c.statut === 'integration' && (
              <Actions>
                <button onClick={() => enregistrer({})} disabled={enCours} style={boutonNeutreStyle}>
                  Enregistrer
                </button>
                <button
                  onClick={validerIntegration}
                  disabled={enCours || !integrationComplete(integration, contratSigne)}
                  className="btn-shine"
                  style={{ ...boutonPrimaireStyle, opacity: integrationComplete(integration, contratSigne) ? 1 : 0.55 }}
                >
                  Valider l’intégration
                </button>
              </Actions>
            )}
            {c.statut === 'integration' && !integrationComplete(integration, contratSigne) && (
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                La validation demande le contrat signé et toutes les étapes cochées (pensez à enregistrer).
              </span>
            )}
            {c.professeur_id && (
              <Link to={`/admin/professeurs/${c.professeur_id}`} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-blue)' }}>
                Voir sa fiche professeur →
              </Link>
            )}
          </Bloc>
        )}

        <Champ label="Notes internes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </Champ>

        {c.statut !== 'integre' && c.statut !== 'refusee' && (
          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
            {refus ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Champ label="Motif" obligatoire aide="Conservé dans le dossier.">
                  <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Niveau insuffisant, indisponible…" style={champStyle} />
                </Champ>
                <Actions>
                  <button onClick={() => setRefus(false)} style={boutonNeutreStyle}>
                    Annuler
                  </button>
                  <button
                    onClick={() => enregistrer({ statut: 'refusee', motif_refus: motif.trim() }, 'Candidature classée « non retenue ».')}
                    disabled={enCours || !motif.trim()}
                    style={boutonDangerStyle}
                  >
                    Confirmer
                  </button>
                </Actions>
              </div>
            ) : (
              <button onClick={() => setRefus(true)} style={boutonDangerStyle} disabled={c.statut === 'integration'}>
                Ne pas retenir ce candidat
              </button>
            )}
          </div>
        )}
      </div>
    </Modale>
  )
}

function Frise({ statut }: { statut: StatutCandidature }) {
  const rang = ORDRE.indexOf(statut)
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {ETAPES.filter((e) => e.statut !== 'refusee').map((e, i) => {
        const atteinte = statut !== 'refusee' && i <= rang
        const courante = e.statut === statut
        return (
          <span
            key={e.statut}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 999,
              border: `1px solid ${courante ? 'var(--accent-gold, #e9cf94)' : 'var(--border)'}`,
              color: courante ? 'var(--accent-gold, #e9cf94)' : atteinte ? 'var(--accent-teal)' : 'var(--muted-2)',
              background: courante ? 'rgba(233,207,148,.1)' : 'transparent',
            }}
          >
            {e.phase} · {e.libelle}
          </span>
        )
      })}
    </div>
  )
}

function Bloc({ titre, ouvertParDefaut, children }: { titre: string; ouvertParDefaut?: boolean; children: ReactNode }) {
  return (
    <details open={ouvertParDefaut} style={{ border: '1px solid var(--border-soft)', borderRadius: 12, padding: '12px 14px' }}>
      <summary style={{ ...titreSection, cursor: 'pointer' }}>{titre}</summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>{children}</div>
    </details>
  )
}

function Actions({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{children}</div>
}

function TexteLong({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div>
      <p style={{ ...titreSection, color: 'var(--muted)', marginBottom: 4 }}>{titre}</p>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{texte}</p>
    </div>
  )
}

function FormulaireChecklist({
  champs,
  valeurs,
  onChange,
  lectureSeule,
}: {
  champs: ChampChecklist[]
  valeurs: ValeursChecklist
  onChange: (v: ValeursChecklist) => void
  lectureSeule: boolean
}) {
  const definir = (cle: string, valeur: string | number | boolean | null) => onChange({ ...valeurs, [cle]: valeur })
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
      {champs.map((champ) => {
        const valeur = valeurs[champ.cle]
        if (champ.type === 'case') {
          return (
            <label key={champ.cle} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--ink-2)', gridColumn: '1 / -1' }}>
              <input type="checkbox" checked={!!valeur} disabled={lectureSeule} onChange={(e) => definir(champ.cle, e.target.checked)} style={{ marginTop: 2 }} />
              {champ.libelle}
            </label>
          )
        }
        const pleineLargeur = champ.type === 'texte'
        return (
          <div key={champ.cle} style={pleineLargeur ? { gridColumn: '1 / -1' } : undefined}>
            <Champ label={champ.libelle}>
              {champ.type === 'texte' ? (
                <textarea
                  value={(valeur as string) ?? ''}
                  disabled={lectureSeule}
                  onChange={(e) => definir(champ.cle, e.target.value)}
                  rows={2}
                  style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              ) : champ.type === 'note' ? (
                <select value={(valeur as number) ?? ''} disabled={lectureSeule} onChange={(e) => definir(champ.cle, e.target.value ? Number(e.target.value) : null)} style={champStyle}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} / 5
                    </option>
                  ))}
                </select>
              ) : champ.type === 'choix' ? (
                <select value={(valeur as string) ?? ''} disabled={lectureSeule} onChange={(e) => definir(champ.cle, e.target.value || null)} style={champStyle}>
                  <option value="">—</option>
                  {champ.options?.map((o) => (
                    <option key={o.valeur} value={o.valeur}>
                      {o.libelle}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={champ.type === 'nombre' ? 'number' : 'date'}
                  value={(valeur as string | number) ?? ''}
                  disabled={lectureSeule}
                  onChange={(e) => definir(champ.cle, champ.type === 'nombre' ? (e.target.value ? Number(e.target.value) : null) : e.target.value || null)}
                  style={champStyle}
                />
              )}
            </Champ>
          </div>
        )
      })}
    </div>
  )
}

function FormulaireTests({ tests, onChange, lectureSeule }: { tests: ValeursTests; onChange: (t: ValeursTests) => void; lectureSeule: boolean }) {
  const propose = niveauGlobalPropose(tests)
  const global = niveauGlobal(tests)
  const reussi = testsReussis(tests)
  const majTest = (cle: string, valeurs: Partial<ResultatTest>) =>
    onChange({ ...tests, [cle]: { ...((tests[cle] as ResultatTest | undefined) ?? {}), ...valeurs } })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {TESTS_ANGLAIS.map((t) => {
        const r = (tests[t.cle] as ResultatTest | undefined) ?? {}
        return (
          <div key={t.cle} style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 1.3fr) 1fr 1fr', gap: 10, alignItems: 'end' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--ink-2)', paddingBottom: 10 }}>
              <input type="checkbox" checked={!!r.fait} disabled={lectureSeule} onChange={(e) => majTest(t.cle, { fait: e.target.checked })} />
              {t.libelle}
            </label>
            <Champ label="Note (/100)">
              <input
                type="number"
                min={0}
                max={100}
                value={r.note ?? ''}
                disabled={lectureSeule}
                onChange={(e) => majTest(t.cle, { note: e.target.value === '' ? null : Number(e.target.value) })}
                style={champStyle}
              />
            </Champ>
            <Champ label="Niveau">
              <select value={r.niveau ?? ''} disabled={lectureSeule} onChange={(e) => majTest(t.cle, { niveau: (e.target.value || null) as ResultatTest['niveau'] })} style={champStyle}>
                <option value="">—</option>
                {NIVEAUX_CECRL.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Champ>
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
        <Champ label="Niveau global retenu" aide={propose ? `Proposé : ${propose} (le plus faible des trois tests)` : 'Renseignez les trois niveaux'}>
          <select
            value={(tests.niveau_global as string) ?? ''}
            disabled={lectureSeule}
            onChange={(e) => onChange({ ...tests, niveau_global: (e.target.value || null) as ValeursTests['niveau_global'] })}
            style={{ ...champStyle, minWidth: 160 }}
          >
            <option value="">{propose ? `Automatique (${propose})` : '—'}</option>
            {NIVEAUX_CECRL.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Champ>
        <span style={{ fontSize: 12.5, fontWeight: 700, paddingBottom: 10, color: reussi ? 'var(--accent-teal)' : 'var(--muted)' }}>
          {global
            ? reussi
              ? `${global} : niveau suffisant (${NIVEAU_MINIMUM} minimum)`
              : `${global} : ${NIVEAU_MINIMUM} minimum requis${TESTS_ANGLAIS.every((t) => (tests[t.cle] as ResultatTest | undefined)?.fait) ? '' : ' et les trois tests passés'}`
            : `${NIVEAU_MINIMUM} minimum requis pour passer`}
        </span>
      </div>
      <Champ label="Commentaire du correcteur">
        <textarea
          value={(tests.commentaire as string) ?? ''}
          disabled={lectureSeule}
          onChange={(e) => onChange({ ...tests, commentaire: e.target.value })}
          rows={2}
          style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </Champ>
    </div>
  )
}
