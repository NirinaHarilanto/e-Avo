-- Six demandes client du 2026-09-22 regroupées dans une seule migration : elles touchent toutes
-- au même axe (droits du professeur sur ses élèves) ou s'enchaînent (forfait supplémentaire).

-- ---------------------------------------------------------------------------------------------
-- 1. Langue toujours "Anglais" à l'attribution de professeur (plus de champ à saisir)
-- ---------------------------------------------------------------------------------------------
-- HOC n'enseigne que l'anglais : redemander la langue à chaque attribution n'avait aucune valeur
-- informative. `p_langue` reste dans la signature (aucun appelant ne doit être cassé) mais son
-- contenu est ignoré — la fonction impose "Anglais" quoi qu'on lui passe.
create or replace function public.attribuer_professeur(
  p_student_id uuid,
  p_teacher_id uuid,
  p_langue text default null,
  p_motif text default null
)
returns table (
  nouvelle_affectation_id uuid,
  seances_individuelles_transferees integer,
  seances_collectives_desinscrites integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_etablissement_id uuid;
  v_langue text := 'Anglais';
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
  v_ancienne_affectation_id uuid;
  v_ancien_teacher_id uuid;
  v_nouvelle_id uuid;
  v_sessions_individuel_ids uuid[];
  v_enrollments_collectif_ids uuid[];
  v_nb_individuelles integer := 0;
  v_nb_desinscrites integer := 0;
  v_instant_transfert timestamptz := now();
begin
  if not public.is_admin_etablissement() then
    raise exception 'Seul un administrateur peut attribuer un professeur.' using errcode = '42501';
  end if;

  v_etablissement_id := public.current_etablissement_id();

  if not exists (
    select 1 from public.profiles
    where id = p_student_id and etablissement_id = v_etablissement_id
  ) then
    raise exception 'Étudiant introuvable dans cet établissement.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_teacher_id and etablissement_id = v_etablissement_id and role = 'professeur'
  ) then
    raise exception 'Professeur introuvable dans cet établissement.' using errcode = '42501';
  end if;

  select id, teacher_id into v_ancienne_affectation_id, v_ancien_teacher_id
  from public.teacher_assignments
  where student_id = p_student_id and date_fin is null;

  update public.teacher_assignments
  set date_fin = current_date, motif_changement = coalesce(v_motif, motif_changement)
  where student_id = p_student_id and date_fin is null;

  insert into public.teacher_assignments (
    etablissement_id, student_id, teacher_id, langue, date_debut, motif_changement
  )
  values (
    v_etablissement_id,
    p_student_id,
    p_teacher_id,
    v_langue,
    current_date,
    case when v_ancienne_affectation_id is not null then v_motif else null end
  )
  returning id into v_nouvelle_id;

  if v_ancienne_affectation_id is not null then

    select coalesce(array_agg(s.id), '{}')
    into v_sessions_individuel_ids
    from public.session_enrollments se
    join public.sessions s on s.id = se.session_id
    where se.student_id = p_student_id
      and se.teacher_assignment_id = v_ancienne_affectation_id
      and s.statut = 'planifiee'
      and s.type = 'individuel'
      and s.teacher_id = v_ancien_teacher_id
      and s.debut >= v_instant_transfert;

    if cardinality(v_sessions_individuel_ids) > 0 then
      update public.sessions
      set teacher_id = p_teacher_id
      where id = any(v_sessions_individuel_ids);
      get diagnostics v_nb_individuelles = row_count;

      update public.session_enrollments
      set teacher_assignment_id = v_nouvelle_id
      where student_id = p_student_id
        and session_id = any(v_sessions_individuel_ids);
    end if;

    select coalesce(array_agg(se.id), '{}')
    into v_enrollments_collectif_ids
    from public.session_enrollments se
    join public.sessions s on s.id = se.session_id
    where se.student_id = p_student_id
      and se.teacher_assignment_id = v_ancienne_affectation_id
      and s.statut = 'planifiee'
      and s.type = 'collectif'
      and s.teacher_id = v_ancien_teacher_id
      and s.debut >= v_instant_transfert;

    if cardinality(v_enrollments_collectif_ids) > 0 then
      delete from public.session_enrollments
      where id = any(v_enrollments_collectif_ids);
      get diagnostics v_nb_desinscrites = row_count;
    end if;

  end if;

  return query select v_nouvelle_id, v_nb_individuelles, v_nb_desinscrites;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Bug de comptage des heures côté professeur
