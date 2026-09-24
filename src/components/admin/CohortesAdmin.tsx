import { useCallback, useEffect, useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useCohortes } from '../../hooks/useCohortes'
import { useCohortClasses } from '../../hooks/useCohortClasses'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { useEtablissement } from '../../hooks/useEtablissement'
import { useEtudiants } from '../../hooks/useEtudiants'
import { supabase } from '../../lib/supabaseClient'
import { initiales } from '../etudiants/DossierEtudiantVue'
import type { Database, StatutCohorte, NiveauClasse, CreneauClasse } from '../../types/database.types'
import { LABEL_NIVEAU_CLASSE, LABEL_CRENEAU_CLASSE, CAPACITE_MIN_CLASSE, CAPACITE_MAX_CLASSE } from '../../lib/classesCollectif'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle, boutonSecondaireStyle, boutonDangerStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'
import { champStyle } from '../ui/Champ'
import { Onglets } from '../ui/Onglets'
import { Modale } from '../ui/Modale'
import { ChampRecherche } from '../ui/BarreOutils'
import { PlanifierSeancesForfait } from '../etudiants/PlanifierSeancesForfait'
import { formaterHeures } from '../../lib/heures'
import { CreneauxTestVague } from './CreneauxTestVague'
import { QuizPositionnementAdmin } from './QuizPositionnementAdmin'

type Cohort = Database['public']['Tables']['cohorts']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type CohortClassRow = Database['public']['Tables']['cohort_classes']['Row']

const LABELS_STATUT: Record<StatutCohorte, string> = { a_venir: 'À venir', en_cours: 'En cours', terminee: 'Terminée' }

