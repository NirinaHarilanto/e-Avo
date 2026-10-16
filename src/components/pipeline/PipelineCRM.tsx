import { useState, type DragEvent, type FormEvent } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { formaterDansFuseauEtablissement } from '../../lib/etablissement'
import {
  estRempli,
  extraireCles,
  niveauDepuisReponses,
  rythmeDepuisReponses,
  sectionsIndividuellesDuo,
  sectionsPartageesDuo,
  type ReponsesDiagnostic,
} from '../../lib/diagnostic'
import { FormulaireDiagnosticCall } from '../prospects/FormulaireDiagnosticCall'
import { SupprimerProspect } from '../prospects/SupprimerProspect'
import { PlanifierAppelDiagnosticModale } from '../admin/PlanifierAppelDiagnosticModale'
import { DetailPaiementModale } from '../paiements/DetailPaiementModale'
import { FraisInscriptionCollectifModale, type FraisInscription } from '../prospects/FraisInscriptionCollectifModale'
import { BadgeStatutPaiement } from '../shared/BadgeStatutPaiement'
import { formaterMontant, resteAPayer, statutReglement } from '../../lib/paiements'
import { useTarifs } from '../../hooks/useTarifs'
import type { ProspectStatut, TypeProgrammeProspect } from '../../types/database.types'
import { COLONNES_PIPELINE, useProspectsPipeline, type ProspectAvecDiagnostic } from '../../hooks/useProspectsPipeline'
import { useRafraichirSurNotification } from '../../hooks/useRafraichirSurNotification'
import { EnTetePage } from '../ui/EnTetePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { Modale } from '../ui/Modale'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { champStyle, etiquetteStyle } from '../ui/Champ'
import { Icone } from '../ui/Icones'
import { BoutonRejoindreVisio } from '../shared/BoutonRejoindreVisio'

/* Pastilles d'étape, relevées sur la maquette « Prospects » du 2026-10-16 : la couleur se
   fonce à mesure que le dossier avance, du blanc cerné de la première étape au violet plein de
   la dernière, et la goutte s'inverse d'une colonne à l'autre. Les teintes d'origine
   (#e9cf94, #a98cff, #6fe3c0) étaient calibrées pour le fond presque noir du thème sombre et
   passaient en pâle sur le fond lavande. */
const COULEUR_COLONNE: Record<string, { fond: string; texte: string; bordure: string; miroir: boolean }> = {
  prospect: { fond: '#fefffa', texte: '#4e356f', bordure: '#e5daf8', miroir: false },
  diagnostic_planifie: { fond: '#fbefd2', texte: '#49306a', bordure: 'transparent', miroir: true },
  diagnostic_fait: { fond: '#d9caf7', texte: '#49306a', bordure: 'transparent', miroir: false },
  etudiant: { fond: '#4e356f', texte: '#fefffa', bordure: 'transparent', miroir: true },
}

