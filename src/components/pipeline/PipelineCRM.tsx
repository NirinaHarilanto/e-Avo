import { useState, type DragEvent, type FormEvent } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { formaterDansFuseauEtablissement } from '../../lib/etablissement'
import { estRempli, niveauDepuisReponses, rythmeDepuisReponses, type ReponsesDiagnostic } from '../../lib/diagnostic'
import { FormulaireDiagnosticCall } from '../prospects/FormulaireDiagnosticCall'
import { PlanifierAppelDiagnosticModale } from '../admin/PlanifierAppelDiagnosticModale'
import { DetailPaiementModale } from '../paiements/DetailPaiementModale'
import { BadgeStatutPaiement } from '../shared/BadgeStatutPaiement'
import { formaterMontant, resteAPayer, statutReglement } from '../../lib/paiements'
import { useTarifs } from '../../hooks/useTarifs'
import type { ProspectStatut, TypeProgrammeProspect } from '../../types/database.types'
import { COLONNES_PIPELINE, useProspectsPipeline, type ProspectAvecDiagnostic } from '../../hooks/useProspectsPipeline'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { Modale } from '../ui/Modale'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { champStyle } from '../ui/Champ'
import { Icone } from '../ui/Icones'

const COULEUR_COLONNE: Record<string, string> = {
  prospect: '#8b96b8',
  diagnostic_planifie: '#e9cf94',
  diagnostic_fait: '#5eb3ff',
  etudiant: '#6fe3c0',
}

export function PipelineCRM() {
  const { profile, session } = useProfileContext()
  const { prospects, totalConvertis, loading, erreur, recharger } = useProspectsPipeline()
  const [colonneSurvolee, setColonneSurvolee] = useState<ProspectStatut | null>(null)
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)

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
    // depuis la landing via une réservation en ligne), on en crée un minimal à la volée.
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
    // Un binôme DUO glissé (voir `CarteDuo`) transporte les deux id séparés par une virgule —
    // les deux dossiers avancent toujours ensemble (demande client du 2026-09-22, « traités par
    // groupe mais pas individuellement »), jamais l'un sans l'autre.
    const idsTransportes = e.dataTransfer.getData('text/plain').split(',').filter(Boolean)
    /* La mutation d'état (et donc le rechargement qui déplace immédiatement la carte vers une
       autre colonne) est reportée après la fin du cycle natif de glisser-déposer du navigateur —
       demande client du 2026-09-16, « ça bloque et fait planter l'application ». `drop` survient
       AVANT `dragend` : muter l'état React ici démontait le nœud DOM d'origine (déplacé vers une
       autre colonne au prochain rendu) alors que le navigateur tenait encore une référence active
       dessus pour terminer son propre geste de glisser-déposer, ce qui plantait l'interaction. Un
       délai de 0 ms suffit à laisser `dragend` se terminer d'abord — il s'exécute forcément avant,
       puisqu'il fait partie de la même file d'événements synchrones que `drop`, alors qu'un
       `setTimeout` est toujours placé après dans la file. */
    setTimeout(() => {
      for (const id of idsTransportes) {
        const prospect = prospects.find((p) => p.id === id)
        if (prospect) changerStatut(prospect, statutCible)
      }
    }, 0)
  }

  return (
    <AdminLayout actif="Prospects">
      <EnTetePage
        compact
        titre="Prospects"
        description="Le parcours d’un candidat, de sa demande initiale jusqu’à sa conversion en étudiant. Chaque colonne est une étape : faites glisser une carte vers la colonne suivante pour faire avancer le dossier."
        actions={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setFormulaireOuvert(true)} className="btn-shine" style={boutonPrimaireStyle}>
              <Icone nom="plus" taille={15} />
              Ajouter un prospect
            </button>
            <button onClick={() => recharger()} className="btn-shine" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--border)', color: 'var(--ink-2)' }}>
              Actualiser
            </button>
          </div>
        }
      />

      <GuidePage
        id="admin-prospects"
        compact
        etapes={[
          <>
            Les nouveaux dossiers arrivent seuls dans la première colonne : ils viennent du formulaire de contact de
            votre page vitrine publique, ou de <strong>Ajouter un prospect</strong> si vous les saisissez vous-même
            (un candidat pas encore passé par un appel diagnostic ou de positionnement).
          </>,
          <>
            <strong>Glissez une carte</strong> d’une colonne à l’autre pour changer son statut, ou utilisez les boutons
            de la carte si vous préférez ne pas faire de glisser-déposer.
          </>,
          <>
            Dépliez une carte pour planifier l’appel diagnostic, puis y noter le <strong>niveau évalué</strong> et le
            rythme convenu : ces informations suivront l’élève dans son dossier. Un rendez-vous réservé en ligne par
            le prospect lui-même affiche sa date, son lien de visioconférence et son statut de validation.
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
              /* Un prospect converti quitte aussitôt ce tableau (demande client du 2026-09-21) :
                 le taux se calcule donc contre le total historique (`totalConvertis`, compté à
                 part côté serveur), pas contre les seuls dossiers encore affichés ici. */
              valeur={`${Math.round((totalConvertis / (prospects.length + totalConvertis || 1)) * 100)} %`}
              ton="teal"
              aide={`${totalConvertis} dossier(s) devenu(s) étudiant`}
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
                {grouperDuo(items).map((groupe) =>
                  Array.isArray(groupe) ? (
                    <CarteDuo key={groupe[0].id} paire={groupe} onChange={recharger} onChangerStatut={changerStatut} />
                  ) : (
                    <CarteProspect key={groupe.id} prospect={groupe} onChange={recharger} onChangerStatut={changerStatut} />
                  ),
                )}
              </div>
            )
          })}
        </div>
      )}

      {formulaireOuvert && profile && (
        <FormulaireNouveauProspect
          etablissementId={profile.etablissement_id}
          onFermer={() => setFormulaireOuvert(false)}
          onCree={() => {
            setFormulaireOuvert(false)
            recharger()
          }}
        />
      )}
    </AdminLayout>
  )
}

