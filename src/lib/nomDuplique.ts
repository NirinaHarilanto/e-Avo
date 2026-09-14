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
