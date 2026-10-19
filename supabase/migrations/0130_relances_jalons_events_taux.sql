-- Chantier du 2026-10-19 (13 demandes client). Cinq socles de données, regroupés ici parce
-- qu'aucun ne se tient sans les autres dans ce lot :
--   1. `relances`      — historique des relances (prospect, absence au diagnostic, reprise après
--                        pause). Demandes 2, 4 et 7 : « rajoute une historique de relance car
--                        plusieurs relances seraient possibles ».
--   2. `profiles.relance_prevue_le` — date de relance posée au moment de la mise en pause (7).
--   3. `jalons_parcours` — mi-parcours et 3 h de la fin : la notification de suivi pédagogique
--                        destinée à l'admin (5) ET l'enquête de satisfaction remplie par l'élève
--                        (8) portent sur les deux MÊMES jalons. Une seule table, donc, plutôt que
--                        deux qui se déclencheraient sur le même calcul.
--   4. `events`        — section Events de la vitrine, alimentée depuis l'espace admin (12).
--   5. deux taux horaires de plus par professeur : corporate et chat & chill (13).


-- ───────────────────────────────── 1. Historique des relances ─────────────────────────────────

-- Jusqu'ici, « Relancer le prospect » (0054) n'écrivait RIEN : l'e-mail partait et l'écran se
-- contentait d'un « Relance envoyée ✓ » qui disparaissait au rechargement de la page. Impossible
-- de savoir si quelqu'un avait déjà relancé, ni quand, ni combien de fois.
--
-- Une seule table pour les trois motifs, et non trois tables : ce sont trois fois le même geste
-- (un admin clique, un e-mail part, on veut la trace), seul le motif change. Le jour où un
-- quatrième motif arrive, il n'y a qu'une valeur à ajouter à la contrainte.
create table public.relances (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  /* Une relance vise SOIT un prospect, SOIT un étudiant déjà inscrit (reprise après pause) —
     jamais les deux, jamais aucun des deux (voir la contrainte en fin de table). */
  prospect_id uuid references public.prospects(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  motif text not null check (motif in ('forfait_a_choisir', 'absence_diagnostic', 'reprise_apres_pause')),
  /* Adresse réellement destinataire, figée : l'e-mail du prospect peut être corrigé ensuite, la
     trace doit dire où le courrier est parti ce jour-là. */
  destinataire_email text not null,
  /* Référence du modèle d'e-mail utilisé (`email_templates.reference`, 0091), pour retrouver quel
     texte est parti. Null si le gabarit de repli codé en dur a servi. */
  modele_reference text,
  /* Une relance refusée par Resend est tracée elle aussi : sans cela, l'admin verrait « aucune
     relance » et conclurait à tort qu'il n'a rien envoyé. */
  succes boolean not null default true,
  erreur text,
  envoyee_le timestamptz not null default now(),
  envoyee_par uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint relances_une_seule_cible check (num_nonnulls(prospect_id, student_id) = 1)
);

create index relances_prospect_idx on public.relances (prospect_id, envoyee_le desc);
create index relances_student_idx on public.relances (student_id, envoyee_le desc);
create index relances_etablissement_idx on public.relances (etablissement_id, envoyee_le desc);

alter table public.relances enable row level security;

-- Lecture et écriture réservées à l'administration : c'est un journal interne de prospection, il
-- n'a aucune raison d'être visible de l'élève relancé ni de son professeur. L'écriture passe de
-- toute façon par la clé de service (api/admin/relancer-prospect.ts), cette policy ne sert qu'à
-- l'affichage de l'historique dans l'espace admin.
create policy "relances_admin_all"
  on public.relances for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());


