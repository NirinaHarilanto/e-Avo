-- Parcours d'entrée en cours collectif — demande client du 2026-09-21 (point 5).
--
-- Un prospect intéressé par le collectif ne réserve plus un appel diagnostic : il choisit un
-- créneau de test oral parmi ceux ouverts par l'admin sur une vague, puis répond à un quiz
-- écrit qui valide sa réservation. Sa note et son bilan sont rattachés à son dossier, et il
-- rejoint la liste des candidats attendus sur ce créneau.

-- Questions paramétrables depuis l'espace admin. La bonne réponse vit ici, jamais côté
-- navigateur : la table n'a AUCUNE policy de lecture publique, et l'API qui sert le quiz au
-- visiteur (api/prospects/test-positionnement) renvoie les énoncés sans les corrigés. Un quiz
-- dont les réponses partent dans le bundle ne mesure plus rien.
create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  ordre integer not null,
  enonce text not null,
  -- Tableau de propositions, dans l'ordre d'affichage.
  options jsonb not null,
  -- Index 0 de `options`, pas la lettre : renuméroter ou réordonner les propositions ne doit
  -- pas obliger à retoucher une correspondance A/B/C/D ailleurs.
  bonne_reponse smallint not null check (bonne_reponse >= 0),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create index quiz_questions_etablissement on public.quiz_questions (etablissement_id, ordre);

alter table public.quiz_questions enable row level security;

create policy "quiz_questions_admin_all"
  on public.quiz_questions for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- Créneaux de test oral d'une vague. Rattachés à `cohorts` et non à l'établissement seul :
-- l'admin les ouvre depuis la fiche de la vague concernée, et un candidat reçu sur un créneau
-- est de fait candidat à cette vague-là.
create table public.creneaux_test_positionnement (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  debut timestamptz not null,
  duree_minutes integer not null default 30 check (duree_minutes between 5 and 240),
  capacite_max integer check (capacite_max > 0),
  lien_visio text,
  actif boolean not null default true,
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index creneaux_test_cohorte on public.creneaux_test_positionnement (cohort_id, debut);

alter table public.creneaux_test_positionnement enable row level security;

create policy "creneaux_test_admin_all"
  on public.creneaux_test_positionnement for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- Candidature à un créneau : le quiz passé, sa note, et le bilan généré automatiquement.
-- Aucune policy d'insertion cliente, comme `rendez_vous` (0042) : l'inscription passe
-- obligatoirement par api/prospects/inscrire-test, seul endroit où la correction est faite et
-- où la capacité du créneau est vérifiée.
create table public.test_positionnement_inscriptions (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  creneau_id uuid not null references public.creneaux_test_positionnement(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  -- Réponses du candidat, index de proposition par question : [{question_id, choix}].
  reponses jsonb not null default '[]'::jsonb,
  score integer not null default 0,
  total integer not null default 0,
  niveau_estime text,
  bilan text,
  created_at timestamptz not null default now(),
  unique (creneau_id, prospect_id)
);

create index test_inscriptions_prospect on public.test_positionnement_inscriptions (prospect_id);

alter table public.test_positionnement_inscriptions enable row level security;

create policy "test_inscriptions_admin_all"
  on public.test_positionnement_inscriptions for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- Quiz de départ fourni par le client (10 questions d'anglais, du présent simple au
-- conditionnel hypothétique). Modifiable ensuite depuis l'espace admin : ce n'est qu'un point
-- de départ, pas un contenu figé dans le code.
insert into public.quiz_questions (etablissement_id, ordre, enonce, options, bonne_reponse)
select e.id, q.ordre, q.enonce, q.options::jsonb, q.bonne_reponse
from public.etablissements e
cross join (values
  (1, 'Choose the correct sentence:',
   '["She does lives in London.","She lives in London.","She living in London.","She live in London."]', 1),
  (2, 'Complete the sentence: "I ______ coffee every morning."',
   '["drinks","drinking","drink","drank"]', 2),
  (3, 'Choose the correct sentence about a completed action in the past:',
   '["Yesterday, I went to work by bus.","Yesterday, I am going to work by bus.","Yesterday, I have go to work by bus.","Yesterday, I go to work by bus."]', 0),
  (4, 'Complete the sentence: "She has worked here ______ 2022."',
   '["from","since","for","during"]', 1),
  (5, 'What does "I am looking forward to meeting you" mean?',
   '["I am expecting to meet you with pleasure.","I do not want to meet you.","I am worried about meeting you.","I have already met you."]', 0),
  (6, 'Choose the correct sentence:',
   '["If I have time, I would call you.","If I will have time, I will call you.","If I have time, I will call you.","If I had time, I will call you."]', 2),
  (7, 'Choose the best option: "When I arrived at the station, the train ______."',
   '["had left","will leave","has left","leaves"]', 0),
  (8, 'Read the sentence: "Despite having little experience, Maria managed to complete the project on time." What does "despite" indicate?',
   '["A purpose","A contrast","A cause","A sequence"]', 1),
  (9, 'Choose the most natural sentence for a professional situation:',
   '["I appreciate if you can sending me the report.","I appreciate you could sent me the report.","I would appreciate it if you could send me the report.","I would appreciate if you send me the report yesterday."]', 2),
  (10, 'Choose the sentence that best expresses a hypothetical situation in the present:',
   '["If I have more time, I would learn another language.","If I had more time, I will learn another language.","If I had more time, I would learn another language.","If I have had more time, I learn another language."]', 2)
) as q(ordre, enonce, options, bonne_reponse);
