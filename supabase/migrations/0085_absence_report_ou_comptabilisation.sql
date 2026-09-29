-- Choix à la clôture d'une séance individuel/duo dès qu'un élève est absent (demande client du
-- 2026-09-29) : jusqu'ici (0011), un élève marqué absent n'était simplement pas débité — le
-- professeur, lui, restait toujours crédité, et la séance passait « terminée » comme si de rien
-- n'était. Le client veut désormais un choix explicite, avec justificatif obligatoire des deux
-- côtés :
--   - « Reporter » : la séance n'a pas eu lieu, rien n'est compté (ni le professeur, ni l'élève) ;
--   - « Comptabiliser » : comptée pour les deux malgré l'absence (politique de type no-show).
-- Voir api/professeur/cloturer-seance.ts pour la logique.

-- Nouveau statut, distinct de « annulee » (qui signifie que la séance n'aura JAMAIS lieu) et de
-- « terminee » (qui reste réservée à une séance effectivement comptée, présence ou non).
alter type public.statut_seance add value 'reportee';

-- Trace du choix dans la même table que les reprogrammations/annulations (0048) — un seul
-- historique par séance, justificatif compris, plutôt qu'un de plus. Le nom de la contrainte
-- n'étant pas garanti (nommage par défaut de Postgres), on la retrouve par son contenu plutôt que
-- par un nom supposé.
do $$
declare
  v_nom_contrainte text;
begin
  select conname into v_nom_contrainte
  from pg_constraint
  where conrelid = 'public.session_modifications'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%type_modification%';
  if v_nom_contrainte is not null then
    execute format('alter table public.session_modifications drop constraint %I', v_nom_contrainte);
  end if;
end $$;

alter table public.session_modifications
  add constraint session_modifications_type_modification_check
  check (type_modification in ('reprogrammee', 'annulee', 'reportee', 'absence_comptabilisee'));