const LABEL_PROGRAMME: Record<string, string> = {
  individuel: 'Individuel',
  duo: 'Duo',
  collectif: 'Collectif',
}

/* Saisie manuelle d'un prospect qui n'est jamais passé par le formulaire public — démarché
   directement, recommandé par un élève, etc. (demande client du 2026-09-16). Insertion directe
   depuis le client : la policy `prospects_admin_all` (migration 0005) autorise déjà tout admin de
   l'établissement à écrire dans `prospects`, pas besoin d'un endpoint dédié. Le dossier entre
   toujours dans la première colonne (« pas encore passé un appel diagnostic ou de
   positionnement »), exactement comme un prospect arrivé par la landing. */
function FormulaireNouveauProspect({
  etablissementId,
  onFermer,
  onCree,
}: {
  etablissementId: string
  onFermer: () => void
  onCree: () => void
}) {
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [langueVisee, setLangueVisee] = useState('')
  const [objectif, setObjectif] = useState('')
  const [typeProgramme, setTypeProgramme] = useState<TypeProgrammeProspect>('individuel')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function creer(e: FormEvent) {
    e.preventDefault()
    if (!nom.trim() || !prenom.trim() || !email.trim()) {
      setErreur('Nom, prénom et e-mail sont obligatoires.')
      return
    }
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('prospects').insert({
      etablissement_id: etablissementId,
      statut: 'prospect',
      nom: nom.trim(),
      prenom: prenom.trim(),
      email: email.trim().toLowerCase(),
      telephone: telephone.trim() || null,
      langue_visee: langueVisee.trim() || null,
      objectif: objectif.trim() || null,
      type_programme: typeProgramme,
    })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onCree()
  }

  return (
    <Modale titre="Ajouter un prospect" onFermer={onFermer} largeurMax={460}>
      <form onSubmit={creer} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)', margin: 0 }}>
          Pour un candidat pas encore passé par un appel diagnostic ou de positionnement — démarché directement,
          recommandé, ou rencontré hors ligne. Le dossier entre dans la colonne « Nouveaux prospects ».
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <input required placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} style={{ ...champStyle, flex: 1 }} />
          <input required placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} style={{ ...champStyle, flex: 1 }} />
        </div>
        <input required type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} style={champStyle} />
        <input placeholder="Téléphone (facultatif)" value={telephone} onChange={(e) => setTelephone(e.target.value)} style={champStyle} />
        <input placeholder="Langue visée (facultatif)" value={langueVisee} onChange={(e) => setLangueVisee(e.target.value)} style={champStyle} />
        <textarea
          placeholder="Objectif (facultatif)"
          value={objectif}
          onChange={(e) => setObjectif(e.target.value)}
          rows={2}
          style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Programme visé</label>
          <select value={typeProgramme} onChange={(e) => setTypeProgramme(e.target.value as TypeProgrammeProspect)} style={champStyle}>
            <option value="individuel">Individuel</option>
            <option value="duo">Duo</option>
            <option value="collectif">Collectif</option>
          </select>
        </div>
        {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erreur}</p>}
        <button type="submit" disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, opacity: enCours ? 0.7 : 1 }}>
          {enCours ? 'Création…' : 'Créer le dossier'}
        </button>
      </form>
    </Modale>
  )
}

/* Tag « À traiter » (demande client du 2026-09-22) : distingue au premier coup d'œil, dans une
   colonne dense, les blocs qui attendent une décision de l'admin de ceux qui suivent simplement
   leur cours normal. Trois cas concrets :
   - un rendez-vous que le prospect a réservé lui-même, jamais encore validé ;
   - le diagnostic fait mais aucun paiement encore enregistré (bloque la conversion, voir
     BlocPaiementForfait plus bas) ;
   - un nouveau prospect qui n'a même pas encore de rendez-vous planifié.
   Extraite de CarteProspect pour être réutilisée par CarteDuo (0058), qui doit lever le badge dès
   qu'UN SEUL des deux membres du binôme a besoin d'une action. */
function prospectATraiter(prospect: ProspectAvecDiagnostic) {
  return (
    (prospect.statut === 'diagnostic_planifie' && prospect.rendezVous?.statut === 'en_attente') ||
    (prospect.statut === 'diagnostic_fait' && !prospect.paiement) ||
    (prospect.statut === 'prospect' && !prospect.rendezVous)
  )
}

