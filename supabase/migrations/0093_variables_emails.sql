-- Constantes de la maison réutilisées par les modèles d'e-mails — tirées de l'inventaire des 58
-- variables des 22 modèles (0091) : une dizaine ne dépendent ni du destinataire ni du moment, mais
-- de l'établissement (lien de réservation, numéro Orange Money, lien du formulaire de test…).
--
-- Deux raisons de les sortir du corps des modèles :
--   1. l'admin ne les retape plus à chaque envoi — c'était la première source d'erreur possible
--      (un numéro Mvola faux part à tout le monde) ;
--   2. sans elles, aucun envoi AUTOMATIQUE n'est honnête : le mail partirait avec un
--      « {{lien_reservation}} » en clair dans le texte.
--
-- Table clé/valeur et non colonnes sur `etablissements` : la liste des constantes bougera au fil
-- des modèles que l'admin créera, et une colonne par constante demanderait une migration à chaque
-- fois.

create table public.email_variables (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  cle text not null,
  libelle text not null,
  valeur text,
  /* Ordre d'affichage dans l'écran de réglages ; regroupe par thème (liens, paiement…). */
  ordre integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (etablissement_id, cle)
);

alter table public.email_variables enable row level security;

create policy "email_variables_admin_all"
  on public.email_variables for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create trigger email_variables_touch
  before update on public.email_variables
  for each row execute function public.horodater_updated_at();

-- Les constantes repérées dans les 22 modèles. Valeurs laissées VIDES à dessein : le client les
-- renseigne depuis l'écran Template e-mails. Une constante vide fait tomber la ligne qui la porte
-- (voir `substituerAvecLignes`, src/lib/templatesEmail.ts) plutôt que d'exposer un gabarit nu.
insert into public.email_variables (etablissement_id, cle, libelle, valeur, ordre)
select e.id, v.cle, v.libelle, v.valeur, v.ordre
from public.etablissements e
cross join (values
  ('lien_reservation',   'Lien de réservation du diagnostic call', 'https://www.harionlineclub.app/', 10),
  ('lien_google_form',   'Lien du test écrit en ligne (Google Form)', null, 20),
  ('lien_questionnaire', 'Lien du questionnaire de satisfaction', null, 30),
  ('lien_supports',      'Lien d''accès aux supports (cours collectifs)', null, 40),
  ('orange_money',       'Orange Money (numéro – nom)', null, 50),
  ('mvola',              'Mvola (numéro – nom)', null, 60),
  ('samedi_1',           'Test oral — 1re date proposée', null, 70),
  ('samedi_2',           'Test oral — 2e date proposée', null, 80),
  ('samedi_3',           'Test oral — 3e date proposée', null, 90),
  ('samedi_4',           'Test oral — 4e date proposée', null, 100)
) as v(cle, libelle, valeur, ordre)
where e.slug = 'hari-online-course';
