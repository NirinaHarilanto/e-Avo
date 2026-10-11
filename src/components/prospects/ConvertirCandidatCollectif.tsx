import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { categorieDepuisNiveauEstime, LABEL_NIVEAU_CLASSE, NIVEAUX_CECRL } from '../../lib/classesCollectif'
import type { NiveauClasse } from '../../types/database.types'
import { Champ, champStyle } from '../ui/Champ'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { MessageErreur } from '../ui/Etats'
import { Modale } from '../ui/Modale'
import { FraisInscriptionCollectifModale, type FraisInscription } from './FraisInscriptionCollectifModale'

/* Conversion d'un candidat collectif en étudiant, en deux étapes — demande client du 2026-10-11 :
   les résultats de l'oral d'abord (niveau retenu, compte rendu), les frais d'inscription ensuite
   (dont le montant dépend du niveau qui vient d'être arrêté). Rien n'est écrit en base tant que
   la seconde étape n'est pas validée — même principe que la décision d'essai individuelle
   (DecisionHeureEssai.tsx) : une seule validation pour l'admin, pas d'étudiant créé sans ses frais.

   Extrait de SessionsOraleAdmin.tsx le 2026-10-11 pour être réutilisé depuis le Suivi des cours
   collectifs (clic sur une ligne « candidat ») sans dupliquer ce flux à deux temps : seule la
   provenance du candidat change, pas la mécanique de conversion elle-même. */

export interface ProspectAConvertir {
  id: string
  prenom: string
  nom: string
  etablissement_id: string
}

export function ConvertirCandidatCollectif({
  prospect,
  niveauEstimeParDefaut,
  scoreQuiz,
  onFermer,
  onConverti,
}: {
  prospect: ProspectAConvertir
  /* Niveau du quiz écrit, pour présélectionner le même niveau à l'oral (cas le plus fréquent :
     l'oral confirme l'écrit) — `null` si le candidat n'a pas passé le quiz. */
  niveauEstimeParDefaut: string | null
  scoreQuiz?: { score: number; total: number } | null
  onFermer: () => void
  /* `frais` est repassé tel quel : l'appelant sait déjà tout ce qu'il a lui-même saisi dans la
     fenêtre précédente, mais ne l'a pas gardé en mémoire — le lui repasser évite de dupliquer cet
     état côté appelant juste pour composer un message de confirmation. */
  onConverti: (resultat: { niveauDetecte?: NiveauClasse | null; classeAssignee?: string | null; frais: FraisInscription }) => void
}) {
  const { session, profile } = useProfileContext()
  const [etape, setEtape] = useState<'resultats' | 'frais'>('resultats')
  const [resultats, setResultats] = useState<{ niveau: string; profilDetaille: string; objectifs: string } | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function appelServeur(url: string, corps: object) {
    if (!session) return { error: 'Session expirée.' }
    const reponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(corps),
    })
    const resultat = await reponse.json().catch(() => null)
    if (!reponse.ok) return { error: resultat?.error ?? 'La demande a échoué.' }
    return { data: resultat }
  }

  async function validerResultatsEtConvertir(resultatsOral: { niveau: string; profilDetaille: string; objectifs: string }, frais: FraisInscription) {
    if (!session || !profile) return
    setEnCours(true)
    setErreur(null)

    const { error: diagnosticError } = await supabase.from('diagnostic_calls').insert({
      etablissement_id: prospect.etablissement_id,
      prospect_id: prospect.id,
      mene_par: profile.id,
      date_appel: new Date().toISOString(),
      niveau_evalue: resultatsOral.niveau.trim() || null,
      notes: formaterNotesTestOral(resultatsOral.profilDetaille, resultatsOral.objectifs),
    })
    if (diagnosticError) {
      setEnCours(false)
      setErreur(diagnosticError.message)
      return
    }

    const { data, error } = await appelServeur('/api/admin/convert-prospect', {
      prospectId: prospect.id,
      niveauFinal: resultatsOral.niveau.trim() || undefined,
      montantFrais: frais.montant,
      fraisRegles: frais.regle,
      moyenPaiement: frais.moyenPaiement || undefined,
      referencePaiement: frais.reference || undefined,
      notesPaiement: frais.notes || undefined,
    })
    setEnCours(false)
    if (error) {
      setErreur(error)
      return
    }
    const resultat = data as { niveauDetecte?: NiveauClasse | null; classeAssignee?: string | null } | undefined
    onConverti({ niveauDetecte: resultat?.niveauDetecte, classeAssignee: resultat?.classeAssignee, frais })
  }

  if (etape === 'resultats') {
    return (
      <ModaleResultatsTestOral
        nom={`${prospect.prenom} ${prospect.nom}`}
        niveauEstimeParDefaut={niveauEstimeParDefaut}
        scoreQuiz={scoreQuiz}
        valeursInitiales={resultats ?? undefined}
        enCours={enCours}
        erreur={erreur}
        onFermer={() => {
          if (enCours) return
          onFermer()
        }}
        onValider={(saisie) => {
          setResultats(saisie)
          setEtape('frais')
        }}
      />
    )
  }

  if (!resultats) return null

  return (
    <FraisInscriptionCollectifModale
      nomCandidat={`${prospect.prenom} ${prospect.nom}`}
      niveau={resultats.niveau}
      etablissementId={prospect.etablissement_id}
      enCours={enCours}
      erreur={erreur}
      onFermer={() => {
        if (enCours) return
        // Retour sur les résultats plutôt que fermeture sèche : l'admin vient de les saisir, les
        // lui faire reprendre pour corriger un montant serait une perte pure.
        setEtape('resultats')
        setErreur(null)
      }}
      onValider={(frais) => validerResultatsEtConvertir(resultats, frais)}
    />
  )
}

