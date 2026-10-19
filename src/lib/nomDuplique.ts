/* Comparaison de noms de personnes, partagée entre le navigateur et les fonctions `api/`
   (celles-ci importent déjà depuis `src/`, voir api/_lib/teacherAuth.ts). Le but n'est pas de
   normaliser un nom pour l'enregistrer — la saisie de l'admin est conservée telle quelle — mais
   de décider si deux saisies désignent la même personne : « Jean-Pierre RAKOTO » et
   « jean pierre rakoto » doivent être reconnus comme un doublon. */

export function normaliserNom(valeur: string | null | undefined): string {
  return (valeur ?? '')
    .normalize('NFD')
    // Retire les diacritiques décomposés par NFD (é -> e + accent aigu), pour qu'un accent
    // oublié à la saisie ne crée pas un second dossier pour la même personne.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Tirets, apostrophes et points servent d'espaces : « Jean-Pierre » = « Jean Pierre ».
    .replace(/[-'’.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function memeNom(
  a: { nom?: string | null; prenom?: string | null },
  b: { nom?: string | null; prenom?: string | null },
): boolean {
  const nomA = normaliserNom(a.nom)
  const prenomA = normaliserNom(a.prenom)
  // Un nom vide ne peut pas faire doublon : ce serait bloquer toutes les fiches incomplètes
  // entre elles.
  if (!nomA || !prenomA) return false
  return nomA === normaliserNom(b.nom) && prenomA === normaliserNom(b.prenom)
}

export function nomComplet(personne: { nom?: string | null; prenom?: string | null }): string {
  return `${personne.prenom ?? ''} ${personne.nom ?? ''}`.trim()
}

/* Qui compte comme homonyme bloquant — la règle, en un seul endroit, partagée par les routes
   `api/` (nomDuplique.ts côté serveur) et par l'édition d'une fiche depuis le navigateur
   (InformationsPersonnelles.tsx). Elle vivait en double, et c'est la copie du navigateur qui a
   oublié les comptes supprimés : le 2026-10-19, un élève bien actif ne pouvait plus enregistrer
   sa propre fiche, « bernard bensas existe déjà dans cet établissement » — l'autre bernard étant
   un compte supprimé, invisible partout ailleurs dans l'application.

   Trois conditions, et la liste ne doit plus jamais se recopier ailleurs :
   - même nom, accents, casse et tirets ignorés (`memeNom`) ;
   - la personne elle-même ne se bloque pas (`exclureId`) — sinon toute modification de fiche
     serait impossible ;
   - un compte supprimé (`status = 'suspended'`) ne bloque personne : il n'apparaît dans aucune
     liste, il ne peut donc pas créer la confusion que cette garde existe pour éviter. */
export function homonymeBloquant<P extends { id: string; nom?: string | null; prenom?: string | null; status?: string | null }>(
  profils: P[],
  cible: { nom?: string | null; prenom?: string | null; exclureId?: string },
): P | null {
  return (
    profils.find(
      (p) => p.id !== cible.exclureId && p.status !== 'suspended' && memeNom(p, { nom: cible.nom, prenom: cible.prenom }),
    ) ?? null
  )
}
