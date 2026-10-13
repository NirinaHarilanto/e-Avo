-- Gestion des avis — demande client du 2026-10-13 : « quand un étudiant (DUO, collectif,
-- individuel) finit toutes ses heures de forfait, il sera notifié et invité à renseigner un avis
-- sur son parcours pédagogique dans son espace personnel. Une fois qu'il valide, l'avis sera
-- transféré à l'admin pour validation [...] quand l'admin valide l'avis, l'avis apparaîtra dans la
-- section témoignages parmi les autres témoignages existants avec la photo de l'étudiant. »
--
-- Les dix-huit témoignages affichés aujourd'hui vivaient en dur dans PageTemoignages.tsx : ils
-- entrent ici tels quels, à l'identique, pour que la page n'ait plus qu'UNE source et que l'admin
-- puisse les gérer (« pour les témoignages existants, rajoute la gestion (suppression, ajout,
-- modification) »). Leur ordre d'affichage d'origine est conservé dans `ordre`.

create table public.temoignages (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  -- Null pour les témoignages historiques, saisis par l'établissement : ils n'ont pas d'auteur
  -- connecté. Renseigné pour un avis déposé par un élève depuis son espace.
  auteur_profile_id uuid references public.profiles(id) on delete set null,
  -- Figé à la soumission plutôt que lu dans `profiles` à l'affichage : un témoignage publié ne
  -- doit pas changer de nom parce que l'élève a corrigé son profil, ni disparaître s'il est
  -- supprimé. Le lien `auteur_profile_id` sert au suivi, pas à l'affichage.
  nom_affiche text not null,
  texte text not null,
  annee int,
  /* Deux provenances d'image, jamais les deux à la fois :
     - `photo_fichier` : un fichier livré avec le site (public/etablissements/<slug>/temoignages/),
       pour les sept témoignages historiques qui en ont un ;
     - `photo_path` : la photo de profil de l'élève, dans le bucket `photos-profil`. */
  photo_fichier text,
  photo_path text,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'publie', 'refuse')),
  -- Renseigné quand l'admin écarte un avis : sert à le dire à l'élève, pas à le cacher.
  motif_refus text,
  ordre int not null default 0,
  soumis_le timestamptz not null default now(),
  decide_le timestamptz,
  decide_par uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint temoignages_une_seule_photo check (photo_fichier is null or photo_path is null)
);

create index temoignages_etablissement_statut_idx on public.temoignages (etablissement_id, statut);
create index temoignages_auteur_idx on public.temoignages (auteur_profile_id);

alter table public.temoignages enable row level security;

-- Lecture publique des seuls témoignages PUBLIÉS : la page Témoignages est servie à un visiteur
-- anonyme (même principe que `tarifs_public_select`, 0026). Un avis en attente ou refusé n'est
-- donc jamais lisible de l'extérieur, y compris en interrogeant l'API directement.
create policy "temoignages_public_select"
  on public.temoignages for select
  to anon, authenticated
  using (statut = 'publie');

-- L'élève voit SON avis quel qu'en soit le statut : c'est ainsi qu'il sait qu'il est en attente,
-- publié, ou refusé et pourquoi.
create policy "temoignages_auteur_select"
  on public.temoignages for select
  to authenticated
  using (auteur_profile_id = auth.uid());

-- Dépôt par l'élève : toujours en son nom et toujours « en attente ». Le `with check` interdit
-- de déposer un avis déjà publié, ou au nom de quelqu'un d'autre — la validation est à l'admin,
-- elle ne peut pas être court-circuitée depuis le navigateur.
create policy "temoignages_auteur_insert"
  on public.temoignages for insert
  to authenticated
  with check (
    auteur_profile_id = auth.uid()
    and etablissement_id = public.current_etablissement_id()
    and statut = 'en_attente'
  );

-- Correction de son propre avis tant qu'il n'est pas tranché : il reste « en attente ».
create policy "temoignages_auteur_update"
  on public.temoignages for update
  to authenticated
  using (auteur_profile_id = auth.uid() and statut = 'en_attente')
  with check (auteur_profile_id = auth.uid() and statut = 'en_attente');

create policy "temoignages_admin_all"
  on public.temoignages for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());


