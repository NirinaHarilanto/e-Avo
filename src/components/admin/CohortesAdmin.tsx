import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useCohortes } from '../../hooks/useCohortes'
import { nomVagueSeul, trierVaguesChronologiquement } from '../../lib/cohortes'
import { useCohortClasses } from '../../hooks/useCohortClasses'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { useEtablissement } from '../../hooks/useEtablissement'
import { supabase } from '../../lib/supabaseClient'
import { initiales } from '../etudiants/DossierEtudiantVue'
import type { Database, StatutCohorte, NiveauClasse, CreneauClasse } from '../../types/database.types'
import { LABEL_NIVEAU_CLASSE, LABEL_CRENEAU_CLASSE, CAPACITE_MIN_CLASSE, CAPACITE_MAX_CLASSE } from '../../lib/classesCollectif'
import { niveauDefinitif } from '../../lib/niveauEtudiant'
import { EnTetePage } from '../ui/EnTetePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle, boutonSecondaireStyle, boutonDangerStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'
import { champStyle } from '../ui/Champ'
import { Onglets } from '../ui/Onglets'
import { Modale } from '../ui/Modale'
import { PanneauPlanningClasse } from '../shared/PanneauPlanningClasse'
import { formaterHeures } from '../../lib/heures'
import { SessionsOraleAdmin } from './SessionsOraleAdmin'
import { SuiviCollectifAdmin } from './SuiviCollectifAdmin'
import { QuizPositionnementAdmin } from './QuizPositionnementAdmin'
import { ChampDate } from '../ui/ChampDate'

type Cohort = Database['public']['Tables']['cohorts']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type CohortClassRow = Database['public']['Tables']['cohort_classes']['Row']

const LABELS_STATUT: Record<StatutCohorte, string> = { a_venir: 'À venir', en_cours: 'En cours', terminee: 'Terminée' }

export function CohortesAdmin() {
  const { profile } = useProfileContext()
  const { cohortes, loading, erreur, recharger } = useCohortes()
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  // Onglet par défaut : « Vagues » (demande client du 2026-10-30, « quand on clique sur cours
  // collectif, il faudrait afficher en premier l'onglet vague »).
  const [onglet, setOnglet] = useState<'vagues' | 'suivi' | 'sessionOrale' | 'quiz'>('vagues')

  /* Par ordre chronologique, la plus ancienne en tête — demande client du 2026-10-10, précisée le
     2026-10-29 devant les vraies vagues (voir le commentaire de trierVaguesChronologiquement). La
     requête de useCohortes() garde son tri `date_debut` brut (simple, stable) ; ce tri-ci est
     celui qui s'affiche réellement. */
  const vaguesTriees = useMemo(() => trierVaguesChronologiquement(cohortes), [cohortes])

  return (
    <AdminLayout actif="Cours collectifs">
      <EnTetePage
        compact
        titre="Cours collectifs"
        actions={
          onglet === 'vagues' && (
            <button onClick={() => setFormulaireOuvert((v) => !v)} className="btn-shine" style={boutonPrimaireStyle}>
              <Icone nom="plus" taille={15} />
              {formulaireOuvert ? 'Fermer' : 'Nouvelle vague'}
            </button>
          )
        }
      />

      <div style={{ marginBottom: 16 }}>
        <Onglets
          etiquette="Section"
          actif={onglet}
          onChange={setOnglet}
          compact
          onglets={[
            { value: 'vagues', label: 'Vagues', compteur: cohortes.length },
            /* Juste après Vagues : c'est la lecture par PERSONNE du même parcours, celle qu'on
               consulte pour savoir qui reste en route (demande client du 2026-10-11). */
            { value: 'suivi', label: 'Suivi des candidats' },
            { value: 'sessionOrale', label: 'Session orale' },
            { value: 'quiz', label: 'Quiz de positionnement' },
          ]}
        />
      </div>

      {onglet === 'suivi' ? (
        <SuiviCollectifAdmin />
      ) : onglet === 'sessionOrale' ? (
        <SessionsOraleAdmin />
      ) : onglet === 'quiz' ? (
        <>
          <QuizPositionnementAdmin />
        </>
      ) : (
        <>
      {formulaireOuvert && profile && (
        <CreerVague
          etablissementId={profile.etablissement_id}
          onAnnuler={() => setFormulaireOuvert(false)}
          onEnregistre={() => {
            setFormulaireOuvert(false)
            recharger()
          }}
        />
      )}

      {loading ? (
        <EtatChargement lignes={3} hauteur={76} />
      ) : erreur ? (
        <MessageErreur>{erreur}</MessageErreur>
      ) : cohortes.length === 0 ? (
        <EtatVide
          icone="vagues"
          titre="Aucune vague paramétrée"
          description="Créez une première vague pour pouvoir y inscrire des élèves en cours collectif. Sans vague, seuls les programmes individuels et en duo sont proposés dans les dossiers étudiants."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <GrilleStats min={160} compact>
            <Stat compact libelle="Vagues" valeur={cohortes.length} ton="or" />
            <Stat compact libelle="En cours" valeur={cohortes.filter((c) => c.statut === 'en_cours').length} ton="teal" />
            <Stat compact libelle="À venir" valeur={cohortes.filter((c) => c.statut === 'a_venir').length} ton="bleu" />
            <Stat compact libelle="Terminées" valeur={cohortes.filter((c) => c.statut === 'terminee').length} ton="neutre" />
          </GrilleStats>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {vaguesTriees.map((c) => (
              <LigneVague key={c.id} cohorte={c} onChange={recharger} />
            ))}
          </div>
        </div>
      )}
        </>
      )}
    </AdminLayout>
  )
}