-- ---------------------------------------------------------------------------------------------
-- `hour_ledger_teacher_select` (0011) n'autorisait le professeur à lire que SES PROPRES lignes
-- (`teacher_id = auth.uid()`). Or les lignes `debit_etudiant`, qui portent la consommation
-- d'heures d'un élève, n'ont jamais de `teacher_id` (seules les lignes `credit_professeur` en
-- ont une) — un professeur ne pouvait donc JAMAIS voir combien d'heures un de ses élèves avait
-- consommées : `student_hours_summary` (vue security_invoker sur cette table) lui renvoyait
-- toujours 0 ligne pour ses élèves. Nouvelle policy dédiée à ce cas précis.
create policy "hour_ledger_teacher_select_eleve"
  on public.hour_ledger for select
  to authenticated
  using (type_ecriture = 'debit_etudiant' and public.is_teacher_of_student(student_id));

-- ---------------------------------------------------------------------------------------------
-- 3. Parité de dossier côté professeur : forfait de l'élève visible
-- ---------------------------------------------------------------------------------------------
-- Jusqu'ici volontairement invisible (voir le commentaire historique d'EtudiantsProfesseur.tsx,
-- « aucune policy RLS ne les ouvre au rôle professeur ») — demande client du 2026-09-22 : « on
-- devrait retrouver ... le forfait que l'étudiant a choisi ... exactement comme dans l'espace
-- admin ». Lecture seule : la policy `packages_admin_all` reste la seule à permettre l'écriture.
create policy "packages_teacher_select"
  on public.packages for select
  to authenticated
  using (public.is_teacher_of_student(student_id));

-- ---------------------------------------------------------------------------------------------
-- 4. Notification admin quand un forfait arrive réellement à son terme
-- ---------------------------------------------------------------------------------------------
-- Le trigger de 0056/0057 prévenait déjà l'ÉLÈVE (et, pour l'essai, l'admin) mais jamais l'admin
-- pour un forfait ORDINAIRE épuisé — demande client du 2026-09-22 : « l'admin devrait recevoir
-- une notification automatique lui demandant de relancer l'étudiant ». Ajouté uniquement au
-- passage à 0 h restantes (pas à 2 h, pour ne pas doubler l'alerte "bientôt épuisé" déjà
-- envoyée à l'élève à ce même seuil) et seulement pour un forfait qui n'est pas un essai (son
-- propre message dédié existe déjà, `essai_termine_admin`).
create or replace function public.alerter_forfait_bientot_epuise()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total numeric;
  v_consomme numeric;
  v_restant numeric;
  v_dernier public.packages%rowtype;
  v_tarif public.tarifs%rowtype;
  v_eleve public.profiles%rowtype;
begin
  if new.type_ecriture is distinct from 'debit_etudiant' or new.student_id is null then
    return new;
  end if;

  select * into v_dernier
    from public.packages
    where student_id = new.student_id
    order by created_at desc
    limit 1;

  if not found then
    return new;
  end if;

  select coalesce(sum(total_heures), 0)
    into v_total
    from public.packages
    where student_id = new.student_id;

  select coalesce(sum(heures), 0)
    into v_consomme
    from public.hour_ledger
    where student_id = new.student_id and type_ecriture = 'debit_etudiant';

  v_restant := v_total - v_consomme;

  if v_restant > 2 then
    return new;
  end if;

  if v_dernier.essai and v_dernier.essai_resultat is null then
    if exists (
      select 1 from public.notifications
      where destinataire_profile_id = new.student_id
        and type = 'essai_termine'
        and created_at >= v_dernier.created_at
    ) then
      return new;
    end if;

    if v_dernier.tarif_vise_id is not null then
      select * into v_tarif from public.tarifs where id = v_dernier.tarif_vise_id;
    end if;

    insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
    values (
      new.etablissement_id,
      new.student_id,
      'essai_termine',
      'Votre heure d’essai est terminée',
      case
        when v_tarif.id is not null
          then 'Merci d’avoir suivi votre heure d’essai avec Hari Online Club. Pour poursuivre votre apprentissage, il vous reste à confirmer le forfait ' || v_tarif.titre || ' que vous aviez retenu ; sans suite de votre part, seule cette heure vous sera facturée.'
        else 'Merci d’avoir suivi votre heure d’essai avec Hari Online Club. Faites-nous savoir si vous souhaitez poursuivre avec un forfait ; sans suite de votre part, seule cette heure vous sera facturée.'
      end,
      '/mon-espace'
    );

    insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
    select
      new.etablissement_id,
      p.id,
      'essai_termine_admin',
      'Heure d’essai terminée — décision à enregistrer',
      coalesce(e.prenom || ' ' || e.nom, 'Un élève') || ' a consommé son heure d’essai. Enregistrez sa décision (poursuivre ou s’arrêter) depuis l’onglet Forfait de son dossier.',
      '/admin/etudiants/' || new.student_id
    from public.profiles p
    left join public.profiles e on e.id = new.student_id
    where p.etablissement_id = new.etablissement_id
      and p.role = 'admin_etablissement'
      and p.status = 'approved';

    return new;
  end if;

  if exists (
    select 1 from public.notifications
    where destinataire_profile_id = new.student_id
      and type = 'forfait_bientot_epuise'
      and created_at >= v_dernier.created_at
  ) then
    return new;
  end if;

  insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
  values (
    new.etablissement_id,
    new.student_id,
    'forfait_bientot_epuise',
    case when v_restant <= 0 then 'Votre forfait est arrivé à son terme' else 'Votre forfait arrive à son terme' end,
    case
      when v_restant <= 0
        then 'Toutes les heures de votre forfait ont été utilisées. Pour poursuivre votre apprentissage sans interruption, rapprochez-vous de Hari Online Club afin de souscrire un nouveau forfait.'
      else 'Il vous reste ' || trim(to_char(v_restant, 'FM999990.99')) || ' h sur votre forfait. Pour poursuivre votre apprentissage sans interruption, rapprochez-vous de Hari Online Club afin de souscrire un nouveau forfait.'
    end,
    '/mon-espace'
  );

  -- Volet admin, nouveau : seulement au terme réel (<= 0), pas à l'alerte "bientôt" à 2 h — sans
  -- quoi l'admin recevrait deux notifications pour un seul événement (2h restantes, puis 0h).
  if v_restant <= 0 and not exists (
    select 1 from public.notifications
    where type = 'forfait_termine_admin'
      and created_at >= v_dernier.created_at
      and message like '%' || new.student_id::text || '%'
  ) then
    select * into v_eleve from public.profiles where id = new.student_id;

    insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
    select
      new.etablissement_id,
      p.id,
      'forfait_termine_admin',
      'Forfait épuisé — à relancer',
      coalesce(v_eleve.prenom || ' ' || v_eleve.nom, 'Un élève') || ' a épuisé son forfait. Relancez-le pour un nouveau forfait depuis son dossier (identifiant ' || new.student_id::text || ').',
      '/admin/etudiants/' || new.student_id
    from public.profiles p
    where p.etablissement_id = new.etablissement_id
      and p.role = 'admin_etablissement'
      and p.status = 'approved';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Demande de forfait supplémentaire par l'étudiant, validée par l'admin
-- ---------------------------------------------------------------------------------------------
-- Distincte de `packages` : une demande n'est qu'une intention, elle ne doit modifier ni le
-- compteur d'heures ni rien de facturable tant qu'elle n'a pas été validée. Une fois validée,
-- `package_id` trace le forfait réellement créé (voir api/admin/valider-demande-forfait.ts).
create table public.demandes_forfait (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  student_id uuid not null references public.profiles(id),
  heures_demandees numeric not null check (heures_demandees > 0),
  message text,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'validee', 'refusee')),
  package_id uuid references public.packages(id),
  motif_refus text,
  created_at timestamptz not null default now(),
  decidee_le timestamptz,
  decidee_par_profile_id uuid references public.profiles(id)
);

