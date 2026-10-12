-- Remplace le quiz de positionnement écrit (10 questions de démarrage, 0051) par le test
-- complet fourni par le client (« HOC test de positionnement QUIZ ») — demande du 2026-10-12 :
-- 40 questions de grammaire/vocabulaire couvrant A1 à C1 (8 par niveau) puis 27 questions de
-- compréhension écrite organisées en 8 textes (avis, notice, publication, publicité, articles).
--
-- Le document source (export Google Forms) ne marque la bonne réponse d'aucune question par
-- aucune mise en forme (gras/couleur/surlignage) : Google Forms ne l'exporte jamais, la clé de
-- correction reste propre au formulaire d'origine. Les bonnes réponses ci-dessous ont donc été
-- déterminées par analyse linguistique (grammaire normative, collocations figées, lecture des
-- textes pour les questions de compréhension) plutôt que recopiées d'un corrigé. Quatre questions
-- de vocabulaire avancé (24, 29, 30, 66) admettent un synonyme proche plausible en usage courant
-- — signalé au client, à ajuster au besoin depuis Paramètres > Quiz de positionnement, qui permet
-- de corriger n'importe quelle question sans repasser par une migration.
--
-- Le schéma quiz_questions ne porte qu'un énoncé par question, sans notion de texte de lecture
-- partagé entre plusieurs questions : chaque texte de compréhension est donc répété dans
-- l'énoncé de CHACUNE de ses questions (préfixe « Texte : ... Question : ... »), pour qu'une
-- question reste lisible seule quel que soit l'ordre dans lequel le candidat la rencontre.
--
-- Historique préservé : les candidatures déjà envoyées (test_positionnement_inscriptions) gardent
-- leur score/niveau/bilan, entièrement autoportants au moment de l'envoi (voir 0051) — supprimer
-- les anciennes questions ne les affecte pas, aucune policy ni aucun écran ne les rejoint après
-- coup à quiz_questions.

delete from public.quiz_questions;