/* Regroupe les binômes DUO présents dans une même colonne en un seul bloc visuel (0058, demande
   client du 2026-09-22 : « traités par groupe mais pas individuellement », un seul bloc pour
   Sandra/Bensas plutôt que deux cartes séparées). Un binôme dont les deux membres n'ont pas
   (encore) le même statut — l'un a avancé plus vite que l'autre — retombe sur deux cartes
   individuelles classiques, chacune affichant déjà le nom du partenaire (`duoPartenaireNom`) :
   rien ne permettrait de les représenter dans une seule colonne. */
function grouperDuo(
  items: ProspectAvecDiagnostic[],
): (ProspectAvecDiagnostic | [ProspectAvecDiagnostic, ProspectAvecDiagnostic])[] {
  const traites = new Set<string>()
  const groupes: (ProspectAvecDiagnostic | [ProspectAvecDiagnostic, ProspectAvecDiagnostic])[] = []
  for (const prospect of items) {
    if (traites.has(prospect.id)) continue
    const partenaire = prospect.duo_partenaire_id ? items.find((p) => p.id === prospect.duo_partenaire_id) : undefined
    if (partenaire && !traites.has(partenaire.id)) {
      groupes.push([prospect, partenaire])
      traites.add(prospect.id)
      traites.add(partenaire.id)
    } else {
      groupes.push(prospect)
      traites.add(prospect.id)
    }
  }
  return groupes
}

interface CarteProspectProps {
  prospect: ProspectAvecDiagnostic
  onChange: () => void
  onChangerStatut: (prospect: ProspectAvecDiagnostic, nouveauStatut: ProspectStatut) => Promise<void>
  /* Rendu à l'intérieur d'un bloc CarteDuo (0058) : pas de carte ni de glisser-déposer propres —
     seuls la ligne d'identité repliée et la fenêtre de détail au clic sont conservées, le geste
     de glisser-déposer étant porté par le bloc englobant pour déplacer les deux dossiers
     ensemble. */
  dansGroupeDuo?: boolean
}

