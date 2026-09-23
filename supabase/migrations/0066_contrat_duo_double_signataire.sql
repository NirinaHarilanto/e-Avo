-- Demande client du 2026-09-23 : un contrat DUO doit porter les informations des DEUX étudiants
-- et être signé par les deux. Un contrat n'avait jusqu'ici qu'un seul destinataire possible
-- (destinataire_profile_id) et un seul jeu de champs de signature côté destinataire — ce n'était
-- pas généralisable en ajoutant simplement une ligne de plus dans `contracts` (ça aurait dupliqué
-- titre/corps_genere/variables_valeurs pour un contrat qui doit rester UN SEUL document commun).
-- Colonnes secondaires nullables : un contrat individuel/professeur n'y touche jamais, tout le
-- code existant continue de fonctionner sans modification pour ce cas.

alter table public.contracts
  add column destinataire_secondaire_profile_id uuid references public.profiles(id),
  add column signe_destinataire_secondaire_at timestamptz,
  add column ip_signature_destinataire_secondaire text,
  add column user_agent_signature_destinataire_secondaire text;

comment on column public.contracts.destinataire_secondaire_profile_id is
  'Second membre d''un binôme DUO devant aussi signer ce contrat (0066). Null pour tout contrat individuel/professeur.';

-- Le second membre du binôme doit pouvoir lire (et donc signer) ce même contrat.
drop policy "contracts_destinataire_select" on public.contracts;
create policy "contracts_destinataire_select"
  on public.contracts for select
  to authenticated
  using (destinataire_profile_id = auth.uid() or destinataire_secondaire_profile_id = auth.uid());

-- Le contrat ne passe « signé » que lorsque TOUTES les parties ont signé — établissement,
-- destinataire principal, et le secondaire s'il y en a un (`is null or ... is not null`, plutôt
-- qu'un simple ET, pour ne rien changer au comportement des contrats sans secondaire).
create or replace function public.maj_statut_signature_contrat()
returns trigger
language plpgsql
as $$
begin
  if new.signe_etablissement_at is not null
    and new.signe_destinataire_at is not null
    and (new.destinataire_secondaire_profile_id is null or new.signe_destinataire_secondaire_at is not null)
    and new.statut <> 'signe'
  then
    new.statut := 'signe';
    new.date_signature := greatest(
      new.signe_etablissement_at,
      new.signe_destinataire_at,
      coalesce(new.signe_destinataire_secondaire_at, new.signe_etablissement_at)
    )::date;
  end if;
  return new;
end;
$$;