insert into public.quiz_questions (etablissement_id, ordre, enonce, options, bonne_reponse)
select e.id, q.ordre, q.enonce, q.options, q.bonne_reponse
from public.etablissements e
cross join (values
  (1, 'My name ___ Anna.', '["are","is","be","am"]'::jsonb, 1),
  (2, 'I ___ from Spain.', '["is","am","are","be"]'::jsonb, 1),
  (3, 'She ___ two children.', '["has","have","haves","having"]'::jsonb, 0),
  (4, 'There ___ a book on the table.', '["is","are","be","am"]'::jsonb, 0),
  (5, 'A place where you buy bread is a ___.', '["bank","bakery","library","hospital"]'::jsonb, 1),
  (6, 'The opposite of "big" is ___.', '["wide","tall","long","small"]'::jsonb, 3),
  (7, 'I drink ___ every morning.', '["chair","coffee","window","shoe"]'::jsonb, 1),
  (8, 'He is my ___; my mother''s brother.', '["cousin","nephew","uncle","grandfather"]'::jsonb, 2),
  (9, 'My brother ___ a doctor.', '["are","is","am","be"]'::jsonb, 1),
  (10, 'They ___ football every Saturday.', '["play","plays","playing","played"]'::jsonb, 0),
  (11, 'There ___ two cats in the garden.', '["is","are","be","was"]'::jsonb, 1),
  (12, 'I ___ swim very well when I was ten.', '["can","could","can''t","couldn''t"]'::jsonb, 1),
  (13, 'My father ___ breakfast every morning.', '["makes","does","has","takes"]'::jsonb, 2),
  (14, 'It''s very cold today, you should wear a ___.', '["coat","plate","chair","spoon"]'::jsonb, 0),
  (15, 'She works in a hospital. She''s a ___.', '["teacher","nurse","waiter","driver"]'::jsonb, 1),
  (16, 'My favourite ___ is pizza.', '["drink","food","sport","colour"]'::jsonb, 1),
  (17, 'While I ___ dinner, the phone rang.', '["cook","cooked","was cooking","had cooked"]'::jsonb, 2),
  (18, 'She ___ already ___ her homework when I called.', '["has / finished","had / finished","has / finish","have / finished"]'::jsonb, 1),
  (19, 'If it ___ tomorrow, we''ll stay at home.', '["rain","rains","will rain","rained"]'::jsonb, 1),
  (20, 'There isn''t ___ sugar left in the jar.', '["many","much","a few","several"]'::jsonb, 1),
  (21, 'It took me a long time to ___ a decision about which job to take.', '["do","make","take","have"]'::jsonb, 1),
  (22, 'Let''s ___ off the meeting until next week.', '["put","turn","give","take"]'::jsonb, 0),
  (23, 'She''s very ___, she always helps other people.', '["selfish","generous","mean","lazy"]'::jsonb, 1),
  (24, 'The meeting has been ___ to Friday instead of Thursday.', '["moved","changed","postponed","cancelled"]'::jsonb, 0),
  (25, 'If I ___ more time, I would travel around the world.', '["have","had","will have","would have"]'::jsonb, 1),
  (26, 'She said that she ___ tired and wanted to go home.', '["is","was","has been","were"]'::jsonb, 1),
  (27, 'When I was young, we ___ spend every summer at the beach.', '["used to","would to","use to","was used to"]'::jsonb, 0),
  (28, 'It''s ___ hot to sit outside today.', '["very","too","so","such"]'::jsonb, 1),
  (29, 'The company decided to ___ down its factory due to falling sales.', '["close","shut","turn","put"]'::jsonb, 0),
  (30, 'She has a real ___ for languages — she speaks five fluently.', '["gift","present","skill","talent"]'::jsonb, 0),
  (31, 'It is important to ___ a balance between work and family life.', '["keep","hold","strike","make"]'::jsonb, 2),
  (32, 'His speech was full of ___ remarks that offended many people.', '["tactful","tactless","tactical","tacit"]'::jsonb, 1),
  (33, 'If she ___ harder at school, she would have gone to university.', '["studied","had studied","studies","would study"]'::jsonb, 1),
  (34, '___ had I arrived home than the phone started ringing.', '["No sooner","Hardly","Scarcely","Rarely"]'::jsonb, 0),
  (35, 'What I really need ___ a good night''s sleep.', '["are","is","be","being"]'::jsonb, 1),
  (36, 'Seldom ___ such a moving performance.', '["I have seen","have I seen","I saw","did I saw"]'::jsonb, 1),
  (37, 'His argument was ___ — full of holes and contradictions.', '["coherent","flawed","valid","sound"]'::jsonb, 1),
  (38, 'The government''s controversial plan has come under ___ from opposition parties.', '["fire","attack","criticism","pressure"]'::jsonb, 0),
  (39, 'The two companies eventually decided to ___ forces to compete with larger rivals.', '["join","merge","unite","combine"]'::jsonb, 0),
  (40, 'The report was criticised for being ___ and lacking concrete evidence.', '["vague","clear","precise","detailed"]'::jsonb, 0),
  (41, 'Texte : « Modern cities are changing rapidly as governments and citizens become more aware of environmental issues. Many communities are investing in cleaner public transportation, expanding bicycle lanes, and creating more green spaces. These initiatives not only improve air quality but also encourage healthier lifestyles. Researchers have found that people living in neighborhoods with parks and trees often report lower stress levels and greater satisfaction with their surroundings. »

Question : "___ cities are changing rapidly as governments and citizens become more aware of environmental issues."', '["Modern","Money","Mobile","Model"]'::jsonb, 0),
  (42, 'Texte : « Modern cities are changing rapidly as governments and citizens become more aware of environmental issues. Many communities are investing in cleaner public transportation, expanding bicycle lanes, and creating more green spaces. These initiatives not only improve air quality but also encourage healthier lifestyles. Researchers have found that people living in neighborhoods with parks and trees often report lower stress levels and greater satisfaction with their surroundings. »

Question : "Many ___ are investing in cleaner public transportation."', '["Companies","Communities","Committees","Commuters"]'::jsonb, 1),
  (43, 'Texte : « Modern cities are changing rapidly as governments and citizens become more aware of environmental issues. Many communities are investing in cleaner public transportation, expanding bicycle lanes, and creating more green spaces. These initiatives not only improve air quality but also encourage healthier lifestyles. Researchers have found that people living in neighborhoods with parks and trees often report lower stress levels and greater satisfaction with their surroundings. »

Question : "These ___ not only improve air quality but also encourage healthier lifestyles."', '["institutions","instructions","initiatives","initials"]'::jsonb, 2),
  (44, 'Texte : « Modern cities are changing rapidly as governments and citizens become more aware of environmental issues. Many communities are investing in cleaner public transportation, expanding bicycle lanes, and creating more green spaces. These initiatives not only improve air quality but also encourage healthier lifestyles. Researchers have found that people living in neighborhoods with parks and trees often report lower stress levels and greater satisfaction with their surroundings. »

Question : "Researchers have ___ that people living near parks report lower stress levels."', '["felt","found","formed","focused"]'::jsonb, 1),
  (45, 'Texte : « Modern cities are changing rapidly as governments and citizens become more aware of environmental issues. Many communities are investing in cleaner public transportation, expanding bicycle lanes, and creating more green spaces. These initiatives not only improve air quality but also encourage healthier lifestyles. Researchers have found that people living in neighborhoods with parks and trees often report lower stress levels and greater satisfaction with their surroundings. »

Question : "People often report lower ___ levels."', '["status","standard","stress","structure"]'::jsonb, 2),
  (46, 'Texte : « Modern cities are changing rapidly as governments and citizens become more aware of environmental issues. Many communities are investing in cleaner public transportation, expanding bicycle lanes, and creating more green spaces. These initiatives not only improve air quality but also encourage healthier lifestyles. Researchers have found that people living in neighborhoods with parks and trees often report lower stress levels and greater satisfaction with their surroundings. »

Question : The passage mainly discusses:', '["public transportation only","environmental improvements in cities","financial problems","climate disasters"]'::jsonb, 1),
  (47, 'Texte : « CITY LIBRARY NOTICE — Beginning next Monday, the Central City Library will extend its opening hours on weekdays from 8:00 a.m. until 9:00 p.m. Visitors are reminded that all borrowed materials must be returned or renewed before their due dates. Self-service kiosks are available near the main entrance for book returns, renewals, and account inquiries. Staff members will continue to assist visitors during normal service hours. »

Question : What is the main purpose of the notice?', '["To advertise a new bookstore","To explain changes to library services","To encourage people to donate books","To announce a reading competition"]'::jsonb, 1),
  (48, 'Texte : « CITY LIBRARY NOTICE — Beginning next Monday, the Central City Library will extend its opening hours on weekdays from 8:00 a.m. until 9:00 p.m. Visitors are reminded that all borrowed materials must be returned or renewed before their due dates. Self-service kiosks are available near the main entrance for book returns, renewals, and account inquiries. Staff members will continue to assist visitors during normal service hours. »

Question : How can visitors renew borrowed books?', '["By calling the mayor''s office","By using the self-service kiosks","By visiting another library","By sending an email only"]'::jsonb, 1),
  (49, 'Texte : « Olivia Harper — Our neighborhood clean-up day is finally here! Last Saturday, over 120 volunteers spent the morning collecting litter, planting flowers, and repainting park benches. It was amazing to see children, parents, and senior citizens working together toward the same goal. The biggest surprise was how quickly the park changed. Areas that had looked neglected for years became welcoming public spaces again. Several residents suggested organizing similar projects every season, and many people have already signed up for the next event. »

Question : What is the author''s main purpose?', '["To criticize the city government","To describe a successful community event","To advertise gardening equipment","To explain how parks are designed"]'::jsonb, 1),
  (50, 'Texte : « Olivia Harper — Our neighborhood clean-up day is finally here! Last Saturday, over 120 volunteers spent the morning collecting litter, planting flowers, and repainting park benches. It was amazing to see children, parents, and senior citizens working together toward the same goal. The biggest surprise was how quickly the park changed. Areas that had looked neglected for years became welcoming public spaces again. Several residents suggested organizing similar projects every season, and many people have already signed up for the next event. »

Question : What surprised the author?', '["The weather","The number of police officers","How quickly the park improved","The cost of the project"]'::jsonb, 2),
  (51, 'Texte : « Olivia Harper — Our neighborhood clean-up day is finally here! Last Saturday, over 120 volunteers spent the morning collecting litter, planting flowers, and repainting park benches. It was amazing to see children, parents, and senior citizens working together toward the same goal. The biggest surprise was how quickly the park changed. Areas that had looked neglected for years became welcoming public spaces again. Several residents suggested organizing similar projects every season, and many people have already signed up for the next event. »

Question : What can be inferred?', '["Residents hope similar events will continue.","The project was cancelled.","Businesses refused to help.","The park will become a parking lot."]'::jsonb, 0),
  (52, 'Texte : « Psychologists have long been interested in understanding why certain memories remain vivid for years while others disappear quickly. Research suggests that emotional significance plays an important role in determining whether information is stored in long-term memory. However, emotion alone does not explain everything. The frequency with which information is recalled also affects how well it is remembered. Students who regularly test themselves on previously learned material generally perform better than those who repeatedly reread the same notes. This phenomenon, known as retrieval practice, strengthens connections between ideas and makes information easier to access in the future. Sleep also contributes significantly to memory consolidation. During sleep, the brain organizes newly acquired information and integrates it with existing knowledge. »

Question : What is the passage mainly about?', '["Why people forget everything","Factors influencing memory","Different types of sleep disorders","Emotional intelligence"]'::jsonb, 1),
  (53, 'Texte : « Psychologists have long been interested in understanding why certain memories remain vivid for years while others disappear quickly. Research suggests that emotional significance plays an important role in determining whether information is stored in long-term memory. However, emotion alone does not explain everything. The frequency with which information is recalled also affects how well it is remembered. Students who regularly test themselves on previously learned material generally perform better than those who repeatedly reread the same notes. This phenomenon, known as retrieval practice, strengthens connections between ideas and makes information easier to access in the future. Sleep also contributes significantly to memory consolidation. During sleep, the brain organizes newly acquired information and integrates it with existing knowledge. »

Question : According to the passage, retrieval practice involves', '["rereading textbooks","actively recalling information","sleeping longer","writing essays"]'::jsonb, 1),
  (54, 'Texte : « Psychologists have long been interested in understanding why certain memories remain vivid for years while others disappear quickly. Research suggests that emotional significance plays an important role in determining whether information is stored in long-term memory. However, emotion alone does not explain everything. The frequency with which information is recalled also affects how well it is remembered. Students who regularly test themselves on previously learned material generally perform better than those who repeatedly reread the same notes. This phenomenon, known as retrieval practice, strengthens connections between ideas and makes information easier to access in the future. Sleep also contributes significantly to memory consolidation. During sleep, the brain organizes newly acquired information and integrates it with existing knowledge. »

Question : The word "consolidation" is closest in meaning to:', '["destruction","strengthening","confusion","separation"]'::jsonb, 1),
  (55, 'Texte : « Artificial intelligence has become an increasingly important part of modern society. Businesses use intelligent systems to improve customer service, hospitals rely on advanced software to assist doctors in diagnosing diseases, and researchers analyze enormous quantities of information using machine learning. Although these technologies have improved efficiency in many fields, they also raise important ethical questions. »

Question : "___ intelligence has become an ___ important part of modern society."', '["Artistic / increased","Artificial / increasingly","Artificial / increased","Artistic / increasing"]'::jsonb, 1),
  (56, 'Texte : « Artificial intelligence has become an increasingly important part of modern society. Businesses use intelligent systems to improve customer service, hospitals rely on advanced software to assist doctors in diagnosing diseases, and researchers analyze enormous quantities of information using machine learning. Although these technologies have improved efficiency in many fields, they also raise important ethical questions. »

Question : "Businesses use intelligent ___ to improve customer service."', '["symptoms","synonyms","syllables","systems"]'::jsonb, 3),
  (57, 'Texte : « Artificial intelligence has become an increasingly important part of modern society. Businesses use intelligent systems to improve customer service, hospitals rely on advanced software to assist doctors in diagnosing diseases, and researchers analyze enormous quantities of information using machine learning. Although these technologies have improved efficiency in many fields, they also raise important ethical questions. »

Question : "Hospitals rely on advanced ___ to assist doctors."', '["software","solutions","sockets","specialists"]'::jsonb, 0),
  (58, 'Texte : « Artificial intelligence has become an increasingly important part of modern society. Businesses use intelligent systems to improve customer service, hospitals rely on advanced software to assist doctors in diagnosing diseases, and researchers analyze enormous quantities of information using machine learning. Although these technologies have improved efficiency in many fields, they also raise important ethical questions. »

Question : "Researchers analyze ___ quantities of information."', '["enrolled","enough","enormous","energy"]'::jsonb, 2),
  (59, 'Texte : « Artificial intelligence has become an increasingly important part of modern society. Businesses use intelligent systems to improve customer service, hospitals rely on advanced software to assist doctors in diagnosing diseases, and researchers analyze enormous quantities of information using machine learning. Although these technologies have improved efficiency in many fields, they also raise important ethical questions. »

Question : "Machine ___ has transformed scientific research."', '["learning","leadership","leasing","leaving"]'::jsonb, 0),
  (60, 'Texte : « Artificial intelligence has become an increasingly important part of modern society. Businesses use intelligent systems to improve customer service, hospitals rely on advanced software to assist doctors in diagnosing diseases, and researchers analyze enormous quantities of information using machine learning. Although these technologies have improved efficiency in many fields, they also raise important ethical questions. »

Question : The main purpose of the passage is to:', '["criticize computers","encourage people to become programmers","explain both the advantages and challenges of AI","compare hospitals and businesses"]'::jsonb, 2),
  (61, 'Texte : « DISCOVER GREEN VALLEY NATIONAL PARK — Escape the noise of the city and experience one of the country''s most beautiful natural landscapes. Green Valley National Park offers over 120 kilometers of marked hiking trails, scenic viewpoints, waterfalls, and protected wildlife habitats. Visitors can choose from guided nature walks, cycling routes, and educational programs led by experienced environmental specialists. Families are welcome, and children''s activities are available every weekend throughout the summer. Advance online booking is recommended during weekends and public holidays. »

Question : What is the main purpose of the advertisement?', '["To promote tourism","To recruit park employees","To describe environmental laws","To advertise sports equipment"]'::jsonb, 0),
  (62, 'Texte : « DISCOVER GREEN VALLEY NATIONAL PARK — Escape the noise of the city and experience one of the country''s most beautiful natural landscapes. Green Valley National Park offers over 120 kilometers of marked hiking trails, scenic viewpoints, waterfalls, and protected wildlife habitats. Visitors can choose from guided nature walks, cycling routes, and educational programs led by experienced environmental specialists. Families are welcome, and children''s activities are available every weekend throughout the summer. Advance online booking is recommended during weekends and public holidays. »

Question : Which activity is specifically mentioned?', '["Horse riding","Guided nature walks","Mountain climbing","Fishing competitions"]'::jsonb, 1),
  (63, 'Texte : « DISCOVER GREEN VALLEY NATIONAL PARK — Escape the noise of the city and experience one of the country''s most beautiful natural landscapes. Green Valley National Park offers over 120 kilometers of marked hiking trails, scenic viewpoints, waterfalls, and protected wildlife habitats. Visitors can choose from guided nature walks, cycling routes, and educational programs led by experienced environmental specialists. Families are welcome, and children''s activities are available every weekend throughout the summer. Advance online booking is recommended during weekends and public holidays. »

Question : Why are visitors encouraged to book in advance?', '["The park is busy during certain periods.","Food is limited.","Guided tours are free.","Parking is unavailable."]'::jsonb, 0),
  (64, 'Texte : « Curiosity has long been recognized as one of the driving forces behind human learning. From early childhood, people naturally explore unfamiliar objects, ask questions, and seek explanations for the world around them. Although curiosity is often associated with children, psychologists argue that it continues to influence learning and creativity throughout adulthood. Recent research suggests that curiosity does more than simply motivate individuals to search for new information. Brain-imaging studies indicate that when people become genuinely curious about a topic, regions of the brain associated with reward and memory become more active. Educational researchers have begun applying these findings in classrooms. Rather than presenting facts immediately, some teachers first encourage students to predict outcomes, solve puzzles, or discuss surprising questions. Although scientists continue to investigate the precise biological mechanisms underlying curiosity, there is growing agreement that encouraging learners to ask meaningful questions may be one of the most effective ways to improve long-term learning. »

Question : What is the main idea of the passage?', '["Curiosity only affects children.","Brain imaging is replacing classroom teaching.","Independent learning is always more effective.","Curiosity contributes to learning but works best with guidance."]'::jsonb, 3),
  (65, 'Texte : « Curiosity has long been recognized as one of the driving forces behind human learning. From early childhood, people naturally explore unfamiliar objects, ask questions, and seek explanations for the world around them. Although curiosity is often associated with children, psychologists argue that it continues to influence learning and creativity throughout adulthood. Recent research suggests that curiosity does more than simply motivate individuals to search for new information. Brain-imaging studies indicate that when people become genuinely curious about a topic, regions of the brain associated with reward and memory become more active. Educational researchers have begun applying these findings in classrooms. Rather than presenting facts immediately, some teachers first encourage students to predict outcomes, solve puzzles, or discuss surprising questions. Although scientists continue to investigate the precise biological mechanisms underlying curiosity, there is growing agreement that encouraging learners to ask meaningful questions may be one of the most effective ways to improve long-term learning. »

Question : According to the passage, curiosity activates brain regions related to:', '["reward and memory","movement and balance","hearing and vision","language production"]'::jsonb, 0),
  (66, 'Texte : « Curiosity has long been recognized as one of the driving forces behind human learning. From early childhood, people naturally explore unfamiliar objects, ask questions, and seek explanations for the world around them. Although curiosity is often associated with children, psychologists argue that it continues to influence learning and creativity throughout adulthood. Recent research suggests that curiosity does more than simply motivate individuals to search for new information. Brain-imaging studies indicate that when people become genuinely curious about a topic, regions of the brain associated with reward and memory become more active. Educational researchers have begun applying these findings in classrooms. Rather than presenting facts immediately, some teachers first encourage students to predict outcomes, solve puzzles, or discuss surprising questions. Although scientists continue to investigate the precise biological mechanisms underlying curiosity, there is growing agreement that encouraging learners to ask meaningful questions may be one of the most effective ways to improve long-term learning. »

Question : The word "underlying" in the final paragraph is closest in meaning to:', '["supporting","hidden beneath","replacing","improving"]'::jsonb, 1),
  (67, 'Texte : « Curiosity has long been recognized as one of the driving forces behind human learning. From early childhood, people naturally explore unfamiliar objects, ask questions, and seek explanations for the world around them. Although curiosity is often associated with children, psychologists argue that it continues to influence learning and creativity throughout adulthood. Recent research suggests that curiosity does more than simply motivate individuals to search for new information. Brain-imaging studies indicate that when people become genuinely curious about a topic, regions of the brain associated with reward and memory become more active. Educational researchers have begun applying these findings in classrooms. Rather than presenting facts immediately, some teachers first encourage students to predict outcomes, solve puzzles, or discuss surprising questions. Although scientists continue to investigate the precise biological mechanisms underlying curiosity, there is growing agreement that encouraging learners to ask meaningful questions may be one of the most effective ways to improve long-term learning. »

Question : Which of the following best summarizes the passage?', '["Brain research has completely transformed education.","Scientists have discovered every mechanism responsible for curiosity.","Teachers should replace textbooks with puzzles.","Curiosity enhances learning by increasing motivation and memory, but it is most effective when combined with accurate guidance and structured instruction."]'::jsonb, 3)
) as q(ordre, enonce, options, bonne_reponse);
