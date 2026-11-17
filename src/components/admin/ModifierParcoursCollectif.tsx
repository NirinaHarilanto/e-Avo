import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { formaterDansFuseauEtablissement } from '../../lib/etablissement'
import { nomVagueSeul } from '../../lib/cohortes'
import { NIVEAUX_ANGLAIS } from '../../lib/classesCollectif'
import type { Database } from '../../types/database.types'
import { Champ } from '../ui/Champ'
import { ListeChoix, type OptionListeChoix } from '../ui/ListeChoix'
import { MessageErreur, MessageInfo } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'

type InscriptionTest = Database['public']['Tables']['test_positionnement_inscriptions']['Row']
type CreneauTest = Database['public']['Tables']['creneaux_test_positionnement']['Row']
type Cohort = Database['public']['Tables']['cohorts']['Row']

/* Option « rien de renseigné » : chaîne vide, comme un <option value=""> natif — ListeChoix
   l'accepte explicitement. Sans elle, un niveau saisi par erreur ne pourrait plus être effacé,
   seulement remplacé par un autre niveau tout aussi faux. */
const AUCUN = ''

/* Édition du parcours collectif d'un candidat — demande client du 2026-11-17, capture à l'appui :
   « il faudrait que l'utilisateur admin puisse modifier les informations dans le parcours
   collectif de la personne, rajoute un bouton modifier ».
 *
 * Ce panneau ne touche QU'À l'inscription au test de positionnement
 * (`test_positionnement_inscriptions`), c'est-à-dire aux trois seules informations du bloc qui
 * n'avaient jusqu'ici aucun moyen d'être corrigées :
 *   — la session orale, posée à l'inscription publique du candidat et jamais rouvrable ensuite ;
 *   — le niveau du quiz écrit, calculé automatiquement par le quiz (lib/quiz.ts) ;
 *   — le niveau du test oral, qui ne se saisissait qu'au compte rendu de session ou à la
 *     conversion.
 *
 * La VAGUE et la CLASSE n'y figurent pas, et ce n'est pas un oubli :
 *   — avant conversion, elles se DÉDUISENT (la vague du créneau choisi, la classe du niveau
 *     retenu) : les rendre saisissables ici créerait deux sources de vérité pour une même
 *     information, qui divergeraient au premier changement de créneau ;
 *   — après conversion, elles deviennent réelles (`cohort_enrollments`) et ont déjà leurs
 *     propres boutons « Changer de vague » / « Changer de classe », juste en dessous, avec les
 *     garde-fous que la base leur impose (capacité d'une classe, heures déjà consommées —
 *     triggers 0074). Les doubler ici reviendrait à contourner ces garde-fous. */