create index demandes_forfait_student on public.demandes_forfait (student_id);
create index demandes_forfait_etablissement_statut on public.demandes_forfait (etablissement_id, statut);

alter table public.demandes_forfait enable row level security;

create policy "demandes_forfait_student_select"
  on public.demandes_forfait for select
  to authenticated
  using (student_id = auth.uid());

create policy "demandes_forfait_student_insert"
  on public.demandes_forfait for insert
  to authenticated
  with check (student_id = auth.uid() and statut = 'en_attente');

create policy "demandes_forfait_admin_all"
  on public.demandes_forfait for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- Un élève demande à son tour : l'admin doit le savoir sans avoir à surveiller la page en
-- continu — même mécanique que les autres notifications admin (rendez_vous_demande, etc.).
create function public.notifier_demande_forfait()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_eleve public.profiles%rowtype;
begin
  select * into v_eleve from public.profiles where id = new.student_id;

  insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
  select
    new.etablissement_id,
    p.id,
    'demande_forfait',
    'Demande de forfait supplémentaire',
    coalesce(v_eleve.prenom || ' ' || v_eleve.nom, 'Un élève') || ' demande ' || trim(to_char(new.heures_demandees, 'FM999990.99')) || ' h supplémentaires.',
    '/admin/etudiants/' || new.student_id
  from public.profiles p
  where p.etablissement_id = new.etablissement_id
    and p.role = 'admin_etablissement'
    and p.status = 'approved';

  return new;
end;
$$;

create trigger demandes_forfait_notifier
  after insert on public.demandes_forfait
  for each row execute function public.notifier_demande_forfait();