interface CreerVagueProps {
  etablissementId: string
  onAnnuler: () => void
  onEnregistre: () => void
  /* Présent en mode modification : préremplit le formulaire et bascule l'enregistrement vers
     une mise à jour de la vague existante plutôt qu'une création. Les élèves déjà inscrits ne
     sont pas affectés par ce changement. */
  vague?: Cohort
}

function CreerVague({ etablissementId, onAnnuler, onEnregistre, vague }: CreerVagueProps) {
  const { profile } = useProfileContext()
  const { professeurs } = useProfesseurs()
  const etablissement = useEtablissement(etablissementId)
  const [nom, setNom] = useState(vague?.nom ?? '')
  const [langue, setLangue] = useState(vague?.langue ?? '')
  const [dateDebut, setDateDebut] = useState(vague?.date_debut ?? '')
  const [dateFin, setDateFin] = useState(vague?.date_fin ?? '')
  const [capaciteMax, setCapaciteMax] = useState<number | ''>(vague?.capacite_max ?? '')
  const [teacherId, setTeacherId] = useState(vague?.teacher_id ?? '')
  const [heuresForfait, setHeuresForfait] = useState<number | ''>(vague?.heures_forfait ?? '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const enModification = !!vague
  const forfaitParDefaut = etablissement?.heures_forfait_collectif ?? 32

  async function enregistrer() {
    if ((!profile && !enModification) || !nom || !dateDebut || !dateFin) return
    setEnCours(true)
    setErreur(null)

    const champs = {
      nom,
      langue: langue || null,
      date_debut: dateDebut,
      date_fin: dateFin,
      capacite_max: capaciteMax === '' ? null : capaciteMax,
      teacher_id: teacherId || null,
      heures_forfait: heuresForfait === '' ? null : heuresForfait,
    }
    const { error } = enModification
      ? await supabase.from('cohorts').update(champs).eq('id', vague.id)
      : await supabase.from('cohorts').insert({
          ...champs,
          etablissement_id: etablissementId,
          created_by_profile_id: profile!.id,
        })

    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onEnregistre()
  }

  return (
    <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, marginBottom: enModification ? 0 : 18 }}>
      <h3 style={{ fontSize: 16, color: 'var(--ink)' }}>{enModification ? `Modifier « ${vague.nom} »` : 'Nouvelle vague'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Nom de la vague</label>
          <input placeholder="Ex. Vague Anglais A1 — Automne" value={nom} onChange={(e) => setNom(e.target.value)} style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Langue</label>
          <input placeholder="Ex. Anglais" value={langue} onChange={(e) => setLangue(e.target.value)} style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Date de début</label>
          <ChampDate type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Date de fin</label>
          <ChampDate type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Capacité max (optionnel)</label>
          <input
            type="number"
            min={1}
            value={capaciteMax}
            onChange={(e) => setCapaciteMax(e.target.value === '' ? '' : Number(e.target.value))}
            style={champStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Professeur (repli historique)</label>
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} style={champStyle}>
            <option value="">À désigner plus tard</option>
            {professeurs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.prenom} {p.nom}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: 'var(--muted-2)', lineHeight: 1.45 }}>
            Ignoré dès que la vague a au moins une classe de niveau (voir plus bas) : chaque classe a alors son propre
            professeur.
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Forfait d’heures par élève</label>
          <input
            type="number"
            min={1}
            placeholder={`${forfaitParDefaut} h (valeur de l’établissement)`}
            value={heuresForfait}
            onChange={(e) => setHeuresForfait(e.target.value === '' ? '' : Number(e.target.value))}
            style={champStyle}
          />
          <span style={{ fontSize: 11, color: 'var(--muted-2)', lineHeight: 1.45 }}>
            Laissez vide pour reprendre les {forfaitParDefaut} h paramétrées pour l’établissement. La dernière heure est
            consacrée à l’évaluation de l’élève.
          </span>
        </div>
      </div>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{erreur}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onAnnuler} style={{ flexGrow: 1, fontSize: 13, padding: 11, borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
          Annuler
        </button>
        <button
          onClick={enregistrer}
          disabled={enCours || !nom || !dateDebut || !dateFin}
          className="btn-shine"
          style={{ flexGrow: 1, background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours || !nom || !dateDebut || !dateFin ? 0.6 : 1 }}
        >
          {enCours ? 'Enregistrement…' : enModification ? 'Enregistrer les modifications' : 'Créer la vague'}
        </button>
      </div>
    </div>
  )
}

