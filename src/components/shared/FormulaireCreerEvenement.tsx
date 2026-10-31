import { useMemo, useState, type FormEvent } from 'react'
import { jetonAcces } from '../../lib/jetonAcces'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { useVagues } from '../../hooks/useVagues'
import { useClassesAvecMembres } from '../../hooks/useClassesAvecMembres'
import { nomVagueSeul } from '../../lib/cohortes'
import { genererOccurrences, versRRule, type RegleRecurrence } from '../../lib/recurrence'
import { etudiantsSelectionnables, vaguesSelectionnables, classesSelectionnables } from '../../lib/invitations'
import { LABEL_NIVEAU_CLASSE } from '../../lib/classesCollectif'
import { SelecteurRecurrence } from './SelecteurRecurrence'
import { ChoixNatureRendezVous } from './ChoixNatureRendezVous'
import type { NatureRendezVous } from '../../lib/natureRendezVous'
import { Modale } from '../ui/Modale'
import { SelecteurPersonnes } from '../ui/SelecteurPersonnes'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { Champ, champStyle, etiquetteStyle } from '../ui/Champ'
import { ChampDate } from '../ui/ChampDate'

function versDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/* Fenêtre « Créer un rendez-vous », extraite de RendezVousAdmin.tsx le 2026-10-31 pour servir un
   second appelant : la fiche d'un élève, d'où l'administration planifie une séance ou une réunion
   avec le professeur et l'élève DÉJÀ connus de l'écran (demande client — « un pop-up similaire
   apparaîtra avec le nom de ou des professeurs et étudiants associés qui s'afficheront par
   défaut »).

   Extraite et non recopiée : ce formulaire porte quatre chemins d'écriture distincts (séance
   simple, séance en série, rendez-vous simple, rendez-vous récurrent Google) et les règles qui
   décident lequel emprunter. Deux copies auraient divergé au premier correctif. */