-- Deux modèles d'e-mail de plus (même principe que les 22 de 0091) : les nouvelles relances
-- doivent partir d'un texte que l'admin peut corriger depuis « Template e-mails », comme la
-- relance « 1.2 » déjà en service — pas d'un gabarit figé dans le code.
--   « 1.3 » rejoint la catégorie Prospect : le candidat ne s'est pas présenté à son appel.
--   « 4.7 » rejoint la catégorie Suivi : l'élève avait mis son parcours en pause.
-- `ordre` les place juste après leurs voisins de catégorie (12 et 46 déjà pris en 0091).
insert into public.email_templates (etablissement_id, reference, categorie, nom, objet, corps, quand, piece_jointe_attendue, ordre)
select e.id, t.reference, t.categorie, t.nom, t.objet, t.corps, t.quand, t.piece_jointe, t.ordre
from public.etablissements e
cross join (values

('1.3', '1. Prospect', 'Absence au diagnostic call',
 'Nous vous avons attendu(e) – reprogrammons votre appel',
 $txt$Bonjour {{prenom}},

Nous vous attendions pour votre appel diagnostic, et nous n'avons pas eu le plaisir de vous voir. Rien de grave : ces choses-là arrivent.

Cet appel reste la première étape pour construire votre parcours : nous y faisons le point sur vos objectifs et nous évaluons votre niveau, afin de vous proposer la formule la plus adaptée. Il ne dure qu'une trentaine de minutes.

Pour choisir un nouveau créneau, il vous suffit de réserver ici : {{lien_reservation}}

Si quelque chose vous a empêché(e) de vous connecter, ou si vous préférez un autre horaire, dites-le nous simplement en réponse à ce message : nous nous adapterons.

Au plaisir de vous retrouver,

Koloina
Hari Online Club$txt$,
 -- `null::text` et non `null` nu : les deux modèles ajoutés ici n'attendent aucune pièce jointe,
 -- et sans ce cast Postgres ne saurait pas de quel type est la colonne du `values`.
 'Quand le prospect ne s''est pas présenté à son appel diagnostic. Peut être renvoyé autant de fois que nécessaire : chaque envoi est tracé dans l''historique des relances de sa fiche.', null::text, 13),

('4.7', '4. Suivi', 'Reprise après une pause',
 'Prêt(e) à reprendre vos cours d''anglais ?',
 $txt$Bonjour {{prenom}},

Votre parcours chez Hari Online Club est en pause depuis quelque temps, et nous voulions prendre de vos nouvelles.

Si le moment est venu de reprendre, nous nous occupons de tout : il nous suffit d'un mot de votre part pour reprendre contact avec votre formateur, replanifier vos séances et repartir là où vous vous étiez arrêté(e). Les heures qu'il vous reste sont toujours là.

Si ce n'est pas encore le bon moment, aucun souci : répondez-nous simplement en nous disant quand vous rappeler.

À très bientôt,

Koloina
Hari Online Club$txt$,
 'À la date de relance notée au moment de la mise en pause de l''étudiant. Peut être renvoyé plusieurs fois : chaque envoi est tracé dans l''historique des relances de son dossier.', null::text, 47)

) as t(reference, categorie, nom, objet, corps, quand, piece_jointe, ordre);


-- ──────────────────── 2. Date de relance posée à la mise en pause (demande 7) ────────────────────

-- Demande 7 : « lorsqu'il fait une pause, l'admin appuiera sur le bouton pause [...] et il faut
-- qu'il y ait la possibilité pour l'admin de mettre une date de relance ». Posée à côté de
-- `motif_pause`/`pause_le` (0063), et conservée comme eux après une réactivation : elle dit quand
-- l'élève devait être rappelé, information qui reste vraie après coup.
alter table public.profiles add column relance_prevue_le date;

comment on column public.profiles.relance_prevue_le is
  'Date à laquelle rappeler un étudiant mis en pause (0130). Conservée après réactivation, comme motif_pause.';


-- ───────────── 3. Jalons du parcours : suivi pédagogique (5) et enquête de satisfaction (8) ─────────────

-- Demande 5 : « À la moitié de chaque forfait d'un étudiant, l'admin sera notifié qu'il devra
-- faire un suivi pédagogique et lancer un meeting avec l'étudiant concerné. Idem lorsque le
-- forfait de l'étudiant est à 3 heures de la fin. »
-- Demande 8 : « il faut que l'étudiant renseigne l'enquête de satisfaction au milieu de son
-- parcours (ou à la moitié de son forfait d'heures) et à 3 heures de la fin de son parcours. »
--
-- Deux demandes, deux mêmes instants : une ligne naît ici quand le cron constate qu'un jalon est
-- atteint, elle notifie l'admin, et c'est elle que l'élève remplit. L'admin et le professeur la
-- relisent ensuite.
--
-- `total_heures_reference` est le CUMUL des forfaits de l'élève au moment du déclenchement, et il
-- entre dans la clé d'unicité : c'est ce qui permet qu'un élève qui prolonge son forfait (20 h →
-- 40 h) reçoive un nouveau jalon de mi-parcours — la moitié d'un parcours de 40 h n'est pas celle
-- d'un parcours de 20 h. Sans lui, un seul jalon par élève pour toute sa vie, quel que soit le
-- nombre de forfaits enchaînés.
create table public.jalons_parcours (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  jalon text not null check (jalon in ('mi_parcours', 'fin_parcours')),
  total_heures_reference numeric(6, 2) not null,
  heures_consommees_au_declenchement numeric(6, 2) not null,
  /* Professeur attitré au moment du déclenchement, figé : c'est lui que l'enquête évalue, même
     s'il change ensuite (le même choix que `nom_affiche` sur `temoignages`, 0128). */
  teacher_id uuid references public.profiles(id) on delete set null,
  declenche_le timestamptz not null default now(),
  /* Réponse de l'élève. Null tant qu'il n'a pas rempli : c'est exactement ce qui fait qu'on la
     lui redemande à sa prochaine connexion. */
  note_globale int check (note_globale between 1 and 5),
  note_pedagogie int check (note_pedagogie between 1 and 5),
  commentaire text,
  repondu_le timestamptz,
  constraint jalons_parcours_unique unique (student_id, jalon, total_heures_reference),
  -- Une réponse enregistrée porte forcément une note globale, et l'inverse : les deux colonnes se
  -- remplissent du même geste (voir PopupEnqueteParcours).
  constraint jalons_parcours_reponse_coherente check ((repondu_le is null) = (note_globale is null))
);

