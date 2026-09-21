-- Acomptes, règlement partiel et suppression motivée des paiements — demandes client des
-- points 2 et 3 (2026-09-21).
--
-- Choix structurant : l'enum `statut_paiement` (0019) n'est PAS étendu avec une valeur
-- 'partiel'. Un `alter type ... add value` ne peut pas être suivi d'un usage de la nouvelle
-- valeur dans la même transaction, et `run-migrations.cjs` exécute chaque fichier dans une
-- transaction — il aurait fallu deux migrations pour une information entièrement dérivable.
-- Le règlement partiel se lit donc de `montant_regle` (0 < montant_regle < montant), tenu à
-- jour par trigger depuis les versements. Les trois statuts affichés au client (« À payer »,
-- « Payé partiellement », « Payé ») se calculent dans `src/lib/paiements.ts`, et le reçu
-- automatique (0030) continue de se déclencher au seul passage à 'paye', c'est-à-dire au
-- solde complet.

alter table public.student_payments
  add column montant_regle numeric(12, 2) not null default 0,
  add column supprime_le timestamptz,
  add column supprime_par uuid references public.profiles(id),
  add column motif_suppression text;

alter table public.teacher_payments
  add column montant_regle numeric(12, 2) not null default 0,
  add column supprime_le timestamptz,
  add column supprime_par uuid references public.profiles(id),
  add column motif_suppression text;

-- Rattachement d'une facture à une rémunération professeur. `invoices.payment_id` (0020) ne
-- pointe que vers `student_payments` ; sans cette colonne, le bouton « Générer une facture »
-- d'une rémunération ne saurait pas reconnaître une facture déjà émise et en créerait une
-- nouvelle à chaque clic.
alter table public.invoices
  add column teacher_payment_id uuid references public.teacher_payments(id);

-- Un versement = un encaissement réel (acompte ou solde) rattaché à une ligne de paiement,
-- d'un côté ou de l'autre. Table unique plutôt que deux tables jumelles : les colonnes sont
-- identiques, et tout ce qui les lit (calcul du reste dû, historique affiché dans la fenêtre
-- de détail) est le même code des deux côtés.
create table public.paiement_versements (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  student_payment_id uuid references public.student_payments(id) on delete cascade,
  teacher_payment_id uuid references public.teacher_payments(id) on delete cascade,
  montant numeric(12, 2) not null check (montant > 0),
  date_versement date not null default current_date,
  moyen_paiement text,
  reference text,
  notes text,
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint paiement_versements_une_seule_cible check (
    (student_payment_id is not null and teacher_payment_id is null)
    or (student_payment_id is null and teacher_payment_id is not null)
  )
);

create index paiement_versements_student on public.paiement_versements (student_payment_id);
create index paiement_versements_teacher on public.paiement_versements (teacher_payment_id);

alter table public.paiement_versements enable row level security;

create policy "paiement_versements_admin_all"
  on public.paiement_versements for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- L'intéressé voit le détail de ses propres versements : c'est exactement ce que la fenêtre de
-- détail montre à l'admin, et le cacher au payeur n'aurait aucun sens.
create policy "paiement_versements_titulaire_select"
  on public.paiement_versements for select
  to authenticated
  using (
    exists (
      select 1 from public.student_payments sp
      where sp.id = paiement_versements.student_payment_id and sp.student_id = auth.uid()
    )
    or exists (
      select 1 from public.teacher_payments tp
      where tp.id = paiement_versements.teacher_payment_id and tp.teacher_id = auth.uid()
    )
  );

-- Le cumul des versements est recalculé depuis la somme réelle, jamais incrémenté : une
-- correction ou une suppression de versement remet le total juste sans dérive possible.
create function public.recalculer_paiement_depuis_versements()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := coalesce(new.student_payment_id, old.student_payment_id);
  v_teacher uuid := coalesce(new.teacher_payment_id, old.teacher_payment_id);
  v_total numeric;
  v_derniere date;
begin
  if v_student is not null then
    select coalesce(sum(montant), 0), max(date_versement)
      into v_total, v_derniere
      from public.paiement_versements
      where student_payment_id = v_student;

    update public.student_payments
      set montant_regle = v_total,
          -- 'annule' et 'en_retard' sont des décisions de l'admin : seul le solde complet les
          -- remplace. À l'inverse, un paiement marqué 'paye' qui redevient incomplet (versement
          -- corrigé ou supprimé) doit repasser en attente, sinon le reste dû resterait invisible.
          statut = case
            when v_total >= montant then 'paye'::public.statut_paiement
            when statut = 'paye' then 'attendu'::public.statut_paiement
            else statut
          end,
          date_paiement = case when v_total >= montant then coalesce(v_derniere, current_date) else date_paiement end
      where id = v_student;
  end if;

  if v_teacher is not null then
    select coalesce(sum(montant), 0), max(date_versement)
      into v_total, v_derniere
      from public.paiement_versements
      where teacher_payment_id = v_teacher;

    update public.teacher_payments
      set montant_regle = v_total,
          statut = case
            when v_total >= montant then 'paye'::public.statut_paiement
            when statut = 'paye' then 'attendu'::public.statut_paiement
            else statut
          end,
          date_paiement = case when v_total >= montant then coalesce(v_derniere, current_date) else date_paiement end
      where id = v_teacher;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger paiement_versements_recalcul
  after insert or update or delete on public.paiement_versements
  for each row execute function public.recalculer_paiement_depuis_versements();

-- Reprise de l'existant : une ligne déjà passée à 'paye' avant cette migration n'a aucun
-- versement détaillé, mais son montant a bien été encaissé en totalité. Sans ce rattrapage,
-- la fenêtre de détail afficherait « reste à payer : montant total » sur des dossiers soldés.
update public.student_payments set montant_regle = montant where statut = 'paye';
update public.teacher_payments set montant_regle = montant where statut = 'paye';