function LigneVague({ cohorte, onChange }: { cohorte: Cohort; onChange: () => void }) {
  const { professeurs } = useProfesseurs()
  const etablissement = useEtablissement(cohorte.etablissement_id)
  const { classes, loading: chargementClasses, recharger: rechargerClasses } = useCohortClasses(cohorte.id)
  const [ouverte, setOuverte] = useState(false)
  const [edition, setEdition] = useState(false)
  const [listeInscritsOuverte, setListeInscritsOuverte] = useState(false)
  const [inscrits, setInscrits] = useState<Profile[] | null>(null)
  // Niveau à afficher à côté de chaque inscrit (demande client du 2026-09-24) : celui déterminé
  // à l'oral (diagnostic_calls.niveau_evalue, saisi à la conversion) prime sur celui du quiz
  // écrit (test_positionnement_inscriptions.niveau_estime) s'il existe, sinon on retombe dessus.
  const [niveauxInscrits, setNiveauxInscrits] = useState<Map<string, string>>(new Map())
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const professeurVague = professeurs.find((p) => p.id === cohorte.teacher_id) ?? null
  const forfaitVague = cohorte.heures_forfait ?? etablissement?.heures_forfait_collectif ?? 32

  async function basculerDetail() {
    if (ouverte) {
      setOuverte(false)
      return
    }
    setOuverte(true)
    chargerInscrits()
  }

  async function voirTousLesEleves() {
    setListeInscritsOuverte(true)
    chargerInscrits()
  }

  async function chargerInscrits() {
    if (inscrits !== null) return
    const { data } = await supabase
      .from('cohort_enrollments')
      .select('student_id')
      .eq('cohort_id', cohorte.id)
    const studentIds = (data ?? []).map((r) => r.student_id)
    if (studentIds.length === 0) {
      setInscrits([])
      return
    }
    // Un élève supprimé garde son inscription à la vague — exclu ici pour ne plus apparaître
    // dans le détail d'une cohorte (demande client du 2026-09-23).
    const { data: profiles } = await supabase.from('profiles').select('*').in('id', studentIds).neq('status', 'suspended')
    setInscrits(profiles ?? [])

    // Même calcul que DossierEtudiantVue.tsx/useDossierEtudiant.ts (niveauDefinitif) — demande
    // client du 2026-09-24 : un niveau différent entre « Étudiants » et « Cours collectifs » pour
    // le même élève. Le quiz écrit (test_positionnement_inscriptions.niveau_estime) n'entre PLUS
    // dans ce calcul : c'est une estimation automatique, jamais validée par l'admin, elle ne doit
    // pas se faire passer pour le niveau définitif.
    //
    // Trié par `created_at`, PAS par `date_appel` : l'inscription à un créneau de test oral crée
    // automatiquement un diagnostic_calls « provisoire » (niveau du quiz écrit, date_appel = date
    // du créneau — potentiellement future) AVANT même que l'oral n'ait eu lieu. Si l'admin fait
    // ensuite l'oral et convertit plus tôt que la date du créneau initialement réservé (candidat
    // reçu en avance, créneau annulé...), trier par date_appel ferait gagner à tort ce niveau
    // provisoire sur celui réellement déterminé à l'oral — bug constaté le 2026-09-24 sur un
    // élève converti avant la date de son créneau. `created_at`, lui, reflète l'ordre réel des
    // événements : la conversion (donc l'entrée de l'admin) arrive toujours après l'inscription
    // au créneau qui l'a précédée.
    const prospectIds = [...new Set((profiles ?? []).map((p) => p.prospect_id).filter((id): id is string => !!id))]
    const [{ data: diagnostics }, { data: reevaluations }] = await Promise.all([
      prospectIds.length > 0
        ? supabase.from('diagnostic_calls').select('prospect_id, niveau_evalue, created_at').in('prospect_id', prospectIds).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as { prospect_id: string; niveau_evalue: string | null; created_at: string }[] }),
      supabase.from('niveau_evaluations').select('student_id, niveau, date_evaluation').in('student_id', studentIds).order('date_evaluation', { ascending: true }),
    ])
    const diagParProspect = new Map<string, string>()
    for (const diagnostic of diagnostics ?? []) {
      if (diagnostic.niveau_evalue && !diagParProspect.has(diagnostic.prospect_id)) diagParProspect.set(diagnostic.prospect_id, diagnostic.niveau_evalue)
    }
    const reevaluationsParEtudiant = new Map<string, { niveau: string }[]>()
    for (const reevaluation of reevaluations ?? []) {
      const liste = reevaluationsParEtudiant.get(reevaluation.student_id) ?? []
      liste.push({ niveau: reevaluation.niveau })
      reevaluationsParEtudiant.set(reevaluation.student_id, liste)
    }
    const niveauParEtudiant = new Map<string, string>()
    for (const p of profiles ?? []) {
      const diagnostic = p.prospect_id ? { niveau_evalue: diagParProspect.get(p.prospect_id) ?? null } : null
      const niveau = niveauDefinitif(diagnostic, reevaluationsParEtudiant.get(p.id))
      if (niveau) niveauParEtudiant.set(p.id, niveau)
    }
    setNiveauxInscrits(niveauParEtudiant)
  }

  async function changerStatut(statut: StatutCohorte) {
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('cohorts').update({ statut }).eq('id', cohorte.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  async function supprimer() {
    if (!window.confirm(`Supprimer la vague « ${nomVagueSeul(cohorte.nom)} » ? Les étudiants inscrits en seront retirés.`)) return
    setEnCours(true)
    const { error } = await supabase.from('cohorts').delete().eq('id', cohorte.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  if (edition) {
    return (
      <CreerVague
        etablissementId={cohorte.etablissement_id}
        vague={cohorte}
        onAnnuler={() => setEdition(false)}
        onEnregistre={() => {
          setEdition(false)
          onChange()
        }}
      />
    )
  }

  return (
    <div className="card card-lift" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flexGrow: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)' }}>
              {cohorte.nom}
            </span>
            <button
              onClick={voirTousLesEleves}
              style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 11px', cursor: 'pointer' }}
            >
              Voir tous les élèves
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {cohorte.langue ? `${cohorte.langue} · ` : ''}
            {new Date(cohorte.date_debut).toLocaleDateString('fr-FR')} → {new Date(cohorte.date_fin).toLocaleDateString('fr-FR')}
            {cohorte.capacite_max ? ` · capacité ${cohorte.capacite_max}` : ''}
            {` · forfait ${formaterHeures(forfaitVague)}`}
          </div>
          <div style={{ fontSize: 11.5, color: professeurVague ? 'var(--accent-teal)' : 'var(--muted-2)' }}>
            {professeurVague ? `Professeur : ${professeurVague.prenom} ${professeurVague.nom}` : 'Aucun professeur désigné'}
          </div>
        </div>
        <select
          value={cohorte.statut}
          disabled={enCours}
          onChange={(e) => changerStatut(e.target.value as StatutCohorte)}
          style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', color: 'var(--ink)', background: 'var(--fond-champ, rgba(0,0,0,.22))' }}
        >
          {(Object.keys(LABELS_STATUT) as StatutCohorte[]).map((s) => (
            <option key={s} value={s}>
              {LABELS_STATUT[s]}
            </option>
          ))}
        </select>
        <button onClick={() => setEdition(true)} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}>
          Modifier
        </button>
        <button onClick={basculerDetail} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}>
          {ouverte ? 'Masquer les inscrits' : 'Voir les inscrits'}
        </button>
        <button onClick={supprimer} disabled={enCours} style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 13px', cursor: 'pointer' }}>
          Supprimer
        </button>
      </div>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 11.5 }}>{erreur}</p>}

      {listeInscritsOuverte && (
        <Modale titre={`Tous les élèves · ${nomVagueSeul(cohorte.nom)}`} onFermer={() => setListeInscritsOuverte(false)} largeurMax={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {inscrits === null ? (
              <EtatChargement lignes={2} hauteur={38} />
            ) : inscrits.length === 0 ? (
              <EtatVide
                compact
                icone="etudiants"
                titre="Aucun élève inscrit"
                description="Les inscriptions se font depuis le dossier de l’élève, page Étudiants, en choisissant le programme collectif."
              />
            ) : (
              inscrits.map((etudiant) => (
                <div key={etudiant.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 999, background: 'var(--voile, rgba(255,255,255,.06))', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                    {initiales(etudiant)}
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                    {etudiant.prenom} {etudiant.nom}
                  </span>
                  {niveauxInscrits.get(etudiant.id) && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--accent-blue)',
                        background: 'rgba(169,140,255,.14)',
                        border: '1px solid rgba(169,140,255,.3)',
                        borderRadius: 999,
                        padding: '2px 9px',
                      }}
                    >
                      {niveauxInscrits.get(etudiant.id)}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </Modale>
      )}

      {ouverte && (
        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ClassesVague cohorte={cohorte} classes={classes} loading={chargementClasses} recharger={rechargerClasses} />

          {/* Planning prévisionnel de la vague ENTIÈRE (demande client du 2026-09-23, point 8) :
              chemin legacy, seulement tant qu'aucune classe de niveau n'a été créée (0074) — dès
              la première classe, chacune a son propre professeur et son propre planning
              (ci-dessus). */}
          {!chargementClasses && classes.length === 0 && inscrits !== null && inscrits.length > 0 && (
            cohorte.teacher_id ? (
              <PanneauPlanningClasse
                studentIds={inscrits.map((e) => e.id)}
                cohortId={cohorte.id}
                teacherId={cohorte.teacher_id}
                heuresForfait={forfaitVague}
                dateFinParDefaut={cohorte.date_fin}
                titre={`Planning prévisionnel · ${cohorte.nom}`}
                peutModifier
                onChange={onChange}
              />
            ) : (
              <p style={{ fontSize: 12, color: 'var(--muted-2)', margin: 0, lineHeight: 1.5 }}>
                Désignez un professeur pour cette vague (bouton <strong>Modifier</strong>) afin de pouvoir établir son
                planning prévisionnel.
              </p>
            )
          )}

        </div>
      )}
    </div>
  )
}

/* Classes de niveau d'une promotion (0074) : Beginner/Intermediate/Advanced, chacune avec son
   professeur et son créneau propres. Sans classe, la promotion reste gérée comme avant (bloc
   ci-dessus dans LigneVague). */
function ClassesVague({
  cohorte,
  classes,
  loading,
  recharger,
}: {
  cohorte: Cohort
  classes: CohortClassRow[]
  loading: boolean
  recharger: () => void
}) {
  const { professeurs } = useProfesseurs()
  const [effectifs, setEffectifs] = useState<Map<string, string[]>>(new Map())
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [classeEnEdition, setClasseEnEdition] = useState<CohortClassRow | null>(null)
  const [classeDepliee, setClasseDepliee] = useState<string | null>(null)
  const [classesEleveDepliees, setClassesEleveDepliees] = useState<Set<string>>(new Set())
  const [profilsEleves, setProfilsEleves] = useState<Map<string, Profile>>(new Map())
  const [classesEnChargement, setClassesEnChargement] = useState<Set<string>>(new Set())
  /* Attribution de professeur à une classe — demande client du 2026-10-11 : « un bouton attribuer
     un professeur pour chaque ligne de classe », à côté de « Modifier » (qui reste le chemin
     pour TOUS les champs de la classe) plutôt qu'à sa place — même logique que le bouton dédié
     déjà posé pour un élève individuel (AttribuerProfesseur.tsx). */
  const [classePourProfesseur, setClassePourProfesseur] = useState<CohortClassRow | null>(null)
  // Co-professeurs actifs par classe (0142, « co-enseignant actif ») : titulaire géré ci-dessus,
  // co-professeur(s) additionnel(s) gérés par CoProfesseursClasse.
  const [coProfesseurs, setCoProfesseurs] = useState<Map<string, { id: string; teacher_id: string }[]>>(new Map())
  const [erreur, setErreur] = useState<string | null>(null)

  const chargerEffectifs = useCallback(async () => {
    if (classes.length === 0) {
      setEffectifs(new Map())
      return
    }
    const { data } = await supabase.from('cohort_enrollments').select('student_id, cohort_class_id').eq('cohort_id', cohorte.id)
    const map = new Map<string, string[]>()
    for (const row of data ?? []) {
      if (!row.cohort_class_id) continue
      const liste = map.get(row.cohort_class_id) ?? []
      liste.push(row.student_id)
      map.set(row.cohort_class_id, liste)
    }
    setEffectifs(map)
  }, [classes, cohorte.id])

  const chargerCoProfesseurs = useCallback(async () => {
    const classeIds = classes.map((c) => c.id)
    if (classeIds.length === 0) {
      setCoProfesseurs(new Map())
      return
    }
    const { data } = await supabase
      .from('cohort_class_teachers')
      .select('id, cohort_class_id, teacher_id')
      .in('cohort_class_id', classeIds)
      .is('removed_at', null)
    const map = new Map<string, { id: string; teacher_id: string }[]>()
    for (const row of data ?? []) {
      const liste = map.get(row.cohort_class_id) ?? []
      liste.push({ id: row.id, teacher_id: row.teacher_id })
      map.set(row.cohort_class_id, liste)
    }
    setCoProfesseurs(map)
  }, [classes])

  useEffect(() => {
    chargerEffectifs()
    chargerCoProfesseurs()
  }, [chargerEffectifs, chargerCoProfesseurs])

  async function basculerVoirEleves(classe: CohortClassRow) {
    const estOuverte = classesEleveDepliees.has(classe.id)
    setClassesEleveDepliees((prev) => {
      const next = new Set(prev)
      if (estOuverte) next.delete(classe.id)
      else next.add(classe.id)
      return next
    })
    if (estOuverte) return
    const ids = effectifs.get(classe.id) ?? []
    const idsManquants = ids.filter((id) => !profilsEleves.has(id))
    if (idsManquants.length === 0) return
    setClassesEnChargement((prev) => new Set(prev).add(classe.id))
    const { data } = await supabase.from('profiles').select('*').in('id', idsManquants)
    setClassesEnChargement((prev) => {
      const next = new Set(prev)
      next.delete(classe.id)
      return next
    })
    if (!data) return
    setProfilsEleves((prev) => {
      const next = new Map(prev)
      for (const p of data) next.set(p.id, p)
      return next
    })
  }

  async function supprimer(classe: CohortClassRow) {
    if (
      !window.confirm(
        `Supprimer la classe ${LABEL_NIVEAU_CLASSE[classe.niveau]}${classe.nom ? ` « ${classe.nom} »` : ''} ? Les élèves inscrits resteront dans la promotion, sans classe.`,
      )
    ) {
      return
    }
    const { error } = await supabase.from('cohort_classes').delete().eq('id', classe.id)
    if (error) {
      setErreur(error.message)
      return
    }
    recharger()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)', flexGrow: 1 }}>
          Classes de niveau
        </span>
        <button onClick={() => setFormulaireOuvert((v) => !v)} style={boutonSecondaireStyle}>
          {formulaireOuvert ? 'Fermer' : '+ Nouvelle classe'}
        </button>
      </div>

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {classes.length === 0 && !loading && (
        <p style={{ fontSize: 12, color: 'var(--muted-2)', margin: 0, lineHeight: 1.5 }}>
          Aucune classe créée. Sans classe, cette promotion reste gérée comme avant : un seul professeur, un planning
          commun à tous les inscrits. Créez une classe par niveau (Beginner/Intermediate/Advanced) pour affecter un
          professeur et un créneau propres à chaque groupe.
        </p>
      )}

      {classes.map((classe) => {
        const ids = effectifs.get(classe.id) ?? []
        const effectif = ids.length
        const prof = professeurs.find((p) => p.id === classe.teacher_id) ?? null
        const couleur =
          effectif < CAPACITE_MIN_CLASSE ? 'var(--danger)' : effectif >= CAPACITE_MAX_CLASSE ? 'var(--accent-gold, #e9cf94)' : 'var(--accent-teal)'

        if (classeEnEdition?.id === classe.id) {
          return (
            <FormulaireClasse
              key={classe.id}
              cohorte={cohorte}
              classe={classe}
              onAnnuler={() => setClasseEnEdition(null)}
              onEnregistre={() => {
                setClasseEnEdition(null)
                recharger()
              }}
            />
          )
        }

        return (
          <div key={classe.id} className="card card-lift" style={{ padding: '9px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flexGrow: 1, minWidth: 170 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                  {LABEL_NIVEAU_CLASSE[classe.niveau]}
                  {classe.nom ? ` — ${classe.nom}` : ''}
                </span>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {LABEL_CRENEAU_CLASSE[classe.creneau]} · {prof ? `${prof.prenom} ${prof.nom}` : 'Aucun professeur désigné'}
                </div>
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: couleur }}>
                {effectif} / {CAPACITE_MAX_CLASSE} élève{effectif > 1 ? 's' : ''}
                {effectif < CAPACITE_MIN_CLASSE ? ' · pas assez pour démarrer' : effectif >= CAPACITE_MAX_CLASSE ? ' · complet' : ''}
              </span>
              <button onClick={() => basculerVoirEleves(classe)} style={boutonSecondaireStyle}>
                {classesEleveDepliees.has(classe.id) ? 'Masquer les élèves' : 'Voir les élèves'}
              </button>
              <button
                onClick={() => setClassePourProfesseur(classePourProfesseur?.id === classe.id ? null : classe)}
                className={prof ? undefined : 'btn-shine'}
                style={prof ? boutonSecondaireStyle : { ...boutonPrimaireStyle, fontSize: 12.5, padding: '7px 13px' }}
              >
                {prof ? 'Changer de professeur' : 'Attribuer un professeur'}
              </button>
              <button onClick={() => setClasseEnEdition(classe)} style={boutonSecondaireStyle}>
                Modifier
              </button>
              <button onClick={() => setClasseDepliee(classe.id)} style={boutonSecondaireStyle}>
                Planning de la classe
              </button>
              <button onClick={() => supprimer(classe)} style={boutonDangerStyle}>
                Supprimer
              </button>
            </div>

            {classePourProfesseur?.id === classe.id && (
              <AttribuerProfesseurClasse
                classe={classe}
                professeurs={professeurs}
                onAnnuler={() => setClassePourProfesseur(null)}
                onAttribue={() => {
                  setClassePourProfesseur(null)
                  recharger()
                }}
              />
            )}

            {/* Co-professeur(s) de la classe (0142) — seulement une fois un titulaire désigné,
                même garde que « Ajouter un second professeur » côté élève individuel
                (AttribuerProfesseur.tsx) : sans titulaire, le bouton juste au-dessus fait déjà
                exactement cela. */}
            {classe.teacher_id && (
              <CoProfesseursClasse
                classe={classe}
                professeurs={professeurs}
                coProfesseurs={coProfesseurs.get(classe.id) ?? []}
                onChange={chargerCoProfesseurs}
              />
            )}

            {classeDepliee === classe.id && (
              <Modale
                titre={`Planning · ${LABEL_NIVEAU_CLASSE[classe.niveau]}${classe.nom ? ` — ${classe.nom}` : ''}`}
                onFermer={() => setClasseDepliee(null)}
                largeurMax={620}
              >
                {classe.teacher_id ? (
                  <PanneauPlanningClasse
                    studentIds={ids}
                    cohortClassId={classe.id}
                    teacherId={classe.teacher_id}
                    dateFinParDefaut={cohorte.date_fin}
                    titre={`Planifier de nouveaux créneaux · ${LABEL_NIVEAU_CLASSE[classe.niveau]}${classe.nom ? ` — ${classe.nom}` : ''}`}
                    peutModifier
                  />
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--muted-2)', margin: 0 }}>
                    Désignez un professeur pour cette classe (bouton <strong>Attribuer un professeur</strong>) afin de
                    pouvoir établir son planning.
                  </p>
                )}
              </Modale>
            )}

            {classesEleveDepliees.has(classe.id) && (
              <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ids.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--muted-2)', margin: 0 }}>Aucun élève dans cette classe.</p>
                ) : classesEnChargement.has(classe.id) ? (
                  <EtatChargement lignes={2} hauteur={28} />
                ) : (
                  ids.map((id) => {
                    const etudiant = profilsEleves.get(id)
                    if (!etudiant) return null
                    return (
                      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 24, height: 24, borderRadius: 999, background: 'var(--voile, rgba(255,255,255,.06))', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                          {initiales(etudiant)}
                        </span>
                        <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                          {etudiant.prenom} {etudiant.nom}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )
      })}

      {formulaireOuvert && (
        <FormulaireClasse
          cohorte={cohorte}
          onAnnuler={() => setFormulaireOuvert(false)}
          onEnregistre={() => {
            setFormulaireOuvert(false)
            recharger()
          }}
        />
      )}
    </div>
  )
}

/* Attribution du professeur d'une classe de niveau — demande client du 2026-10-11 : « pour les
   étudiants en cours collectifs, l'attribution de professeur devrait se faire uniquement dans
   l'admin depuis la section cours collectifs, onglet vague. Mettre un bouton attribuer un
   professeur pour chaque ligne de classe. » Même pattern que AttribuerProfesseur.tsx (élève
   individuel) : un bouton qui se déplie en formulaire, pas une case perdue parmi d'autres dans un
   formulaire générique.

   Simple colonne `cohort_classes.teacher_id` (pas de table d'historique comme
   `teacher_assignments` côté élève individuel) : une classe n'a qu'un seul professeur à la fois,
   rien à transférer ou migrer au changement — un UPDATE suffit. « Instantanément pris en compte
   dans toute l'application, y compris les étudiants » : géré par useVagueEtudiant.ts, qui résout
   désormais le professeur depuis LA CLASSE de l'élève (teacher_id) et non plus depuis la
   promotion entière — sans quoi deux classes d'une même vague, confiées à deux professeurs
   différents, auraient affiché le même nom aux élèves des deux groupes. */
function AttribuerProfesseurClasse({
  classe,
  professeurs,
  onAnnuler,
  onAttribue,
}: {
  classe: CohortClassRow
  professeurs: Database['public']['Tables']['profiles']['Row'][]
  onAnnuler: () => void
  onAttribue: () => void
}) {
  const [teacherId, setTeacherId] = useState(classe.teacher_id ?? '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function attribuer() {
    if (!teacherId) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('cohort_classes').update({ teacher_id: teacherId }).eq('id', classe.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onAttribue()
  }

  return (
    <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h4 style={{ fontSize: 13, color: 'var(--accent-gold, #e9cf94)', margin: 0 }}>
        {classe.teacher_id ? 'Changer de professeur' : 'Attribuer un professeur'} ·{' '}
        {LABEL_NIVEAU_CLASSE[classe.niveau]}
        {classe.nom ? ` — ${classe.nom}` : ''}
      </h4>
      <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} style={champStyle}>
        <option value="">Choisir un professeur</option>
        {professeurs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.prenom} {p.nom}
          </option>
        ))}
      </select>
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onAnnuler} disabled={enCours} style={boutonSecondaireStyle}>
          Annuler
        </button>
        <button
          onClick={attribuer}
          disabled={!teacherId || enCours}
          className="btn-shine"
          style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: !teacherId || enCours ? 0.6 : 1 }}
        >
          {enCours ? 'Enregistrement…' : 'Confirmer'}
        </button>
      </div>
    </div>
  )
}

