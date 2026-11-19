-- Changer de vague à mi-parcours, une fois le forfait en cours SOLDÉ — décision client du
-- 2026-11-19 : « quand l'admin choisit de déplacer un étudiant vers une autre classe ou une
-- autre vague de classe, alors qu'il n'a pas encore terminé tout son forfait d'heures en cours,
-- il faut alors l'avertir et lui donner le choix s'il souhaite garder le compteur actuel ou
-- souhaite réinitialiser le compteur de l'étudiant. »
--
-- Le garde-fou de 0074 (assoupli une première fois par 0147) interdisait ce mouvement : un élève
-- ne quittait sa promotion que s'il n'y avait consommé aucune heure, ou s'il avait terminé son
-- forfait. Il protégeait d'un vrai risque — ouvrir un forfait neuf dans la vague d'arrivée en
-- laissant derrière soi des heures payées et jamais suivies — mais il le faisait en INTERDISANT,
-- là où le client veut désormais DÉCIDER, cas par cas et en connaissance de cause.
--
-- Ce que la décision devient, côté application : l'admin choisit entre conserver le compteur
-- (le nouveau forfait reprend les heures restantes, rien n'est perdu, rien n'est revendu) et le
-- réinitialiser (forfait complet, les heures non suivies sont abandonnées). Dans les DEUX cas,
-- le forfait en cours est soldé — c'est précisément ce que la route fait avant de déplacer
-- l'inscription (api/admin/deplacer-etudiants-classe.ts).
--
-- D'où la formulation retenue ici, qui dit la règle plutôt que de nommer un appelant :
--
--     on ne quitte pas sa promotion en laissant derrière soi un forfait collectif OUVERT.
--
-- Elle laisse passer la route de déplacement, qui solde avant de déplacer, et continue de
-- retenir le chemin qui ne solde rien — « Changer de vague » depuis le dossier de l'élève
-- (AssignerVague.tsx), qui ne touche ni au forfait ni au planning et ferait donc exactement la
-- perte que 0074 redoutait. Le message d'erreur le dit maintenant en toutes lettres, pour que
-- l'admin sache par où passer.

begin;

create or replace function public.verifier_pas_de_consommation_avant_changement_promotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.cohort_id is distinct from new.cohort_id
     and public.etudiant_a_consomme_heures_promotion(old.student_id, old.cohort_id)
     -- L'exception de 0147 : un parcours mené à son terme n'a plus rien à perdre en changeant de
     -- promotion, il en recommence un.
     and not public.forfait_collectif_entierement_consomme(old.student_id, old.cohort_id, old.cohort_class_id)
     /* L'exception de 0164 : à mi-parcours aussi, à CONDITION que le forfait en cours ait été
        soldé. Le solder est le geste par lequel l'administration tranche le sort des heures
        restantes — les reporter sur le forfait suivant, ou les abandonner. Tant qu'un forfait
        collectif reste ouvert, ce choix n'a pas été fait, et l'élève ne part pas. */
     and exists (
       select 1
         from public.packages p
        where p.student_id = old.student_id
          and p.type_programme = 'collectif'
          and p.clos_le is null
     ) then
    raise exception 'Cet élève a commencé son forfait dans sa promotion actuelle sans l''avoir terminé : son forfait doit d''abord être soldé. Passez par « Déplacer un étudiant » depuis Cours collectifs, qui vous laisse choisir le sort de ses heures restantes.';
  end if;
  return new;
end;
$$;

commit;