create index jalons_parcours_student_idx on public.jalons_parcours (student_id, declenche_le desc);
create index jalons_parcours_etablissement_idx on public.jalons_parcours (etablissement_id, declenche_le desc);
create index jalons_parcours_teacher_idx on public.jalons_parcours (teacher_id);

alter table public.jalons_parcours enable row level security;

-- L'élève voit ses propres jalons (c'est ce qui lui ouvre l'enquête) et lui seul peut y répondre.
create policy "jalons_parcours_eleve_select"
  on public.jalons_parcours for select
  to authenticated
  using (
    student_id = auth.uid()
    -- Binôme DUO : le dossier pédagogique vit sur la principale (0054), mais chaque membre
    -- répond à SA propre enquête — la secondaire doit donc voir les jalons posés sur elle-même.
    -- Ce sont bien deux lignes distinctes, une par personne (voir le cron).
    or exists (
      select 1 from public.profiles moi
      where moi.id = auth.uid() and moi.duo_partenaire_id = jalons_parcours.student_id
    )
  );

-- Écriture limitée à la réponse : l'élève ne peut ni créer un jalon (c'est le cron qui constate
-- l'atteinte du seuil), ni le réécrire une fois répondu — sinon il pourrait revenir sur son avis
-- indéfiniment, et le professeur verrait sa note changer après coup.
create policy "jalons_parcours_eleve_update"
  on public.jalons_parcours for update
  to authenticated
  using (student_id = auth.uid() and repondu_le is null)
  with check (student_id = auth.uid());

create policy "jalons_parcours_admin_all"
  on public.jalons_parcours for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- Demande 8 : « L'admin et le professeur concerné pourront voir l'enquête de satisfaction
-- renseignée par l'étudiant. » En lecture seule : un professeur ne modifie pas l'avis qu'on porte
-- sur lui. `is_teacher_of_student` couvre l'affectation individuelle, la classe collective et la
-- secondaire d'un binôme DUO (0129) ; `teacher_id` couvre le cas d'un professeur qui n'encadre
-- plus l'élève mais qui était le sien au moment de l'enquête.
create policy "jalons_parcours_teacher_select"
  on public.jalons_parcours for select
  to authenticated
  using (teacher_id = auth.uid() or public.is_teacher_of_student(student_id));


-- ─────────────────────────── 4. Section Events de la vitrine (demande 12) ───────────────────────────

-- Demande 12 : « rajoute une section Events sur la page principale de HOC au même niveau que
-- Tarifs & cours, témoignages [...] admin pourra rajouter du contenu events depuis l'espace admin
-- et ça s'affichera dans la section Events de la page principale. »
--
-- Même structure que `temoignages` (0128), pour les mêmes raisons : lecture publique des seuls
-- contenus publiés, gestion complète côté admin.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  titre text not null,
  /* Accroche d'une ligne affichée sur la carte, distincte de la description complète : sans elle,
     la carte afficherait un début de paragraphe tronqué au milieu d'un mot. */
  accroche text,
  description text not null,
  /* Date et heure de l'événement. `debut` seul suffit pour l'afficher ; `fin` est facultative
     (un événement d'une journée entière n'a pas d'heure de fin utile). */
  debut timestamptz not null,
  fin timestamptz,
  /* Libre : « En ligne (Google Meet) », « Antananarivo », « Sur inscription »… Un événement en
     ligne et un événement sur place se décrivent du même champ. */
  lieu text,
  /* Image d'illustration dans le bucket public `events` ci-dessous. Null = carte sans visuel,
     rendue avec le dégradé du thème (voir SectionEvents). */
  image_path text,
  /* Bouton d'action de la carte. Les deux vont ensemble : un lien sans libellé afficherait un
     bouton vide, un libellé sans lien un bouton mort. */
  lien_url text,
  lien_libelle text,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'publie')),
  ordre int not null default 0,
  cree_par uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_lien_complet check ((lien_url is null) = (lien_libelle is null)),
  constraint events_fin_apres_debut check (fin is null or fin > debut)
);

