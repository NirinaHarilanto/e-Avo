-- Signature interne des contrats — Phase 4 du chantier "Hari Online Club" (2026-09-13).
-- Décision actée avec le client : signature interne simple (horodatage + IP/appareil comme
-- preuve), pas de prestataire tiers (Yousign/DocuSign écarté) — annule le périmètre initial de
-- 0021 ("signature manuelle, un scan peut être rattaché").

alter table public.contracts
  add column signe_etablissement_at timestamptz,
  add column signe_etablissement_par uuid references public.profiles(id),
  add column signe_destinataire_at timestamptz,
  add column ip_signature_destinataire text,
  add column user_agent_signature_destinataire text,
  add column date_limite_signature date;

-- `date_signature` (0021) devient "date à laquelle les DEUX parties ont signé", posée
-- automatiquement dès que c'est le cas — plutôt qu'un champ que le client doit lui-même tenir
-- cohérent avec les deux horodatages ci-dessus.
create function public.maj_statut_signature_contrat()
returns trigger
language plpgsql
as $$
begin
  if new.signe_etablissement_at is not null and new.signe_destinataire_at is not null and new.statut <> 'signe' then
    new.statut := 'signe';
    new.date_signature := greatest(new.signe_etablissement_at, new.signe_destinataire_at)::date;
  end if;
  return new;
end;
$$;

create trigger contracts_maj_statut_signature
  before update on public.contracts
  for each row execute function public.maj_statut_signature_contrat();