export function PipelineCRM() {
  const { profile, session, derniereNotification } = useProfileContext()
  const { prospects, totalConvertis, loading, erreur, recharger } = useProspectsPipeline()
  /* Couche 2 de la stratégie temps réel du 2026-09-29 : un nouveau prospect (réservation ou test
     de positionnement sur la vitrine) recharge le pipeline sans que l'admin ait à rafraîchir sa
     page — voir useRafraichirSurNotification.ts. */
  useRafraichirSurNotification(derniereNotification, ['rendez_vous_demande', 'test_positionnement'], recharger)
  const [colonneSurvolee, setColonneSurvolee] = useState<ProspectStatut | null>(null)
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  /* Candidat collectif dont la conversion attend la saisie de ses frais d'inscription (2026-10-11). */
  const [fraisPour, setFraisPour] = useState<ProspectAvecDiagnostic | null>(null)
  const [conversionEnCours, setConversionEnCours] = useState(false)
  const [erreurFrais, setErreurFrais] = useState<string | null>(null)

  // Mutation de statut centralisée : utilisée aussi bien par le glisser-déposer que par les
  // actions rapides des cartes, pour ne jamais dupliquer la logique de transition (conversion
  // étudiant, création à la volée d'une ligne diagnostic_calls manquante).
  /* Renvoie `false` si la transition n'a pas eu lieu (refus de la confirmation, erreur serveur)
     — ce que l'appelant DOIT regarder quand il enchaîne les deux membres d'un binôme DUO :
     convertir le second alors que le premier a échoué éclate la paire entre le pipeline et la
     section Étudiants, exactement ce qui s'est produit le 2026-09-22 (un homonyme supprimé
     bloquait l'un des deux, l'autre passait quand même). */
  async function changerStatut(
    prospect: ProspectAvecDiagnostic,
    nouveauStatut: ProspectStatut,
    // Confirmation déjà obtenue par l'appelant : un binôme DUO déplacé d'un seul geste est
    // confirmé une fois pour les deux dossiers (voir `onDropColonne`), pas une fois par personne.
    dejaConfirme = false,
  ): Promise<boolean> {
    if (nouveauStatut === prospect.statut) return true

    if (nouveauStatut === 'etudiant') {
      if (!session) return false
      if (
        !dejaConfirme &&
        !confirm(
          `Convertir ${prospect.prenom} ${prospect.nom} en étudiant ? Un e-mail d'invitation sera envoyé à ${prospect.email} pour qu'il/elle crée son mot de passe.`,
        )
      ) {
        return false
      }
      /* Cours collectifs : les frais d'inscription s'enregistrent AVANT la conversion (demande
         client du 2026-10-11), et le serveur refuse de convertir sans eux. La fenêtre de saisie
         est la même que dans Cours collectifs › Session orale — sans ce détour, un candidat
         collectif saisi directement ici, sans passer par une session orale, serait devenu
         inconvertible. La conversion reprend dans `convertirCollectif` une fois le montant validé. */
      if (fraisCollectifASaisir(prospect)) {
        setFraisPour(prospect)
        return false
      }

      const reponse = await fetch('/api/admin/convert-prospect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ prospectId: prospect.id }),
      })
      if (!reponse.ok) {
        const corps = await reponse.json().catch(() => null)
        alert(corps?.error ?? 'La conversion a échoué.')
        return false
      }
      recharger()
      return true
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

    const { error } = await supabase.from('prospects').update({ statut: nouveauStatut }).eq('id', prospect.id)
    recharger()
    return !error
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
    setTimeout(async () => {
      const aDeplacer = idsTransportes
        .map((id) => prospects.find((p) => p.id === id))
        .filter((p): p is ProspectAvecDiagnostic => !!p && p.statut !== statutCible)
      if (aDeplacer.length === 0) return

      // Une seule confirmation pour tout le groupe, qui nomme les deux personnes concernées —
      // enchaîner deux boîtes de dialogue identiques pour un geste unique donne l'impression
      // d'un double-clic accidentel.
      if (statutCible === 'etudiant') {
        const noms = aDeplacer.map((p) => `${p.prenom} ${p.nom}`).join(' et ')
        const emails = aDeplacer.map((p) => p.email).join(' et ')
        const pluriel = aDeplacer.length > 1
        if (
          !confirm(
            `Convertir ${noms} en étudiant${pluriel ? 's' : ''} ? Un e-mail d'invitation sera envoyé à ${emails} pour ${pluriel ? 'qu’ils créent leur mot de passe' : 'qu’il/elle crée son mot de passe'}.`,
          )
        ) {
          return
        }
      }

      /* Séquentiel : deux conversions simultanées déclencheraient deux rechargements concurrents
         du tableau, dont le plus lent peut réafficher un état déjà périmé. Et surtout, on
         S'ARRÊTE au premier échec : faire passer le second membre d'un binôme alors que le
         premier a été refusé laisserait la paire éclatée entre deux sections de l'application,
         sans moyen simple de la recoller (demande client du 2026-09-22 : « les deux étudiants
         devraient toujours aller de pair »). L'erreur a déjà été signalée par `changerStatut`. */
      for (const prospect of aDeplacer) {
        if (!(await changerStatut(prospect, statutCible, true))) return
      }
    }, 0)
  }

  /* Deuxième temps de la conversion d'un candidat collectif : les frais saisis, on repart sur la
     même route que les autres programmes, qui les enregistre dans le même geste. */
  async function convertirCollectif(prospect: ProspectAvecDiagnostic, frais: FraisInscription) {
    if (!session) return
    setConversionEnCours(true)
    setErreurFrais(null)
    const reponse = await fetch('/api/admin/convert-prospect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        prospectId: prospect.id,
        montantFrais: frais.montant,
        fraisRegles: frais.regle,
        moyenPaiement: frais.moyenPaiement || undefined,
        referencePaiement: frais.reference || undefined,
        notesPaiement: frais.notes || undefined,
      }),
    })
    setConversionEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreurFrais(corps?.error ?? 'La conversion a échoué.')
      return
    }
    setFraisPour(null)
    recharger()
  }

  return (
    <AdminLayout actif="Prospects">
      <EnTetePage
        compact
        titre="Prospects"
        compteur={!loading && prospects.length > 0 ? `${prospects.length} en cours` : undefined}
        /* Le bouton « Actualiser » propre à cette page a été retiré le 2026-10-16 : l'en-tête
           porte désormais le bouton d'actualisation commun aux trois espaces (EnTetePage.tsx),
           juste à côté, et deux boutons voisins portant le même mot se lisaient comme un défaut.
           Rien n'est perdu — le bouton commun recharge la page entière, donc aussi ces données. */
        actions={
          <button onClick={() => setFormulaireOuvert(true)} className="btn-shine" style={boutonPrimaireStyle}>
            <Icone nom="plus" taille={15} />
            Ajouter un prospect
          </button>
        }
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
                  gap: 12,
                  borderRadius: 28,
                  padding: 16,
                  border: survolee ? `1.5px dashed ${COULEUR_COLONNE[colonne.statut].texte}` : '1.5px dashed transparent',
                  background: survolee
                    ? 'var(--hoc-lavande-forte, rgba(255,255,255,.06))'
                    : 'var(--hoc-colonne, rgba(255,255,255,.03))',
                  transition: 'background .15s, border-color .15s',
                  minWidth: 0,
                }}
              >
                {/* Le compte de dossiers vit DANS la pastille d'étape, comme sur la maquette : une
                    seule pastille au lieu d'une puce de couleur plus un compteur séparé. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 6px 8px' }}>
                  <span
                    className={COULEUR_COLONNE[colonne.statut].miroir ? 'petale-miroir' : 'petale'}
                    style={{
                      width: 30,
                      height: 30,
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                      background: COULEUR_COLONNE[colonne.statut].fond,
                      color: COULEUR_COLONNE[colonne.statut].texte,
                      border: `1px solid ${COULEUR_COLONNE[colonne.statut].bordure}`,
                    }}
                  >
                    {items.length}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', minWidth: 0 }}>{colonne.titre}</span>
                </div>
                {/* Zone d'accueil en pointillé de la maquette, qui dit ce qu'on peut faire de la
                    colonne vide plutôt que de constater qu'elle l'est. La colonne « Étudiant »
                    est vide en permanence et par construction : un prospect converti quitte
                    aussitôt ce tableau pour l'espace Étudiants (voir useProspectsPipeline), elle
                    ne sert donc QUE de cible de dépôt — d'où le libellé propre à cette étape,
                    qui annonce la conversion au lieu de laisser croire à un dossier manquant. */}
                {items.length === 0 &&
                  (colonne.statut === 'prospect' ? (
                    /* Première colonne vide : la maquette n'y met pas une zone de dépôt mais une
                       vraie carte d'amorçage. Rien ne peut y « glisser » depuis une colonne
                       voisine — on ne revient pas en arrière dans le tunnel —, donc la seule
                       action utile est d'ouvrir le formulaire de saisie. */
                    <div
                      className="card"
                      style={{
                        borderRadius: 20,
                        padding: '32px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        gap: 12,
                      }}
                    >
                      <span
                        className="petale"
                        aria-hidden="true"
                        style={{
                          width: 64,
                          height: 64,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'var(--hoc-pastille, rgba(169,140,255,.14))',
                          color: 'var(--accent-blue)',
                        }}
                      >
                        <Icone nom="prospects" taille={28} />
                      </span>
                      <span className="police-titre" style={{ fontWeight: 700, fontSize: 19, color: 'var(--ink)' }}>
                        Aucun prospect
                      </span>
                      <button
                        onClick={() => setFormulaireOuvert(true)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          height: 44,
                          padding: '0 18px',
                          border: '1.5px solid var(--accent-blue)',
                          borderRadius: 20,
                          background: 'transparent',
                          color: 'var(--accent-blue)',
                          fontSize: 14,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <Icone nom="plus" taille={14} />
                        Ajouter le premier
                      </button>
                    </div>
                  ) : (
                    <div
                      style={{
                        flexGrow: 1,
                        minHeight: 150,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        fontSize: 13,
                        lineHeight: 1.45,
                        /* `--muted` et non `--muted-2` : cet état vide est posé sur la colonne
                           lavande, pas sur le blanc d'une carte, et le gris tertiaire y descend
                           sous le seuil de lisibilité. */
                        color: 'var(--muted)',
                        border: '1.5px dashed var(--hoc-lavande-forte, rgba(255,255,255,.14))',
                        borderRadius: 20,
                        padding: 20,
                      }}
                    >
                      {colonne.statut === 'etudiant'
                        ? 'Déposez ici un dossier prêt pour le convertir en étudiant.'
                        : 'Faites glisser une carte ici'}
                    </div>
                  ))}
                {grouperDuo(items).map((groupe, rang) =>
                  Array.isArray(groupe) ? (
                    <CarteDuo key={groupe[0].id} paire={groupe} onChange={recharger} onChangerStatut={changerStatut} indice={rang} />
                  ) : (
                    <CarteProspect key={groupe.id} prospect={groupe} onChange={recharger} onChangerStatut={changerStatut} indice={rang} />
                  ),
                )}
                {/* Pied de la première colonne, comme sur la maquette : la saisie d'un dossier
                    reste à portée sans remonter jusqu'à l'en-tête quand la colonne est longue. */}
                {colonne.statut === 'prospect' && items.length > 0 && (
                  <button
                    onClick={() => setFormulaireOuvert(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      height: 44,
                      border: '1.5px dashed var(--hoc-lavande-forte, rgba(255,255,255,.14))',
                      borderRadius: 20,
                      background: 'transparent',
                      color: 'var(--accent-blue)',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <Icone nom="plus" taille={14} />
                    Ajouter ici
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {fraisPour && (
        <FraisInscriptionCollectifModale
          nomCandidat={`${fraisPour.prenom} ${fraisPour.nom}`}
          /* Pas de test oral derrière une conversion faite depuis le pipeline : le niveau connu
             est celui qu'a noté l'appel diagnostic, à défaut rien — l'admin saisit alors le
             montant lui-même. */
          niveau={fraisPour.diagnostic?.niveau_evalue ?? null}
          etablissementId={profile?.etablissement_id}
          enCours={conversionEnCours}
          erreur={erreurFrais}
          onFermer={() => {
            if (conversionEnCours) return
            setFraisPour(null)
            setErreurFrais(null)
          }}
          onValider={(frais) => convertirCollectif(fraisPour, frais)}
        />
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

/* « Reçu aujourd'hui », « Reçu hier », « Reçu le 13 oct. » — la façon dont la maquette date les
   cartes. Une date absolue pour tout ce qui remonte à plus de deux jours : au-delà, « il y a
   9 jours » oblige à un calcul mental que la date évite. Les jours se comparent dans le fuseau de
   l'établissement comme partout ailleurs dans l'administration (demande client du 2026-09-21),
   sinon un admin en déplacement lirait « hier » sur un dossier arrivé le jour même à Tana. */
function dateRelativeCourte(iso: string): string {
  const jour = (d: string | Date) => formaterDansFuseauEtablissement(d, { dateStyle: 'short' })
  const cible = jour(iso)
  if (cible === jour(new Date())) return "aujourd'hui"
  if (cible === jour(new Date(Date.now() - 86_400_000))) return 'hier'
  return `le ${formaterDansFuseauEtablissement(iso, { day: 'numeric', month: 'short' })}`
}

/* Deuxième ligne de l'en-tête d'une carte. La maquette n'y met pas la même information d'une
   colonne à l'autre : à l'entrée dans le tableau c'est la date d'arrivée du dossier qui compte,
   une fois le diagnostic passé c'est la date où il a eu lieu, et entre les deux l'intitulé du
   besoin — l'encart de rendez-vous juste en dessous porte déjà la date pour cette étape-là. */
export function sousTitreCarte(prospect: ProspectAvecDiagnostic): string {
  if (prospect.statut === 'diagnostic_fait' && prospect.diagnostic?.date_appel) {
    return `Diagnostic ${dateRelativeCourte(prospect.diagnostic.date_appel)}`
  }
  if (prospect.statut === 'diagnostic_planifie') {
    return prospect.langue_visee || 'Langue non précisée'
  }
  return `Reçu ${dateRelativeCourte(prospect.created_at)}`
}

/* « Demain, 10 h 00 », « lun. 19 oct., 15 h 30 » : la date du rendez-vous telle que l'encart or
   de la maquette l'écrit. Le prospect peut avoir réservé lui-même en ligne (`rendezVous`) ou
   avoir été planifié par l'admin (`diagnostic.date_appel`) — les deux chemins mènent à la même
   ligne affichée. Les jours sont comparés dans le fuseau de l'établissement, jamais dans celui
   du navigateur : un admin en déplacement doit lire « demain » quand c'est demain à Tana. */
export function dateRendezVousCarte(prospect: ProspectAvecDiagnostic): string | null {
  const instant = prospect.rendezVous?.debut ?? prospect.diagnostic?.date_appel
  if (!instant) return null
  const jourDe = (d: string | Date) => formaterDansFuseauEtablissement(d, { dateStyle: 'short' })
  const heure = formaterDansFuseauEtablissement(instant, { hour: '2-digit', minute: '2-digit' })
  const demain = new Date(Date.now() + 86_400_000)
  if (jourDe(instant) === jourDe(new Date())) return `Aujourd’hui, ${heure}`
  if (jourDe(instant) === jourDe(demain)) return `Demain, ${heure}`
  return `${formaterDansFuseauEtablissement(instant, { weekday: 'short', day: 'numeric', month: 'short' })}, ${heure}`
}

/* Avatar en goutte des maquettes, teinté de la couleur de l'étape : la carte garde ainsi un
   repère de sa colonne même lorsqu'elle est glissée au-dessus d'une autre. `index` fait
   alterner la goutte et son miroir d'une carte à l'autre, comme sur la maquette. */
function AvatarProspect({ prospect, index = 0, taille = 40 }: { prospect: ProspectAvecDiagnostic; index?: number; taille?: number }) {
  const couleur = COULEUR_COLONNE[prospect.statut] ?? COULEUR_COLONNE.prospect
  return (
    <span
      aria-hidden="true"
      className={index % 2 === 1 ? 'petale-miroir' : 'petale'}
      style={{
        width: taille,
        height: taille,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 700,
        background: couleur.fond === '#fefffa' ? 'var(--hoc-pastille, #ede5fb)' : couleur.fond,
        color: couleur.fond === '#fefffa' ? 'var(--accent-blue)' : couleur.texte,
      }}
    >
      {(prospect.prenom[0] ?? '').toUpperCase()}
      {(prospect.nom[0] ?? '').toUpperCase()}
    </span>
  )
}

/* Repère « ce dossier attend un geste de votre part » (voir `prospectATraiter`). */
function PastilleATraiter() {
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        color: '#fff',
        background: 'var(--danger)',
        borderRadius: 999,
        padding: '3px 9px',
      }}
    >
      À traiter
    </span>
  )
}

/* Les deux puces de la maquette : pleine pour l'information principale (le besoin exprimé),
   cernée pour la mention secondaire (le format du programme). */
function PuceCarte({ enfants, pleine = false, ton }: { enfants: string; pleine?: boolean; ton?: string }) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: '4px 10px',
        borderRadius: 99,
        background: pleine ? 'var(--hoc-pastille, #ede5fb)' : 'var(--surface-alt, transparent)',
        color: ton ?? (pleine ? 'var(--accent-blue)' : 'var(--ink-2)'),
        border: pleine ? '1px solid transparent' : '1px solid var(--border)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
      }}
    >
      {enfants}
    </span>
  )
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

/* Faut-il ouvrir la fenêtre des frais d'inscription avant de convertir ce candidat ?

   Au collectif, l'élève ne règle qu'UNE somme : le tarif de son niveau. Qu'elle soit encaissée
   depuis cette fiche (bloc « Frais d'inscription », qui propose ce même tarif) ou depuis la
   fenêtre de conversion, c'est le même et unique encaissement — demande client du 2026-10-16 :
   « le paiement du forfait devrait être le même que le paiement des frais d'inscription [...]
   c'est soit l'un soit l'autre ». Redemander un montant alors qu'une ligne existe déjà en
   créerait une seconde, que le Suivi des cours collectifs ADDITIONNE à la première
   (`suiviCollectif.ts` retient toutes les lignes du prospect, sans regarder ni leurs notes ni
   leur `package_id`) : le candidat y serait passé à 300 000 Ar pour 150 000 encaissés.

   Même règle que celle déjà posée côté serveur (api/admin/convert-prospect.ts) : une ligne de
   paiement existante vaut acquittement, la conversion peut partir sans montant. */
export function fraisCollectifASaisir(prospect: Pick<ProspectAvecDiagnostic, 'type_programme' | 'paiement'>): boolean {
  return prospect.type_programme === 'collectif' && !prospect.paiement
}

/* Regroupe les binômes DUO présents dans une même colonne en un seul bloc visuel (0058, demande
   client du 2026-09-22 : « traités par groupe mais pas individuellement », un seul bloc pour
   Sandra/Bensas plutôt que deux cartes séparées). Un binôme dont les deux membres n'ont pas
   (encore) le même statut — l'un a avancé plus vite que l'autre — retombe sur deux cartes
   individuelles classiques, chacune affichant déjà le nom du partenaire (`duoPartenaireNom`) :
   rien ne permettrait de les représenter dans une seule colonne. */
export function grouperDuo(
  items: ProspectAvecDiagnostic[],
): (ProspectAvecDiagnostic | [ProspectAvecDiagnostic, ProspectAvecDiagnostic])[] {
  const traites = new Set<string>()
  const groupes: (ProspectAvecDiagnostic | [ProspectAvecDiagnostic, ProspectAvecDiagnostic])[] = []
  for (const prospect of items) {
    if (traites.has(prospect.id)) continue
    /* Lien cherché dans les deux sens : api/prospects/reserver.ts l'écrit normalement des deux
       côtés, mais le second écrit (la mise à jour du premier dossier) peut avoir échoué sans
       annuler la réservation. Ne regarder que `duo_partenaire_id` laissait alors le binôme
       éclaté en deux cartes — exactement le symptôme que ce regroupement doit supprimer. */
    const partenaire = items.find(
      (p) => p.id !== prospect.id && (p.id === prospect.duo_partenaire_id || p.duo_partenaire_id === prospect.id),
    )
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

/* Machine à états des actions d'un prospect (diagnostic, tarif, essai, relance, validation de
   rendez-vous, paiement) — extraite de `CarteProspect` en un hook (0059, demande client du
   2026-09-22 : « les informations des deux personnes formant le DUO dans le pop-up... car les
   deux personnes vont toujours de pair ») pour être réutilisée telle quelle par `CarteDuo`, qui
   fait porter ces actions par un SEUL des deux membres du binôme (voir `identifierPorteur`) au
   lieu de les dupliquer. Le comportement d'un prospect individuel reste rigoureusement identique
   à avant l'extraction. */
function useActionsProspect(prospect: ProspectAvecDiagnostic, onChange: () => void) {
  const { profile, session } = useProfileContext()
  const [ouvert, setOuvert] = useState(false)
  const [planificationOuverte, setPlanificationOuverte] = useState(false)
  const [reponses, setReponses] = useState<ReponsesDiagnostic>(prospect.diagnostic?.reponses ?? {})
  const [questionnaireOuvert, setQuestionnaireOuvert] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [validationEnCours, setValidationEnCours] = useState(false)
  const [relanceEnCours, setRelanceEnCours] = useState(false)
  const [relanceEnvoyee, setRelanceEnvoyee] = useState(false)
  const [paiementOuvert, setPaiementOuvert] = useState(false)

  // Forfait choisi par le prospect (0054) : liste filtrée sur son programme, individuel/collectif
  // exclu du duo et réciproquement — pas de sens de proposer un forfait duo à un individuel.
  const { tarifs } = useTarifs(prospect.etablissement_id)
  const tarifsDuProgramme = tarifs.filter((t) => t.type_programme === (prospect.type_programme ?? 'individuel'))
  const tarifChoisi = tarifs.find((t) => t.id === prospect.tarif_choisi_id) ?? null
  /* Séance d'essai (0057, revue en 0078 le 2026-09-29) : 1, 2 ou 3 h facturées au tarif horaire
     de SON programme (`heures = 1`), à part du forfait — c'est donc ce montant-là qu'on encaisse
     avant la conversion. Sans tarif horaire, l'essai n'est pas proposable (rien ne permettrait
     de le facturer). */
  const tarifUneHeure = tarifsDuProgramme.find((t) => t.heures === 1) ?? null
  const essai = prospect.essai_demande
  const essaiHeures = prospect.essai_heures ?? 1
  const tarifEssai = tarifUneHeure
    ? { titre: `Séance d’essai · ${essaiHeures} h`, prix: Number(tarifUneHeure.prix) * essaiHeures, heures: essaiHeures }
    : null
  const tarifAEncaisser = essai ? tarifEssai : tarifChoisi
  /* Un simple acompte suffit à débloquer la conversion : le client parle d'« enregistrer le
     paiement », pas d'exiger le solde complet — un forfait se règle souvent en plusieurs fois
     (voir paiement_versements, 0049). Le reste dû reste visible dans le dossier de l'étudiant
     (ou, pour un duo, dans le dossier partagé — un seul paiement pour le binôme, porté par le
     même prospect que le forfait, voir `identifierPorteur`). */
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

  async function choisirHeuresEssai(heures: number) {
    setErreur(null)
    const { error } = await supabase.from('prospects').update({ essai_heures: heures }).eq('id', prospect.id)
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

  return {
    profile,
    session,
    ouvert,
    setOuvert,
    planificationOuverte,
    setPlanificationOuverte,
    reponses,
    setReponses,
    questionnaireOuvert,
    setQuestionnaireOuvert,
    enCours,
    setEnCours,
    erreur,
    validationEnCours,
    relanceEnCours,
    relanceEnvoyee,
    paiementOuvert,
    setPaiementOuvert,
    tarifsDuProgramme,
    tarifChoisi,
    tarifUneHeure,
    essai,
    tarifAEncaisser,
    paiementEnregistre,
    marquerRealise,
    enregistrerDiagnostic,
    choisirTarif,
    basculerEssai,
    essaiHeures,
    choisirHeuresEssai,
    relancerProspect,
    validerRendezVous,
  }
}

interface CarteProspectProps {
  prospect: ProspectAvecDiagnostic
  onChange: () => void
  onChangerStatut: (prospect: ProspectAvecDiagnostic, nouveauStatut: ProspectStatut) => Promise<boolean>
  /* Rang de la carte dans sa colonne : sert uniquement à faire alterner la goutte de l'avatar
     et son miroir, comme sur la maquette. */
  indice?: number
}

function CarteProspect({ prospect, onChange, onChangerStatut, indice = 0 }: CarteProspectProps) {
  const estPositionnement = prospect.type_programme === 'collectif'
  const necessiteAction = prospectATraiter(prospect)
  const [enGlissement, setEnGlissement] = useState(false)
  const [detailOuvert, setDetailOuvert] = useState(false)
  const a = useActionsProspect(prospect, onChange)
  const {
    profile,
    session,
    ouvert,
    setOuvert,
    planificationOuverte,
    setPlanificationOuverte,
    reponses,
    setReponses,
    questionnaireOuvert,
    setQuestionnaireOuvert,
    enCours,
    erreur,
    validationEnCours,
    paiementOuvert,
    setPaiementOuvert,
    tarifsDuProgramme,
    tarifUneHeure,
    essai,
    tarifAEncaisser,
    paiementEnregistre,
    relanceEnCours,
    relanceEnvoyee,
    marquerRealise,
    enregistrerDiagnostic,
    choisirTarif,
    basculerEssai,
    essaiHeures,
    choisirHeuresEssai,
    relancerProspect,
    validerRendezVous,
  } = a

  async function convertirEnEtudiant() {
    a.setEnCours(true)
    await onChangerStatut(prospect, 'etudiant')
    a.setEnCours(false)
  }

  return (
    <>
      {/* Carte repliée : uniquement l'identité du prospect, pour qu'une colonne à forte
          affluence tienne sur une hauteur raisonnable — tout le reste (objectif, diagnostic,
          actions) est déplacé dans la fenêtre de détail ouverte au clic. Le drag-and-drop reste
          porté par cette carte : un vrai clic n'émet jamais l'événement `click` après un
          glissé, les deux interactions ne se marchent donc pas dessus. */}
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
          padding: 16,
          borderRadius: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          cursor: 'grab',
          opacity: enGlissement ? 0.4 : 1,
          position: 'relative',
          borderColor: necessiteAction ? 'rgba(255,138,112,.5)' : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AvatarProspect prospect={prospect} index={indice} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flexGrow: 1 }}>
            <span
              className="police-titre-italique"
              style={{
                fontWeight: 600,
                fontSize: 17,
                color: 'var(--ink)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {prospect.prenom} {prospect.nom}
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sousTitreCarte(prospect)}</span>
          </div>
          {/* Posé dans le flux de l'en-tête, à la place du menu « … » de la maquette. Il
              débordait auparavant au-dessus du bord supérieur de la carte (`top: -8`) : sur une
              colonne où plusieurs dossiers attendent d'affilée — le cas ordinaire de la première
              étape, où aucun appel n'est encore planifié — chaque pastille mordait la carte
              précédente et franchissait le bord de la colonne. */}
          {necessiteAction && <PastilleATraiter />}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {/* Besoin exprimé en puce pleine, format du programme en puce cernée : la hiérarchie
              de la maquette, où l'on repère d'abord ce que la personne vient chercher. */}
          {prospect.statut !== 'diagnostic_planifie' && prospect.langue_visee && (
            <PuceCarte pleine enfants={prospect.langue_visee} />
          )}
          {prospect.type_programme && <PuceCarte enfants={LABEL_PROGRAMME[prospect.type_programme]} />}
          {/* Binôme DUO dont les membres n'ont pas (encore) le même statut (0058) : ils ne
              peuvent pas être regroupés en un seul bloc (voir `grouperDuo`), ce repère évite
              au moins de les traiter comme deux prospects sans rapport. */}
          {prospect.duoPartenaireNom && (
            <PuceCarte enfants={`Duo avec ${prospect.duoPartenaireNom}`} ton="var(--accent-gold, #e9cf94)" />
          )}
        </div>

        {/* Étape « appel planifié » : la date du rendez-vous dans l'encart or de la maquette.
            C'est la seule information qu'on vient chercher sur ces cartes-là. */}
        {prospect.statut === 'diagnostic_planifie' && dateRendezVousCarte(prospect) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 14,
              background: 'var(--hoc-bandeau-or, rgba(233,207,148,.12))',
              color: 'var(--ink)',
            }}
          >
            <Icone nom="seances" taille={18} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{dateRendezVousCarte(prospect)}</span>
              <span style={{ fontSize: 12 }}>
                {prospect.type_programme === 'collectif' ? 'Test de positionnement' : 'Appel diagnostic'}
                {prospect.rendezVous ? ` · ${prospect.rendezVous.duree_minutes} min` : ''}
              </span>
            </div>
          </div>
        )}

        {/* Étape « diagnostic réalisé » : le niveau, écrit grand comme sur la maquette — c'est
            lui qui décide du forfait proposé à l'étape suivante. */}
        {prospect.statut === 'diagnostic_fait' && prospect.diagnostic?.niveau_evalue && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="police-titre" style={{ fontWeight: 700, fontSize: 26, color: 'var(--ink)' }}>
              {prospect.diagnostic.niveau_evalue}
            </span>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>niveau estimé</span>
          </div>
        )}
      </div>

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
                <span style={{ ...etiquetteStyle, fontSize: 11 }}>Objectif indiqué à la réservation</span>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)', background: 'var(--fond-champ, rgba(0,0,0,.22))', borderRadius: 10, padding: '10px 12px', margin: 0 }}>
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

            {prospect.testPositionnement && <BilanTestEcrit test={prospect.testPositionnement} />}
            {prospect.creneauTest && <SeanceTestOral creneau={prospect.creneauTest} />}

            {prospect.statut === 'diagnostic_fait' && prospect.diagnostic?.niveau_evalue && (
              <span style={{ alignSelf: 'flex-start', fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)', background: 'rgba(169,140,255,.14)', border: '1px solid rgba(169,140,255,.3)', borderRadius: 999, padding: '5px 11px' }}>
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
            {/* Une fois le rendez-vous pris, la même fenêtre reste accessible pour le déplacer ou
                l'annuler (demande client du 2026-09-29) — elle détecte déjà toute seule le
                rendez-vous actif du prospect et bascule en mode « modifier » (voir
                PlanifierAppelDiagnosticModale.tsx) ; sans ce bouton, elle n'était plus jamais
                réouvrable dès que le prospect quittait la colonne « Nouveaux prospects ». */}
            {prospect.statut === 'diagnostic_planifie' && prospect.rendezVous && (
              <button
                onClick={() => setPlanificationOuverte(true)}
                className="btn-shine btn-secondary"
                style={{ width: '100%', fontSize: 12.5, padding: 10 }}
              >
                Modifier ou annuler le rendez-vous
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
                  heures={essaiHeures}
                  onChoisirHeures={choisirHeuresEssai}
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
                  collectif={estPositionnement}
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
                  <p style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--muted)', margin: 0, padding: '8px 10px', borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--fond-champ, rgba(0,0,0,.22))' }}>
                    Enregistrez d’abord {estPositionnement ? 'les frais d’inscription' : 'le paiement du forfait'} ci-dessus :
                    la conversion en étudiant se débloquera aussitôt. Le paiement suivra automatiquement dans le dossier de
                    l’étudiant.
                  </p>
                )}
                <button
                  onClick={convertirEnEtudiant}
                  disabled={enCours || !paiementEnregistre}
                  title={
                    paiementEnregistre
                      ? undefined
                      : `Enregistrez ${estPositionnement ? 'les frais d’inscription' : 'le paiement du forfait'} pour débloquer la conversion.`
                  }
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

            {/* Disponible depuis n'importe quelle colonne du pipeline — demande client du
                2026-09-23 : « la possibilité de supprimer un prospect à chaque étape ». */}
            <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
              <SupprimerProspect
                prospects={[prospect]}
                onSupprime={() => {
                  setOuvert(false)
                  onChange()
                }}
              />
            </div>
          </div>
        </Modale>
      )}
    </>
  )
}

