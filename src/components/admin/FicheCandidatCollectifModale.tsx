import { useCallback, useEffect, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { formaterDansFuseauEtablissement } from '../../lib/etablissement'
import { nomVagueSeul } from '../../lib/cohortes'
import { LABEL_NIVEAU_CLASSE, parcoursCollectifTermine } from '../../lib/classesCollectif'
import { formaterHeures } from '../../lib/heures'
import { formaterMontant, statutReglement } from '../../lib/paiements'
import { classePrevue, LIBELLE_ETAPE_COLLECTIF, type LigneSuiviCollectif } from '../../lib/suiviCollectif'
import { useEtablissement } from '../../hooks/useEtablissement'
import type { Database } from '../../types/database.types'
import { InformationsPersonnelles } from '../shared/InformationsPersonnelles'
import { EditerIdentiteProspect } from '../prospects/EditerIdentiteProspect'
import { SupprimerProspect } from '../prospects/SupprimerProspect'
import { ConvertirCandidatCollectif } from '../prospects/ConvertirCandidatCollectif'
import { ReevaluerEtudiantCollectif } from '../prospects/ReevaluerEtudiantCollectif'
import { FraisInscriptionCollectifModale, type FraisInscription } from '../prospects/FraisInscriptionCollectifModale'
import { DetailPaiementModale, type CiblePaiement } from '../paiements/DetailPaiementModale'
import { SupprimerCompte } from '../shared/SupprimerCompte'
import { AssignerVague } from '../etudiants/AssignerVague'
import { ChangerClasseEtudiant } from '../etudiants/ChangerClasseEtudiant'
import { Modale } from '../ui/Modale'
import { GroupeSection } from '../ui/Section'
import { PanneauRelances } from '../shared/Relances'
import { LigneInfo } from '../ui/Champ'
import { BadgeStatutPaiement } from '../shared/BadgeStatutPaiement'
import { boutonSecondaireStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { EtatChargement, MessageErreur, MessageInfo, MessageSucces } from '../ui/Etats'

type Prospect = Database['public']['Tables']['prospects']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type StudentPayment = Database['public']['Tables']['student_payments']['Row']
type Cohort = Database['public']['Tables']['cohorts']['Row']

/* Fiche d'une personne du Suivi des cours collectifs, ouverte au clic sur sa ligne — demande
   client du 2026-10-11 : « chaque ligne devrait être cliquable, un pop-up apparaîtra avec toutes
   les informations de la personne. Toutes les informations devraient être modifiables [...] et
   après enregistrement, les mises à jour devraient être instantanées dans toute l'application
   HOC. Si la personne est encore un prospect, rajoute la possibilité de le convertir [...]
   sachant qu'avant la validation [...] il faut toujours enregistrer un paiement. »

   « Instantané dans toute l'application » n'exige rien de spécial ici : toute écriture passe par
   le client Supabase, dont le `fetch` est déjà remplacé par `fetchAvecSynchro` (lib/synchro.ts)
   — elle signale donc automatiquement à tous les écrans montés (y compris celui-ci et la table
   derrière) qu'une donnée a changé. Ce composant n'a qu'à recharger SON PROPRE dossier après
   chaque action, exactement comme DossierEtudiantVue.tsx le fait pour les mêmes panneaux
   réutilisés ici (InformationsPersonnelles, AssignerVague) — sans ça, le panneau réaffiche la
   donnée d'avant la modification jusqu'à la fermeture de la fenêtre.

   Rien n'est reconstruit depuis `ligne` (le résumé déjà calculé pour la table) une fois le
   dossier chargé : la fiche tient son propre état, à jour après chaque action, plutôt que de
   dépendre d'un objet figé au moment où la ligne a été cliquée. */
export function FicheCandidatCollectifModale({
  ligne,
  cohortes,
  onFermer,
  onChange,
}: {
  ligne: LigneSuiviCollectif
  cohortes: Cohort[]
  onFermer: () => void
  /* Rafraîchit la liste de l'écran parent — en plus de ce que `fetchAvecSynchro` déclenche déjà
     tout seul, pour que la ligne derrière cette fenêtre soit à jour dès sa fermeture, sans
     attendre le signal de synchro (300 ms + sondage). */
  onChange: () => void
}) {
  const { profile } = useProfileContext()
  const [prospect, setProspect] = useState<Prospect | null>(null)
  const [profilEtudiant, setProfilEtudiant] = useState<Profile | null>(null)
  const [vagueId, setVagueId] = useState<string | null>(null)
  const [classeId, setClasseId] = useState<string | null>(null)
  const [paiements, setPaiements] = useState<StudentPayment[] | null>(null)
  /* Heures consommées DANS LA VAGUE ACTUELLE (pas le cumul à vie du dossier, qui mélangerait
     plusieurs vagues si l'élève en a déjà changé) — demande client du 2026-10-11 : « quand toutes
     les heures seront consommées et que le parcours se termine, un bouton évaluer l'étudiant
     apparaîtra ». `null` tant que non calculé (pas encore de vague, ou dossier en cours de
     chargement) ; distinct de `0`, une vraie valeur. */
  const [heuresConsommeesVague, setHeuresConsommeesVague] = useState<number | null>(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)

  const [convertirOuvert, setConvertirOuvert] = useState(false)
  const [marquageOralEnCours, setMarquageOralEnCours] = useState(false)
  const [reevaluerOuvert, setReevaluerOuvert] = useState(false)
  const [creerFraisOuvert, setCreerFraisOuvert] = useState(false)
  const [enCoursFrais, setEnCoursFrais] = useState(false)
  const [erreurFrais, setErreurFrais] = useState<string | null>(null)
  const [paiementOuvert, setPaiementOuvert] = useState<StudentPayment | null>(null)

  const rechargerDossier = useCallback(async () => {
    /* Les deux premières requêtes ne dépendent l'une de l'autre en rien (la seconde cherche par
       `prospect_id`, pas par un id de profil connu d'avance) : parties en parallèle plutôt qu'en
       série, comme l'étaient par inadvertance les quatre requêtes de cette fonction au premier
       jet — mesuré à plusieurs secondes de chargement en conditions réelles (dev server distant
       de la base), corrigé avant tout envoi en production. */
    const [{ data: prospectData, error: erreurProspect }, { data: profilData }] = await Promise.all([
      supabase.from('prospects').select('*').eq('id', ligne.prospectId).maybeSingle(),
      // Le profil fait foi une fois converti, cherché par `prospect_id` pour que ce même
      // rechargement découvre tout seul le profil tout juste créé par une conversion lancée
      // DEPUIS cette fenêtre. Un profil suspendu (compte supprimé) ne compte pas — même règle
      // que le Suivi lui-même (construireSuiviCollectif.ts).
      supabase.from('profiles').select('*').eq('prospect_id', ligne.prospectId).neq('status', 'suspended').maybeSingle(),
    ])
    if (erreurProspect || !prospectData) {
      setErreur(erreurProspect?.message ?? 'Ce candidat est introuvable — il a peut-être été supprimé entre-temps.')
      setChargement(false)
      return
    }
    setProspect(prospectData)
    setProfilEtudiant(profilData ?? null)

    /* Les frais d'inscription sont rattachés au PROSPECT dès leur encaissement (0056), avant
       toute conversion — c'est justement ce qui bloque la suppression d'un candidat pas encore
       converti (api/admin/supprimer-prospect.ts refuse tant qu'une ligne existe). Cette requête
       partait donc toujours, même sans profil : bug trouvé le 2026-10-19, un candidat non
       converti voyait sa ligne de paiement forcée à `[]` ici, alors qu'elle existait bel et bien
       en base — la section Paiements de cette fiche (plus bas) restait alors invisible, sans
       aucun moyen d'y faire le geste que le message d'erreur de suppression demande pourtant
       explicitement de faire « depuis sa fiche ». */
    const [{ data: parProspect }, { data: parEtudiant }] = await Promise.all([
      supabase.from('student_payments').select('*').eq('prospect_id', ligne.prospectId).is('supprime_le', null),
      profilData
        ? supabase.from('student_payments').select('*').eq('student_id', profilData.id).is('supprime_le', null)
        : Promise.resolve({ data: [] as StudentPayment[] }),
    ])
    // Une même ligne peut porter les deux clés (convert-prospect.ts pose prospect_id ET
    // student_id) : dédoublonnée par id plutôt que listée deux fois.
    const fusion = new Map([...(parProspect ?? []), ...(parEtudiant ?? [])].map((p) => [p.id, p]))
    setPaiements([...fusion.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)))

    if (profilData) {
      const { data: inscriptionVague } = await supabase
        .from('cohort_enrollments')
        .select('cohort_id, cohort_class_id')
        .eq('student_id', profilData.id)
        .maybeSingle()
      setVagueId(inscriptionVague?.cohort_id ?? null)
      setClasseId(inscriptionVague?.cohort_class_id ?? null)

      /* Heures consommées DANS CETTE VAGUE précisément : jointure manuelle sessions→hour_ledger
         (pas de select imbriqué, piège déjà rencontré sur adopter-seances.ts) plutôt que
         `student_hours_summary`, qui cumule TOUTE la vie du dossier — compterait aussi les heures
         d'une vague précédente si l'élève en a déjà changé, déclarant un parcours terminé avant
         même d'avoir commencé le nouveau. */
      if (inscriptionVague?.cohort_id) {
        const { data: seancesVague } = await supabase.from('sessions').select('id').eq('cohort_id', inscriptionVague.cohort_id)
        const sessionIds = (seancesVague ?? []).map((s) => s.id)
        const { data: debits } = sessionIds.length
          ? await supabase.from('hour_ledger').select('heures').eq('student_id', profilData.id).eq('type_ecriture', 'debit_etudiant').in('session_id', sessionIds)
          : { data: [] as { heures: number }[] }
        setHeuresConsommeesVague((debits ?? []).reduce((total, d) => total + Number(d.heures), 0))
      } else {
        setHeuresConsommeesVague(null)
      }
    } else {
      setVagueId(null)
      setClasseId(null)
      setHeuresConsommeesVague(null)
    }

    setChargement(false)
  }, [ligne.prospectId])

  useEffect(() => {
    rechargerDossier()
  }, [rechargerDossier])

  async function toutRecharger() {
    await rechargerDossier()
    onChange()
  }

  /* Fait passer le candidat de « Test oral planifié » à « Test oral passé » — bug trouvé le
     2026-10-19 : depuis que le quiz terminé retire un candidat collectif du tableau Prospects
     (demande client du 2026-10-19, point 3), plus aucun écran ne pouvait faire avancer ce statut.
     Il ne vivait jusque-là QUE dans PipelineCRM.tsx (bouton « Marquer le test comme fait »,
     accessible seulement depuis Prospects) — en retirant ces candidats de ce tableau, cette action
     était devenue inaccessible pour eux, laissant « Test oral planifié » affiché indéfiniment
     même après la date de la session, y compris pour un candidat dont l'oral a réellement eu
     lieu. Ici, aucune donnée du quiz ni de l'oral n'est réécrite : le niveau final se saisit à la
     conversion (ConvertirCandidatCollectif), ce bouton ne fait avancer que le statut. */
  async function marquerOralPasse() {
    if (!prospect) return
    setMarquageOralEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('prospects').update({ statut: 'diagnostic_fait' }).eq('id', prospect.id)
    setMarquageOralEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    await toutRecharger()
  }

  // Inscription réelle (`cohort_enrollments`, rechargée dans `vagueId`) une fois converti ; tant
  // que ce n'est pas le cas, `vagueId` reste à `null` (rien à charger sans profil) et la vague
  // VISÉE vient de `ligne.vagueId`, déjà résolue par construireSuiviCollectif depuis la session
  // de test choisie. Sans ce repli, la vague visée d'un candidat pas encore converti restait
  // vide dans la fiche alors que la table, juste derrière, l'affichait correctement.
  const vagueActuelle = cohortes.find((c) => c.id === vagueId) ?? null
  const vagueAffichee = profilEtudiant ? vagueActuelle : (cohortes.find((c) => c.id === ligne.vagueId) ?? null)
  const etablissementId = profilEtudiant?.etablissement_id ?? prospect?.etablissement_id
  const etablissement = useEtablissement(etablissementId)
  const etape = profilEtudiant ? 'etudiant' : (prospect?.statut ?? ligne.etape)
  /* Même formule que CohortesAdmin.tsx (ligne de vague) : le forfait propre à la vague prime,
     sinon le défaut de l'établissement. */
  const heuresForfaitVague = vagueActuelle?.heures_forfait ?? etablissement?.heures_forfait_collectif ?? 32
  const parcoursTermine =
    !!profilEtudiant && !!vagueActuelle && parcoursCollectifTermine(heuresConsommeesVague ?? 0, heuresForfaitVague)
  /* Le PROFIL fait foi une fois converti — c'est lui que modifie InformationsPersonnelles juste
     en dessous, jamais `prospects` (même règle qu'ailleurs dans le Suivi, voir
     construireSuiviCollectif.ts). Afficher le nom du prospect ici une fois converti aurait montré
     un titre de fenêtre qui contredit le panneau d'identité affiché juste dessous. */
  const nom = profilEtudiant
    ? `${profilEtudiant.prenom} ${profilEtudiant.nom}`
    : prospect
      ? `${prospect.prenom} ${prospect.nom}`
      : ligne.nom
  const niveauPourFrais = ligne.niveauFinal ?? ligne.niveauTest
  const classeAnnoncee = profilEtudiant ? null : classePrevue(ligne)

  return (
    <Modale titre={nom} onFermer={onFermer} largeurMax={620}>
      {chargement || !prospect ? (
        <EtatChargement lignes={4} hauteur={50} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {erreur && <MessageErreur>{erreur}</MessageErreur>}
          {succes && <MessageSucces>{succes}</MessageSucces>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                borderRadius: 999,
                padding: '3px 10px',
                color: profilEtudiant ? 'var(--accent-teal)' : 'var(--accent-gold, #e9cf94)',
                background: profilEtudiant ? 'rgba(111,227,192,.14)' : 'rgba(233,207,148,.14)',
                border: `1px solid ${profilEtudiant ? 'rgba(111,227,192,.4)' : 'rgba(233,207,148,.4)'}`,
              }}
            >
              {LIBELLE_ETAPE_COLLECTIF[etape]}
            </span>
            {/* Visible seulement tant que l'oral n'a pas déjà été marqué passé ni le candidat
                converti — une fois « Test oral passé », la seule suite possible est la
                conversion, juste en dessous. */}
            {!profilEtudiant && prospect.statut === 'diagnostic_planifie' && (
              <button
                onClick={marquerOralPasse}
                disabled={marquageOralEnCours}
                style={{ ...boutonSecondaireStyle, opacity: marquageOralEnCours ? 0.6 : 1 }}
              >
                {marquageOralEnCours ? 'Enregistrement…' : 'Marquer le test oral comme passé'}
              </button>
            )}
            {/* Suppression complète — demande client du 2026-10-19 : « dans la section des cours
                collectifs, il faut rajouter la possibilité de supprimer complètement un
                étudiant », précisée à la capture suivante : le bouton doit être sur CETTE fiche,
                à n'importe quelle étape du candidat — pas seulement une fois converti. Jusqu'ici,
                supprimer un candidat collectif obligeait à retrouver sa trace ailleurs : la page
                Étudiants (une fois converti, via SupprimerCompte) ou le pipeline Prospects (avant
                conversion, via SupprimerProspect) — or un candidat collectif dont le quiz est
                terminé a justement disparu du pipeline (demande 3 du même chantier), le laissant
                sans AUCUN moyen de suppression tant qu'il n'était pas converti.

                Les deux mêmes composants qu'ailleurs, choisis selon l'étape : même comportement,
                mêmes garanties, même texte de confirmation — y compris la disparition
                automatique de la ligne au Suivi (construireSuiviCollectif.ts exclut déjà tout
                profil suspendu et toute suppression de prospect fait disparaître la ligne de la
                table source). Un candidat qui a déjà réglé ses frais d'inscription part avec son
                encaissement, mais jamais à l'aveugle : SupprimerProspect demande une deuxième
                confirmation qui affiche les montants concernés (décision client du 2026-10-19,
                après que le refus pur et simple l'ait laissé sans issue). */}
            <span style={{ marginLeft: 'auto' }}>
              {profilEtudiant ? (
                <SupprimerCompte
                  personne={profilEtudiant}
                  onSupprime={() => {
                    onChange()
                    onFermer()
                  }}
                />
              ) : (
                <SupprimerProspect
                  prospects={[{ id: prospect.id, prenom: prospect.prenom, nom: prospect.nom }]}
                  onSupprime={() => {
                    onChange()
                    onFermer()
                  }}
                />
              )}
            </span>
          </div>

          {/* Identité : éditée dans `profiles` une fois converti (source de vérité partout
              ailleurs dans l'app, voir InformationsPersonnelles.tsx), dans `prospects` tant que
              ce n'est pas le cas — jamais les deux en même temps. */}
          {profilEtudiant ? (
            <InformationsPersonnelles personne={profilEtudiant} onChange={toutRecharger} carte={false} />
          ) : (
            <EditerIdentiteProspect prospect={prospect} onChange={toutRecharger} />
          )}

          {/* Parcours collectif : lecture seule pour la session orale et les niveaux (déjà
              couverts par Session orale/la conversion elle-même), modifiable pour la vague et la
              classe une fois converti. */}
          <GroupeSection titre="Parcours collectif">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <LigneInfo
                label="Session orale"
                valeur={ligne.sessionOrale ? formaterDansFuseauEtablissement(ligne.sessionOrale) : '—'}
              />
              <LigneInfo
                label="Vague"
                valeur={vagueAffichee ? nomVagueSeul(vagueAffichee.nom) : '—'}
              />
              <LigneInfo
                label="Classe"
                valeur={ligne.classe ?? (classeAnnoncee ? `${classeAnnoncee} (prévue)` : '—')}
              />
              <LigneInfo label="Niveau — quiz écrit" valeur={ligne.niveauTest ?? '—'} />
              <LigneInfo
                label="Niveau — test oral"
                valeur={ligne.niveauFinal ? <strong style={{ color: 'var(--accent-teal)' }}>{ligne.niveauFinal}</strong> : '—'}
              />
              {profilEtudiant && vagueActuelle && (
                <LigneInfo
                  label="Heures du parcours"
                  valeur={
                    <span style={{ color: parcoursTermine ? 'var(--accent-gold, #e9cf94)' : undefined, fontWeight: parcoursTermine ? 700 : undefined }}>
                      {formaterHeures(heuresConsommeesVague ?? 0)} / {formaterHeures(heuresForfaitVague)}
                      {parcoursTermine ? ' · parcours terminé' : ''}
                    </span>
                  }
                />
              )}
            </div>

            {/* Fin de parcours — demande client du 2026-10-11 : « quand toutes les heures seront
                consommées [...] un bouton évaluer l'étudiant apparaîtra [...] l'admin doit lui
                attribuer une nouvelle classe, et une nouvelle vague, et pourra également modifier
                son niveau. La validation sera toujours précédée d'un enregistrement de
                paiement. » Volontairement distinct de « Changer de vague »/« Changer de classe »
                juste en dessous : ceux-là sont des corrections ponctuelles sans effet sur le
                niveau ni les frais, celui-ci est le parcours GUIDÉ de fin de cycle, complet. */}
            {parcoursTermine && (
              <div style={{ marginTop: 10 }}>
                <MessageInfo>
                  Ce parcours est terminé : toutes les heures de la vague ont été consommées. Réévaluez l'élève pour
                  l'attribuer à sa prochaine vague et classe.
                </MessageInfo>
                <button
                  onClick={() => setReevaluerOuvert(true)}
                  className="btn-shine"
                  style={{ ...boutonPrimaireStyle, width: '100%', marginTop: 8 }}
                >
                  Évaluer l'étudiant
                </button>
              </div>
            )}

            {profilEtudiant && etablissementId && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <AssignerVague
                  studentId={profilEtudiant.id}
                  etablissementId={etablissementId}
                  vagueActuelle={vagueActuelle}
                  onTermine={toutRecharger}
                />
                {/* Changer la CLASSE sans repasser par le choix de la vague — demande client du
                    2026-10-11. N'a de sens que dans une vague déjà choisie (vagueId). */}
                {vagueId && (
                  <ChangerClasseEtudiant
                    studentId={profilEtudiant.id}
                    cohortId={vagueId}
                    classeActuelleId={classeId}
                    onTermine={toutRecharger}
                  />
                )}
              </div>
            )}
          </GroupeSection>

          {/* Frais et autres paiements : chaque ligne ouvre la fiche complète (acomptes, reçu,
              facture — DetailPaiementModale.tsx), déjà construite ailleurs dans l'app plutôt que
              réinventée ici.

              Affichée dès qu'il y a quelque chose à montrer, plus seulement une fois converti —
              bug trouvé le 2026-10-19 : les frais d'inscription sont encaissés dès l'étape
              prospect (0056), et cette section restait pourtant invisible avant la conversion.
              Un admin doit pouvoir voir et traiter un encaissement dès ce stade, sans attendre la
              conversion — y compris pour le supprimer seul, sans toucher au candidat (supprimer le
              candidat emporte désormais ses encaissements, mais c'est l'autre geste). Le bouton « Enregistrer les frais
              d'inscription » reste réservé à un étudiant déjà converti (`profilEtudiant`) : avant
              conversion, c'est « Convertir en étudiant » plus bas qui porte cette saisie. */}
          {(profilEtudiant || (paiements?.length ?? 0) > 0) && (
            <GroupeSection titre="Paiements">
              {paiements === null ? (
                <EtatChargement lignes={1} hauteur={34} />
              ) : paiements.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0 }}>Aucun paiement enregistré.</p>
                  <button onClick={() => setCreerFraisOuvert(true)} style={boutonSecondaireStyle}>
                    Enregistrer les frais d’inscription
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {paiements.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPaiementOuvert(p)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 11px',
                        borderRadius: 9,
                        background: 'var(--voile-doux, rgba(255,255,255,.03))',
                        border: '1px solid var(--border-soft)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                      }}
                    >
                      <BadgeStatutPaiement statut={statutReglement(p)} />
                      <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flexGrow: 1 }}>
                        {p.notes || 'Paiement'}
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{formaterMontant(p.montant, p.devise)}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Relance du règlement, avec son historique — demande client du 2026-10-19 :
                  « pour les cours collectifs, il faudrait également rajouter un bouton de relance
                  de paiement [...] rattacher un historique de relance également ». Même bouton,
                  même modèle d'e-mail (1.4) et même journal que pour l'individuel et le DUO : un
                  candidat collectif qui n'a pas réglé est exactement dans la même situation,
                  diagnostic passé et place en attente de confirmation.

                  Proposé tant que rien n'est encore réglé — une fois les frais encaissés, le
                  candidat n'attend plus que sa conversion, qui n'est pas une affaire de relance. */}
              {!profilEtudiant && (paiements ?? []).every((p) => statutReglement(p) !== 'paye') && (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
                  <PanneauRelances cible={{ prospectId: prospect.id, motif: 'paiement_a_regler' }} libelle="Relancer le paiement" />
                </div>
              )}
            </GroupeSection>
          )}

          {/* Conversion : seulement tant que la personne n'est pas déjà étudiante. Le paiement
              des frais est imposé par la fenêtre elle-même (ConvertirCandidatCollectif), jamais
              contournable depuis ici. */}
          {!profilEtudiant && (
            <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
              <button onClick={() => setConvertirOuvert(true)} className="btn-shine" style={{ ...boutonPrimaireStyle, width: '100%' }}>
                Convertir en étudiant
              </button>
            </div>
          )}
        </div>
      )}

      {convertirOuvert && prospect && (
        <ConvertirCandidatCollectif
          prospect={prospect}
          niveauEstimeParDefaut={ligne.niveauTest}
          onFermer={() => setConvertirOuvert(false)}
          onConverti={(resultat) => {
            setConvertirOuvert(false)
            const classeDite = resultat.niveauDetecte
              ? resultat.classeAssignee
                ? `Classe ${LABEL_NIVEAU_CLASSE[resultat.niveauDetecte]} assignée automatiquement.`
                : `Niveau ${LABEL_NIVEAU_CLASSE[resultat.niveauDetecte]} : aucune classe disponible, à créer ou compléter depuis l’onglet Vagues.`
              : 'Niveau non déterminé : affectez la classe à la main.'
            setSucces(`${nom} est maintenant étudiant·e. ${classeDite}`)
            toutRecharger()
          }}
        />
      )}

      {reevaluerOuvert && profilEtudiant && etablissementId && (
        <ReevaluerEtudiantCollectif
          etudiant={{
            profilId: profilEtudiant.id,
            prospectId: ligne.prospectId,
            etablissementId,
            nom,
            niveauActuel: ligne.niveauFinal ?? ligne.niveauTest,
          }}
          onFermer={() => setReevaluerOuvert(false)}
          onEvalue={() => {
            setReevaluerOuvert(false)
            setSucces(`${nom} a été réévalué·e et affecté·e à sa nouvelle vague.`)
            toutRecharger()
          }}
        />
      )}

      {creerFraisOuvert && etablissementId && (
        <FraisInscriptionCollectifModale
          nomCandidat={nom}
          niveau={niveauPourFrais}
          etablissementId={etablissementId}
          contexte="complement"
          enCours={enCoursFrais}
          erreur={erreurFrais}
          onFermer={() => {
            if (enCoursFrais) return
            setCreerFraisOuvert(false)
            setErreurFrais(null)
          }}
          onValider={async (frais: FraisInscription) => {
            if (!profile || !profilEtudiant) return
            setEnCoursFrais(true)
            setErreurFrais(null)
            const { error } = await supabase.from('student_payments').insert({
              etablissement_id: etablissementId,
              student_id: profilEtudiant.id,
              prospect_id: ligne.prospectId,
              montant: frais.montant,
              montant_regle: frais.regle ? frais.montant : 0,
              statut: frais.regle ? 'paye' : 'attendu',
              date_paiement: frais.regle ? new Date().toISOString().slice(0, 10) : null,
              moyen_paiement: frais.moyenPaiement || null,
              reference: frais.reference || null,
              notes: frais.notes || "Frais d'inscription — cours collectifs",
              created_by_profile_id: profile.id,
            })
            setEnCoursFrais(false)
            if (error) {
              setErreurFrais(error.message)
              return
            }
            setCreerFraisOuvert(false)
            toutRecharger()
          }}
        />
      )}

      {paiementOuvert && prospect && (
        <DetailPaiementModale
          cible={
            profilEtudiant
              ? ({
                  type: 'etudiant',
                  paiement: paiementOuvert,
                  personne: profilEtudiant,
                  forfait: null,
                  professeur: null,
                } satisfies CiblePaiement)
              : /* Candidat pas encore converti (2026-10-19) : les frais d'inscription
                   encaissés avant conversion (0056) restent rattachés au PROSPECT, pas à un
                   profil qui n'existe pas encore. `tarif: null` ne sert qu'à la création d'une
                   nouvelle ligne (`CreationLignePaiement`) — on en ouvre ici une qui existe
                   déjà (`paiementOuvert`), jamais lue dans ce cas. */
                ({
                  type: 'prospect',
                  prospect: { id: prospect.id, etablissement_id: prospect.etablissement_id, prenom: prospect.prenom, nom: prospect.nom },
                  tarif: null,
                  paiement: paiementOuvert,
                } satisfies CiblePaiement)
          }
          onFermer={() => setPaiementOuvert(null)}
          onChange={toutRecharger}
        />
      )}
    </Modale>
  )
}