function CarteProspect({ prospect, onChange, onChangerStatut, dansGroupeDuo = false }: CarteProspectProps) {
  const { profile, session } = useProfileContext()
  const estPositionnement = prospect.type_programme === 'collectif'
  const necessiteAction = prospectATraiter(prospect)
  const [ouvert, setOuvert] = useState(false)
  const [planificationOuverte, setPlanificationOuverte] = useState(false)
  const [reponses, setReponses] = useState<ReponsesDiagnostic>(prospect.diagnostic?.reponses ?? {})
  const [questionnaireOuvert, setQuestionnaireOuvert] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enGlissement, setEnGlissement] = useState(false)
  const [detailOuvert, setDetailOuvert] = useState(false)
  const [validationEnCours, setValidationEnCours] = useState(false)
  const [relanceEnCours, setRelanceEnCours] = useState(false)
  const [relanceEnvoyee, setRelanceEnvoyee] = useState(false)
  const [paiementOuvert, setPaiementOuvert] = useState(false)

  // Forfait choisi par le prospect (0054) : liste filtrée sur son programme, individuel/collectif
  // exclu du duo et réciproquement — pas de sens de proposer un forfait duo à un individuel.
  const { tarifs } = useTarifs(prospect.etablissement_id)
  const tarifsDuProgramme = tarifs.filter((t) => t.type_programme === (prospect.type_programme ?? 'individuel'))
  const tarifChoisi = tarifs.find((t) => t.id === prospect.tarif_choisi_id) ?? null
  /* Heure d'essai (0057) : l'élève commence par 1 h au tarif horaire, puis décide. C'est donc ce
     tarif-là qu'il faut encaisser avant la conversion, pas le prix du forfait visé. Le tarif
     horaire est celui de SON programme avec `heures = 1` — sans lui, l'essai n'est pas
     proposable (rien ne permettrait de le facturer). */
  const tarifUneHeure = tarifsDuProgramme.find((t) => t.heures === 1) ?? null
  const essai = prospect.essai_demande
  const tarifAEncaisser = essai ? tarifUneHeure : tarifChoisi
  /* Un simple acompte suffit à débloquer la conversion : le client parle d'« enregistrer le
     paiement », pas d'exiger le solde complet — un forfait se règle souvent en plusieurs fois
     (voir paiement_versements, 0049). Le reste dû reste visible dans le dossier de l'étudiant. */
  const paiementEnregistre = !!prospect.paiement

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

    /* `notes` n'est plus écrite ici : la zone de saisie libre a été retirée de la fiche
       (demande client du 2026-09-21, la trame structurée la remplace). La colonne existe
       toujours et garde ce qui y avait été saisi auparavant — la réécrire depuis un champ
       disparu l'aurait effacée. */
    const { error: updateDiagError } = await supabase
      .from('diagnostic_calls')
      .update({
        niveau_evalue: niveauDepuisReponses(reponses),
        rythme_convenu: rythmeDepuisReponses(reponses),
        reponses,
      })
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

  /* Enregistre niveau / rythme / notes SANS changer de colonne — contrairement à
     `marquerRealise()`, qui fait les deux à la fois au moment de la transition. Une fois dans
     « Diagnostic réalisé », ces trois champs doivent rester modifiables (demande client du
     2026-09-16 : « son niveau modifiable et les résultats de l'appel », avec une zone libre à
     l'écriture pour les notes de l'admin). */
  async function enregistrerDiagnostic() {
    if (!profile) return
    setEnCours(true)
    setErreur(null)

    let diagnosticId = prospect.diagnostic?.id ?? null
    if (!diagnosticId) {
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

    const { error } = await supabase
      .from('diagnostic_calls')
      .update({
        niveau_evalue: niveauDepuisReponses(reponses),
        rythme_convenu: rythmeDepuisReponses(reponses),
        reponses,
      })
      .eq('id', diagnosticId)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  async function choisirTarif(tarifId: string) {
    setErreur(null)
    const { error } = await supabase.from('prospects').update({ tarif_choisi_id: tarifId || null }).eq('id', prospect.id)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  async function basculerEssai(valeur: boolean) {
    setErreur(null)
    const { error } = await supabase.from('prospects').update({ essai_demande: valeur }).eq('id', prospect.id)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  async function relancerProspect() {
    if (!session) return
    setRelanceEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/relancer-prospect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ prospectId: prospect.id }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
    setRelanceEnCours(false)
    if (reponse.error) {
      setErreur(reponse.error)
      return
    }
    setRelanceEnvoyee(true)
  }

  async function validerRendezVous() {
    if (!session || !prospect.rendezVous) return
    setValidationEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/valider-rendez-vous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ rendezVousId: prospect.rendezVous.id, decision: 'confirmer' }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
    setValidationEnCours(false)
    if (reponse.error) {
      setErreur(reponse.error)
      return
    }
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
          glissé, les deux interactions ne se marchent donc pas dessus.
          Rendu compact (0058) : dans un binôme DUO, ce composant est imbriqué dans `CarteDuo`,
          qui porte déjà la carte externe et le glisser-déposer du groupe — ici, plus qu'une
          simple ligne d'identité cliquable, sans carte ni poignée de glisser propres. */}
      {dansGroupeDuo ? (
        <div onClick={() => setDetailOuvert(true)} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
          <span style={{ width: 26, height: 26, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 10.5, fontWeight: 800, flexShrink: 0 }}>
            {(prospect.prenom[0] ?? '').toUpperCase()}
            {(prospect.nom[0] ?? '').toUpperCase()}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
              {prospect.prenom} {prospect.nom}
            </span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>{prospect.langue_visee || 'Langue non précisée'}</span>
          </div>
          {necessiteAction && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                color: '#fff',
                background: 'var(--danger)',
                borderRadius: 999,
                padding: '2px 7px',
                flexShrink: 0,
              }}
            >
              À traiter
            </span>
          )}
        </div>
      ) : (
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
          style={{
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
            cursor: 'grab',
            opacity: enGlissement ? 0.4 : 1,
            position: 'relative',
            borderColor: necessiteAction ? 'rgba(255,138,112,.5)' : undefined,
          }}
        >
          {necessiteAction && (
            <span
              style={{
                position: 'absolute',
                top: -8,
                right: 8,
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                color: '#fff',
                background: 'var(--danger)',
                borderRadius: 999,
                padding: '2px 8px',
                boxShadow: '0 3px 10px rgba(255,138,112,.4)',
              }}
            >
              À traiter
            </span>
          )}
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

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {prospect.type_programme && (
              <span
                style={{
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
            {/* Binôme DUO dont les membres n'ont pas (encore) le même statut (0058) : ils ne
                peuvent pas être regroupés en un seul bloc (voir `grouperDuo`), ce repère évite
                au moins de les traiter comme deux prospects sans rapport. */}
            {prospect.duoPartenaireNom && (
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)', border: '1px solid rgba(233,207,148,.32)', borderRadius: 999, padding: '2px 9px' }}>
                Duo avec {prospect.duoPartenaireNom}
              </span>
            )}
          </div>
        </div>
      )}

      {detailOuvert && (
        <Modale titre={`${prospect.prenom} ${prospect.nom}`} onFermer={() => setDetailOuvert(false)} largeurMax={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Informations personnelles — demandées explicitement par le client le 2026-09-16
                pour les fiches « Appel diagnostic planifié » et « Diagnostic réalisé », affichées
                ici pour toutes les étapes puisqu'elles ne coûtent rien à montrer plus tôt. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{prospect.langue_visee || 'Langue non précisée'}</span>
              <a href={`mailto:${prospect.email}`} style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                {prospect.email}
              </a>
              {prospect.telephone && (
                <a href={`tel:${prospect.telephone}`} style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                  {prospect.telephone}
                </a>
              )}
            </div>

            {prospect.objectif && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Objectif indiqué à la réservation
                </span>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)', background: 'rgba(0,0,0,.24)', borderRadius: 10, padding: '10px 12px', margin: 0 }}>
                  « {prospect.objectif} »
                </p>
              </div>
            )}

            {prospect.statut === 'diagnostic_planifie' && (
              <PostItRendezVous
                prospect={prospect}
                validationEnCours={validationEnCours}
                onValider={validerRendezVous}
              />
            )}

            {prospect.testPositionnement && <BilanTestPositionnement test={prospect.testPositionnement} />}

            {prospect.statut === 'diagnostic_fait' && prospect.diagnostic?.niveau_evalue && (
              <span style={{ alignSelf: 'flex-start', fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)', background: 'rgba(94,179,255,.14)', border: '1px solid rgba(94,179,255,.3)', borderRadius: 999, padding: '5px 11px' }}>
                Niveau évalué {prospect.diagnostic.niveau_evalue}
              </span>
            )}

            <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>
              Dossier créé le {new Date(prospect.created_at).toLocaleDateString('fr-FR')}
            </span>

            {erreur && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{erreur}</p>}

            {prospect.statut === 'prospect' && (
              <button
                onClick={() => setPlanificationOuverte(true)}
                className="btn-shine"
                style={{ width: '100%', fontSize: 12.5, padding: 10, background: 'var(--accent-gradient)', color: '#1b1510' }}
              >
                Planifier un appel diagnostic
              </button>
            )}
            {/* Exactement la fenêtre de la section Facturation (acomptes, reste dû, reçu,
                génération de facture) — demande client du 2026-09-21 : « tout doit être lié ».
                La ligne créée ici est rattachée au prospect, puis reprise telle quelle par la
                conversion (voir api/admin/convert-prospect.ts). */}
            {paiementOuvert && (
              <DetailPaiementModale
                cible={{
                  type: 'prospect',
                  prospect: {
                    id: prospect.id,
                    etablissement_id: prospect.etablissement_id,
                    prenom: prospect.prenom,
                    nom: prospect.nom,
                  },
                  tarif: tarifAEncaisser
                    ? { titre: tarifAEncaisser.titre, prix: tarifAEncaisser.prix, heures: tarifAEncaisser.heures }
                    : null,
                  paiement: prospect.paiement,
                }}
                onFermer={() => setPaiementOuvert(false)}
                onChange={onChange}
              />
            )}

            {planificationOuverte && session && (
              <PlanifierAppelDiagnosticModale
                prospect={prospect}
                profile={profile}
                session={session}
                onFermer={() => setPlanificationOuverte(false)}
                onChange={onChange}
              />
            )}

            {prospect.statut === 'diagnostic_planifie' && !ouvert && (
              <button
                onClick={() => {
                  setOuvert(true)
                  // Demande client du 2026-09-21 : la trame doit se déplier directement, sans
                  // clic supplémentaire sur « Remplir » — c'est justement ce que ce bouton sert
                  // à commencer à remplir.
                  setQuestionnaireOuvert(true)
                }}
                className="btn-shine btn-secondary"
                style={{ width: '100%', fontSize: 12.5, padding: 10 }}
              >
                Marquer {estPositionnement ? 'le test' : 'le diagnostic'} comme fait
              </button>
            )}
            {prospect.statut === 'diagnostic_planifie' && ouvert && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <BlocQuestionnaire
                  ouvert={questionnaireOuvert}
                  onBasculer={() => setQuestionnaireOuvert((v) => !v)}
                  reponses={reponses}
                  onChange={setReponses}
                />
                {/* Niveau et rythme ne se ressaisissent plus ici : ils viennent du questionnaire
                    ci-dessus (section « Niveau d'anglais actuel » → Niveau estimé, et « Rythme
                    souhaité ») — demande client du 2026-09-21, « corrige les redondances ». */}
                <ApercuNiveauRythme reponses={reponses} />
                <SelecteurTarifChoisi tarifs={tarifsDuProgramme} valeur={prospect.tarif_choisi_id} onChoisir={choisirTarif} />
                <button onClick={marquerRealise} disabled={enCours} className="btn-shine btn-secondary" style={{ fontSize: 12.5, padding: 9, opacity: enCours ? 0.7 : 1 }}>
                  Confirmer
                </button>
              </div>
            )}

            {prospect.statut === 'diagnostic_fait' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <BlocQuestionnaire
                  ouvert={questionnaireOuvert}
                  onBasculer={() => setQuestionnaireOuvert((v) => !v)}
                  reponses={reponses}
                  onChange={setReponses}
                />
                <ApercuNiveauRythme reponses={reponses} />
                <SelecteurTarifChoisi tarifs={tarifsDuProgramme} valeur={prospect.tarif_choisi_id} onChoisir={choisirTarif} />
                <ChoixHeureEssai
                  essai={essai}
                  tarifChoisi={tarifChoisi}
                  tarifUneHeure={tarifUneHeure}
                  /* Verrouillé dès qu'un paiement existe : son montant a été calculé d'après ce
                     choix, basculer après coup rendrait la ligne fausse. */
                  verrouille={!!prospect.paiement}
                  onBasculer={basculerEssai}
                />
                <BlocPaiementForfait
                  paiement={prospect.paiement}
                  tarifAEncaisser={tarifAEncaisser}
                  essai={essai}
                  onOuvrir={() => setPaiementOuvert(true)}
                />
                <button onClick={enregistrerDiagnostic} disabled={enCours} className="btn-shine btn-secondary" style={{ fontSize: 12.5, padding: 9, opacity: enCours ? 0.7 : 1 }}>
                  {enCours ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button
                  onClick={relancerProspect}
                  disabled={relanceEnCours || relanceEnvoyee}
                  className="btn-shine btn-secondary"
                  style={{ fontSize: 12.5, padding: 9, opacity: relanceEnCours ? 0.7 : 1, color: relanceEnvoyee ? 'var(--accent-teal)' : undefined }}
                >
                  {relanceEnvoyee ? 'Relance envoyée ✓' : relanceEnCours ? 'Envoi…' : 'Relancer le prospect'}
                </button>
                {/* Conversion verrouillée tant que le forfait n'est pas encaissé — demande
                    client du 2026-09-21. Le motif est écrit juste au-dessus du bouton plutôt que
                    dans une infobulle : un bouton grisé sans explication est le premier réflexe
                    de support évité. */}
                {!paiementEnregistre && (
                  <p style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--muted)', margin: 0, padding: '8px 10px', borderRadius: 8, border: '1px dashed var(--border)', background: 'rgba(0,0,0,.18)' }}>
                    Enregistrez d’abord le paiement du forfait ci-dessus : la conversion en étudiant se
                    débloquera aussitôt. Le paiement suivra automatiquement dans le dossier de l’étudiant.
                  </p>
                )}
                <button
                  onClick={convertirEnEtudiant}
                  disabled={enCours || !paiementEnregistre}
                  title={paiementEnregistre ? undefined : 'Enregistrez le paiement du forfait pour débloquer la conversion.'}
                  className={paiementEnregistre ? 'btn-shine' : undefined}
                  style={{
                    width: '100%',
                    fontSize: 12.5,
                    padding: 10,
                    background: paiementEnregistre ? 'var(--accent-blue-gradient)' : 'var(--surface-alt)',
                    color: paiementEnregistre ? '#fff' : 'var(--muted-2)',
                    border: paiementEnregistre ? 'none' : '1px solid var(--border)',
                    cursor: paiementEnregistre ? 'pointer' : 'not-allowed',
                    opacity: enCours ? 0.7 : 1,
                  }}
                >
                  Convertir en étudiant
                </button>
              </div>
            )}
          </div>
        </Modale>
      )}
    </>
  )
}