/* Le binôme ne partage qu'UNE fiche de réservation (0059) : rendez-vous, diagnostic et forfait
   choisi ne sont jamais enregistrés que sur un seul des deux dossiers prospects — celui saisi en
   « Personne 1 » du formulaire (voir api/prospects/reserver.ts), jamais sur les deux. Ce membre
   devient le « porteur » de toutes les actions communes ; l'autre reste une identité à afficher,
   jusqu'à sa propre conversion en étudiant « secondaire » (voir api/admin/convert-prospect.ts). */
export function identifierPorteur(paire: [ProspectAvecDiagnostic, ProspectAvecDiagnostic]): [ProspectAvecDiagnostic, ProspectAvecDiagnostic] {
  /* Ordre de priorité important (0060) : depuis que l'autre membre reçoit lui aussi son propre
     `diagnostic_calls` (trame à deux vitesses, voir CarteDuo), `diagnostic` n'identifie plus le
     porteur à coup sûr — les deux peuvent désormais en avoir un. `rendezVous` et
     `tarif_choisi_id` restent en revanche exclusifs au porteur (jamais écrits sur l'autre membre,
     voir api/prospects/reserver.ts et `choisirTarif`), donc plus fiables et vérifiés en premier.
     Le repli sur `paire[0]` — stable d'un rendu à l'autre, ordonné par `created_at` — ne sert que
     tant qu'aucun des trois signaux n'existe encore. */
  const porteur = paire.find((p) => p.rendezVous) ?? paire.find((p) => p.tarif_choisi_id) ?? paire.find((p) => p.diagnostic) ?? paire[0]
  const autre = paire.find((p) => p.id !== porteur.id)!
  return [porteur, autre]
}

