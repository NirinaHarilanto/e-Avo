-- Un profil par utilisateur Supabase Auth. Le rôle est TOUJOURS forcé à 'etudiant' par le
-- trigger d'inscription ci-dessous : ne jamais lire `raw_user_meta_data` pour déterminer le
-- rôle, sinon n'importe qui peut s'auto-promouvoir admin_etablissement en le passant à
-- l'inscription. Toute promotion (professeur / admin_etablissement) passe exclusivement par
-- api/_lib/adminAuth.ts, côté serveur, avec la clé service_role.
create type public.role_profil as enum ('etudiant', 'professeur', 'admin_etablissement');
create type public.statut_profil as enum ('pending', 'approved', 'suspended');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  etablissement_id uuid not null references public.etablissements(id),
  prospect_id uuid,
  role public.role_profil not null default 'etudiant',
  status public.statut_profil not null default 'pending',
  nom text,
  prenom text,
  email text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- L'établissement est choisi par l'utilisateur AVANT l'inscription (sélecteur
-- d'établissement), transmis via `raw_user_meta_data.etablissement_id` au moment du signUp —
-- c'est la seule valeur de metadata à laquelle ce trigger fait confiance ; le rôle, lui, ne
-- vient jamais des metadata (cf. commentaire ci-dessus). `security definer`, exécuté avec les
-- droits du propriétaire de la fonction (postgres, qui a BYPASSRLS) : c'est ce qui permet
-- l'insertion dans `profiles` malgré le RLS, sans policy d'insert ouverte côté client.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, etablissement_id, email, nom, prenom)
  values (
    new.id,
    (new.raw_user_meta_data ->> 'etablissement_id')::uuid,
    new.email,
    new.raw_user_meta_data ->> 'nom',
    new.raw_user_meta_data ->> 'prenom'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