/* Co-professeur(s) d'une classe de niveau (0142) — pendant collectif du bouton « Ajouter un
   second professeur » de AttribuerProfesseur.tsx (0138, élève individuel), avec une différence
   assumée : une classe collective a des séances COMMUNES à tout le groupe, pas un planning 1:1
   par professeur. Le rôle retenu avec le client est donc « co-enseignant actif » — le titulaire
   (`cohort_classes.teacher_id`, géré par AttribuerProfesseurClasse ci-dessus) et chaque
   co-professeur voient la classe dans leur propre espace et peuvent CHACUN y planifier des
   séances ; chaque séance reste attribuée à qui l'a créée (`sessions.teacher_id`), donc la
   rémunération suit déjà la bonne personne sans rien y changer. L'ajout est une fonction SQL
   (`ajouter_professeur_classe`, rien à transférer) ; le retrait passe par une route serveur
   (`api/admin/retirer-professeur-classe.ts`) car il annule les séances à venir de ce
   co-professeur pour cette classe — retirer une réunion Google et prévenir les personnes
   concernées est hors de portée de Postgres, exactement comme pour l'élève individuel. */
function CoProfesseursClasse({
  classe,
  professeurs,
  coProfesseurs,
  onChange,
}: {
  classe: CohortClassRow
  professeurs: Database['public']['Tables']['profiles']['Row'][]
  coProfesseurs: { id: string; teacher_id: string }[]
  onChange: () => void
}) {
  const { session } = useProfileContext()
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [teacherId, setTeacherId] = useState('')
  const [motif, setMotif] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [aRetirer, setARetirer] = useState<{ id: string; teacher_id: string } | null>(null)

  const idsExclus = new Set([classe.teacher_id, ...coProfesseurs.map((c) => c.teacher_id)])
  const professeursProposables = professeurs.filter((p) => !idsExclus.has(p.id))

  async function ajouter() {
    if (!teacherId) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.rpc('ajouter_professeur_classe', {
      p_cohort_class_id: classe.id,
      p_teacher_id: teacherId,
      p_motif: motif || null,
    })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setFormulaireOuvert(false)
    setTeacherId('')
    setMotif('')
    onChange()
  }

  async function retirer() {
    if (!aRetirer || !session) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/retirer-professeur-classe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ assignationId: aRetirer.id, motif: motif || null }),
    })
    const resultat = (await reponse.json().catch(() => ({}))) as { error?: string }
    setEnCours(false)
    if (!reponse.ok) {
      setErreur(resultat.error ?? 'Le retrait du professeur a échoué.')
      return
    }
    setARetirer(null)
    setMotif('')
    onChange()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {coProfesseurs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {coProfesseurs.map((cp) => {
            const prof = professeurs.find((p) => p.id === cp.teacher_id)
            return (
              <div key={cp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                <span style={{ color: 'var(--accent-teal)' }}>
                  Co-professeur : {prof ? `${prof.prenom} ${prof.nom}` : 'Professeur inconnu'}
                </span>
                <button
                  onClick={() => {
                    setErreur(null)
                    setMotif('')
                    setARetirer(cp)
                  }}
                  style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Retirer
                </button>
              </div>
            )
          })}
        </div>
      )}

      {!formulaireOuvert ? (
        <button
          onClick={() => {
            setErreur(null)
            setFormulaireOuvert(true)
          }}
          style={{ ...boutonSecondaireStyle, alignSelf: 'flex-start' }}
        >
          + Ajouter un second professeur
        </button>
      ) : (
        <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} style={champStyle}>
            <option value="">Choisir un professeur</option>
            {professeursProposables.map((p) => (
              <option key={p.id} value={p.id}>
                {p.prenom} {p.nom}
              </option>
            ))}
          </select>
          {professeursProposables.length === 0 && (
            <p style={{ fontSize: 11.5, color: 'var(--muted-2)', margin: 0 }}>Tous les professeurs sont déjà attribués à cette classe.</p>
          )}
          {erreur && <MessageErreur>{erreur}</MessageErreur>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                setFormulaireOuvert(false)
                setTeacherId('')
                setErreur(null)
              }}
              disabled={enCours}
              style={boutonSecondaireStyle}
            >
              Annuler
            </button>
            <button
              onClick={ajouter}
              disabled={!teacherId || enCours}
              className="btn-shine"
              style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: !teacherId || enCours ? 0.6 : 1 }}
            >
              {enCours ? 'Enregistrement…' : 'Confirmer'}
            </button>
          </div>
        </div>
      )}

      {aRetirer && (
        <Modale
          titre={`Retirer ${(() => {
            const prof = professeurs.find((p) => p.id === aRetirer.teacher_id)
            return prof ? `${prof.prenom} ${prof.nom}` : 'ce professeur'
          })()} ?`}
          onFermer={() => setARetirer(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.6 }}>
              Ses séances encore à venir pour cette classe seront <strong>annulées</strong> et sont à replanifier. Les élèves
              et ce professeur en seront prévenus, et les réunions correspondantes retirées de leurs agendas. Les séances
              déjà données ne sont pas touchées.
            </p>
            <input
              placeholder="Motif du retrait (optionnel)"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              style={champStyle}
            />
            {erreur && <MessageErreur>{erreur}</MessageErreur>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setARetirer(null)} disabled={enCours} style={{ ...boutonSecondaireStyle, flexGrow: 1 }}>
                Annuler
              </button>
              <button
                onClick={retirer}
                disabled={enCours}
                className="btn-shine"
                style={{ ...boutonDangerStyle, flexGrow: 1, opacity: enCours ? 0.6 : 1 }}
              >
                {enCours ? 'Retrait…' : 'Retirer et annuler ses séances'}
              </button>
            </div>
          </div>
        </Modale>
      )}
    </div>
  )
}

