import { useMemo, useRef, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { PopupSatisfaction } from './SatisfactionSeance'

/* Ouvre automatiquement l'enquête de satisfaction dès qu'une séance vient d'être clôturée sans
   avoir encore reçu l'avis de l'élève connecté — demande client du 2026-09-30 : « pourquoi
   l'enquête de satisfaction... ne se lance pas après que la séance a été clôturée ». Jusqu'ici,
   `SatisfactionSeance.tsx` n'exposait qu'un petit bouton « Donner votre avis » enfoui dans
   l'onglet Parcours pédagogique du dossier — rien ne la « lançait » jamais d'elle-même, il
   fallait la trouver. Monté une fois dans EtudiantLayout.tsx (comme BienvenueEtudiant), donc sur
   toutes les pages de l'espace élève, pas seulement le dossier.

   `studentId` reste PROPRE à l'identité connectée (`profile.id`), jamais `idEtudiantEffectif` :
   pour un binôme DUO, chaque membre a assisté au même cours mais répond à sa propre enquête (voir
   le même choix déjà fait dans MonEspaceEtudiant.tsx/DossierEtudiantVue.tsx). Le dossier, lui,
   reste chargé sous `idEtudiantEffectif` (dossier partagé par le binôme) — c'est dans SES
   séances que la recherche porte, la réponse déjà donnée étant filtrée sur `studentId`.

   Fenêtre de 14 jours sur `debut` (aucune colonne « clôturée le » sur `sessions`, seule sa date
   de cours est connue) : au-delà, une séance ancienne jamais notée n'a plus grand intérêt à
   interrompre l'élève à chaque connexion — elle reste répondable depuis le dossier. */
const FENETRE_JOURS = 14

export function EnqueteSatisfactionAuto() {
  const { profile, idEtudiantEffectif } = useProfileContext()
  const { dossier, recharger } = useDossierEtudiant(idEtudiantEffectif ?? undefined)
  // Une séance fermée ici (sans y répondre) ne revient pas tant que l'onglet reste ouvert —
  // seul un rechargement de page (nouvelle session de navigation) la reproposera, le temps
  // qu'elle sorte de la fenêtre de 14 jours ou reçoive une réponse.
  const ignoreesRef = useRef(new Set<string>())
  const [, forcerRendu] = useState(0)

  const cible = useMemo(() => {
    if (!dossier || !profile) return null
    const seuil = Date.now() - FENETRE_JOURS * 86_400_000
    const candidates = dossier.periodes
      .flatMap((p) => p.seances.map((s) => ({ seance: s, professeur: p.professeur })))
      .filter(
        (c) =>
          c.seance.session.statut === 'terminee' &&
          new Date(c.seance.session.debut).getTime() >= seuil &&
          !c.seance.satisfactions.some((sat) => sat.student_id === profile.id) &&
          !ignoreesRef.current.has(c.seance.session.id) &&
          // Rien à évaluer pour une absence constatée à la clôture — demande client du
          // 2026-09-30 : « quand l'étudiant est absent, il est inutile de lancer une enquête ».
          c.seance.enrollment.present !== false,
      )
      .sort((a, b) => b.seance.session.debut.localeCompare(a.seance.session.debut))
    return candidates[0] ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier, profile])

  if (!cible || !profile) return null

  function fermer() {
    ignoreesRef.current.add(cible!.seance.session.id)
    forcerRendu((n) => n + 1)
  }

  return (
    <PopupSatisfaction
      seance={cible.seance}
      studentId={profile.id}
      professeur={cible.professeur ? `${cible.professeur.prenom} ${cible.professeur.nom}` : null}
      onFermer={fermer}
      onEnregistre={() => {
        recharger()
      }}
    />
  )
}