export function ModifierParcoursCollectif({
  inscription,
  creneauActuel,
  estConverti,
  onAnnuler,
  onEnregistre,
}: {
  inscription: InscriptionTest
  creneauActuel: CreneauTest | null
  /* Candidat déjà converti : la session orale n'est plus qu'un souvenir, sa vague réelle vient
     de son inscription en cohorte. La laisser modifiable ferait croire qu'on le déplace. */
  estConverti: boolean
  onAnnuler: () => void
  onEnregistre: () => void
}) {
  const [creneauId, setCreneauId] = useState(inscription.creneau_id)
  const [niveauTest, setNiveauTest] = useState(inscription.niveau_estime ?? AUCUN)
  const [niveauOral, setNiveauOral] = useState(inscription.niveau_final ?? AUCUN)
  const [creneaux, setCreneaux] = useState<CreneauTest[] | null>(null)
  const [vagues, setVagues] = useState<Cohort[]>([])
  const [inscritsParCreneau, setInscritsParCreneau] = useState<Record<string, number>>({})
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let actif = true
    Promise.all([
      supabase.from('creneaux_test_positionnement').select('*').order('debut'),
      supabase.from('cohorts').select('*'),
      supabase.from('test_positionnement_inscriptions').select('creneau_id'),
    ]).then(([{ data: listeCreneaux }, { data: listeVagues }, { data: listeInscriptions }]) => {
      if (!actif) return
      setCreneaux(listeCreneaux ?? [])
      setVagues(listeVagues ?? [])
      const comptes: Record<string, number> = {}
      for (const i of listeInscriptions ?? []) comptes[i.creneau_id] = (comptes[i.creneau_id] ?? 0) + 1
      setInscritsParCreneau(comptes)
    })
    return () => {
      actif = false
    }
  }, [])

  const optionsNiveau: OptionListeChoix[] = [
    { id: AUCUN, libelle: 'Non évalué' },
    ...NIVEAUX_ANGLAIS.map((n) => ({ id: n, libelle: n })),
  ]

  /* Chaque créneau porte sa vague et son taux de remplissage : déplacer quelqu'un sans voir où
     il atterrit, ni s'il reste de la place, c'est décider à l'aveugle. La capacité n'est pas
     bloquante ici — un admin qui déplace une personne connaît son motif, et le refus
     automatique qui vaut pour une inscription publique (api/prospects/test-positionnement.ts)
     n'a pas à lui être opposé. Elle est seulement DITE. */
  const optionsCreneau: OptionListeChoix[] = (creneaux ?? []).map((c) => {
    const vague = vagues.find((v) => v.id === c.cohort_id)
    const inscrits = inscritsParCreneau[c.id] ?? 0
    const complet = c.capacite_max != null && inscrits >= c.capacite_max && c.id !== inscription.creneau_id
    return {
      id: c.id,
      libelle: `${formaterDansFuseauEtablissement(c.debut)} · ${vague ? nomVagueSeul(vague.nom) : 'vague supprimée'} · ${inscrits}${c.capacite_max != null ? `/${c.capacite_max}` : ''} inscrit${inscrits > 1 ? 's' : ''}${complet ? ' · complet' : ''}`,
    }
  })

  const creneauChoisi = (creneaux ?? []).find((c) => c.id === creneauId) ?? null
  const vagueChoisie = creneauChoisi ? vagues.find((v) => v.id === creneauChoisi.cohort_id) ?? null : null
  const changeDeVague = !!creneauActuel && !!creneauChoisi && creneauActuel.cohort_id !== creneauChoisi.cohort_id

  async function enregistrer() {
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase
      .from('test_positionnement_inscriptions')
      .update({
        ...(estConverti ? {} : { creneau_id: creneauId }),
        niveau_estime: niveauTest || null,
        niveau_final: niveauOral || null,
      })
      .eq('id', inscription.id)
    setEnCours(false)
    if (error) {
      /* `unique (creneau_id, prospect_id)` (0051) : le candidat a déjà une inscription sur la
         session visée. Le message brut de Postgres ne le dirait qu'en anglais et en nommant la
         contrainte — autant énoncer la situation réelle. */
      setErreur(
        error.code === '23505'
          ? 'Ce candidat est déjà inscrit à cette session orale : choisissez-en une autre.'
          : error.message,
      )
      return
    }
    onEnregistre()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {estConverti ? (
        <MessageInfo>
          La session orale n'est plus modifiable une fois le candidat converti : sa vague et sa classe
          réelles se changent avec les boutons dédiés, juste en dessous.
        </MessageInfo>
      ) : (
        <Champ
          label="Session orale"
          aide={
            vagueChoisie
              ? `Vague visée : ${nomVagueSeul(vagueChoisie.nom)}${changeDeVague ? ' — changer de session change donc aussi la vague.' : '.'}`
              : 'La vague visée découle de la session choisie.'
          }
        >
          <ListeChoix
            options={optionsCreneau}
            valeur={creneauId}
            onChange={setCreneauId}
            placeholder={creneaux === null ? 'Chargement…' : 'Choisir une session…'}
            disabled={creneaux === null}
          />
        </Champ>
      )}

      <Champ label="Niveau — quiz écrit" aide="Calculé par le quiz écrit. Indicatif : c'est l'oral qui fait foi.">
        <ListeChoix options={optionsNiveau} valeur={niveauTest} onChange={setNiveauTest} />
      </Champ>

      {/* Ce niveau-là commande la classe de niveau ET le montant des frais d'inscription (0118) :
          le dire ici évite de le corriger en croyant ne toucher qu'un affichage. */}
      <Champ label="Niveau — test oral" aide="Fait foi : détermine la classe de niveau et le montant des frais d'inscription.">
        <ListeChoix options={optionsNiveau} valeur={niveauOral} onChange={setNiveauOral} />
      </Champ>

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onAnnuler} disabled={enCours} style={{ ...boutonNeutreStyle, flexGrow: 1, fontSize: 12.5, padding: 9 }}>
          Annuler
        </button>
        <button
          onClick={enregistrer}
          disabled={enCours}
          className="btn-shine"
          style={{ ...boutonPrimaireStyle, flexGrow: 1, fontSize: 12.5, padding: 9, opacity: enCours ? 0.6 : 1 }}
        >
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