/* Bloc visuel unique pour un binôme DUO dont les deux membres partagent le même statut (0058,
   demande client du 2026-09-22). Porte la carte externe et le glisser-déposer du groupe — les
   deux id transportés ensemble (voir `onDropColonne`) garantissent qu'ils avancent toujours de
   pair, jamais l'un sans l'autre. Chaque ligne d'identité imbriquée ouvre sa propre fenêtre de
   détail (diagnostic, paiement, conversion...), ces informations restant propres à chaque
   personne. */
function CarteDuo({
  paire,
  onChange,
  onChangerStatut,
}: {
  paire: [ProspectAvecDiagnostic, ProspectAvecDiagnostic]
  onChange: () => void
  onChangerStatut: (prospect: ProspectAvecDiagnostic, nouveauStatut: ProspectStatut) => Promise<void>
}) {
  const [enGlissement, setEnGlissement] = useState(false)
  const necessiteAction = paire.some(prospectATraiter)
  const nomGroupe = paire[0].duo_nom_groupe || `${paire[0].prenom} & ${paire[1].prenom}`

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', paire.map((p) => p.id).join(','))
        e.dataTransfer.effectAllowed = 'move'
        setEnGlissement(true)
      }}
      onDragEnd={() => setEnGlissement(false)}
      className="card card-lift"
      style={{
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        cursor: 'grab',
        opacity: enGlissement ? 0.4 : 1,
        position: 'relative',
        borderColor: necessiteAction ? 'rgba(255,138,112,.5)' : 'rgba(233,207,148,.32)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--accent-gold, #e9cf94)' }}>
          Duo · {nomGroupe}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <CarteProspect prospect={paire[0]} onChange={onChange} onChangerStatut={onChangerStatut} dansGroupeDuo />
        <div style={{ height: 1, background: 'var(--border-soft)' }} />
        <CarteProspect prospect={paire[1]} onChange={onChange} onChangerStatut={onChangerStatut} dansGroupeDuo />
      </div>
    </div>
  )
}

