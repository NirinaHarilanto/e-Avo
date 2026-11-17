-- Prestation « Extra » accordée à un professeur — demande client du 2026-11-17 : « rajoute un
-- bloc "Extra", au même titre que le bloc bonus, à partir duquel l'admin pourra attribuer une
-- prestation, AUTRE QUE CE QUI EST DÉJÀ DÉFINI À CE JOUR DANS HOC, à un professeur [...] le type
-- de prestation, la durée, le montant de la prestation, le statut de la prestation, date et lieu
-- de la prestation [...] Pour les prestations validées, le montant validé sera rajouté
-- automatiquement dans le timesheet du professeur également. »
--
-- Pourquoi une table NOUVELLE et non une extension de `prestations_externes` (0131), qui porte
-- pourtant déjà type/client/début/durée/lieu/statut : parce que les deux ne se paient pas de la
-- même façon. Une prestation externe est rémunérée AUX HEURES, au taux corporate ou chat & chill
-- du professeur — son montant se calcule (`calculerRemuneration`), il ne se saisit pas. Un Extra
-- porte son PROPRE montant, décidé au cas par cas, précisément parce qu'il sort de ce qui est
-- déjà défini. Les mêler aurait obligé `calculerRemuneration` à distinguer deux régimes dans la
-- même table, et le `check (type in ('corporate','chat_chill'))` de 0131 à devenir libre — soit
-- à défaire la garantie qui fait que chaque prestation externe trouve un taux.
--
-- Un Extra est donc, mécaniquement, un cousin du bonus (0162) : un montant qui s'ajoute au relevé
-- d'heures à sa validation. Il en reprend la convention de « payé » — `teacher_payment_id`
-- renseigné (0029) — et le garde-fou qui interdit de réécrire ce qui est déjà parti en paiement.

begin;

create table public.prestations_extra (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  teacher_id uuid not null references public.profiles(id),
  /* Libre, et c'est tout l'objet : « autre que ce qui est déjà défini à ce jour dans HOC ».
     Un `check (type in (...))` comme celui de 0131 reviendrait à redéfinir une liste fermée,
     exactement ce que cette table existe pour éviter. */
  type_prestation text not null check (length(btrim(type_prestation)) > 0),
  montant numeric(12, 2) not null check (montant > 0),
  /* Informative : elle décrit la prestation, elle ne CALCULE pas le montant (contrairement aux
     prestations externes de 0131). Facultative — un forfait de relecture ou de conception n'a
     pas toujours de durée qui ait un sens. */
  duree_minutes integer check (duree_minutes > 0 and duree_minutes <= 1440),
  date_prestation date not null,
  /* Libre : « En ligne », « Locaux du client », une adresse… Rien n'en dépend, comme pour 0131. */
  lieu text,
  /* Seule `validee` part au relevé d'heures. `planifiee` est une prestation convenue mais pas
     encore reconnue comme due ; `annulee` ne sera jamais payée et reste pour mémoire. */
  statut text not null default 'planifiee' check (statut in ('planifiee', 'validee', 'annulee')),
  notes text,
  /* Payé : renseigné à la validation du relevé qui porte cet extra. Même convention que le grand
     livre (0029) et que les bonus (0162), pour que les trois se lisent de la même façon. */
  teacher_payment_id uuid references public.teacher_payments(id),
  timesheet_id uuid references public.timesheets(id),
  cree_par uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  /* Un extra payé a forcément été validé : les deux ne peuvent pas diverger. Même esprit que
     `prestations_externes_cloture_coherente` (0131). */
  constraint prestations_extra_paye_est_valide check (teacher_payment_id is null or statut = 'validee')
);

create index prestations_extra_professeur on public.prestations_extra (teacher_id, date_prestation desc);

alter table public.prestations_extra enable row level security;

create policy "prestations_extra_admin_all"
  on public.prestations_extra for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

/* Le professeur lit les SIENNES, et rien d'autre — demande client : « ce bloc sera visible du
   côté professeur en mode lecture uniquement ». Elles figurent sur son relevé d'heures et sa
   facture, les lui cacher dans l'application n'aurait aucun sens. Aucune policy d'écriture :
   attribuer une prestation reste une décision de l'administration. */
create policy "prestations_extra_professeur_select"
  on public.prestations_extra for select
  to authenticated
  using (teacher_id = auth.uid());

/* Une prestation PAYÉE ne se réécrit plus : son montant est parti dans une rémunération et sur
   une facture, toutes deux figées. Même règle et même raison que pour les bonus (0162) et les
   forfaits (0057). En trigger et pas seulement à l'écran : la policy admin autorise l'écriture
   directe depuis le navigateur, et une règle d'argent ne doit pas dépendre du chemin emprunté.

   `teacher_payment_id` et `timesheet_id` restent modifiables : c'est précisément ce que pose la
   validation du relevé, et ce que doit pouvoir défaire la suppression d'une rémunération
   (api/admin/supprimer-ligne-financiere.ts détache les références avant de supprimer). */
create or replace function public.refuser_modification_extra_paye()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.teacher_payment_id is not null then
      raise exception 'Cette prestation a déjà été payée avec un relevé d''heures : elle ne peut plus être supprimée.';
    end if;
    return old;
  end if;

  if old.teacher_payment_id is not null
     and (new.montant is distinct from old.montant
          or new.type_prestation is distinct from old.type_prestation
          or new.statut is distinct from old.statut
          or new.teacher_id is distinct from old.teacher_id
          or new.date_prestation is distinct from old.date_prestation
          or new.duree_minutes is distinct from old.duree_minutes
          or new.lieu is distinct from old.lieu) then
    raise exception 'Cette prestation a déjà été payée avec un relevé d''heures : elle ne peut plus être modifiée.';
  end if;
  return new;
end;
$$;

create trigger prestations_extra_garde_paye
  before update or delete on public.prestations_extra
  for each row
  execute function public.refuser_modification_extra_paye();

comment on table public.prestations_extra is
  'Prestation ponctuelle attribuée par l''administration à un professeur, hors catalogue (0163). Porte son propre montant, contrairement aux prestations externes de 0131 qui se rémunèrent aux heures. Reprise sur le relevé d''heures et la facture à la validation du relevé, mais seulement si statut = validee.';

commit;