export function CohortesAdmin() {
  const { profile } = useProfileContext()
  const { cohortes, loading, erreur, recharger } = useCohortes()
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [onglet, setOnglet] = useState<'vagues' | 'quiz'>('vagues')

  return (
    <AdminLayout actif="Cours collectifs">
      <EnTetePage
        compact
        titre="Cours collectifs"
        description="Une vague est un groupe d’élèves qui suivent le même programme sur une même période. C’est l’alternative au forfait individuel ou en duo."
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
            { value: 'quiz', label: 'Quiz de positionnement' },
          ]}
        />
      </div>

      {onglet === 'quiz' ? (
        <>
          <GuidePage
            id="admin-quiz-positionnement"
            compact
            etapes={[
              <>
                Ce questionnaire est posé aux candidats qui réservent une <strong>session de test oral</strong> depuis la
                page publique. Y répondre est ce qui valide définitivement leur place.
              </>,
              <>
                La note situe automatiquement un <strong>niveau estimé</strong> (A1 à C1) et produit un bilan rattaché au
                dossier du candidat, que vous retrouvez dans la vague concernée et dans sa fiche prospect.
              </>,
              <>
                Modifiez les questions, leurs propositions et la bonne réponse à votre guise. Une question{' '}
                <strong>désactivée</strong> n’est plus posée et ne compte plus dans la note, sans fausser les tests déjà
                passés.
              </>,
            ]}
          />
          <QuizPositionnementAdmin />
        </>
      ) : (
        <>
      <GuidePage
        id="admin-vagues"
        compact
        etapes={[
          <>
            Créez une vague en lui donnant un nom, une langue, ses dates de début et de fin, et une{' '}
            <strong>capacité maximale</strong> d’élèves.
          </>,
          <>
            Inscrivez ensuite les élèves un par un depuis leur dossier, page <strong>Étudiants</strong> : choisissez le
            programme « collectif » puis la vague voulue.
          </>,
          <>
            Le <strong>statut</strong> de chaque vague se change directement dans sa ligne. Passez-la en « Terminée »
            quand la session est finie : elle restera consultable dans les dossiers des élèves.
          </>,
          <>
            <strong>Modifier</strong> permet de corriger le nom, la langue, les dates ou la capacité d’une vague déjà
            créée, sans toucher aux élèves déjà inscrits.
          </>,
          <>
            Le bouton <strong>Voir les inscrits</strong> déplie la liste des élèves rattachés, et donne accès aux{' '}
            <strong>sessions de test oral</strong> que vous ouvrez pour cette vague : c’est ce que les candidats au
            collectif réservent depuis la page publique. Une session peut être <strong>modifiée</strong> après coup ;
            son lien Google Meet se génère tout seul.
          </>,
          <>
            <strong>Cliquez sur une session</strong> pour dérouler la liste des candidats qui s’y sont inscrits, avec
            leur note au questionnaire. Une fois le test oral passé, le bouton{' '}
            <strong>Convertir en étudiant</strong> crée son compte et le rattache automatiquement à cette vague — et,
            si son niveau a pu être déterminé, à la classe correspondante.
          </>,
          <>
            Une vague (« promotion ») peut être scindée en <strong>classes de niveau</strong> — Beginner, Intermediate,
            Advanced — chacune avec son propre professeur et son propre créneau (matin/midi/soir, réglés dans{' '}
            <strong>Paramètres</strong>). Le niveau d’un candidat est déterminé automatiquement à partir de son quiz
            écrit, sans ressaisie de votre part.
          </>,
          <>
            Une classe compte <strong>3 à 7 élèves</strong>. En dessous de 3, ne démarrez pas ses cours. À 7, les
            inscriptions supplémentaires sont refusées : créez une seconde classe du même niveau pour les accueillir.
          </>,
          <>
            Le bouton <strong>+ Élèves</strong> sur une classe permet d'y ajouter directement un élève déjà dans la
            promotion sans classe, ou n'importe quel autre élève de l'établissement — sans repasser par son dossier.
          </>,
        ]}
      />

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
            {cohortes.map((c) => (
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
          <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Date de fin</label>
          <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} style={champStyle} />
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

    const prospectIds = [...new Set((profiles ?? []).map((p) => p.prospect_id).filter((id): id is string => !!id))]
    if (prospectIds.length === 0) return
    const [{ data: diagnostics }, { data: inscriptions }] = await Promise.all([
      supabase.from('diagnostic_calls').select('prospect_id, niveau_evalue, date_appel').in('prospect_id', prospectIds).order('date_appel', { ascending: false }),
      supabase
        .from('test_positionnement_inscriptions')
        .select('prospect_id, niveau_estime, created_at')
        .in('prospect_id', prospectIds)
        .order('created_at', { ascending: false }),
    ])
    const quizParProspect = new Map<string, string>()
    for (const inscription of inscriptions ?? []) {
      if (inscription.niveau_estime && !quizParProspect.has(inscription.prospect_id)) quizParProspect.set(inscription.prospect_id, inscription.niveau_estime)
    }
    const diagParProspect = new Map<string, string>()
    for (const diagnostic of diagnostics ?? []) {
      if (diagnostic.niveau_evalue && !diagParProspect.has(diagnostic.prospect_id)) diagParProspect.set(diagnostic.prospect_id, diagnostic.niveau_evalue)
    }
    const niveauParEtudiant = new Map<string, string>()
    for (const p of profiles ?? []) {
      if (!p.prospect_id) continue
      const niveau = diagParProspect.get(p.prospect_id) ?? quizParProspect.get(p.prospect_id)
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
    if (!window.confirm(`Supprimer la vague « ${cohorte.nom} » ? Les étudiants inscrits en seront retirés.`)) return
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
          <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)' }}>
            {cohorte.nom}
          </span>
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
          style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
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
      {ouverte && (
        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                <span style={{ width: 26, height: 26, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
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
                      background: 'rgba(94,179,255,.14)',
                      border: '1px solid rgba(94,179,255,.3)',
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

          <ClassesVague cohorte={cohorte} classes={classes} loading={chargementClasses} recharger={rechargerClasses} />

          {/* Planning prévisionnel de la vague ENTIÈRE (demande client du 2026-09-23, point 8) :
              chemin legacy, seulement tant qu'aucune classe de niveau n'a été créée (0074) — dès
              la première classe, chacune a son propre professeur et son propre planning
              (ci-dessus). */}
          {!chargementClasses && classes.length === 0 && inscrits !== null && inscrits.length > 0 && (
            cohorte.teacher_id ? (
              <PlanifierSeancesForfait
                studentIds={inscrits.map((e) => e.id)}
                cohortId={cohorte.id}
                teacherId={cohorte.teacher_id}
                heuresForfait={forfaitVague}
                dateFinParDefaut={cohorte.date_fin}
                titre={`Planning prévisionnel · ${cohorte.nom}`}
                onCree={onChange}
              />
            ) : (
              <p style={{ fontSize: 12, color: 'var(--muted-2)', margin: 0, lineHeight: 1.5 }}>
                Désignez un professeur pour cette vague (bouton <strong>Modifier</strong>) afin de pouvoir établir son
                planning prévisionnel.
              </p>
            )
          )}

          <CreneauxTestVague cohorteId={cohorte.id} />
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
  const [classePourAjout, setClassePourAjout] = useState<CohortClassRow | null>(null)
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

  useEffect(() => {
    chargerEffectifs()
  }, [chargerEffectifs])

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
              <button
                onClick={() => setClassePourAjout(classe)}
                disabled={effectif >= CAPACITE_MAX_CLASSE}
                style={{ ...boutonSecondaireStyle, opacity: effectif >= CAPACITE_MAX_CLASSE ? 0.5 : 1 }}
              >
                + Élèves
              </button>
              <button onClick={() => setClasseEnEdition(classe)} style={boutonSecondaireStyle}>
                Modifier
              </button>
              <button onClick={() => setClasseDepliee(classeDepliee === classe.id ? null : classe.id)} style={boutonSecondaireStyle}>
                {classeDepliee === classe.id ? 'Masquer le planning' : 'Planning de la classe'}
              </button>
              <button onClick={() => supprimer(classe)} style={boutonDangerStyle}>
                Supprimer
              </button>
            </div>

            {classeDepliee === classe.id && (
              classe.teacher_id ? (
                <PlanifierSeancesForfait
                  studentIds={ids}
                  cohortClassId={classe.id}
                  teacherId={classe.teacher_id}
                  dateFinParDefaut={cohorte.date_fin}
                  titre={`Planning prévisionnel · ${LABEL_NIVEAU_CLASSE[classe.niveau]}${classe.nom ? ` — ${classe.nom}` : ''}`}
                  onCree={() => {}}
                />
              ) : (
                <p style={{ fontSize: 12, color: 'var(--muted-2)', margin: 0 }}>
                  Désignez un professeur pour cette classe (bouton <strong>Modifier</strong>) afin de pouvoir établir
                  son planning.
                </p>
              )
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

      {classePourAjout && (
        <AjouterEtudiantsClasse
          cohorte={cohorte}
          classe={classePourAjout}
          idsDejaDansClasse={effectifs.get(classePourAjout.id) ?? []}
          onFermer={() => setClassePourAjout(null)}
          onAjoute={chargerEffectifs}
        />
      )}
    </div>
  )
}

/* Ajout d'élèves à une classe depuis sa fiche (demande client du 2026-09-24), plutôt que
   seulement depuis le dossier de chaque élève (AssignerVague.tsx) : deux listes, les élèves déjà
   dans la promotion mais pas encore affectés à une classe (cas courant après une conversion sans
   classe disponible), et une recherche pour en ajouter n'importe quel autre. Le trigger de
   capacité (migration 0074) reste la garde ultime si deux admins agissent en même temps. */
function AjouterEtudiantsClasse({
  cohorte,
  classe,
  idsDejaDansClasse,
  onFermer,
  onAjoute,
}: {
  cohorte: Cohort
  classe: CohortClassRow
  idsDejaDansClasse: string[]
  onFermer: () => void
  onAjoute: () => void
}) {
  const { etudiants } = useEtudiants()
  const [sansClasse, setSansClasse] = useState<Profile[] | null>(null)
  const [recherche, setRecherche] = useState('')
  const [idEnCours, setIdEnCours] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const chargerSansClasse = useCallback(async () => {
    const { data: enrollments } = await supabase
      .from('cohort_enrollments')
      .select('student_id')
      .eq('cohort_id', cohorte.id)
      .is('cohort_class_id', null)
    const ids = (enrollments ?? []).map((e) => e.student_id)
    if (ids.length === 0) {
      setSansClasse([])
      return
    }
    const { data: profils } = await supabase.from('profiles').select('*').in('id', ids).neq('status', 'suspended')
    setSansClasse(profils ?? [])
  }, [cohorte.id])

  useEffect(() => {
    chargerSansClasse()
  }, [chargerSansClasse])

  const rechercheNormalisee = recherche.trim().toLowerCase()
  const idsExclus = new Set([...idsDejaDansClasse, ...(sansClasse ?? []).map((e) => e.id)])
  const resultatsRecherche =
    rechercheNormalisee.length < 2
      ? []
      : etudiants
          .filter((e) => !idsExclus.has(e.id))
          .filter((e) => `${e.prenom ?? ''} ${e.nom ?? ''}`.toLowerCase().includes(rechercheNormalisee))
          .slice(0, 8)

  async function ajouter(etudiant: Profile) {
    setIdEnCours(etudiant.id)
    setErreur(null)

    // Une ligne cohort_enrollments par élève au plus : on met à jour la sienne si elle existe
    // déjà (même logique qu'AssignerVague.tsx — l'élève peut venir d'une autre promotion, le
    // trigger de garde bloque alors le changement s'il a déjà consommé des heures), sinon on en
    // crée une nouvelle.
    const { data: existant } = await supabase
      .from('cohort_enrollments')
      .select('cohort_id')
      .eq('student_id', etudiant.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const champs = { cohort_id: cohorte.id, cohort_class_id: classe.id }
    const { error } = existant
      ? await supabase.from('cohort_enrollments').update(champs).eq('cohort_id', existant.cohort_id).eq('student_id', etudiant.id)
      : await supabase
          .from('cohort_enrollments')
          .insert({ etablissement_id: cohorte.etablissement_id, student_id: etudiant.id, ...champs })

    setIdEnCours(null)
    if (error) {
      setErreur(`${etudiant.prenom} ${etudiant.nom} : ${error.message}`)
      return
    }
    setSansClasse((liste) => (liste ?? []).filter((e) => e.id !== etudiant.id))
    onAjoute()
  }

  return (
    <Modale
      titre={`Ajouter des élèves · ${LABEL_NIVEAU_CLASSE[classe.niveau]}${classe.nom ? ` — ${classe.nom}` : ''}`}
      onFermer={onFermer}
      largeurMax={520}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>
            Déjà dans cette promotion, sans classe
          </span>
          {sansClasse === null ? (
            <EtatChargement lignes={1} hauteur={30} />
          ) : sansClasse.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted-2)', margin: 0 }}>Aucun élève en attente d'affectation.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sansClasse.map((etudiant) => (
                <LigneEtudiantAAjouter key={etudiant.id} etudiant={etudiant} enCours={idEnCours === etudiant.id} onAjouter={() => ajouter(etudiant)} />
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>
            Rechercher un autre élève
          </span>
          <p style={{ fontSize: 11, color: 'var(--muted-2)', margin: 0, lineHeight: 1.5 }}>
            S'il suit déjà une autre promotion et n'a pas encore consommé d'heures dans celle-ci, il en sera retiré
            pour rejoindre celle-ci.
          </p>
          <ChampRecherche valeur={recherche} onChange={setRecherche} placeholder="Nom de l'élève…" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {resultatsRecherche.map((etudiant) => (
              <LigneEtudiantAAjouter key={etudiant.id} etudiant={etudiant} enCours={idEnCours === etudiant.id} onAjouter={() => ajouter(etudiant)} />
            ))}
            {rechercheNormalisee.length >= 2 && resultatsRecherche.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--muted-2)', margin: 0 }}>Aucun élève trouvé.</p>
            )}
          </div>
        </div>
      </div>
    </Modale>
  )
}

function LigneEtudiantAAjouter({ etudiant, enCours, onAjouter }: { etudiant: Profile; enCours: boolean; onAjouter: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,.03)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--ink)', flexGrow: 1 }}>
        {etudiant.prenom} {etudiant.nom}
      </span>
      <button onClick={onAjouter} disabled={enCours} style={{ ...boutonSecondaireStyle, opacity: enCours ? 0.6 : 1 }}>
        {enCours ? 'Ajout…' : 'Ajouter'}
      </button>
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
