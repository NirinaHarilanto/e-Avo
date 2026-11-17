-- Bonus accordé à un professeur quand un de ses élèves RENOUVELLE ou PROLONGE son forfait
-- d'heures — demande client du 2026-11-17 : « l'admin devrait pouvoir attribuer un bonus de
-- 10 000 Ar à chaque professeur quand un de ses étudiants fait un renouvellement ou prolongement
-- de son forfait d'heures [...] ces bonus apparaîtront sur le timesheet du professeur concerné.
-- On retrouvera l'historique et statuts des bonus dans le pop-up, ceux qui sont payés et ceux qui
-- ne le sont pas encore. »
--
-- Trois décisions prises avec le client avant d'écrire (AskUserQuestion, 2026-11-17) :
--   1. l'application REPÈRE les renouvellements et les propose, l'admin valide d'un clic — rien
--      n'est accordé sans son geste ;
--   2. 10 000 Ar par défaut, modifiable bonus par bonus ;
--   3. un bonus devient « payé » à la VALIDATION du relevé d'heures qui le porte.
--
-- La table ne porte pas d'heures, et c'est tout l'enjeu : un bonus ne peut pas vivre dans
-- `hour_ledger`, dont chaque ligne est un volume horaire (le grand livre sert aussi à calculer
-- les heures restantes d'un élève — y glisser un montant sans heures fausserait ce calcul). Il
-- lui faut donc sa propre table, qui emprunte au grand livre sa manière de marquer ce qui est
-- payé : `teacher_payment_id` renseigné = payé (même convention que 0029).

begin;

create table public.bonus_professeur (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  teacher_id uuid not null references public.profiles(id),
  montant numeric(12, 2) not null check (montant > 0),
  motif text not null check (length(btrim(motif)) > 0),
  /* Le forfait qui a motivé le bonus. `on delete set null` et non `cascade` : un forfait
     supprimé ne doit pas emporter un bonus déjà accordé, encore moins déjà payé — le bonus
     perd seulement la trace de son origine. Null pour un bonus saisi librement par l'admin. */
  package_id uuid references public.packages(id) on delete set null,
  student_id uuid references public.profiles(id),
  /* Payé : renseigné à la validation du relevé qui porte ce bonus (api/admin/traiter-timesheet).
     Exactement la convention de `hour_ledger.teacher_payment_id` (0029) — « ce qui est rattaché
     à une rémunération est payé », pour que les deux se lisent de la même façon. */
  teacher_payment_id uuid references public.teacher_payments(id),
  timesheet_id uuid references public.timesheets(id),
  accorde_le date not null default current_date,
  accorde_par uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index bonus_professeur_professeur on public.bonus_professeur (teacher_id, accorde_le desc);

/* Un renouvellement ne vaut qu'UN bonus. Sans cette unicité, rouvrir le pop-up et recliquer la
   même proposition en accorderait un second, sans que rien ne le signale — l'admin ne voit pas
   d'écart entre « accorder » et « accorder encore ». Index partiel : les bonus saisis librement
   (sans forfait rattaché) restent évidemment cumulables. */
create unique index bonus_professeur_un_par_forfait
  on public.bonus_professeur (package_id)
  where package_id is not null;

alter table public.bonus_professeur enable row level security;

create policy "bonus_professeur_admin_all"
  on public.bonus_professeur for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

/* Le professeur lit les SIENS, et rien d'autre : ils figurent sur son relevé d'heures et sur sa
   facture, les lui cacher dans l'application n'aurait aucun sens. Lecture seule — accorder un
   bonus reste une décision de l'administration. */
create policy "bonus_professeur_professeur_select"
  on public.bonus_professeur for select
  to authenticated
  using (teacher_id = auth.uid());

/* Un bonus PAYÉ ne se réécrit jamais, exactement comme un forfait payé (0057) ou une paie déjà
   émise (api/professeur/retirer-seance.ts) : son montant est parti dans une rémunération et sur
   une facture, toutes deux figées. Le corriger après coup désaccorderait silencieusement le
   document du montant réellement versé. En trigger et pas seulement dans l'écran : la policy
   admin ci-dessus autorise l'écriture directe depuis le navigateur, et une règle d'argent ne
   doit pas dépendre du chemin emprunté pour y arriver.

   `teacher_payment_id` lui-même reste modifiable : c'est précisément ce que pose la validation
   du relevé, et ce que doit pouvoir défaire une suppression de rémunération
   (api/admin/supprimer-ligne-financiere.ts détache les références avant de supprimer). */
create or replace function public.refuser_modification_bonus_paye()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.teacher_payment_id is not null then
      raise exception 'Ce bonus a déjà été payé avec un relevé d''heures : il ne peut plus être supprimé.';
    end if;
    return old;
  end if;

  if old.teacher_payment_id is not null
     and (new.montant is distinct from old.montant
          or new.motif is distinct from old.motif
          or new.teacher_id is distinct from old.teacher_id
          or new.accorde_le is distinct from old.accorde_le) then
    raise exception 'Ce bonus a déjà été payé avec un relevé d''heures : son montant et son motif ne peuvent plus être modifiés.';
  end if;
  return new;
end;
$$;

create trigger bonus_professeur_garde_paye
  before update or delete on public.bonus_professeur
  for each row
  execute function public.refuser_modification_bonus_paye();

comment on table public.bonus_professeur is
  'Bonus accordé par l''administration à un professeur, typiquement au renouvellement ou au prolongement du forfait d''un de ses élèves (0162). Repris sur le relevé d''heures et la facture à la validation du relevé, qui le marque payé via teacher_payment_id.';

commit;
