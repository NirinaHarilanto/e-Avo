import { useEffect, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { useCohortes } from '../../hooks/useCohortes'
import { useCohortClasses } from '../../hooks/useCohortClasses'
import { categorieDepuisNiveauEstime, LABEL_NIVEAU_CLASSE, libelleCreneau, NIVEAUX_CECRL } from '../../lib/classesCollectif'
import { useCreneauxClasses } from '../../hooks/useCreneauxClasses'
import type { NiveauClasse } from '../../types/database.types'
import { Champ, champStyle } from '../ui/Champ'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { Modale } from '../ui/Modale'
import { FraisInscriptionCollectifModale, type FraisInscription } from './FraisInscriptionCollectifModale'
import { enregistrerFraisCollectif } from '../../lib/enregistrerFraisCollectif'

/* Réévaluation de fin de parcours collectif — demande client du 2026-10-11 : « à la fin de
   chaque parcours collectif d'une classe, chaque étudiant [...] sera réévalué et réattribué à
   une classe et une vague bien définie avec une mise à jour de son niveau [...] la validation
   sera toujours précédée d'un enregistrement de paiement de ses frais d'inscription
   correspondant à son niveau. »

   Même mécanique à deux temps que la conversion d'un prospect (ConvertirCandidatCollectif.tsx),
   pour un ÉTUDIANT déjà converti cette fois : (1) niveau + nouvelle vague + nouvelle classe,
   (2) frais d'inscription du NOUVEAU niveau, obligatoires avant toute écriture. Les frais sont
   enregistrés EN PREMIER à la confirmation (pas en dernier, à l'inverse de convert-prospect.ts) :
   c'est l'invariant que le client a explicitement demandé de protéger — si la suite échoue,
   l'admin le sait et peut reprendre, mais le paiement, lui, n'est jamais perdu. */

export interface EtudiantAReevaluer {
  profilId: string
  prospectId: string
  etablissementId: string
  nom: string
  niveauActuel: string | null
}

export function ReevaluerEtudiantCollectif({
  etudiant,
  onFermer,
  onEvalue,
}: {
  etudiant: EtudiantAReevaluer
  onFermer: () => void
  onEvalue: () => void
}) {
  const [etape, setEtape] = useState<'placement' | 'frais'>('placement')
  const [placement, setPlacement] = useState<{ niveau: string; cohortId: string; cohortClassId: string | null } | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const { profile } = useProfileContext()

  async function confirmer(placementRetenu: { niveau: string; cohortId: string; cohortClassId: string | null }, frais: FraisInscription) {
    if (!profile) return
    setEnCours(true)
    setErreur(null)

    // 1) Les frais d'abord — invariant explicitement demandé par le client : le paiement ne doit
    //    jamais rester silencieusement perdu si la suite échoue.
    const { error: erreurFrais } = await enregistrerFraisCollectif({
      etablissementId: etudiant.etablissementId,
      studentId: etudiant.profilId,
      prospectId: etudiant.prospectId,
      frais,
      creeParProfileId: profile.id,
      notesParDefaut: "Frais d'inscription — réévaluation de fin de parcours collectif",
    })
    if (erreurFrais) {
      setEnCours(false)
      setErreur(erreurFrais)
      return
    }

    // 2) Nouvelle vague / nouvelle classe — une seule ligne `cohort_enrollments` par élève (même
    //    principe que AssignerVague.tsx) : pas d'historique des vagues précédentes conservé ici,
    //    uniquement le placement courant.
    const { error: erreurPlacement } = await supabase
      .from('cohort_enrollments')
      .update({ cohort_id: placementRetenu.cohortId, cohort_class_id: placementRetenu.cohortClassId })
      .eq('student_id', etudiant.profilId)
    if (erreurPlacement) {
      setEnCours(false)
      setErreur(`Les frais ont été enregistrés, mais le changement de vague a échoué : ${erreurPlacement.message}. Réessayez depuis « Changer de vague ».`)
      return
    }

    // 3) Niveau : mis à jour sur la dernière inscription au test de positionnement si elle
    //    existe (c'est elle que lit le Suivi, voir construireSuiviCollectif.ts) — en plus d'une
    //    trace dans diagnostic_calls (étape 4), robuste même pour un élève converti sans jamais
    //    avoir eu d'inscription (ex. conversion directe depuis le pipeline).
    const { data: derniereInscription } = await supabase
      .from('test_positionnement_inscriptions')
      .select('id')
      .eq('prospect_id', etudiant.prospectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (derniereInscription) {
      await supabase.from('test_positionnement_inscriptions').update({ niveau_final: placementRetenu.niveau }).eq('id', derniereInscription.id)
    }

    // 4) Trace de la réévaluation dans le dossier, comme un appel diagnostic.
    await supabase.from('diagnostic_calls').insert({
      etablissement_id: etudiant.etablissementId,
      prospect_id: etudiant.prospectId,
      mene_par: profile.id,
      date_appel: new Date().toISOString(),
      niveau_evalue: placementRetenu.niveau,
      notes: 'Réévaluation de fin de parcours collectif : nouvelle vague et nouvelle classe attribuées.',
    })

    setEnCours(false)
    onEvalue()
  }

  if (etape === 'placement') {
    return (
      <ModalePlacement
        nomEtudiant={etudiant.nom}
        niveauActuel={etudiant.niveauActuel}
        valeursInitiales={placement ?? undefined}
        onFermer={onFermer}
        onValider={(choix) => {
          setPlacement(choix)
          setEtape('frais')
        }}
      />
    )
  }

  if (!placement) return null

  return (
    <FraisInscriptionCollectifModale
      nomCandidat={etudiant.nom}
      niveau={placement.niveau}
      etablissementId={etudiant.etablissementId}
      contexte="reevaluation"
      enCours={enCours}
      erreur={erreur}
      onFermer={() => {
        if (enCours) return
        setEtape('placement')
        setErreur(null)
      }}
      onValider={(frais) => confirmer(placement, frais)}
    />
  )
}

function ModalePlacement({
  nomEtudiant,
  niveauActuel,
  valeursInitiales,
  onFermer,
  onValider,
}: {
  nomEtudiant: string
  niveauActuel: string | null
  valeursInitiales?: { niveau: string; cohortId: string; cohortClassId: string | null }
  onFermer: () => void
  onValider: (choix: { niveau: string; cohortId: string; cohortClassId: string | null }) => void
}) {
  const { cohortes, loading: chargementCohortes } = useCohortes()
  const { creneaux: creneauxClasses } = useCreneauxClasses()
  const [niveau, setNiveau] = useState<string>(
    valeursInitiales?.niveau ?? NIVEAUX_CECRL.find((n) => n === niveauActuel) ?? NIVEAUX_CECRL[0],
  )
  const [cohortId, setCohortId] = useState(valeursInitiales?.cohortId ?? '')
  const [cohortClassId, setCohortClassId] = useState(valeursInitiales?.cohortClassId ?? '')
  const { classes, loading: chargementClasses } = useCohortClasses(cohortId || null)
  const categorieNiveau: NiveauClasse | null = categorieDepuisNiveauEstime(niveau)

  /* Présélectionne la classe du niveau choisi, comme AssignerVague.tsx — l'admin reste libre de
     la changer. Ne se redéclenche qu'au changement de vague ou de niveau, jamais en écrasant un
     choix déjà fait par l'admin dans la liste. */
  useEffect(() => {
    if (!cohortId || chargementClasses) return
    const suggestion = classes.find((c) => c.niveau === categorieNiveau)
    if (suggestion) setCohortClassId(suggestion.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId, niveau, chargementClasses, classes])

  function choisirCohort(valeur: string) {
    setCohortId(valeur)
    setCohortClassId('')
  }

  const pret = !!niveau && !!cohortId

  return (
    <Modale titre={`Réévaluer · ${nomEtudiant}`} onFermer={onFermer} largeurMax={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.55 }}>
          Son parcours actuel est terminé (toutes les heures de la vague ont été consommées). Choisissez son nouveau
          niveau, sa nouvelle vague et sa nouvelle classe. L'étape suivante enregistre ses frais d'inscription pour ce
          niveau, avant que le nouveau placement ne soit validé.
        </p>

        <Champ label="Niveau d'anglais retenu" obligatoire aide={niveauActuel ? `Niveau actuel : ${niveauActuel}.` : undefined}>
          <select value={niveau} onChange={(e) => setNiveau(e.target.value)} style={champStyle}>
            {NIVEAUX_CECRL.map((n) => (
              <option key={n} value={n}>
                {n} · classe {LABEL_NIVEAU_CLASSE[categorieDepuisNiveauEstime(n)!]}
              </option>
            ))}
          </select>
        </Champ>

        <Champ label="Nouvelle vague" obligatoire>
          <select value={cohortId} onChange={(e) => choisirCohort(e.target.value)} style={champStyle}>
            <option value="">{chargementCohortes ? 'Chargement…' : '— Choisir une promotion —'}</option>
            {cohortes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} · {new Date(c.date_debut).toLocaleDateString('fr-FR')} → {new Date(c.date_fin).toLocaleDateString('fr-FR')}
              </option>
            ))}
          </select>
        </Champ>

        {cohortId && (
          <Champ label="Nouvelle classe">
            <select value={cohortClassId} onChange={(e) => setCohortClassId(e.target.value)} style={champStyle}>
              <option value="">
                {chargementClasses ? 'Chargement…' : classes.length === 0 ? 'Aucune classe créée pour l’instant' : 'Aucune classe (à régulariser plus tard)'}
              </option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {LABEL_NIVEAU_CLASSE[c.niveau]}
                  {c.nom ? ` — ${c.nom}` : ''} · {libelleCreneau(creneauxClasses, c.creneau)}
                  {categorieNiveau === c.niveau ? ' (niveau retenu)' : ''}
                </option>
              ))}
            </select>
          </Champ>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onFermer} style={boutonNeutreStyle}>
            Annuler
          </button>
          <button
            onClick={() => onValider({ niveau, cohortId, cohortClassId: cohortClassId || null })}
            disabled={!pret}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: pret ? 1 : 0.6 }}
          >
            Continuer vers les frais d’inscription
          </button>
        </div>
      </div>
    </Modale>
  )
}