/* Bloc visuel unique pour un binôme DUO dont les deux membres partagent le même statut (0058,
   demande client du 2026-09-22 : « traités par groupe mais pas individuellement »). Porte la
   carte externe et le glisser-déposer du groupe — les deux id transportés ensemble (voir
   `onDropColonne`), porteur en tête, garantissent qu'ils avancent toujours de pair.
   Un seul pop-up pour les deux (0059, demande client du 2026-09-22 : « les deux personnes vont
   toujours de pair tout au long de l'apprentissage ») — rendez-vous, diagnostic, forfait et
   paiement du binôme y sont uniques (portés par `porteur`, voir `identifierPorteur`), seule
   l'identité (nom, contact) reste propre à chaque personne. */
function CarteDuo({
  paire,
  onChange,
  onChangerStatut,
  indice = 0,
}: {
  paire: [ProspectAvecDiagnostic, ProspectAvecDiagnostic]
  onChange: () => void
  onChangerStatut: (prospect: ProspectAvecDiagnostic, nouveauStatut: ProspectStatut, dejaConfirme?: boolean) => Promise<boolean>
  indice?: number
}) {
  const [porteur, autre] = identifierPorteur(paire)
  const [enGlissement, setEnGlissement] = useState(false)
  const [detailOuvert, setDetailOuvert] = useState(false)
  const necessiteAction = prospectATraiter(porteur)
  const nomGroupe = paire[0].duo_nom_groupe || paire[1].duo_nom_groupe || `${paire[0].prenom} & ${paire[1].prenom}`
  const a = useActionsProspect(porteur, onChange)

  /* Trame de l'appel diagnostic à deux vitesses (0060, demande client du 2026-09-22) : les
     questions communes au binôme (disponibilités, rythme, profil du formateur, besoins
     prioritaires, programme recommandé) n'ont qu'une réponse pour les deux, les autres en ont
     une par personne. Jusqu'ici tout vivait dans le seul `diagnostic_calls` du porteur — ce qui
     reste la source historique dont on repart ici, `extraireCles` en isolant juste la part
     commune et la part du porteur ; celle de l'autre membre est neuve (il n'avait jamais eu son
     propre diagnostic_calls). */
  const [reponsesPorteur, setReponsesPorteur] = useState<ReponsesDiagnostic>(() =>
    extraireCles(porteur.diagnostic?.reponses ?? {}, sectionsIndividuellesDuo()),
  )
  const [reponsesAutre, setReponsesAutre] = useState<ReponsesDiagnostic>(() =>
    extraireCles(autre.diagnostic?.reponses ?? {}, sectionsIndividuellesDuo()),
  )
  const [reponsesPartagees, setReponsesPartagees] = useState<ReponsesDiagnostic>(() =>
    extraireCles(porteur.diagnostic?.reponses ?? {}, sectionsPartageesDuo()),
  )
  const reponsesCompletesPorteur = { ...reponsesPorteur, ...reponsesPartagees }
  const reponsesCompletesAutre = { ...reponsesAutre, ...reponsesPartagees }

  /* Écrit le `diagnostic_calls` d'UNE personne du binôme (porteur ou autre, chacun le sien) —
     même mécanique que `useActionsProspect.marquerRealise`, mais appelée deux fois ici (voir
     `sauvegarderDiagnosticsDuo` plus bas) puisqu'un binôme tient désormais sur deux lignes. */
  async function sauvegarderDiagnosticPersonne(cible: ProspectAvecDiagnostic, reponsesCompletes: ReponsesDiagnostic): Promise<boolean> {
    if (!a.profile) return false
    let diagnosticId = cible.diagnostic?.id ?? null
    if (!diagnosticId) {
      const { data: inserted, error: insertError } = await supabase
        .from('diagnostic_calls')
        .insert({
          etablissement_id: cible.etablissement_id,
          prospect_id: cible.id,
          mene_par: a.profile.id,
          date_appel: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (insertError || !inserted) return false
      diagnosticId = inserted.id
    }
    const { error } = await supabase
      .from('diagnostic_calls')
      .update({
        niveau_evalue: niveauDepuisReponses(reponsesCompletes),
        rythme_convenu: rythmeDepuisReponses(reponsesCompletes),
        reponses: reponsesCompletes,
      })
      .eq('id', diagnosticId)
    return !error
  }

  async function sauvegarderDiagnosticsDuo() {
    a.setEnCours(true)
    const [okPorteur, okAutre] = await Promise.all([
      sauvegarderDiagnosticPersonne(porteur, reponsesCompletesPorteur),
      sauvegarderDiagnosticPersonne(autre, reponsesCompletesAutre),
    ])
    a.setEnCours(false)
    return okPorteur && okAutre
  }

  async function marquerDuoRealise() {
    if (!(await sauvegarderDiagnosticsDuo())) return
    // Les deux dossiers avancent ensemble (0058) — jamais seulement le porteur.
    await supabase
      .from('prospects')
      .update({ statut: 'diagnostic_fait' })
      .in('id', [porteur.id, autre.id])
    a.setOuvert(false)
    onChange()
  }

  async function enregistrerDuoDiagnostic() {
    await sauvegarderDiagnosticsDuo()
    onChange()
  }

  async function convertirEnEtudiants() {
    if (
      !confirm(
        `Convertir ${porteur.prenom} ${porteur.nom} et ${autre.prenom} ${autre.nom} en étudiants ? Un e-mail d’invitation sera envoyé à chacun pour qu’ils créent leur mot de passe.`,
      )
    ) {
      return
    }
    a.setEnCours(true)
    /* Porteur d'abord : c'est sur son id que la conversion crée le forfait partagé (voir
       api/admin/convert-prospect.ts) — converti ensuite, l'autre membre le rejoint comme
       « secondaire » au lieu de recevoir son propre forfait en double. Si le premier échoue on
       n'enchaîne pas : la paire resterait sinon à cheval entre le pipeline et la section
       Étudiants (le message d'erreur a déjà été affiché par `changerStatut`). */
    if (await onChangerStatut(porteur, 'etudiant', true)) {
      await onChangerStatut(autre, 'etudiant', true)
    }
    a.setEnCours(false)
  }

  return (
    <>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', `${porteur.id},${autre.id}`)
          e.dataTransfer.effectAllowed = 'move'
          setEnGlissement(true)
        }}
        onDragEnd={() => setEnGlissement(false)}
        onClick={() => setDetailOuvert(true)}
        className="card card-lift"
        style={{
          padding: 16,
          borderRadius: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          cursor: 'grab',
          opacity: enGlissement ? 0.4 : 1,
          position: 'relative',
          borderColor: necessiteAction ? 'rgba(255,138,112,.5)' : 'rgba(233,207,148,.32)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              flexGrow: 1,
              minWidth: 0,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.3,
              textTransform: 'uppercase',
              color: 'var(--accent-gold, #e9cf94)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Duo · {nomGroupe}
          </span>
          {necessiteAction && <PastilleATraiter />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {paire.map((p, rang) => (
            <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <AvatarProspect prospect={p} index={indice + rang} taille={32} />
                <span
                  className="police-titre-italique"
                  style={{
                    fontWeight: 600,
                    fontSize: 15,
                    color: 'var(--ink)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.prenom} {p.nom}
                </span>
              </div>
              {/* Chaque membre du binôme a son propre diagnostic (voir `autre.diagnostic` dans la
                  fenêtre de détail juste en dessous) : un même « B1 » affiché une seule fois pour
                  le duo masquerait que l'autre membre peut être à un niveau différent. Même
                  format que le niveau d'un prospect individuel (ligne ~1141) — la maquette du
                  2026-10-16 demande explicitement de le retrouver « respectant le format et la
                  couleur » déjà en place. Indenté sous le nom (32 + 12 = largeur de l'avatar et
                  de son espacement) pour qu'il reste sans ambiguïté attaché à SA personne. */}
              {porteur.statut === 'diagnostic_fait' && p.diagnostic?.niveau_evalue && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, paddingLeft: 44 }}>
                  <span className="police-titre" style={{ fontWeight: 700, fontSize: 26, color: 'var(--ink)' }}>
                    {p.diagnostic.niveau_evalue}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>niveau estimé</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <PuceCarte enfants={sousTitreCarte(porteur)} />
        </div>
        {porteur.statut === 'diagnostic_planifie' && dateRendezVousCarte(porteur) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 14,
              background: 'var(--hoc-bandeau-or, rgba(233,207,148,.12))',
              color: 'var(--ink)',
            }}
          >
            <Icone nom="seances" taille={18} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{dateRendezVousCarte(porteur)}</span>
              <span style={{ fontSize: 12 }}>
                Appel diagnostic{porteur.rendezVous ? ` · ${porteur.rendezVous.duree_minutes} min` : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      {detailOuvert && (
        <Modale titre={`Duo · ${nomGroupe}`} onFermer={() => setDetailOuvert(false)} largeurMax={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {paire.map((p) => (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
                  {p.prenom} {p.nom}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{p.langue_visee || 'Langue non précisée'}</span>
                <a href={`mailto:${p.email}`} style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                  {p.email}
                </a>
                {p.telephone && (
                  <a href={`tel:${p.telephone}`} style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                    {p.telephone}
                  </a>
                )}
                {/* Chaque membre du duo garde son propre objectif, toujours rattaché à sa
                    personne — demande client du 2026-09-23, jamais mélangé ni réduit à celui
                    du porteur. */}
                {p.objectif && (
                  <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--ink-2)', background: 'var(--fond-champ, rgba(0,0,0,.22))', borderRadius: 8, padding: '7px 10px', margin: '2px 0 0' }}>
                    « {p.objectif} »
                  </p>
                )}
              </div>
            ))}

            {porteur.statut === 'diagnostic_planifie' && (
              <PostItRendezVous prospect={porteur} validationEnCours={a.validationEnCours} onValider={a.validerRendezVous} />
            )}

            {porteur.statut === 'diagnostic_fait' && (porteur.diagnostic?.niveau_evalue || autre.diagnostic?.niveau_evalue) && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {porteur.diagnostic?.niveau_evalue && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)', background: 'rgba(169,140,255,.14)', border: '1px solid rgba(169,140,255,.3)', borderRadius: 999, padding: '5px 11px' }}>
                    Niveau {porteur.prenom} : {porteur.diagnostic.niveau_evalue}
                  </span>
                )}
                {autre.diagnostic?.niveau_evalue && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)', background: 'rgba(169,140,255,.14)', border: '1px solid rgba(169,140,255,.3)', borderRadius: 999, padding: '5px 11px' }}>
                    Niveau {autre.prenom} : {autre.diagnostic.niveau_evalue}
                  </span>
                )}
              </div>
            )}

            <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>
              Dossier créé le {new Date(porteur.created_at).toLocaleDateString('fr-FR')}
            </span>

            {a.erreur && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{a.erreur}</p>}

            {porteur.statut === 'prospect' && (
              <button
                onClick={() => a.setPlanificationOuverte(true)}
                className="btn-shine"
                style={{ width: '100%', fontSize: 12.5, padding: 10, background: 'var(--accent-gradient)', color: '#1b1510' }}
              >
                Planifier un appel diagnostic
              </button>
            )}
            {porteur.statut === 'diagnostic_planifie' && porteur.rendezVous && (
              <button
                onClick={() => a.setPlanificationOuverte(true)}
                className="btn-shine btn-secondary"
                style={{ width: '100%', fontSize: 12.5, padding: 10 }}
              >
                Modifier ou annuler le rendez-vous
              </button>
            )}

            {a.paiementOuvert && (
              <DetailPaiementModale
                cible={{
                  type: 'prospect',
                  prospect: { id: porteur.id, etablissement_id: porteur.etablissement_id, prenom: porteur.prenom, nom: porteur.nom },
                  tarif: a.tarifAEncaisser
                    ? { titre: a.tarifAEncaisser.titre, prix: a.tarifAEncaisser.prix, heures: a.tarifAEncaisser.heures }
                    : null,
                  paiement: porteur.paiement,
                  // Demande client du 2026-10-16 : le forfait est partagé par les deux membres du
                  // binôme, la fenêtre de paiement doit donc nommer les deux, pas seulement le
                  // porteur qui en porte techniquement la ligne.
                  duoPartenaire: { id: autre.id, etablissement_id: autre.etablissement_id, prenom: autre.prenom, nom: autre.nom },
                }}
                onFermer={() => a.setPaiementOuvert(false)}
                onChange={onChange}
              />
            )}

            {a.planificationOuverte && a.session && (
              <PlanifierAppelDiagnosticModale
                prospect={porteur}
                profile={a.profile}
                session={a.session}
                onFermer={() => a.setPlanificationOuverte(false)}
                onChange={onChange}
              />
            )}

            {porteur.statut === 'diagnostic_planifie' && !a.ouvert && (
              <button
                onClick={() => {
                  a.setOuvert(true)
                  a.setQuestionnaireOuvert(true)
                }}
                className="btn-shine btn-secondary"
                style={{ width: '100%', fontSize: 12.5, padding: 10 }}
              >
                Marquer le diagnostic comme fait
              </button>
            )}
            {porteur.statut === 'diagnostic_planifie' && a.ouvert && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <BlocQuestionnaireDuo
                  porteur={porteur}
                  autre={autre}
                  ouvert={a.questionnaireOuvert}
                  onBasculer={() => a.setQuestionnaireOuvert((v) => !v)}
                  reponsesPartagees={reponsesPartagees}
                  onChangePartagees={setReponsesPartagees}
                  reponsesPorteur={reponsesPorteur}
                  onChangePorteur={setReponsesPorteur}
                  reponsesAutre={reponsesAutre}
                  onChangeAutre={setReponsesAutre}
                />
                <SelecteurTarifChoisi tarifs={a.tarifsDuProgramme} valeur={porteur.tarif_choisi_id} onChoisir={a.choisirTarif} />
                <button onClick={marquerDuoRealise} disabled={a.enCours} className="btn-shine btn-secondary" style={{ fontSize: 12.5, padding: 9, opacity: a.enCours ? 0.7 : 1 }}>
                  Confirmer
                </button>
              </div>
            )}

            {porteur.statut === 'diagnostic_fait' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <BlocQuestionnaireDuo
                  porteur={porteur}
                  autre={autre}
                  ouvert={a.questionnaireOuvert}
                  onBasculer={() => a.setQuestionnaireOuvert((v) => !v)}
                  reponsesPartagees={reponsesPartagees}
                  onChangePartagees={setReponsesPartagees}
                  reponsesPorteur={reponsesPorteur}
                  onChangePorteur={setReponsesPorteur}
                  reponsesAutre={reponsesAutre}
                  onChangeAutre={setReponsesAutre}
                />
                <SelecteurTarifChoisi tarifs={a.tarifsDuProgramme} valeur={porteur.tarif_choisi_id} onChoisir={a.choisirTarif} />
                <ChoixHeureEssai
                  essai={a.essai}
                  heures={a.essaiHeures}
                  onChoisirHeures={a.choisirHeuresEssai}
                  tarifUneHeure={a.tarifUneHeure}
                  verrouille={!!porteur.paiement}
                  onBasculer={a.basculerEssai}
                />
                <BlocPaiementForfait paiement={porteur.paiement} tarifAEncaisser={a.tarifAEncaisser} essai={a.essai} onOuvrir={() => a.setPaiementOuvert(true)} />
                <button onClick={enregistrerDuoDiagnostic} disabled={a.enCours} className="btn-shine btn-secondary" style={{ fontSize: 12.5, padding: 9, opacity: a.enCours ? 0.7 : 1 }}>
                  {a.enCours ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button
                  onClick={a.relancerProspect}
                  disabled={a.relanceEnCours || a.relanceEnvoyee}
                  className="btn-shine btn-secondary"
                  style={{ fontSize: 12.5, padding: 9, opacity: a.relanceEnCours ? 0.7 : 1, color: a.relanceEnvoyee ? 'var(--accent-teal)' : undefined }}
                >
                  {a.relanceEnvoyee ? 'Relance envoyée ✓' : a.relanceEnCours ? 'Envoi…' : 'Relancer le prospect'}
                </button>
                {!a.paiementEnregistre && (
                  <p style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--muted)', margin: 0, padding: '8px 10px', borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--fond-champ, rgba(0,0,0,.22))' }}>
                    Enregistrez d’abord le paiement du forfait ci-dessus, partagé par le binôme : la conversion des
                    deux en étudiants se débloquera aussitôt.
                  </p>
                )}
                <button
                  onClick={convertirEnEtudiants}
                  disabled={a.enCours || !a.paiementEnregistre}
                  title={a.paiementEnregistre ? undefined : 'Enregistrez le paiement du forfait pour débloquer la conversion.'}
                  className={a.paiementEnregistre ? 'btn-shine' : undefined}
                  style={{
                    width: '100%',
                    fontSize: 12.5,
                    padding: 10,
                    background: a.paiementEnregistre ? 'var(--accent-blue-gradient)' : 'var(--surface-alt)',
                    color: a.paiementEnregistre ? '#fff' : 'var(--muted-2)',
                    border: a.paiementEnregistre ? 'none' : '1px solid var(--border)',
                    cursor: a.paiementEnregistre ? 'pointer' : 'not-allowed',
                    opacity: a.enCours ? 0.7 : 1,
                  }}
                >
                  Convertir les deux en étudiants
                </button>
              </div>
            )}

            {/* Disponible depuis n'importe quelle colonne du pipeline — demande client du
                2026-09-23. Les deux membres du duo sont toujours supprimés ensemble, comme
                toutes les autres actions de cette carte. */}
            <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
              <SupprimerProspect
                prospects={[porteur, autre]}
                onSupprime={() => {
                  a.setOuvert(false)
                  onChange()
                }}
              />
            </div>
          </div>
        </Modale>
      )}
    </>
  )
}