/* Paiement du forfait choisi, à l'étape « Diagnostic réalisé » — demande client du 2026-09-21.
   Remplace l'ancienne zone de notes libres, et se place juste sous le forfait choisi pour que la
   décision (quel forfait) et son encaissement se lisent d'un seul tenant. C'est ce bloc qui
   conditionne la conversion en étudiant. */
/* Heure d'essai avant engagement (0057) — arbitrage client : l'essai dure toujours une heure.
   Coché, c'est le tarif horaire qui est encaissé avant la conversion ; le forfait visé n'est
   facturé (pour son complément) qu'une fois l'essai transformé, depuis le dossier de l'élève. */
function ChoixHeureEssai({
  essai,
  tarifChoisi,
  tarifUneHeure,
  verrouille,
  onBasculer,
}: {
  essai: boolean
  tarifChoisi: { titre: string } | null
  tarifUneHeure: { titre: string; prix: number } | null
  verrouille: boolean
  onBasculer: (valeur: boolean) => void
}) {
  const indisponible = !tarifUneHeure && !essai

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          fontSize: 12.5,
          color: indisponible || verrouille ? 'var(--muted-2)' : 'var(--ink-2)',
          cursor: indisponible || verrouille ? 'not-allowed' : 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={essai}
          disabled={indisponible || verrouille}
          onChange={(e) => onBasculer(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        Commencer par une heure d’essai
      </label>
      {indisponible && (
        <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>
          Aucun tarif d’une heure n’existe pour ce programme : créez-en un dans Tarifs pour pouvoir
          proposer un essai.
        </span>
      )}
      {essai && tarifUneHeure && (
        <span style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--muted)' }}>
          Seule l’heure d’essai est encaissée maintenant ({tarifUneHeure.prix.toLocaleString('fr-FR')} Ar).
          {tarifChoisi
            ? ` Si l’élève poursuit, le complément du forfait ${tarifChoisi.titre} lui sera facturé depuis son dossier ; s’il s’arrête, il n’aura payé que cette heure.`
            : ' Choisissez un forfait ci-dessus pour que le complément puisse être calculé.'}
        </span>
      )}
      {verrouille && (
        <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>
          Choix figé : un paiement a déjà été enregistré sur cette base.
        </span>
      )}
    </div>
  )
}

