import { useEffect, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { formaterDansFuseauEtablissement } from '../../lib/etablissement'
import { estRempli, niveauDepuisReponses, sectionsCollectif, type ReponsesDiagnostic } from '../../lib/diagnostic'
import { enregistrerCompteRenduOral, lireCompteRenduOral } from '../../lib/compteRenduOral'
import type { Database } from '../../types/database.types'
import { FormulaireDiagnosticCall } from '../prospects/FormulaireDiagnosticCall'
import { Modale } from '../ui/Modale'
import { Icone } from '../ui/Icones'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { EtatChargement, MessageErreur, MessageInfo } from '../ui/Etats'

type CreneauTest = Database['public']['Tables']['creneaux_test_positionnement']['Row']
type Inscription = Database['public']['Tables']['test_positionnement_inscriptions']['Row']
type Prospect = Database['public']['Tables']['prospects']['Row']

export interface CandidatSession {
  inscription: Inscription
  prospect: Prospect | null
}

/* Compte rendu d'une session de test oral collectif, candidat par candidat — demande client du
   2026-11-08 : « à 5 min de la fin de la session orale, il faudrait rajouter un bouton sur le
   pop-up afin que l'admin puisse renseigner le compte rendu de la session pour chaque prospect
   [...] prends la même trame de diagnostic appel comme pour la partie individuel mais uniquement
   les informations applicables pour un cours collectif [...] une fois renseigné, l'admin pourra
   enregistrer les informations SANS directement convertir en étudiants. »

   Ce dernier point est toute la raison d'être de cette fenêtre. Jusqu'ici, le seul endroit où
   consigner l'oral était la fenêtre de conversion (ConvertirCandidatCollectif) : enregistrer ce
   qui s'était dit revenait à créer le compte, encaisser les frais et affecter une classe dans la
   foulée. Un oral qui n'aboutit pas tout de suite — candidat qui réfléchit, paiement à venir,
   décision à plusieurs — ne laissait donc aucune trace, et l'admin reprenait de mémoire des
   jours plus tard.

   Rien n'est converti ici : on écrit le compte rendu, le niveau retenu, et on fait avancer
   l'étape du candidat à « Test oral passé ». La conversion reste un geste séparé, et elle
   RETROUVE ce qui a été saisi ici plutôt que de le redemander (voir lib/compteRenduOral.ts). */
export function ResultatsSessionOraleModale({
  creneau,
  candidats,
  onFermer,
  onEnregistre,
}: {
  creneau: CreneauTest
  candidats: CandidatSession[]
  onFermer: () => void
  onEnregistre: (nombre: number) => void
}) {
  const { profile } = useProfileContext()
  const sections = sectionsCollectif()
  const avecProspect = candidats.filter((c) => c.prospect !== null)

  /* Une trame par candidat, toutes montées en même temps : l'admin sort d'une session où il a vu
     les candidats les uns après les autres, il remplit dans cet ordre-là sans perdre ce qu'il a
     déjà tapé en passant au suivant. */
  const [saisies, setSaisies] = useState<Record<string, ReponsesDiagnostic> | null>(null)
  /* Candidats dont la trame était DÉJÀ enregistrée à l'ouverture, et candidats que l'admin vient
     de toucher. La distinction n'est pas cosmétique : chaque trame s'ouvre pré-remplie du niveau
     déjà connu, si bien qu'une trame « non vide » ne prouve rien — sans ce suivi, une session de
     six candidats dont l'admin n'en a vu que deux faisait passer les six à « Test oral passé »,
     avec le niveau du quiz écrit promu niveau définitif pour quatre personnes jamais entendues. */
  const [dejaEnregistres, setDejaEnregistres] = useState<Set<string>>(new Set())
  const [modifies, setModifies] = useState<Set<string>>(new Set())
  const [deplie, setDeplie] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let actif = true
    Promise.all(
      avecProspect.map(async (candidat) => {
        const prospectId = candidat.prospect!.id
        const existant = await lireCompteRenduOral(prospectId)
        /* Repris du compte rendu déjà enregistré s'il y en a un (l'admin revient corriger), sinon
           pré-rempli du niveau déjà connu — le niveau final s'il a été arrêté, le quiz écrit à
           défaut. Pré-remplir est ici le cas le plus fréquent : l'oral confirme l'écrit, et
           l'admin n'a qu'à corriger les exceptions. */
        const dejaSaisi = !!existant && estRempli(existant.reponses)
        const reponses: ReponsesDiagnostic = dejaSaisi
          ? existant!.reponses
          : { niveau_estime: candidat.inscription.niveau_final ?? candidat.inscription.niveau_estime ?? '' }
        return [prospectId, reponses, dejaSaisi] as const
      }),
    ).then((paires) => {
      if (!actif) return
      setSaisies(Object.fromEntries(paires.map(([id, reponses]) => [id, reponses])))
      setDejaEnregistres(new Set(paires.filter(([, , deja]) => deja).map(([id]) => id)))
      setDeplie(paires[0]?.[0] ?? null)
    })
    return () => {
      actif = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creneau.id])

  async function enregistrer() {
    if (!saisies || !profile) return
    setEnCours(true)
    setErreur(null)

    /* Seuls les candidats que l'admin a effectivement renseignés partent en base — pas ceux dont
       la trame est simplement pré-remplie du niveau déjà connu. Rouvrir la fenêtre pour corriger
       une seule personne ne réécrit donc pas les comptes rendus des autres. */
    const aEnregistrer = avecProspect.filter((c) => modifies.has(c.prospect!.id) && estRempli(saisies[c.prospect!.id] ?? {}))
    if (aEnregistrer.length === 0) {
      setEnCours(false)
      setErreur('Renseignez au moins un candidat avant d’enregistrer.')
      return
    }

    for (const candidat of aEnregistrer) {
      const prospect = candidat.prospect!
      const reponses = saisies[prospect.id]
      const niveau = niveauDepuisReponses(reponses)

      const { error } = await enregistrerCompteRenduOral({
        etablissementId: prospect.etablissement_id,
        prospectId: prospect.id,
        meneParProfileId: profile.id,
        niveau,
        reponses,
      })
      if (error) {
        setEnCours(false)
        setErreur(`${prospect.prenom} ${prospect.nom} : ${error}`)
        return
      }

      /* Le niveau retenu est RECOPIÉ sur l'inscription : c'est `niveau_final` (0118) qui fait foi
         pour la classe de niveau et pour le montant des frais, pas le compte rendu pédagogique.
         Sans cette ligne, le suivi continuerait d'afficher « Niveau — test oral : — » juste
         après une saisie, et la conversion repartirait du quiz écrit. */
      if (niveau) {
        const { error: erreurNiveau } = await supabase
          .from('test_positionnement_inscriptions')
          .update({ niveau_final: niveau })
          .eq('id', candidat.inscription.id)
        if (erreurNiveau) {
          setEnCours(false)
          setErreur(`${prospect.prenom} ${prospect.nom} : ${erreurNiveau.message}`)
          return
        }
      }

      /* L'étape avance, jamais à reculons : `statut` ne revient pas en arrière une fois
         « etudiant » posé — il sert aussi de clé d'historique après une suppression de compte
         (voir suiviCollectif.ts). Le forcer ici rétrograderait un candidat déjà converti qu'on
         rouvre simplement pour corriger son compte rendu. */
      if (prospect.statut === 'prospect' || prospect.statut === 'diagnostic_planifie') {
        const { error: erreurStatut } = await supabase
          .from('prospects')
          .update({ statut: 'diagnostic_fait' })
          .eq('id', prospect.id)
        if (erreurStatut) {
          setEnCours(false)
          setErreur(`${prospect.prenom} ${prospect.nom} : ${erreurStatut.message}`)
          return
        }
      }
    }

    setEnCours(false)
    onEnregistre(aEnregistrer.length)
  }

  const renseignes = saisies
    ? avecProspect.filter((c) => modifies.has(c.prospect!.id) && estRempli(saisies[c.prospect!.id] ?? {})).length
    : 0

  return (
    <Modale
      titre={`Résultats de la session · ${formaterDansFuseauEtablissement(creneau.debut)}`}
      onFermer={() => {
        if (enCours) return
        onFermer()
      }}
      largeurMax={620}
    >
      {saisies === null ? (
        <EtatChargement lignes={3} hauteur={44} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MessageInfo>
            Ces résultats sont enregistrés dans le dossier de chaque candidat sans le convertir en étudiant·e. La
            conversion reste à faire ensuite, et reprendra ce que vous saisissez ici.
          </MessageInfo>

          {avecProspect.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0 }}>Aucun candidat inscrit sur cette session.</p>
          ) : (
            avecProspect.map((candidat) => {
              const prospect = candidat.prospect!
              const ouvert = deplie === prospect.id
              const rempli = dejaEnregistres.has(prospect.id) || modifies.has(prospect.id)
              return (
                <div
                  key={prospect.id}
                  style={{ border: '1px solid var(--border-soft)', borderRadius: 10, overflow: 'hidden' }}
                >
                  <button
                    type="button"
                    onClick={() => setDeplie(ouvert ? null : prospect.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      width: '100%',
                      padding: '9px 11px',
                      background: 'var(--voile-doux, rgba(255,255,255,.03))',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ display: 'inline-flex', transform: ouvert ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
                      <Icone nom="chevron" taille={13} />
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', flexGrow: 1 }}>
                      {prospect.prenom} {prospect.nom}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      quiz {candidat.inscription.score}/{candidat.inscription.total}
                    </span>
                    {rempli && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-teal)' }}>Renseigné</span>
                    )}
                  </button>
                  {ouvert && (
                    <div style={{ padding: '12px 11px 14px' }}>
                      <FormulaireDiagnosticCall
                        reponses={saisies[prospect.id] ?? {}}
                        onChange={(reponses) => {
                          setSaisies({ ...saisies, [prospect.id]: reponses })
                          setModifies(new Set(modifies).add(prospect.id))
                        }}
                        sections={sections}
                      />
                    </div>
                  )}
                </div>
              )
            })
          )}

          {erreur && <MessageErreur>{erreur}</MessageErreur>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onFermer} disabled={enCours} style={boutonNeutreStyle}>
              Annuler
            </button>
            <button
              onClick={enregistrer}
              disabled={enCours || renseignes === 0}
              className="btn-shine"
              style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours || renseignes === 0 ? 0.6 : 1 }}
            >
              {enCours
                ? 'Enregistrement…'
                : renseignes === 0
                  ? 'Enregistrer les résultats'
                  : `Enregistrer les résultats (${renseignes} candidat${renseignes > 1 ? 's' : ''})`}
            </button>
          </div>
        </div>
      )}
    </Modale>
  )
}