/* Paiement du forfait choisi, à l'étape « Diagnostic réalisé » — demande client du 2026-09-21.
   Remplace l'ancienne zone de notes libres, et se place juste sous le forfait choisi pour que la
   décision (quel forfait) et son encaissement se lisent d'un seul tenant. C'est ce bloc qui
   conditionne la conversion en étudiant. */
/* Séance d'essai avant engagement (0057, revue le 2026-09-29) : 1, 2 ou 3 heures facturées au
   tarif horaire, à part. Si l'élève poursuit, il paie ensuite le forfait complet de son choix
   (décision enregistrée depuis son dossier) ; s'il s'arrête, il n'aura payé que l'essai. */
function ChoixHeureEssai({
  essai,
  heures,
  onChoisirHeures,
  tarifUneHeure,
  verrouille,
  onBasculer,
}: {
  essai: boolean
  heures: number
  onChoisirHeures: (heures: number) => void
  tarifUneHeure: { titre: string; prix: number } | null
  verrouille: boolean
  onBasculer: (valeur: boolean) => void
}) {
  const indisponible = !tarifUneHeure && !essai
  const prixHoraire = tarifUneHeure ? Number(tarifUneHeure.prix) : null

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
        Commencer par une séance d’essai
      </label>
      {indisponible && (
        <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>
          Aucun tarif d’une heure n’existe pour ce programme : créez-en un dans Tarifs pour pouvoir
          proposer un essai.
        </span>
      )}
      {essai && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: 22 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Durée :</span>
          {[1, 2, 3].map((h) => (
            <button
              key={h}
              type="button"
              disabled={verrouille}
              onClick={() => onChoisirHeures(h)}
              aria-pressed={heures === h}
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '5px 12px',
                borderRadius: 999,
                cursor: verrouille ? 'not-allowed' : 'pointer',
                border: `1px solid ${heures === h ? 'transparent' : 'var(--border)'}`,
                background: heures === h ? 'var(--accent-gradient)' : 'transparent',
                color: heures === h ? '#1b1510' : 'var(--ink-2)',
              }}
            >
              {h} h
            </button>
          ))}
        </div>
      )}
      {essai && prixHoraire != null && (
        <span style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--muted)', paddingLeft: 22 }}>
          {heures} h × {prixHoraire.toLocaleString('fr-FR')} Ar = <strong>{(heures * prixHoraire).toLocaleString('fr-FR')} Ar</strong>,
          facturés à part. S’il poursuit, l’élève paiera ensuite le forfait complet de son choix ; s’il s’arrête, il n’aura
          payé que l’essai.
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
  /* Au collectif, ce règlement EST celui des frais d'inscription — un seul encaissement pour les
     deux (voir `fraisCollectifASaisir`). Le dire ici, dans le libellé même du bloc, évite à
     l'admin de croire qu'une seconde somme reste due à la conversion : c'est exactement la
     confusion signalée par le client le 2026-10-16. */
  collectif = false,
  onOuvrir,
}: {
  paiement: ProspectAvecDiagnostic['paiement']
  tarifAEncaisser: { titre: string; prix: number } | null
  essai: boolean
  collectif?: boolean
  onOuvrir: () => void
}) {
  const ligne = paiement
    ? { montant: paiement.montant, montant_regle: paiement.montant_regle, statut: paiement.statut }
    : null
  const reste = ligne ? resteAPayer(ligne) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
      <span style={{ ...etiquetteStyle, fontSize: 11 }}>
        {collectif ? 'Frais d’inscription' : essai ? 'Paiement de la séance d’essai' : 'Paiement du forfait choisi'}
      </span>

      {collectif && (
        <p style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--muted)', margin: 0 }}>
          Au collectif, ce règlement tient lieu de frais d’inscription : il ne sera pas redemandé à la conversion.
        </p>
      )}

      {!tarifAEncaisser && !paiement && (
        <p style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--muted)', margin: 0 }}>
          {essai
            ? 'Aucun tarif d’une heure n’est disponible : impossible de chiffrer l’essai.'
            : collectif
              ? 'Choisissez d’abord le niveau ci-dessus : son tarif sert de base aux frais d’inscription.'
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
          {collectif
            ? 'Enregistrer les frais d’inscription'
            : essai
              ? 'Enregistrer le paiement de l’essai'
              : 'Enregistrer le paiement du forfait'}
        </button>
      )}
    </div>
  )
}

