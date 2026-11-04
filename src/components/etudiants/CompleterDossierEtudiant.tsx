import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { jetonAcces } from '../../lib/jetonAcces'
import { useProfileContext } from '../../context/ProfileContext'
import { useCacheRequete } from '../../hooks/useCacheRequete'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { useNiveauxEtudiant } from '../../hooks/useNiveauxEtudiant'
import { NIVEAUX_ANGLAIS } from '../../lib/classesCollectif'
import {
  estRempli,
  niveauDepuisReponses,
  rythmeDepuisReponses,
  synthetiser,
  type ReponsesDiagnostic,
} from '../../lib/diagnostic'
import { formaterHeures } from '../../lib/heures'
import { formaterMontant, statutReglement } from '../../lib/paiements'
import { jourDansFuseauEtablissement } from '../../lib/etablissement'
import { CreerForfait } from './CreerForfait'
import { AttribuerProfesseur } from './AttribuerProfesseur'
import { PlanifierSeancesForfait } from './PlanifierSeancesForfait'
import { FormulaireDiagnosticCall } from '../prospects/FormulaireDiagnosticCall'
import { DetailPaiementModale, type CiblePaiement } from '../paiements/DetailPaiementModale'
import { Champ, champStyle } from '../ui/Champ'
import { ChampDate } from '../ui/ChampDate'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'
import type { Database } from '../../types/database.types'

type TypeProgramme = Database['public']['Tables']['packages']['Row']['type_programme']
type StudentPayment = Database['public']['Tables']['student_payments']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

/* Troisième étape de l'assistant de création d'un étudiant — demande client du 2026-11-04,
   capture à l'appui : « on doit pouvoir renseigner en troisième étape toutes les informations
   concernant l'étudiant : les forfaits choisis, si le paiement est fait (sinon enregistrer un
   paiement), son niveau, renseigner son diagnostic call, son heure de cours restantes,
   attribution de professeur, création de planning ».

   Jusqu'ici l'assistant s'arrêtait au compte créé, et les sept informations ci-dessous se
   saisissaient ailleurs, chacune depuis son propre écran : le forfait et le professeur depuis la
   fiche de l'élève, le paiement depuis Paiements, le diagnostic depuis le pipeline prospect (donc
   nulle part pour un élève créé à la main), le planning depuis la fiche encore, et les heures
   déjà suivies depuis aucun écran du tout. D'où des dossiers systématiquement laissés à moitié
   faits — exactement ce que l'assistant était censé éviter.

   Rien n'est obligatoire : le compte existe déjà quand ce panneau s'ouvre. Imposer les sept
   blocs enfermerait l'admin dans un formulaire dont il ne pourrait plus sortir alors que
   l'essentiel est fait, et l'information manquante (un paiement attendu la semaine suivante, un
   diagnostic pas encore mené) se renseignera depuis la fiche comme avant. Chaque bloc dit donc
   seulement où il en est, et « Terminer » reste disponible en permanence.

   L'ORDRE, lui, n'est pas décoratif : trois blocs dépendent de ce qui précède.
     — le paiement et la reprise d'heures portent sur un forfait : sans forfait, rien à régler ni
       à débiter ;
     — le planning est écrit au nom d'un professeur (`sessions.teacher_id`, non nul depuis 0008) :
       sans attribution, la route de planification n'a personne à qui attacher les séances.
   Chaque bloc bloqué le dit en une phrase plutôt que de se désactiver en silence. */
