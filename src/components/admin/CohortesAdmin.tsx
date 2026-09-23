import { useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useCohortes } from '../../hooks/useCohortes'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { useEtablissement } from '../../hooks/useEtablissement'
import { supabase } from '../../lib/supabaseClient'
import { initiales } from '../etudiants/DossierEtudiantVue'
import type { Database, StatutCohorte } from '../../types/database.types'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'
import { champStyle } from '../ui/Champ'
import { Onglets } from '../ui/Onglets'
import { PlanifierSeancesForfait } from '../etudiants/PlanifierSeancesForfait'
import { formaterHeures } from '../../lib/heures'
import { CreneauxTestVague } from './CreneauxTestVague'
import { QuizPositionnementAdmin } from './QuizPositionnementAdmin'

type Cohort = Database['public']['Tables']['cohorts']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

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
            <strong>Convertir en étudiant</strong> crée son compte et le rattache automatiquement à cette vague.
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
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Professeur de la vague</label>
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} style={champStyle}>
            <option value="">À désigner plus tard</option>
            {professeurs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.prenom} {p.nom}
              </option>
            ))}
          </select>
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
  const [ouverte, setOuverte] = useState(false)
  const [edition, setEdition] = useState(false)
  const [inscrits, setInscrits] = useState<Profile[] | null>(null)
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
              </div>
            ))
          )}
          </div>

          {/* Planning prévisionnel de la vague (demande client du 2026-09-23, point 8) : toutes
              les séances du groupe d'un coup, rattachées à la vague — c'est ce rattachement qui
              les fait apparaître dans l'espace du professeur ET dans celui de chaque inscrit. */}
          {inscrits !== null && inscrits.length > 0 && (
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
