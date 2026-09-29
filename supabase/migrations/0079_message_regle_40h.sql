-- Format des messages de la règle des 40 h (0078) : « 20 h » plutôt que « 20. h », montant en Ar.

create or replace function public.verifier_paiement_en_plusieurs_fois()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_heures numeric;
  v_paiement public.student_payments%rowtype;
begin
  if new.student_payment_id is null then
    return new;
  end if;

  select * into v_paiement from public.student_payments where id = new.student_payment_id;
  v_heures := public.heures_couvertes_paiement(new.student_payment_id);

  if v_heures is not null
     and v_heures < 40
     and new.montant < (v_paiement.montant - v_paiement.montant_regle) then
    raise exception 'Le paiement en plusieurs fois est réservé aux forfaits de 40 heures ou plus : ce forfait (% h) se règle en une seule fois, soit % Ar.',
      trim(trailing '.' from to_char(v_heures, 'FM999990.99')),
      trim(trailing '.' from to_char(v_paiement.montant - v_paiement.montant_regle, 'FM999999990.99'))
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function public.verifier_echeancier_40h()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_heures numeric;
begin
  v_heures := public.heures_couvertes_paiement(new.student_payment_id);
  if v_heures is not null and v_heures < 40 then
    raise exception 'Un échéancier n''est possible que pour un forfait de 40 heures ou plus (ce forfait : % h).',
      trim(trailing '.' from to_char(v_heures, 'FM999990.99'))
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