export function CompleterDossierEtudiant({
  studentId,
  typeProgramme,
  onTermine,
}: {
  studentId: string
  typeProgramme: TypeProgramme
  onTermine: () => void
}) {
  const { dossier, loading, recharger } = useDossierEtudiant(studentId)
  const { evaluations, recharger: rechargerNiveaux } = useNiveauxEtudiant(studentId)

  /* Le forfait courant est `packages[0]` (le plus récent), comme partout ailleurs dans le
     dossier — voir EtudiantsAdmin.tsx. */
  const forfait = dossier?.packages[0] ?? null

  /* La ligne de paiement du forfait, si elle existe déjà. Elle décide de DEUX choses : l'état
     affiché par le bloc 2, et la cible passée à la fenêtre de paiement — ouvrir en
     `type: 'forfait'` alors qu'une ligne existe en créerait une SECONDE (cette cible-là naît
     avec `paiement = null` et enregistre le premier versement en créant la ligne). */
  const { valeur: paiement, recharger: rechargerPaiement } = useCacheRequete(
    forfait && `paiement-forfait-${forfait.id}`,
    async (): Promise<StudentPayment | null> => {
      const { data } = await supabase
        .from('student_payments')
        .select('*')
        .eq('package_id', (forfait as NonNullable<typeof forfait>).id)
        .is('supprime_le', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data ?? null
    },
  )

  const [paiementOuvert, setPaiementOuvert] = useState(false)

  if (loading || !dossier) return <EtatChargement />

  const etablissementId = dossier.etudiant.etablissement_id
  const professeursAttribues = dossier.periodesActuelles
    .map((p) => p.professeur)
    .filter((p): p is NonNullable<typeof p> => p !== null)
  const estCollectif = typeProgramme === 'collectif'
  /* Niveau « renseigné » = la dernière étape de l'historique, diagnostic compris — même lecture
     que HistoriqueNiveauModale, pour que les deux écrans ne se contredisent pas. */
  const niveauActuel = evaluations.at(-1)?.niveau ?? dossier.diagnostic?.niveau_evalue ?? null
  const reglement = paiement ? statutReglement(paiement) : null

  function toutRecharger() {
    recharger()
    rechargerPaiement()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p style={{ margin: '0 0 6px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
        Le compte est créé et l’invitation envoyée. Complétez maintenant son dossier : tout ce qui
        suit est facultatif ici et restera modifiable depuis sa fiche.
      </p>

      {/* 1 — Forfait. Pour le collectif, il naît tout seul à l'inscription à la vague (32 h par
          défaut) et le prix est porté par une ligne de frais séparée : il n'y a rien à créer. */}
      <Bloc
        numero={1}
        titre="Forfait"
        fait={!!forfait}
        resume={forfait ? `${formaterHeures(forfait.total_heures)}${forfait.montant ? ` · ${formaterMontant(Number(forfait.montant))}` : ''}` : 'Aucun forfait'}
      >
        {estCollectif ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-2)', lineHeight: 1.6 }}>
            Élève en cours collectif : le forfait de la vague a été créé automatiquement à
            l’inscription. Les frais d’inscription se saisissent depuis <strong>Cours collectifs</strong>,
            pas ici.
          </p>
        ) : (
          <CreerForfait
            studentId={studentId}
            etablissementId={etablissementId}
            forfaitExistant={forfait}
            typeProgrammeInitial={forfait ? undefined : typeProgramme === 'duo' ? 'duo' : 'individuel'}
            onCree={toutRecharger}
          />
        )}
      </Bloc>

      {/* 2 — Paiement. La fenêtre de paiement est celle de l'écran Paiements, sans variante :
          acomptes, reste dû, reçu et facture y sont exactement les mêmes. */}
      <Bloc
        numero={2}
        titre="Paiement"
        fait={reglement === 'paye'}
        resume={
          !forfait
            ? 'Pas de forfait à régler'
            : reglement === 'paye'
              ? 'Réglé'
              : reglement === 'partiel'
                ? `Acompte de ${formaterMontant(paiement!.montant_regle, paiement!.devise)} encaissé`
                : 'Rien d’encaissé'
        }
        bloque={forfait ? null : 'Créez d’abord le forfait : c’est lui qui porte le montant à régler.'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-2)', lineHeight: 1.6 }}>
            {reglement === 'paye'
              ? 'Le forfait est soldé. Rouvrez la fenêtre pour imprimer le reçu ou la facture.'
              : 'Enregistrez le règlement complet ou un simple acompte — le reste dû se calcule tout seul.'}
          </p>
          <div>
            <button type="button" onClick={() => setPaiementOuvert(true)} style={boutonSecondaireStyle}>
              {reglement === 'paye' ? 'Voir le paiement' : 'Enregistrer un paiement'}
            </button>
          </div>
        </div>
      </Bloc>

      {/* 3 — Niveau. Une réévaluation, écrite dans `niveau_evaluations` comme celles ajoutées
          plus tard depuis l'historique du dossier : rien de spécifique à l'assistant. */}
      <Bloc numero={3} titre="Niveau" fait={!!niveauActuel} resume={niveauActuel ?? 'Non évalué'}>
        <BlocNiveau studentId={studentId} etablissementId={etablissementId} niveauActuel={niveauActuel} onEnregistre={rechargerNiveaux} />
      </Bloc>

      {/* 4 — Appel diagnostic. Impossible avant 0158 pour un élève créé à la main :
          `diagnostic_calls.prospect_id` était `not null` et un tel élève n'a aucun prospect. */}
      <Bloc
        numero={4}
        titre="Appel diagnostic"
        fait={!!dossier.diagnostic}
        resume={dossier.diagnostic ? `Mené le ${new Date(dossier.diagnostic.date_appel).toLocaleDateString('fr-FR')}` : 'Non renseigné'}
      >
        {dossier.diagnostic ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-2)', lineHeight: 1.6 }}>
            Le diagnostic est enregistré. Il se relit et se complète depuis le parcours pédagogique
            de sa fiche.
          </p>
        ) : (
          <BlocDiagnostic studentId={studentId} etablissementId={etablissementId} onEnregistre={recharger} />
        )}
      </Bloc>

      {/* 5 — Heures déjà suivies. Un élève repris d'un relevé papier arrive avec des heures déjà
          consommées : sans cette reprise, son compteur annoncerait un forfait intact (0140). */}
      <Bloc
        numero={5}
        titre="Heures de cours restantes"
        fait={dossier.heuresReprises > 0}
        resume={
          !forfait
            ? 'Pas de forfait'
            : dossier.heuresReprises > 0
              ? `${formaterHeures(dossier.heuresReprises)} déjà suivies avant la mise en service`
              : `${formaterHeures(forfait.total_heures)} — forfait intact`
        }
        bloque={forfait ? null : 'Créez d’abord le forfait : les heures restantes s’y déduisent.'}
      >
        {forfait && (
          <BlocHeuresReprises
            packageId={forfait.id}
            totalHeures={forfait.total_heures}
            heuresDejaReprises={dossier.heuresReprises}
            onEnregistre={toutRecharger}
          />
        )}
      </Bloc>

      {/* 6 — Professeur. Bloc tel quel de la fiche de l'élève : `periodesActuelles` vient du
          dossier et vaut la liste vide pour un compte qui vient de naître. */}
      <Bloc
        numero={6}
        titre="Professeur"
        fait={professeursAttribues.length > 0 || !!dossier.professeurClasse}
        resume={
          estCollectif
            ? dossier.professeurClasse
              ? `${dossier.professeurClasse.prenom} ${dossier.professeurClasse.nom} (professeur de la classe)`
              : 'Celui de sa classe de niveau'
            : professeursAttribues.length > 0
              ? professeursAttribues.map((p) => `${p.prenom} ${p.nom}`).join(', ')
              : 'Non attribué'
        }
      >
        <AttribuerProfesseur
          studentId={studentId}
          periodesActuelles={dossier.periodesActuelles}
          estCollectif={estCollectif}
          onTermine={recharger}
        />
      </Bloc>

      {/* 7 — Planning. Jamais pour un élève collectif : ses séances appartiennent à sa classe et
          se planifient par classe depuis Cours collectifs (règle du 2026-10-19). */}
      <Bloc
        numero={7}
        titre="Planning prévisionnel"
        fait={!!dossier.prochaineSeance}
        resume={
          dossier.prochaineSeance
            ? `Prochaine séance le ${new Date(dossier.prochaineSeance.session.debut).toLocaleDateString('fr-FR')}`
            : 'Aucune séance planifiée'
        }
        bloque={
          estCollectif
            ? 'Élève en cours collectif : le planning est celui de sa classe, créé depuis Cours collectifs.'
            : !forfait
              ? 'Créez d’abord le forfait : son volume d’heures fixe l’échéance du planning.'
              : professeursAttribues.length === 0
                ? 'Attribuez d’abord un professeur : chaque séance est planifiée en son nom.'
                : null
        }
      >
        {forfait && professeursAttribues.length > 0 && !estCollectif && (
          <BlocPlanning
            studentId={studentId}
            professeurs={professeursAttribues}
            forfait={forfait}
            onCree={toutRecharger}
          />
        )}
      </Bloc>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" onClick={onTermine} className="btn-shine" style={boutonPrimaireStyle}>
          Terminer
        </button>
      </div>

      {paiementOuvert && forfait && (
        <DetailPaiementModale
          cible={
            (paiement
              ? {
                  type: 'etudiant',
                  paiement,
                  personne: dossier.etudiant,
                  forfait,
                  professeurs: professeursAttribues,
                  duoPartenaire: dossier.duoPartenaire,
                }
              : {
                  type: 'forfait',
                  forfait,
                  personne: dossier.etudiant,
                  professeurs: professeursAttribues,
                  duoPartenaire: dossier.duoPartenaire,
                }) satisfies CiblePaiement
          }
          onFermer={() => {
            setPaiementOuvert(false)
            rechargerPaiement()
          }}
          onChange={toutRecharger}
        />
      )}
    </div>
  )
}

