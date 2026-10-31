import { supabase } from '../lib/supabaseClient'
import type { CreneauClasseDefini } from '../lib/classesCollectif'
import { useCacheRequete } from './useCacheRequete'

/* Créneaux horaires proposés aux classes de niveau (0150), dans l'ordre choisi par
   l'administration. Chargés via le cache de requêtes partagé : le même libellé s'affiche dans
   l'espace admin, l'espace professeur et le dossier de l'élève, et une modification dans
   Paramètres se répercute partout dès le rechargement de la liste.

   `actif` est rendu tel quel plutôt que filtré ici : les listes de CHOIX ne proposent que les
   créneaux actifs, mais l'AFFICHAGE d'une classe déjà rattachée à un créneau retiré doit encore
   pouvoir en lire le libellé. */
export function useCreneauxClasses() {
  const { valeur, loading, erreur, recharger } = useCacheRequete('creneaux-classes', async () => {
    const { data, error } = await supabase
      .from('creneaux_classes')
      .select('id, cle, libelle, heure, ordre, actif')
      .order('ordre')
      .order('heure')
    if (error) throw new Error(error.message)
    return data ?? []
  })

  return {
    creneaux: (valeur ?? []) as (CreneauClasseDefini & { id: string; ordre: number })[],
    loading,
    erreur,
    recharger,
  }
}