create index events_etablissement_statut_idx on public.events (etablissement_id, statut, debut);

alter table public.events enable row level security;

-- Lecture publique des seuls événements PUBLIÉS : la section est servie à un visiteur anonyme
-- (même principe que `tarifs_public_select`, 0026, et `temoignages_public_select`, 0128). Un
-- brouillon n'est donc jamais lisible de l'extérieur, y compris en interrogeant l'API directement.
create policy "events_public_select"
  on public.events for select
  to anon, authenticated
  using (statut = 'publie');

create policy "events_admin_all"
  on public.events for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- Bucket PUBLIC, pour la même raison que `photos-profil` (0128) : l'image s'affiche sur la
-- vitrine, lue par un visiteur anonyme qui n'a aucun jeton pour demander une URL signée. Écriture
-- réservée à l'administration — contrairement aux photos de profil, rien ici n'est déposé par un
-- élève.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('events', 'events', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "events_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'events' and public.is_admin_etablissement());

create policy "events_storage_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'events' and public.is_admin_etablissement())
  with check (bucket_id = 'events' and public.is_admin_etablissement());

create policy "events_storage_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'events' and public.is_admin_etablissement());


-- ──────────────── 5. Taux horaires corporate et chat & chill (demande 13) ────────────────

-- Demande 13 : « Pour chaque professeur, rajoute les types de taux suivants : taux horaire
-- corporate, taux horaire chat & chill. » Posés à côté des trois taux de 0126
-- (individuel/duo/collectif), sans valeur par défaut : aucun professeur n'en a encore été doté,
-- et 0 Ar/h serait un taux faux plutôt qu'un taux manquant.
--
-- À SIGNALER AU CLIENT : contrairement aux trois premiers, ces deux taux ne s'appliquent pour
-- l'instant à aucune rémunération automatique — `hour_ledger.type_facturation` (0126) ne connaît
-- que 'individuel' / 'collectif' / 'duo', et aucun type de cours « corporate » ou « chat & chill »
-- n'existe dans l'application. Ils se saisissent et s'affichent sur la fiche du professeur ; leur
-- application au calcul des heures suppose d'abord de créer ces deux types de cours.
alter table public.profiles
  add column taux_horaire_corporate numeric(10, 2),
  add column taux_horaire_chat_chill numeric(10, 2);

comment on column public.profiles.taux_horaire_corporate is
  'Taux horaire (Ar/h) pour une séance corporate — professeur uniquement (0130). Pas encore appliqué automatiquement : aucun type de séance corporate n''existe.';
comment on column public.profiles.taux_horaire_chat_chill is
  'Taux horaire (Ar/h) pour une séance chat & chill — professeur uniquement (0130). Pas encore appliqué automatiquement : aucun type de séance chat & chill n''existe.';

-- `empecher_promotion_profil` (0082, étendue en 0126) protège les taux horaires : un professeur
-- ne peut pas relever le sien depuis son propre profil. Les deux nouvelles colonnes rejoignent la
-- garde, sinon elles resteraient librement modifiables par l'intéressé. Recréée à l'identique
-- pour le reste.
create or replace function public.empecher_promotion_profil()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() not in ('service_role', 'postgres') then
    if new.role is distinct from old.role
      or new.etablissement_id is distinct from old.etablissement_id
      or new.status is distinct from old.status
    then
      raise exception 'Modification de role/etablissement_id/status réservée au backend (service_role).';
    end if;
    if (
        new.taux_horaire_individuel is distinct from old.taux_horaire_individuel
        or new.taux_horaire_duo is distinct from old.taux_horaire_duo
        or new.taux_horaire_collectif is distinct from old.taux_horaire_collectif
        or new.taux_horaire_corporate is distinct from old.taux_horaire_corporate
        or new.taux_horaire_chat_chill is distinct from old.taux_horaire_chat_chill
      )
      and auth.uid() = old.id and not public.is_admin_etablissement()
    then
      raise exception 'Modification du taux horaire réservée à un administrateur.';
    end if;
    if new.statut_integration is distinct from old.statut_integration and not public.is_admin_etablissement() then
      raise exception 'Validation de l''intégration réservée à un administrateur.';
    end if;
  end if;
  return new;
end;
$$;