function BlocPaiementForfait({
  paiement,
  tarifAEncaisser,
  essai,
  onOuvrir,
}: {
  paiement: ProspectAvecDiagnostic['paiement']
  tarifAEncaisser: { titre: string; prix: number } | null
  essai: boolean
  onOuvrir: () => void
}) {
  const ligne = paiement
    ? { montant: paiement.montant, montant_regle: paiement.montant_regle, statut: paiement.statut }
    : null
  const reste = ligne ? resteAPayer(ligne) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {essai ? 'Paiement de l’heure d’essai' : 'Paiement du forfait choisi'}
      </span>

      {!tarifAEncaisser && !paiement && (
        <p style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--muted)', margin: 0 }}>
          {essai
            ? 'Aucun tarif d’une heure n’est disponible : impossible de chiffrer l’essai.'
            : 'Choisissez d’abord un forfait ci-dessus : son montant servira de base au paiement.'}
        </p>
      )}

      {ligne ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <BadgeStatutPaiement statut={statutReglement(ligne)} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {formaterMontant(paiement!.montant_regle)} réglé sur {formaterMontant(paiement!.montant)}
              {reste > 0 ? ` · reste ${formaterMontant(reste)}` : ''}
            </span>
          </div>
          <button onClick={onOuvrir} className="btn-shine btn-secondary" style={{ fontSize: 12.5, padding: 9 }}>
            {reste > 0 ? 'Ajouter un acompte' : 'Voir le paiement'}
          </button>
        </>
      ) : (
        <button
          onClick={onOuvrir}
          disabled={!tarifAEncaisser}
          className={tarifAEncaisser ? 'btn-shine btn-secondary' : undefined}
          style={{
            fontSize: 12.5,
            padding: 9,
            ...(tarifAEncaisser
              ? {}
              : { background: 'var(--surface-alt)', color: 'var(--muted-2)', border: '1px solid var(--border)', borderRadius: 999, cursor: 'not-allowed' }),
          }}
        >
          {essai ? 'Enregistrer le paiement de l’essai' : 'Enregistrer le paiement du forfait'}
        </button>
      )}
    </div>
  )
}

/* Résultat du quiz écrit passé par un candidat au collectif pour valider sa place au test oral
   (0051). Le bilan détaillé est aussi recopié dans les notes du diagnostic, ce qui le fait
   suivre dans le dossier de l'élève une fois le prospect converti. */
function BilanTestPositionnement({
  test,
}: {
  test: NonNullable<ProspectAvecDiagnostic['testPositionnement']>
}) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, borderRadius: 10, border: '1px solid rgba(94,179,255,.3)', background: 'rgba(94,179,255,.08)', padding: '11px 13px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--accent-blue)', flexGrow: 1 }}>
          Test de positionnement écrit
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
          {test.score}/{test.total}
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)' }}>{test.niveau_estime ?? 'Non évalué'}</span>
      </div>
      {test.bilan && (
        <>
          <button
            type="button"
            onClick={() => setOuvert((v) => !v)}
            style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', padding: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {ouvert ? 'Masquer le bilan' : 'Voir le bilan détaillé'}
          </button>
          {ouvert && (
            <pre style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
              {test.bilan}
            </pre>
          )}
        </>
      )}
    </div>
  )
}

/* Aperçu en lecture seule de ce que `niveauDepuisReponses`/`rythmeDepuisReponses` enregistreront
   — l'admin voit tout de suite si ces deux informations manquent encore dans le questionnaire,
   sans avoir à le dérouler pour vérifier. */
function ApercuNiveauRythme({ reponses }: { reponses: ReponsesDiagnostic }) {
  const niveau = niveauDepuisReponses(reponses)
  const rythme = rythmeDepuisReponses(reponses)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, color: 'var(--muted)', padding: '2px 2px' }}>
      <span>Niveau qui sera enregistré : <strong style={{ color: niveau ? 'var(--ink-2)' : 'var(--muted-2)' }}>{niveau ?? '— à renseigner dans le questionnaire'}</strong></span>
      <span>Rythme qui sera enregistré : <strong style={{ color: rythme ? 'var(--ink-2)' : 'var(--muted-2)' }}>{rythme ?? '— à renseigner dans le questionnaire'}</strong></span>
    </div>
  )
}