export function FormulaireCreerEvenement({
  debutInitial,
  participantsInitiaux,
  natureInitiale = 'autre',
  dureeInitiale = 60,
  onFermer,
  onCree,
}: {
  debutInitial: Date
  /* Participants déjà connus de l'écran appelant — le professeur et l'élève, quand la fenêtre
     s'ouvre depuis une fiche d'élève. Ils remplissent la zone « obligatoires » d'emblée, et
     restent retirables : l'admin peut convier quelqu'un de plus ou se raviser. */
  participantsInitiaux?: string[]
  /* Nature cochée à l'ouverture. Depuis la fiche d'un élève c'est « séance de cours » : c'est ce
     qu'on vient y faire neuf fois sur dix, et la case « Autre » reste à un clic pour une réunion
     ou une séance d'information. */
  natureInitiale?: NatureRendezVous
  dureeInitiale?: number
  onFermer: () => void
  onCree: () => void
}) {
  const { etudiants } = useEtudiants()
  const { professeurs } = useProfesseurs()
  const { vagues } = useVagues()
  const { classes } = useClassesAvecMembres()
  const [titre, setTitre] = useState('')
  const [nature, setNature] = useState<NatureRendezVous>(natureInitiale)
  const [debut, setDebut] = useState(versDatetimeLocal(debutInitial))
  const [dureeMinutes, setDureeMinutes] = useState(dureeInitiale)
  const [obligatoiresIds, setObligatoiresIds] = useState<string[]>(participantsInitiaux ?? [])
  const [optionnelsIds, setOptionnelsIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  /* `null` = événement ponctuel, le cas courant. Sinon, une règle de récurrence construite par
     SelecteurRecurrence.tsx — traduite en RRULE iCalendar pour un rendez-vous « autre » (Google
     en porte alors seul la répétition), ou en dates concrètes pour une séance de cours (0123,
     chaque occurrence devient une vraie `sessions`, liée aux autres par un `serie_id` commun). */
  const [regleRecurrence, setRegleRecurrence] = useState<RegleRecurrence | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  /* Un seul vivier, étudiants et professeurs mélangés — demande client du 2026-09-16 :
     « toutes les personnes de l'application devraient être retrouvables dans ces zones de
     recherche ». L'étiquette de rôle affichée dans les suggestions (voir SelecteurPersonnes)
     permet de les distinguer sans les séparer en deux listes. Depuis le 2026-09-23 s'y ajoutent
     les vagues, qui convient tous leurs inscrits d'un coup. */
  const toutLeMonde = useMemo(
    () => [
      ...etudiantsSelectionnables(etudiants),
      ...professeurs.map((p) => ({ ...p, role: 'Professeur' })),
      ...vaguesSelectionnables(vagues),
      ...classesSelectionnables(classes),
    ],
    [etudiants, professeurs, vagues, classes],
  )

  /* Vivier d'une séance de cours, scindé en deux — demande client du 2026-10-31, capture à
     l'appui : « sépare le bloc professeur et élève en deux blocs : un bloc Professeur et un
     autre bloc Étudiant ». Un rendez-vous « autre » (réunion, point de suivi) garde SON unique
     champ mélangé juste en dessous : rien n'y distingue a priori qui est professeur ou élève, la
     scission ne vaudrait rien pour lui. */
  const professeursPourSeance = useMemo(() => professeurs.map((p) => ({ ...p, role: 'Professeur' })), [professeurs])
  const etudiantsPourSeance = useMemo(
    () => [...etudiantsSelectionnables(etudiants), ...vaguesSelectionnables(vagues), ...classesSelectionnables(classes)],
    [etudiants, vagues, classes],
  )

  const professeurIds = useMemo(() => new Set(professeurs.map((p) => p.id)), [professeurs])
  const tousParticipants = [...obligatoiresIds, ...optionnelsIds]
  const professeursConvies = tousParticipants.filter((id) => professeurIds.has(id))
  const etudiantsConvies = tousParticipants.filter((id) => !professeurIds.has(id))
  /* Les deux blocs d'une séance de cours partagent le même état `obligatoiresIds` que le champ
     mélangé d'un rendez-vous « autre » — rien d'autre dans le fichier (validation à l'envoi,
     classe/vague détectées, titre récapitulatif) n'a alors besoin de savoir d'où vient un
     identifiant. Chaque bloc n'en reçoit et n'en renvoie que son sous-ensemble. */
  const profsSeanceSelectionnes = obligatoiresIds.filter((id) => professeurIds.has(id))
  const etudiantsSeanceSelectionnes = obligatoiresIds.filter((id) => !professeurIds.has(id))

  /* Une séance n'est rattachée à une classe/vague que si tout son effectif y est, et lui seul :
     c'est cette appartenance qui fait décompter l'heure à tous ses inscrits, présents ou non
     (0069, point 10 ; 0074 pour les classes). Une classe est plus spécifique qu'une vague
     entière : testée en premier. */
  const classeDeLaSeance = useMemo(() => {
    const choisis = new Set(etudiantsConvies)
    return classes.find((c) => c.membreIds.length === choisis.size && c.membreIds.every((id) => choisis.has(id)))
  }, [etudiantsConvies, classes])

  const vagueDeLaSeance = useMemo(() => {
    if (classeDeLaSeance) return undefined
    const choisis = new Set(etudiantsConvies)
    return vagues.find((v) => v.membreIds.length === choisis.size && v.membreIds.every((id) => choisis.has(id)))
  }, [etudiantsConvies, vagues, classeDeLaSeance])

  async function creer(e: FormEvent) {
    e.preventDefault()
    if (!debut) {
      setErreur('La date est obligatoire.')
      return
    }
    /* Un participant reste exigé pour une séance de cours — elle n'a pas de sens sans élève — mais
       plus pour un rendez-vous : un créneau que l'admin se bloque n'invite personne. */
    if (nature === 'seance_cours' && obligatoiresIds.length === 0 && optionnelsIds.length === 0) {
      setErreur('Une séance de cours demande au moins un participant.')
      return
    }
    if (nature === 'autre' && !titre.trim()) {
      setErreur('Le titre est obligatoire.')
      return
    }
    /* Une séance de cours n'est pas un événement d'agenda : c'est une vraie `sessions`, seul
       objet dont la clôture décompte les heures du forfait de l'élève et crédite celles du
       professeur (api/professeur/cloturer-seance.ts). D'où deux points d'entrée distincts selon
       la case cochée — demande client du 2026-09-23, point 3. */
    if (nature === 'seance_cours' && (professeursConvies.length !== 1 || etudiantsConvies.length === 0)) {
      setErreur('Une séance de cours demande exactement un professeur et au moins un élève.')
      return
    }
    setEnCours(true)
    setErreur(null)

    /* Un rendez-vous qui se répète part directement dans l'agenda Google, sans ligne
       `evenements_admin` : cette table ne sait pas représenter une répétition, et n'y inscrire que
       la première occurrence ferait apparaître ce jour-là deux fois dans l'agenda. L'agenda HOC
       l'affiche ensuite par la superposition Google, avec sa fiche et ses boutons. */
    if (nature === 'autre' && regleRecurrence) {
      const reponseSerie = await fetch('/api/admin/google-evenement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonAcces()}` },
        body: JSON.stringify({
          action: 'creer',
          titre: titre.trim(),
          debut: new Date(debut).toISOString(),
          dureeMinutes,
          description: notes.trim() || undefined,
          recurrence: versRRule(regleRecurrence),
        }),
      })
        .then((r) => r.json())
        .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
      setEnCours(false)
      if (reponseSerie.error) {
        setErreur(reponseSerie.error)
        return
      }
      onCree()
      return
    }

    /* Séance de cours récurrente (0123) : chaque occurrence devient une vraie `sessions`, liée
       aux autres par un `serie_id` commun — même route que le Planning prévisionnel
       (planifier-seances-prevision.ts), qui sait déjà créer plusieurs séances d'un coup et n'a
       besoin que de la liste des dates déjà résolues. */
    if (nature === 'seance_cours' && regleRecurrence) {
      const debuts = genererOccurrences(regleRecurrence, new Date(debut)).map((d) => d.toISOString())
      const reponseSerie = await fetch('/api/admin/planifier-seances-prevision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonAcces()}` },
        body: JSON.stringify({
          teacherId: professeursConvies[0],
          studentIds: etudiantsConvies,
          dureeMinutes,
          debuts,
          cohortId: classeDeLaSeance?.cohorte?.id ?? vagueDeLaSeance?.cohorte.id,
          cohortClassId: classeDeLaSeance?.classe.id,
        }),
      })
        .then((r) => r.json())
        .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
      setEnCours(false)
      if (reponseSerie.error) {
        setErreur(reponseSerie.error)
        return
      }
      onCree()
      return
    }

    const reponse = await fetch(
      nature === 'seance_cours' ? '/api/professeur/planifier-seance' : '/api/admin/creer-evenement',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonAcces()}` },
        body: JSON.stringify(
          nature === 'seance_cours'
            ? {
                teacherId: professeursConvies[0],
                studentIds: etudiantsConvies,
                type: etudiantsConvies.length > 1 ? 'collectif' : 'individuel',
                debut: new Date(debut).toISOString(),
                dureeMinutes,
                cohortId: classeDeLaSeance?.cohorte?.id ?? vagueDeLaSeance?.cohorte.id,
                cohortClassId: classeDeLaSeance?.classe.id,
              }
            : {
                titre: titre.trim(),
                debut: new Date(debut).toISOString(),
                dureeMinutes,
                obligatoiresIds,
                optionnelsIds,
                notes: notes.trim() || undefined,
              },
        ),
      },
    )
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
    setEnCours(false)
    if (reponse.error) {
      setErreur(reponse.error)
      return
    }
    onCree()
  }

  return (
    <Modale titre="Créer un rendez-vous" onFermer={onFermer} largeurMax={480}>
      <form onSubmit={creer} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ChoixNatureRendezVous valeur={nature} onChange={setNature} />
        <Champ label="Titre" obligatoire={nature === 'autre'}>
          <input
            required={nature === 'autre'}
            placeholder={nature === 'seance_cours' ? 'Intitulé du cours (facultatif)' : 'Ex. Point de mi-parcours'}
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            style={champStyle}
          />
        </Champ>
        {/* Les deux champs portent enfin leur intitulé — signalé par le client le 2026-10-31,
            capture à l'appui : « la case 60 n'a pas d'intitulé, il faut en rajouter et la case
            n'est pas visuellement bien ». Une case numérique isolée au milieu d'un formulaire ne
            dit pas ce qu'elle mesure, et son `title` ne se lit qu'au survol — invisible au
            clavier comme au premier coup d'œil. `Champ` est le composant d'intitulé déjà employé
            partout ailleurs dans l'application : le formulaire s'aligne du même coup sur les
            autres écrans. */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <Champ label="Date et heure de début" obligatoire style={{ flex: 1, minWidth: 0 }}>
            <ChampDate required type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="Durée (min)" obligatoire style={{ width: 110, flexShrink: 0 }}>
            <input
              required
              type="number"
              min={5}
              max={480}
              step={5}
              value={dureeMinutes}
              onChange={(e) => setDureeMinutes(Number(e.target.value))}
              style={champStyle}
            />
          </Champ>
        </div>

        {/* Deux zones de recherche façon Outlook — demande client du 2026-09-16 : « on devrait
            avoir le même principe que Outlook lors de la réservation d'un point ». Une même
            personne ne peut pas se retrouver dans les deux à la fois (`exclure`). */}
        {nature === 'seance_cours' ? (
          <>
            {/* Professeur(s) et élève(s), en deux blocs — demande client du 2026-10-31. Quand
                l'élève a plusieurs professeurs actifs (0138), `participantsInitiaux` les y pose
                tous les deux par défaut : « mets les deux professeurs par défaut [...] l'admin
                pourra en enlever manuellement ». Une séance de cours n'en garde en revanche
                qu'UN seul à l'envoi (`sessions.teacher_id` est une colonne unique) : le message
                d'erreur plus bas le rappelle si l'admin valide sans avoir retiré le second. */}
            <SelecteurPersonnes
              etiquette="Professeur(s)"
              placeholder="Rechercher un professeur…"
              candidats={professeursPourSeance}
              selectionnes={profsSeanceSelectionnes}
              onChange={(ids) => setObligatoiresIds((actuels) => [...ids, ...actuels.filter((id) => !professeurIds.has(id))])}
            />
            <SelecteurPersonnes
              etiquette="Élève(s)"
              placeholder="Rechercher un nom, une classe ou une vague…"
              candidats={etudiantsPourSeance}
              selectionnes={etudiantsSeanceSelectionnes}
              onChange={(ids) => setObligatoiresIds((actuels) => [...actuels.filter((id) => professeurIds.has(id)), ...ids])}
            />
          </>
        ) : (
          <SelecteurPersonnes
            etiquette="Participants obligatoires"
            placeholder="Rechercher un nom, une classe ou une vague…"
            candidats={toutLeMonde}
            selectionnes={obligatoiresIds}
            onChange={setObligatoiresIds}
            exclure={optionnelsIds}
          />
        )}
        {nature === 'autre' && obligatoiresIds.length === 0 && optionnelsIds.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
            Sans participant, ce créneau sera simplement bloqué dans votre agenda : il part dans votre agenda Google,
            sans invitation à envoyer.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={etiquetteStyle}>Répétition</span>
          <SelecteurRecurrence debut={new Date(debut || debutInitial)} valeur={regleRecurrence} onChange={setRegleRecurrence} />
          {regleRecurrence && nature === 'autre' && (
            <span style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              Un rendez-vous qui se répète est créé directement dans l’agenda Google, sans participant HOC. Vous le
              retrouverez dans cet agenda, où vous pourrez modifier ou supprimer une seule date ou toute la série.
            </span>
          )}
          {regleRecurrence && nature === 'seance_cours' && (
            <span style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              {genererOccurrences(regleRecurrence, new Date(debut || debutInitial)).length} séance(s) seront créées, liées entre
              elles : modifier ou annuler l’une d’elles proposera de le faire pour elle seule ou pour toute la série.
            </span>
          )}
        </div>
        {/* Une séance de cours n'a pas d'invité facultatif : on y est inscrit ou on ne l'est pas,
            et c'est cette inscription qui décompte les heures. */}
        {nature === 'autre' && (
          <SelecteurPersonnes
            etiquette="Participants optionnels"
            placeholder="Rechercher un nom, une classe ou une vague…"
            candidats={toutLeMonde}
            selectionnes={optionnelsIds}
            onChange={setOptionnelsIds}
            exclure={obligatoiresIds}
          />
        )}

        {nature === 'seance_cours' && classeDeLaSeance && (
          <p style={{ fontSize: 12, color: 'var(--accent-violet)', margin: 0, lineHeight: 1.5 }}>
            Séance de la classe « {LABEL_NIVEAU_CLASSE[classeDeLaSeance.classe.niveau]}
            {classeDeLaSeance.classe.nom ? ` — ${classeDeLaSeance.classe.nom}` : ''} » : une fois clôturée, l’heure sera
            décomptée du forfait de ses {classeDeLaSeance.membreIds.length} inscrits, présents ou non.
          </p>
        )}
        {nature === 'seance_cours' && !classeDeLaSeance && vagueDeLaSeance && (
          <p style={{ fontSize: 12, color: 'var(--accent-violet)', margin: 0, lineHeight: 1.5 }}>
            Séance de la vague « {nomVagueSeul(vagueDeLaSeance.cohorte.nom)} » : une fois clôturée, l’heure sera décomptée du forfait
            de ses {vagueDeLaSeance.membreIds.length} inscrits, présents ou non.
          </p>
        )}

        {nature === 'autre' && (
          <Champ label="Notes (facultatif)">
            <textarea
              placeholder="Ordre du jour, point à préparer…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Champ>
        )}

        {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erreur}</p>}
        <button type="submit" disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, opacity: enCours ? 0.7 : 1 }}>
          {enCours ? 'Création…' : nature === 'seance_cours' ? 'Planifier la séance' : 'Créer le rendez-vous'}
        </button>
      </form>
    </Modale>
  )
}
