/* Une inscription peut survivre au compte de l'élève : la suppression d'un étudiant est une
   suppression douce (`status = 'suspended'`, voir api/admin/supprimer-utilisateur.ts) et toutes
   les vues masquent désormais ces profils. L'inscription, elle, reste en base — c'est une trace
   pédagogique — mais son profil n'est plus résoluble. Afficher « Élève supprimé » plutôt qu'un
   « ? » muet, comme on le fait déjà pour un prospect supprimé (agendaEvenements.ts). */
export function nomEleveInscrit(
  etudiant: { prenom: string | null; nom: string | null } | null | undefined,
): string {
  if (!etudiant) return 'Élève supprimé'
  return `${etudiant.prenom ?? ''} ${etudiant.nom ?? ''}`.trim()
}

export function nomsElevesInscrits(
  inscriptions: { etudiant: { prenom: string | null; nom: string | null } | null }[],
): string[] {
  return inscriptions.map((i) => nomEleveInscrit(i.etudiant))
}

/* Revu le 2026-09-23 : un compte supprimé ne doit plus laisser aucune trace visible NULLE PART,
   passé compris (demande client explicite — « il faut enlever toutes les informations lui
   concernant [...] les rendez-vous passés, planning, rendez-vous futur »). L'ancienne version ne
   filtrait que l'avenir, en gardant l'historique intact par souci de traçabilité pédagogique ;
   ce choix est désormais surclassé par la demande du client. Les données ne sont PAS supprimées
   en base (la personne peut se réinscrire plus tard) — seul l'AFFICHAGE change.

   Renvoie `null` quand la séance entière est à masquer : elle avait des inscrits, tous
   supprimés. Une séance créée sans aucun inscrit est légitime et reste visible (aucun rapport
   avec une suppression de compte). */
export function inscriptionsVisibles<I extends { etudiant: unknown | null }>(
  inscriptions: I[],
): I[] | null {
  const actives = inscriptions.filter((i) => i.etudiant)
  if (inscriptions.length > 0 && actives.length === 0) return null
  return actives
}

/* `sessions.type` ne distingue que 'individuel' et 'collectif' (0008) : un binôme DUO est une
   séance 'individuel' à deux inscrits. Le reconnaître demande donc de regarder QUI est inscrit,
   pas la colonne `type` — exactement deux élèves, liés l'un à l'autre par `duo_partenaire_id`
   (0054, lien asymétrique : un seul des deux le porte).

   Une coïncidence — deux élèves d'une même vague, seuls présents ce jour-là — ne passe pas ce
   test et reste « Collectif ».

   Partagé depuis `CalendrierProfesseur.tsx` le 2026-10-11 : la même séance s'affichait « Duo »
   dans l'agenda du professeur et « Individuel » partout ailleurs (fiche admin, agenda de
   l'élève, comptes rendus), faute d'un seul endroit pour en décider. */
export function estSeanceDuo(
  inscriptions: { etudiant: { id: string; duo_partenaire_id?: string | null } | null }[],
): boolean {
  if (inscriptions.length !== 2) return false
  const [a, b] = inscriptions
  if (!a.etudiant || !b.etudiant) return false
  return a.etudiant.duo_partenaire_id === b.etudiant.id || b.etudiant.duo_partenaire_id === a.etudiant.id
}

export function libelleTypeSeance(
  type: 'individuel' | 'collectif',
  inscriptions: { etudiant: { id: string; duo_partenaire_id?: string | null } | null }[],
): string {
  if (estSeanceDuo(inscriptions)) return 'Duo'
  return type === 'individuel' ? 'Individuel' : 'Collectif'
}

/* Séances d'un élève que AUCUNE de ses affectations individuelles ne réclame — demande client du
   2026-10-19 : « il faudrait que tous les étudiants en cours collectifs soient visibles dans la
   section Étudiants afin de bien suivre l'étudiant en cours collectif ». Le parcours d'un dossier
   se construit sur `teacher_assignments` (une période par professeur), or un élève en cours
   collectif n'en a aucune : son professeur est celui de sa classe de niveau (0074). Ses séances
   restaient donc invisibles, et son dossier affichait « Aucune séance enregistrée » alors qu'il
   suivait normalement ses cours.

   Le second test (`!ids.has(...)`) n'est pas redondant avec le premier : une affectation
   supprimée laisse derrière elle des inscriptions qui la référencent encore, et ces séances-là
   ne doivent pas disparaître du dossier non plus. */
export function seancesHorsAffectation<S extends { enrollment: { teacher_assignment_id: string | null } }>(
  seances: S[],
  affectationIds: string[],
): S[] {
  const ids = new Set(affectationIds)
  return seances.filter((s) => !s.enrollment.teacher_assignment_id || !ids.has(s.enrollment.teacher_assignment_id))
}

/* Auteur affiché dans l'historique d'une séance (EditerSeancePlanifieeModale.tsx) — demande
   client du 2026-10-19, capture à l'appui : une modification faite par un admin s'affichait
   « Utilisateur inconnu ». `estAdmin` vient de `session_modifications.modifie_par_est_admin`
   (0132), enregistré à l'écriture et jamais recalculé en relisant le profil : un admin
   plateforme garde une ligne `profiles` rattachée à SON établissement d'origine, invisible via
   RLS à un autre admin dès que la séance appartient à un établissement différent
   (`profiles_admin_select_etablissement`, 0004) — d'où le nom introuvable malgré un acteur bien
   identifié comme admin. Le nom est ajouté quand il est aussi lisible, jamais substitué à lui. */
export function libelleAuteurModification(
  estAdmin: boolean,
  auteur: { prenom: string | null; nom: string | null } | null,
): string {
  const nom = auteur ? `${auteur.prenom ?? ''} ${auteur.nom ?? ''}`.trim() : ''
  if (estAdmin) return nom ? `Admin · ${nom}` : 'Admin'
  return nom || 'Utilisateur inconnu'
}