/* Forfait choisi par le prospect parmi la grille tarifaire de son programme (0054) — repris
   automatiquement en `packages` à la conversion (api/admin/convert-prospect.ts). */
function SelecteurTarifChoisi({
  tarifs,
  valeur,
  onChoisir,
}: {
  tarifs: { id: string; titre: string; prix: number; unite: string; heures: number | null }[]
  valeur: string | null
  onChoisir: (tarifId: string) => void
}) {
  if (tarifs.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Forfait choisi</label>
      <select
        value={valeur ?? ''}
        onChange={(e) => onChoisir(e.target.value)}
        style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
      >
        <option value="">Non renseigné</option>
        {tarifs.map((t) => (
          <option key={t.id} value={t.id}>
            {t.titre} — {t.prix.toLocaleString('fr-FR')} {t.unite}
          </option>
        ))}
      </select>
    </div>
  )
}

/* Trame complète de l'appel diagnostic (demande client du 2026-09-21), repliée par défaut :
   elle fait une trentaine de champs et écraserait les trois champs de synthèse au-dessus, qui
   restent le geste le plus fréquent après un appel. La pastille indique qu'un questionnaire a
   déjà été rempli, pour ne pas avoir à déplier pour le savoir. */
function BlocQuestionnaire({
  ouvert,
  onBasculer,
  reponses,
  onChange,
}: {
  ouvert: boolean
  onBasculer: () => void
  reponses: ReponsesDiagnostic
  onChange: (reponses: ReponsesDiagnostic) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
      <button
        type="button"
        onClick={onBasculer}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Trame de l’appel diagnostic
        </span>
        {estRempli(reponses) && (
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-teal)', background: 'rgba(111,227,192,.14)', border: '1px solid rgba(111,227,192,.3)', borderRadius: 999, padding: '2px 8px' }}>
            Remplie
          </span>
        )}
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)', marginLeft: 'auto' }}>
          {ouvert ? 'Masquer' : 'Remplir'}
        </span>
      </button>
      {ouvert && <FormulaireDiagnosticCall reponses={reponses} onChange={onChange} />}
    </div>
  )
}

/* Note « post-it » du rendez-vous réservé en ligne par le prospect lui-même (voir
   api/prospects/reserver.ts) — jaune tant que l'admin ne l'a pas validé, vert une fois validé,
   avec le lien Meet dès qu'il existe et un bouton de validation directement ici (demande client
   du 2026-09-16). Un prospect qui n'a jamais réservé en ligne (dossier saisi à la main, ou appel
   planifié directement par l'admin) n'a pas de `rendezVous` : rien ne s'affiche, le badge
   diagnostic_calls existant (voir CarteProspect) prend le relais. */
function PostItRendezVous({
  prospect,
  validationEnCours,
  onValider,
}: {
  prospect: ProspectAvecDiagnostic
  validationEnCours: boolean
  onValider: () => void
}) {
  if (!prospect.rendezVous) return null
  const rdv = prospect.rendezVous
  const valide = rdv.statut === 'confirme'
  const quand = formaterDansFuseauEtablissement(rdv.debut)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        borderRadius: 10,
        padding: '12px 14px',
        background: valide ? '#dff5e8' : '#faf0c2',
        border: `1px solid ${valide ? '#8fd6ac' : '#e3cf6d'}`,
        boxShadow: '0 4px 14px rgba(0,0,0,.18)',
      }}
    >
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: valide ? '#1c6b41' : '#8a6d0a' }}>
        {valide ? 'Rendez-vous validé' : 'À valider par l’admin'}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#241d05' }}>{quand}</span>
      <span style={{ fontSize: 11.5, color: '#4a3f10' }}>{rdv.duree_minutes} min</span>
      {rdv.lien_meet && (
        <a
          href={rdv.lien_meet}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, fontWeight: 700, color: valide ? '#1c6b41' : '#8a6d0a' }}
        >
          Lien de visioconférence →
        </a>
      )}
      {rdv.statut === 'refuse' && <span style={{ fontSize: 11.5, color: '#8a2f0a' }}>Rendez-vous refusé.</span>}
      {rdv.statut === 'annule' && <span style={{ fontSize: 11.5, color: '#6a5f10' }}>Rendez-vous annulé.</span>}
      {rdv.statut === 'en_attente' && (
        <button
          type="button"
          onClick={onValider}
          disabled={validationEnCours}
          style={{
            alignSelf: 'flex-start',
            fontSize: 12,
            fontWeight: 700,
            color: '#1b1510',
            background: 'linear-gradient(150deg, #f0d472, #d9b93f)',
            border: 'none',
            borderRadius: 999,
            padding: '7px 16px',
            cursor: 'pointer',
            opacity: validationEnCours ? 0.7 : 1,
          }}
        >
          {validationEnCours ? 'Validation…' : 'Valider le rendez-vous'}
        </button>
      )}
    </div>
  )
}