/* Résultat du quiz ÉCRIT passé par un candidat au collectif pour valider sa place au test oral
   (0051). Le bilan détaillé est aussi recopié dans les notes du diagnostic, ce qui le fait
   suivre dans le dossier de l'élève une fois le prospect converti.

   Séparé du test ORAL le 2026-10-16 (demande client) : les deux étaient empilés dans un seul
   encadré intitulé « Test de positionnement écrit », si bien que le bouton « Rejoindre via
   Jitsi » — qui ouvre la séance ORALE — semblait appartenir au questionnaire écrit, déjà passé
   et noté. Deux épreuves distinctes, deux blocs distincts. */
function BilanTestEcrit({ test }: { test: NonNullable<ProspectAvecDiagnostic['testPositionnement']> }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--hoc-pastille, rgba(169,140,255,.08))', padding: '12px 14px' }}>
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

/* Séance ORALE réservée par le candidat : quand elle a lieu, et par où la rejoindre. Dessinée
   comme l'encart de rendez-vous de la maquette (aplat or, texte violet foncé) plutôt que comme
   le bloc écrit ci-dessus — c'est un rendez-vous à venir, pas un résultat acquis, et la
   distinction se lit au premier coup d'œil dans une fiche qui porte les deux. */
function SeanceTestOral({
  creneau,
}: {
  creneau: NonNullable<ProspectAvecDiagnostic['creneauTest']>
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 14, background: 'var(--hoc-bandeau-or, rgba(233,207,148,.12))', padding: '12px 14px' }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--ink)' }}>
        Test de positionnement oral
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icone nom="seances" taille={18} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
            {formaterDansFuseauEtablissement(creneau.debut)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>Séance de groupe · {creneau.dureeMinutes} min</span>
        </div>
      </div>
      {/* Toujours Jitsi : creer-creneau-test.ts n'appelle jamais creerEvenementVisio avec
          `fournisseur: 'google_meet'`, le créneau de test oral garde donc systématiquement son
          lien Jitsi d'origine (voir nouveauLienVisio dans api/_lib/google.ts). */}
      {creneau.lienVisio ? (
        <BoutonRejoindreVisio lien={creneau.lienVisio} fournisseur="jitsi" />
      ) : (
        <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
          Lien de visioconférence en cours de génération.
        </span>
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
      <label style={{ ...etiquetteStyle, fontSize: 11 }}>Forfait choisi</label>
      <select
        value={valeur ?? ''}
        onChange={(e) => onChoisir(e.target.value)}
        style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'var(--fond-champ, rgba(0,0,0,.22))' }}
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
        <span style={{ ...etiquetteStyle, fontSize: 11 }}>Trame de l’appel diagnostic</span>
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

/* Variante DUO de `BlocQuestionnaire` (0060, demande client du 2026-09-22) : un bloc « Informations
   communes au duo » (disponibilités, rythme, profil du formateur, besoins prioritaires, programme
   recommandé) suivi de deux trames individuelles, une par personne — plutôt que la même trame
   complète dupliquée deux fois, qui aurait fait ressaisir deux fois les mêmes réponses communes. */
function BlocQuestionnaireDuo({
  porteur,
  autre,
  ouvert,
  onBasculer,
  reponsesPartagees,
  onChangePartagees,
  reponsesPorteur,
  onChangePorteur,
  reponsesAutre,
  onChangeAutre,
}: {
  porteur: ProspectAvecDiagnostic
  autre: ProspectAvecDiagnostic
  ouvert: boolean
  onBasculer: () => void
  reponsesPartagees: ReponsesDiagnostic
  onChangePartagees: (reponses: ReponsesDiagnostic) => void
  reponsesPorteur: ReponsesDiagnostic
  onChangePorteur: (reponses: ReponsesDiagnostic) => void
  reponsesAutre: ReponsesDiagnostic
  onChangeAutre: (reponses: ReponsesDiagnostic) => void
}) {
  const rempli = estRempli(reponsesPartagees) || estRempli(reponsesPorteur) || estRempli(reponsesAutre)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
      <button
        type="button"
        onClick={onBasculer}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <span style={{ ...etiquetteStyle, fontSize: 11 }}>Trame de l’appel diagnostic</span>
        {rempli && (
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-teal)', background: 'rgba(111,227,192,.14)', border: '1px solid rgba(111,227,192,.3)', borderRadius: 999, padding: '2px 8px' }}>
            Remplie
          </span>
        )}
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)', marginLeft: 'auto' }}>
          {ouvert ? 'Masquer' : 'Remplir'}
        </span>
      </button>
      {ouvert && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--accent-gold, #e9cf94)' }}>
              Informations communes au duo
            </span>
            <FormulaireDiagnosticCall sections={sectionsPartageesDuo()} reponses={reponsesPartagees} onChange={onChangePartagees} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--accent-blue)' }}>
              {porteur.prenom} {porteur.nom}
            </span>
            <FormulaireDiagnosticCall sections={sectionsIndividuellesDuo()} reponses={reponsesPorteur} onChange={onChangePorteur} />
            <ApercuNiveauRythme reponses={{ ...reponsesPorteur, ...reponsesPartagees }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--accent-blue)' }}>
              {autre.prenom} {autre.nom}
            </span>
            <FormulaireDiagnosticCall sections={sectionsIndividuellesDuo()} reponses={reponsesAutre} onChange={onChangeAutre} />
            <ApercuNiveauRythme reponses={{ ...reponsesAutre, ...reponsesPartagees }} />
          </div>
        </div>
      )}
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
        boxShadow: '0 4px 14px rgba(73,48,106,.14)',
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
            color: 'var(--ink)',
            background: 'var(--accent-gradient)',
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