/* Un bloc de l'étape : son numéro, son état d'un coup d'œil, et son formulaire replié tant qu'on
   ne l'ouvre pas. Replié par défaut parce que sept formulaires dépliés d'un coup ne se lisent
   pas — même règle que les sections repliables des pop-up de séance (2026-10-13). Un bloc déjà
   renseigné ou bloqué ne s'ouvre pas tout seul non plus : son résumé suffit à le vérifier. */
function Bloc({
  numero,
  titre,
  fait,
  resume,
  bloque,
  children,
}: {
  numero: number
  titre: string
  fait: boolean
  resume: string
  bloque?: string | null
  children?: React.ReactNode
}) {
  const [ouvert, setOuvert] = useState(false)

  return (
    <section
      style={{
        borderRadius: 14,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '11px 13px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 800,
            /* Teinte verte pour un bloc renseigné : l'admin doit voir ce qui reste à faire sans
               lire les sept résumés. L'icône accompagne la couleur — elle seule ne suffirait
               pas à quelqu'un qui distingue mal le vert du gris. */
            background: fait ? 'color-mix(in srgb, var(--accent-teal) 22%, transparent)' : 'var(--voile, rgba(255,255,255,.06))',
            color: fait ? 'var(--accent-teal)' : 'var(--muted)',
          }}
        >
          {fait ? <Icone nom="valide" taille={13} /> : numero}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flexGrow: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{titre}</span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.45 }}>{resume}</span>
        </span>
        <Icone
          nom="chevron"
          taille={14}
          style={{ flexShrink: 0, color: 'var(--muted)', transform: ouvert ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}
        />
      </button>
      {ouvert && (
        <div style={{ padding: '2px 13px 14px' }}>
          {bloque ? (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-2)', lineHeight: 1.6 }}>{bloque}</p>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  )
}

function BlocNiveau({
  studentId,
  etablissementId,
  niveauActuel,
  onEnregistre,
}: {
  studentId: string
  etablissementId: string
  niveauActuel: string | null
  onEnregistre: () => void
}) {
  const { profile } = useProfileContext()
  /* Liste déroulante et non saisie libre, comme HistoriqueNiveauModale et le test oral collectif
     (2026-10-16) : « Intermédiaire+ » tapé à la main n'est reconnu par aucun des barèmes qui
     comparent ensuite ce niveau. Échelle anglaise seule depuis 0153. */
  const [niveau, setNiveau] = useState(niveauActuel ?? NIVEAUX_ANGLAIS[0])
  const [notes, setNotes] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function enregistrer() {
    if (!profile) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('niveau_evaluations').insert({
      etablissement_id: etablissementId,
      student_id: studentId,
      niveau,
      notes: notes.trim() || null,
      evalue_par: profile.id,
    })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setNotes('')
    onEnregistre()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Champ label="Niveau">
        <select value={niveau} onChange={(e) => setNiveau(e.target.value)} style={champStyle}>
          {NIVEAUX_ANGLAIS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Champ>
      <Champ label="Remarques (optionnel)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Ce qui a motivé ce niveau…"
          style={{ ...champStyle, resize: 'vertical' }}
        />
      </Champ>
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <div>
        <button type="button" onClick={enregistrer} disabled={enCours} style={{ ...boutonSecondaireStyle, opacity: enCours ? 0.6 : 1 }}>
          {enCours ? 'Enregistrement…' : niveauActuel ? 'Enregistrer ce nouveau niveau' : 'Enregistrer le niveau'}
        </button>
      </div>
    </div>
  )
}

function BlocDiagnostic({
  studentId,
  etablissementId,
  onEnregistre,
}: {
  studentId: string
  etablissementId: string
  onEnregistre: () => void
}) {
  const { profile } = useProfileContext()
  const [reponses, setReponses] = useState<ReponsesDiagnostic>({})
  const [dateAppel, setDateAppel] = useState(jourDansFuseauEtablissement())
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function enregistrer() {
    if (!profile) return
    if (!estRempli(reponses)) {
      setErreur('Répondez au moins à une question avant d’enregistrer.')
      return
    }
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('diagnostic_calls').insert({
      etablissement_id: etablissementId,
      /* `student_id` et non `prospect_id` : cet élève a été créé à la main, il n'a aucun prospect
         derrière lui. Les deux colonnes sont exclusives depuis 0158. */
      student_id: studentId,
      mene_par: profile.id,
      /* Midi local et non minuit : à minuit, la conversion en UTC reculerait la date d'un jour à
         Madagascar (UTC+3) — le travers corrigé partout ailleurs dans le projet. */
      date_appel: new Date(`${dateAppel}T12:00:00`).toISOString(),
      /* Niveau et rythme sont CALCULÉS depuis les réponses, jamais saisis deux fois (2026-09-21,
         « corrige les redondances »). */
      niveau_evalue: niveauDepuisReponses(reponses),
      rythme_convenu: rythmeDepuisReponses(reponses),
      notes: synthetiser(reponses) || null,
      reponses,
    })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onEnregistre()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Champ label="Date de l’appel" style={{ maxWidth: 230 }}>
        <ChampDate value={dateAppel} onChange={(e) => setDateAppel(e.target.value)} style={champStyle} />
      </Champ>
      <FormulaireDiagnosticCall reponses={reponses} onChange={setReponses} />
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <div>
        <button type="button" onClick={enregistrer} disabled={enCours} style={{ ...boutonSecondaireStyle, opacity: enCours ? 0.6 : 1 }}>
          {enCours ? 'Enregistrement…' : 'Enregistrer le diagnostic'}
        </button>
      </div>
    </div>
  )
}

/* Reprise des heures déjà suivies hors application (0140). L'admin saisit les heures RESTANTES —
   c'est le chiffre qu'il lit sur son relevé — et la soustraction se fait ici : la route attend
   les heures DÉJÀ SUIVIES, qui sont ce qui se débite réellement du forfait. Jamais un retrait de
   `packages.total_heures`, qui reste le volume SOUSCRIT. */
function BlocHeuresReprises({
  packageId,
  totalHeures,
  heuresDejaReprises,
  onEnregistre,
}: {
  packageId: string
  totalHeures: number
  heuresDejaReprises: number
  onEnregistre: () => void
}) {
  const [restantes, setRestantes] = useState(String(totalHeures))
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  if (heuresDejaReprises > 0) {
    return (
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-2)', lineHeight: 1.6 }}>
        {formaterHeures(heuresDejaReprises)} ont déjà été reprises sur ce forfait de{' '}
        {formaterHeures(totalHeures)}, il en reste donc {formaterHeures(totalHeures - heuresDejaReprises)}. Une reprise
        ne s’enregistre qu’une fois par forfait : pour la corriger, passez par le relevé d’heures
        de sa fiche.
      </p>
    )
  }

  const valeur = Number(restantes.replace(',', '.'))
  const valide = Number.isFinite(valeur) && valeur >= 0 && valeur <= totalHeures
  const dejaSuivies = valide ? Math.round((totalHeures - valeur) * 100) / 100 : 0

  async function enregistrer() {
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/reprendre-heures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonAcces()}` },
      body: JSON.stringify({ packageId, heuresDejaSuivies: dejaSuivies }),
    })
    const corps = (await reponse.json().catch(() => ({}))) as { error?: string }
    setEnCours(false)
    if (!reponse.ok) {
      setErreur(corps.error ?? 'L’enregistrement des heures déjà suivies a échoué.')
      return
    }
    onEnregistre()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-2)', lineHeight: 1.6 }}>
        Si cet élève a déjà suivi des heures avant d’être inscrit ici (relevé papier, cours menés
        hors application), indiquez ce qu’il lui reste : la différence est débitée de son forfait
        de {formaterHeures(totalHeures)}. Laissez la valeur telle quelle pour un forfait intact.
      </p>
      <Champ label="Heures de cours restantes" style={{ maxWidth: 230 }}>
        <input
          type="number"
          min={0}
          max={totalHeures}
          step="0.5"
          value={restantes}
          onChange={(e) => setRestantes(e.target.value)}
          style={champStyle}
        />
      </Champ>
      {valide && dejaSuivies > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2, var(--ink))', lineHeight: 1.6 }}>
          {formaterHeures(dejaSuivies)} seront enregistrées comme déjà suivies avant la mise en service.
        </p>
      )}
      {!valide && <MessageErreur>Indiquez un nombre d’heures entre 0 et {formaterHeures(totalHeures)}.</MessageErreur>}
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <div>
        <button
          type="button"
          onClick={enregistrer}
          disabled={enCours || !valide || dejaSuivies <= 0}
          style={{ ...boutonSecondaireStyle, opacity: enCours || !valide || dejaSuivies <= 0 ? 0.5 : 1 }}
        >
          {enCours ? 'Enregistrement…' : 'Enregistrer les heures déjà suivies'}
        </button>
      </div>
    </div>
  )
}

/* Planification de la série de séances. Deux détails reproduits de la fiche de l'élève, et non
   réinventés ici :
     — pour QUEL professeur, dès que l'élève en a plusieurs (0138) : planifier chez le premier de
       la liste remplirait en silence l'agenda d'un professeur que l'admin n'a pas choisi ;
     — l'échéance retenue est reportée sur `packages.echeance`, sinon seul le formulaire la
       connaîtrait et le reste de l'application afficherait l'ancienne valeur (2026-09-16). */
function BlocPlanning({
  studentId,
  professeurs,
  forfait,
  onCree,
}: {
  studentId: string
  professeurs: Profile[]
  forfait: Database['public']['Tables']['packages']['Row']
  onCree: () => void
}) {
  const [teacherId, setTeacherId] = useState(professeurs[0].id)
  const retenu = professeurs.some((p) => p.id === teacherId) ? teacherId : professeurs[0].id

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {professeurs.length > 1 && (
        <Champ label="Planifier les séances de">
          <select value={retenu} onChange={(e) => setTeacherId(e.target.value)} style={champStyle}>
            {professeurs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.prenom} {p.nom}
              </option>
            ))}
          </select>
        </Champ>
      )}
      <PlanifierSeancesForfait
        studentIds={[studentId]}
        teacherId={retenu}
        dureeParDefaut={60}
        dateFinParDefaut={forfait.echeance}
        heuresForfait={forfait.total_heures}
        onCree={async (dateFinRetenue) => {
          if (dateFinRetenue && dateFinRetenue !== forfait.echeance) {
            await supabase.from('packages').update({ echeance: dateFinRetenue }).eq('id', forfait.id)
          }
          onCree()
        }}
      />
    </div>
  )
}