-- Reprise des dix-huit témoignages jusqu'ici codés en dur dans PageTemoignages.tsx, mot pour mot
-- (textes du client, en anglais, langue d'origine des citations). Ils entrent directement
-- « publiés » : ils sont déjà en ligne, cette migration ne fait que déplacer leur source. `ordre`
-- conserve leur ordre d'affichage d'origine, qui plaçait en tête les sept ayant une photo.
-- Rattachés à l'établissement de la vitrine par son slug RÉEL, `hari-online-course` — vérifié en
-- base le 2026-10-13, et non déduit du nom « Hari Online Club » : les deux ne coïncident pas.
insert into public.temoignages (etablissement_id, nom_affiche, texte, annee, photo_fichier, ordre, statut, soumis_le, decide_le)
select e.id, v.nom_affiche, v.texte, v.annee, v.photo_fichier, v.ordre, 'publie', now(), now()
from public.etablissements e
cross join (values
  ('dia', 2026, 'Dia', 'I really enjoy my English lessons with Hari. She is kind, patient, and always willing to help. She creates a positive and comfortable learning environment, which makes it easier for me to speak and improve my English with confidence. Thanks to her support, encouragement, and clear explanations, I have made noticeable progress and feel much more confident using English in everyday situations. Thank you, Hari, for your dedication and continuous support!', 'temoignage-dia.webp', 0),
  ('miora', 2025, 'Miora Christelle', 'Thank you from the bottom of my heart for everything you have done for me. Thanks to you, Harinjo English has become a place where I found not only knowledge, but also support, motivation, and a true family. Because of your support, I’ve improved, regained confidence, and most of all, I’ve come to love this language. Thank you, Mrs. Hari, Mrs. Manda and Mr. Landry : there are people you never forget — and you are one of them.', 'temoignage-miora.webp', 1),
  ('mihanta', 2025, 'Mihanta Andriantsoa', 'I started English classes to be more fluent and confident when speaking. The courses were more than just a learning session, they became a real hobby for me — a great way to disconnect from daily stress and talk about different topics in English. If you are looking for a way to learn and have fun at the same time, I definitely recommend this adventure. Thank you to the whole team for this great experience!', 'temoignage-mihanta.webp', 2),
  ('frederica', 2025, 'Frederica Andriananténaina', 'Personally, I really loved my online classes with the team, especially with Miss Sandra. I’ve already learned so much, and I truly feel like I’ve made incredible progress in a short amount of time. Her approach was clear, dynamic, and encouraging — she really helped me build confidence and speak without fear of making mistakes. A big thank you to the whole team, and especially to Miss Sandra, for this wonderful experience!', 'temoignage-frederica.webp', 3),
  ('cynthia', 2025, 'Cynthia Raobelina', 'I would like to sincerely thank you for your support and dedication throughout this English course. Your lessons have truly helped me improve my language skills, especially in speaking and vocabulary. I have noticed a real difference in my confidence and fluency, and I’m very grateful for the motivating learning environment you created.', 'temoignage-cynthia.webp', 4),
  ('fanirisoa', 2025, 'Fanirisoa Randria', 'I was so sad that my sessions had ended because I truly enjoyed them. It wasn’t just an English course; it was a discovery of a new world and an opportunity to meet wonderful people. A huge thank you to Harinjo’s team, from the bottom of my heart — especially my teacher Patricia, for her support and incredible patience with me. I’ve improved so much and I’m no longer worried about speaking with native English speakers. I’ll be back.', 'temoignage-fanirisoa.webp', 5),
  ('stephane', 2024, 'Stéphane Rakotonjanahary', 'Hari’s Online Courses has truly impressed me with the quality and professionalism of its courses. The lessons are clear, engaging, well-structured, and highly practical — complex topics explained in a simple and easy-to-understand way. I highly recommend Hari’s Online Courses to anyone looking to improve their skills, gain confidence, and take their learning to the next level.', 'temoignage-stephane.webp', 6),
  ('fara', 2026, 'Fara', 'I really enjoyed learning English with Manda. She is very kind, always willing to help, and ready to listen to what I needed so that I could improve my English-speaking skills with confidence. I will definitely come back, and I also encourage others to study here.', null, 7),
  ('leonardo', 2026, 'Leonardo', 'When I first started, I didn’t know anything about English, but after just one month, I saw significant progress. I’m not a pro yet, but Hari Online Club has taught me how to study on my own, and I’m confident that one day I will speak like a native. A big thank you to Teacher Manda and Teacher Lucie for their guidance and support.', null, 8),
  ('henintsoa', 2026, 'Henintsoa', 'Even though I didn’t reach my ideal score for the IELTS Speaking test, I still achieved my target overall IELTS band score of 7.5, and I couldn’t have reached that without you. Thank you, Manda, for being such a great and kind teacher. And thank you to the whole HOC team for being so organised and attentive to my needs.', null, 9),
  ('mahery', 2025, 'Mahery', 'I’ve been taking online English courses with Hari, a passionate young Malagasy teacher, and I’m very satisfied. The lessons are pedagogical and well-structured, making it easy to learn new words in a natural way. The organization is professional, and I have absolutely no regrets about having devoted my time and money. I wish her every success in developing her online courses.', null, 10),
  ('nancy', 2025, 'Nancy', 'I’ve been taking English lessons with Hari for about a month now, and I’ve truly enjoyed the experience. The lessons are tailored to my needs and goals. Hari is very supportive and encouraging, always prompting me to speak freely and gently correcting me when I make mistakes. Her positive energy makes the lessons enjoyable — we laugh a lot, but we always stay focused on learning English!', null, 11),
  ('manoa', 2025, 'Manoa Finoana', 'I would like to sincerely thank the wonderful Manda for my 15 hours of lessons. Her pedagogy and good humor, as well as our laughter, helped me break the wall so I could practice my spoken English. I’ll be back soon and yes, I’d love to continue with Harinjo and her team, especially Manda.', null, 12),
  ('rianah', 2025, 'Rianah', 'I finally found exactly what I needed with Teacher Manda and Harinjo. Their teaching skills are excellent; they explain everything clearly and never hesitate to answer any questions I have, no matter how specific. They have helped me significantly improve my English, especially when it comes to expressing myself and organizing my ideas. It has been a wonderful experience!', null, 13),
  ('nekena', 2025, 'Nekena', 'I want to thank Hari’s team, especially Patricia, who supported me throughout my learning journey. From the first session, Patricia immediately understood how to adapt the lessons to my needs. I was learning without even noticing it, simply because I was enjoying the process. For anyone looking to improve their English in a practical and engaging way, I genuinely recommend Hari’s team.', null, 14),
  ('carol', 2025, 'Carol', 'I just wanted to say thank you. Thanks to Harinjo’s support, I’ve finally been able to express myself in English, something I had never managed to do elsewhere or on my own. She is truly a gifted and inspiring teacher. I’m incredibly grateful. She really makes it easy.', null, 15),
  ('lovatiana', 2025, 'Only Lovatiana Rahajanirina', 'This was my first time attending an online English class, and it was a great experience. What I appreciated the most: the energy and enthusiasm of the teachers, the friendly and welcoming atmosphere, and most importantly the kindness — it truly felt like a safe space for learning. I was corrected with kindness, and that made a big difference. I’m even planning to sign up for more courses.', null, 16),
  ('nathalie', 2024, 'Nathalie Delpierre', 'I am very satisfied with Hari’s online courses. In 20 hours of lessons, I’ve expanded my vocabulary, improved my grammar, and learned many common expressions. The strength of Hari’s lessons lies in the audios, which are interesting, easy to understand, and encourage us to talk about subjects we enjoy. Try the Hari method, you’ll love it.', null, 17)
) as v(cle, annee, nom_affiche, texte, photo_fichier, ordre)
where e.slug = 'hari-online-course';

-- Photo de profil — demande client du 2026-10-13 : « créer la possibilité d'insérer la photo
-- étudiant dans la section informations personnelles de son espace personnel ». Elle sert d'abord
-- au témoignage publié, mais appartient au profil : elle est donc posée sur `profiles`, pas sur
-- `temoignages`.
alter table public.profiles add column photo_path text;

-- Bucket PUBLIC, contrairement à `signatures` (0047), `tampons` (0104) et `documents` (0018) qui
-- sont tous privés : une photo de témoignage s'affiche sur la vitrine, lue par un visiteur
-- anonyme sans jeton. Une URL signée ne conviendrait pas (elle expire, et il n'y a personne pour
-- la demander). Rien d'autre que des photos de profil ne doit donc y entrer : taille et types
-- d'images sont bornés ici.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos-profil', 'photos-profil', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Écriture : chacun la sienne, dans un dossier à son identifiant (même découpage que
-- `signatures`, 0047) — plus l'admin de l'établissement, qui gère les photos des témoignages.
create policy "photos_profil_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'photos-profil'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin_etablissement())
  );

create policy "photos_profil_storage_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'photos-profil'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin_etablissement())
  )
  with check (
    bucket_id = 'photos-profil'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin_etablissement())
  );

create policy "photos_profil_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'photos-profil'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin_etablissement())
  );