function FormulaireClasse({
  cohorte,
  classe,
  onAnnuler,
  onEnregistre,
}: {
  cohorte: Cohort
  classe?: CohortClassRow
  onAnnuler: () => void
  onEnregistre: () => void
}) {
  const { profile } = useProfileContext()
  const { professeurs } = useProfesseurs()
  const etablissement = useEtablissement(cohorte.etablissement_id)
  const [niveau, setNiveau] = useState<NiveauClasse>(classe?.niveau ?? 'beginner')
  const [nom, setNom] = useState(classe?.nom ?? '')
  const [creneau, setCreneau] = useState<CreneauClasse>(classe?.creneau ?? 'soir')
  const [teacherId, setTeacherId] = useState(classe?.teacher_id ?? '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const enModification = !!classe

  const heureCreneau: Record<CreneauClasse, string> = {
    matin: etablissement?.creneau_matin?.slice(0, 5) ?? '07:00',
    midi: etablissement?.creneau_midi?.slice(0, 5) ?? '12:00',
    soir: etablissement?.creneau_soir?.slice(0, 5) ?? '19:00',
  }

  async function enregistrer() {
    if (!profile && !enModification) return
    setEnCours(true)
    setErreur(null)
    const champs = { niveau, nom: nom.trim() || null, creneau, teacher_id: teacherId || null }
    const { error } = enModification
      ? await supabase.from('cohort_classes').update(champs).eq('id', classe.id)
      : await supabase.from('cohort_classes').insert({
          ...champs,
          cohort_id: cohorte.id,
          etablissement_id: cohorte.etablissement_id,
          created_by_profile_id: profile!.id,
        })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onEnregistre()
  }

  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h4 style={{ fontSize: 13, color: 'var(--ink)', margin: 0 }}>{enModification ? 'Modifier la classe' : 'Nouvelle classe'}</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Niveau</label>
          <select value={niveau} onChange={(e) => setNiveau(e.target.value as NiveauClasse)} style={champStyle}>
            {(Object.keys(LABEL_NIVEAU_CLASSE) as NiveauClasse[]).map((n) => (
              <option key={n} value={n}>
                {LABEL_NIVEAU_CLASSE[n]}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Étiquette (optionnel)</label>
          <input placeholder="Ex. Beginner — groupe 2" value={nom} onChange={(e) => setNom(e.target.value)} style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Créneau</label>
          <select value={creneau} onChange={(e) => setCreneau(e.target.value as CreneauClasse)} style={champStyle}>
            {(Object.keys(LABEL_CRENEAU_CLASSE) as CreneauClasse[]).map((c) => (
              <option key={c} value={c}>
                {LABEL_CRENEAU_CLASSE[c]} · {heureCreneau[c]}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Professeur</label>
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} style={champStyle}>
            <option value="">À désigner plus tard</option>
            {professeurs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.prenom} {p.nom}
              </option>
            ))}
          </select>
        </div>
      </div>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{erreur}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onAnnuler}
          style={{ flexGrow: 1, fontSize: 12, padding: 9, borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}
        >
          Annuler
        </button>
        <button
          onClick={enregistrer}
          disabled={enCours}
          className="btn-shine"
          style={{ flexGrow: 1, fontSize: 12, padding: 9, background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours ? 0.6 : 1 }}
        >
          {enCours ? 'Enregistrement…' : enModification ? 'Enregistrer' : 'Créer la classe'}
        </button>
      </div>
    </div>
  )
}