/* Notes de l'appel diagnostic (0006) — reprise à l'identique de l'ex-CreneauxTestVague.tsx. */
function formaterNotesTestOral(profilDetaille: string, objectifs: string): string | null {
  const parties = [
    profilDetaille.trim() ? `Profil détaillé :\n${profilDetaille.trim()}` : null,
    objectifs.trim() ? `Objectifs :\n${objectifs.trim()}` : null,
  ].filter((p): p is string => p !== null)
  return parties.length > 0 ? parties.join('\n\n') : null
}

function ModaleResultatsTestOral({
  nom,
  niveauEstimeParDefaut,
  scoreQuiz,
  valeursInitiales,
  enCours,
  erreur,
  onFermer,
  onValider,
}: {
  nom: string
  niveauEstimeParDefaut: string | null
  scoreQuiz?: { score: number; total: number } | null
  /* Ce que l'admin avait déjà saisi, quand il revient ici depuis la fenêtre des frais : sans ça,
     revenir en arrière pour corriger un niveau lui ferait reperdre son compte rendu d'oral. */
  valeursInitiales?: { niveau: string; profilDetaille: string; objectifs: string }
  enCours: boolean
  erreur: string | null
  onFermer: () => void
  onValider: (resultats: { niveau: string; profilDetaille: string; objectifs: string }) => void
}) {
  /* Proposé au niveau du quiz écrit quand il en existe un : l'admin confirme d'un clic le cas le
     plus fréquent (l'oral confirme l'écrit) et ne corrige que les autres. Repli sur le premier
     niveau de la liste plutôt que sur un choix vide — le champ est obligatoire, et un « — » à
     sélectionner n'apporterait rien de plus qu'un clic. */
  const [niveau, setNiveau] = useState<string>(
    valeursInitiales?.niveau ?? NIVEAUX_CECRL.find((n) => n === niveauEstimeParDefaut) ?? NIVEAUX_CECRL[0],
  )
  const [profilDetaille, setProfilDetaille] = useState(valeursInitiales?.profilDetaille ?? '')
  const [objectifs, setObjectifs] = useState(valeursInitiales?.objectifs ?? '')

  return (
    <Modale titre={`Résultats du test oral · ${nom}`} onFermer={onFermer} largeurMax={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.55 }}>
          Ces résultats sont enregistrés dans le dossier de l'élève (comme un appel diagnostic). L'étape suivante
          enregistre ses frais d'inscription, puis {nom} devient étudiant·e et rejoint automatiquement sa vague, dans
          la classe de son niveau.
        </p>
        {/* Liste déroulante et non plus saisie libre — demande client du 2026-10-11 : « mets le
            niveau d'anglais en liste déroulante pour faciliter la sélection et la compréhension ».
            Au-delà du confort, c'est ce qui garantit que le niveau saisi désigne bien une classe
            ET un tarif : un « Intermédiaire » tapé à la main n'était reconnu par aucun des deux.
            Pré-rempli avec le niveau du quiz écrit, que l'admin confirme ou corrige. */}
        <Champ
          label="Niveau d'anglais retenu"
          obligatoire
          aide={
            /* Le score détaillé (x/10) n'est connu que des appelants qui ont l'inscription sous
               la main (SessionsOraleAdmin) ; le niveau seul suffit à dire que le quiz A été
               passé — ne pas le confondre avec son absence faute du détail du score. */
            niveauEstimeParDefaut
              ? `Quiz écrit : ${niveauEstimeParDefaut}${scoreQuiz ? ` (${scoreQuiz.score}/${scoreQuiz.total})` : ''} — indicatif, c'est l'oral qui fait foi.`
              : 'Le candidat n’a pas passé le quiz écrit.'
          }
        >
          <select value={niveau} onChange={(e) => setNiveau(e.target.value)} style={champStyle}>
            {NIVEAUX_CECRL.map((n) => (
              <option key={n} value={n}>
                {n} · classe {LABEL_NIVEAU_CLASSE[categorieDepuisNiveauEstime(n)!]}
              </option>
            ))}
          </select>
        </Champ>
        <Champ label="Profil détaillé">
          <textarea value={profilDetaille} onChange={(e) => setProfilDetaille(e.target.value)} rows={3} style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </Champ>
        <Champ label="Objectifs">
          <textarea value={objectifs} onChange={(e) => setObjectifs(e.target.value)} rows={3} style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </Champ>
        {erreur && <MessageErreur>{erreur}</MessageErreur>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onFermer} disabled={enCours} style={boutonNeutreStyle}>
            Annuler
          </button>
          <button
            onClick={() => onValider({ niveau, profilDetaille, objectifs })}
            disabled={enCours}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours ? 0.6 : 1 }}
          >
            {enCours ? 'Enregistrement…' : 'Continuer vers les frais d’inscription'}
          </button>
        </div>
      </div>
    </Modale>
  )
}
