import { useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useProfileContext } from '../../context/ProfileContext'
import { homonymeBloquant, nomComplet } from '../../lib/nomDuplique'
import type { Database } from '../../types/database.types'
import { GroupeSection, Section } from '../ui/Section'
import { Champ, LigneInfo, champStyle } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { boutonSecondaireStyle, boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'

type Profile = Database['public']['Tables']['profiles']['Row']

/* Les champs exigés pour un dossier complet (au-delà de nom/prénom, déjà exigés à
   l'inscription) : téléphone, adresse, ville. La date et le lieu de naissance ont été retirés
   de la fiche le 2026-09-29 (jugés non pertinents par le client). Exportée pour que la
   liste des étudiants (EtudiantsAdmin.tsx) puisse signaler un dossier incomplet sans dupliquer
   cette définition — un seul endroit à mettre à jour si ces champs changent. */
export function informationsPersonnellesCompletes(personne: Profile): boolean {
  /* Confirmation manuelle (0145, bouton « Complet ? » ci-dessous) : fait taire le badge même si
     les trois champs ne sont pas tous renseignés — l'admin a vérifié et juge le dossier bon tel
     quel pour cet élève précis. */
  return personne.dossier_complet_confirme || Boolean(personne.telephone && personne.adresse && personne.ville)
}

interface InformationsPersonnellesProps {
  personne: Profile
  onChange: () => void
  /* Champs additionnels propres à un rôle (ex. taux horaire professeur, Phase 2/3) — insérés
     entre l'adresse et les boutons, sans dupliquer ce composant par rôle. */
  extra?: ReactNode
  /* À `false` quand le panneau est inséré dans un onglet qui porte déjà son propre cadre (voir
     DossierEtudiantVue.tsx) : évite une carte dans une carte. Le contenu reste identique, seul
     l'habillage (fond, bordure) disparaît. */
  carte?: boolean
  /* Masque le bouton "Modifier" — espace professeur (0061) : la RLS `profiles` n'ouvre l'écriture
     qu'à l'admin et au titulaire lui-même, un professeur qui cliquerait "Enregistrer" essuierait
     un échec silencieux (0 ligne mise à jour). Mieux vaut ne jamais proposer l'action. */
  lectureSeule?: boolean
  /* Masque e-mail/téléphone/WhatsApp/adresse/ville — demande client du 2026-10-16 : « le
     professeur ne doit pas voir les coordonnées de ses étudiants ». Nom et prénom restent
     affichés (nécessaires pour identifier l'élève) ; seules les coordonnées personnelles
     disparaissent. Distinct de `lectureSeule`, qui ne masque que le bouton d'édition — un admin
     en lecture seule sur un autre écran doit par exemple continuer à tout voir. */
  masquerCoordonnees?: boolean
}

/* Panneau réutilisable admin : informations personnelles modifiables d'un étudiant ou d'un
   professeur (nom/prénom/téléphone/adresse). L'e-mail reste affiché en lecture seule : c'est
   aussi l'identifiant de connexion (auth.users), le modifier ici désynchroniserait l'affichage
   du login réel sans le changer — hors périmètre de ce panneau. */
export function InformationsPersonnelles({ personne, onChange, extra, carte = true, lectureSeule = false, masquerCoordonnees = false }: InformationsPersonnellesProps) {
  const { profile: moi } = useProfileContext()
  const [edition, setEdition] = useState(false)
  const [nom, setNom] = useState(personne.nom ?? '')
  const [prenom, setPrenom] = useState(personne.prenom ?? '')
  const [telephone, setTelephone] = useState(personne.telephone ?? '')
  const [whatsapp, setWhatsapp] = useState(personne.whatsapp ?? '')
  const [adresse, setAdresse] = useState(personne.adresse ?? '')
  const [ville, setVille] = useState(personne.ville ?? '')
  const [pays, setPays] = useState(personne.pays ?? '')
  const [tauxIndividuel, setTauxIndividuel] = useState(personne.taux_horaire_individuel?.toString() ?? '')
  const [tauxDuo, setTauxDuo] = useState(personne.taux_horaire_duo?.toString() ?? '')
  const [tauxCollectif, setTauxCollectif] = useState(personne.taux_horaire_collectif?.toString() ?? '')
  const [tauxCorporate, setTauxCorporate] = useState(personne.taux_horaire_corporate?.toString() ?? '')
  const [tauxChatChill, setTauxChatChill] = useState(personne.taux_horaire_chat_chill?.toString() ?? '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCoursConfirmation, setEnCoursConfirmation] = useState(false)
  const estProfesseur = personne.role === 'professeur'

  /* Bouton « Complet ? » (0145, demande client du 2026-10-30) : un simple bascule, pas une
     action à sens unique — un clic accidentel ou un dossier qui se révèle finalement incomplet
     doit pouvoir revenir en arrière sans contacter le support. Étudiant uniquement, et réservé à
     l'admin (jamais au professeur, jamais à l'élève sur son propre « Mon profil » en self-service
     — ce panneau y est monté avec `lectureSeule` à `false`, un rôle seul ne suffit donc pas à le
     distinguer) : c'est une vérification administrative, pas une auto-déclaration. */
  async function basculerDossierComplet() {
    setEnCoursConfirmation(true)
    const { error } = await supabase
      .from('profiles')
      .update({ dossier_complet_confirme: !personne.dossier_complet_confirme })
      .eq('id', personne.id)
    setEnCoursConfirmation(false)
    if (!error) onChange()
  }

  function annuler() {
    setNom(personne.nom ?? '')
    setPrenom(personne.prenom ?? '')
    setTelephone(personne.telephone ?? '')
    setWhatsapp(personne.whatsapp ?? '')
    setAdresse(personne.adresse ?? '')
    setVille(personne.ville ?? '')
    setPays(personne.pays ?? '')
    setTauxIndividuel(personne.taux_horaire_individuel?.toString() ?? '')
    setTauxDuo(personne.taux_horaire_duo?.toString() ?? '')
    setTauxCollectif(personne.taux_horaire_collectif?.toString() ?? '')
    setTauxCorporate(personne.taux_horaire_corporate?.toString() ?? '')
    setTauxChatChill(personne.taux_horaire_chat_chill?.toString() ?? '')
    setErreur(null)
    setEdition(false)
  }

  async function enregistrer() {
    setEnCours(true)
    setErreur(null)

    /* Même règle qu'à l'invitation (api/_lib/nomDuplique.ts) : deux personnes du même nom ne
       doivent jamais coexister dans la liste des étudiants ou des professeurs. Ce panneau écrit
       directement dans `profiles` sans passer par une fonction `api/`, la vérification se fait
       donc ici — l'admin voit déjà tous les profils de son établissement (policies de 0004/0017),
       la requête ne révèle rien de nouveau. */
    if (nom.trim() && prenom.trim()) {
      const { data: profils } = await supabase
        .from('profiles')
        .select('id, nom, prenom, status')
        .eq('etablissement_id', personne.etablissement_id)
        .eq('role', personne.role)
      /* `homonymeBloquant` plutôt qu'un filtre écrit ici : cette copie de la règle avait oublié
         les comptes supprimés, et un élève bien actif ne pouvait plus enregistrer sa propre fiche
         parce qu'un homonyme SUPPRIMÉ existait encore en base (2026-10-19, capture client). La
         règle est désormais au même endroit pour le navigateur et pour les routes `api/`. */
      const homonyme = homonymeBloquant(profils ?? [], { nom, prenom, exclureId: personne.id })
      if (homonyme) {
        setEnCours(false)
        setErreur(
          `${nomComplet(homonyme)} existe déjà dans cet établissement. Ajoutez de quoi les distinguer (second prénom, initiale) plutôt que deux fiches au même nom.`,
        )
        return
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        nom: nom || null,
        prenom: prenom || null,
        telephone: telephone || null,
        whatsapp: whatsapp || null,
        adresse: adresse || null,
        ville: ville || null,
        pays: pays || null,
        ...(estProfesseur && {
          taux_horaire_individuel: tauxIndividuel ? Number(tauxIndividuel) : null,
          taux_horaire_duo: tauxDuo ? Number(tauxDuo) : null,
          taux_horaire_collectif: tauxCollectif ? Number(tauxCollectif) : null,
          taux_horaire_corporate: tauxCorporate ? Number(tauxCorporate) : null,
          taux_horaire_chat_chill: tauxChatChill ? Number(tauxChatChill) : null,
        }),
      })
      .eq('id', personne.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setEdition(false)
    onChange()
  }

  const Conteneur = carte ? Section : GroupeSection
  const proprietesConteneur = carte ? { padding: '18px 20px' } : {}

  return (
    <Conteneur
      titre="Informations personnelles"
      {...proprietesConteneur}
      actions={
        !edition && !lectureSeule ? (
          <>
            {personne.role === 'etudiant' && moi?.role === 'admin_etablissement' && (
              <button
                onClick={basculerDossierComplet}
                disabled={enCoursConfirmation}
                style={
                  personne.dossier_complet_confirme
                    ? { ...boutonSecondaireStyle, color: '#fefffa', background: 'var(--success)', border: '1px solid var(--success)', opacity: enCoursConfirmation ? 0.6 : 1 }
                    : { ...boutonSecondaireStyle, opacity: enCoursConfirmation ? 0.6 : 1 }
                }
              >
                {enCoursConfirmation ? 'Enregistrement…' : personne.dossier_complet_confirme ? '✓ Dossier complet' : 'Complet ?'}
              </button>
            )}
            <button onClick={() => setEdition(true)} style={boutonSecondaireStyle}>
              Modifier
            </button>
          </>
        ) : undefined
      }
    >
      {!edition ? (
        /* `collee` sur toutes les lignes : l'intitulé est suivi directement de sa valeur, tout
           aligné à gauche — demande client du 2026-10-19. Les valeurs ne sont plus repoussées au
           bord droit du panneau, où un « Ville » court et une « Adresse » longue se retrouvaient
           à deux distances très différentes de leur intitulé. */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <LigneInfo collee label="Nom" valeur={personne.nom ?? '—'} />
          <LigneInfo collee label="Prénom" valeur={personne.prenom ?? '—'} />
          {masquerCoordonnees ? (
            <p style={{ fontSize: 11.5, color: 'var(--muted-2)', margin: '6px 0 0', lineHeight: 1.5 }}>
              Coordonnées (e-mail, téléphone, WhatsApp, adresse) réservées à l’administration.
            </p>
          ) : (
            <>
              <LigneInfo collee label="E-mail" valeur={personne.email ?? '—'} />
              <LigneInfo collee label="Téléphone" valeur={personne.telephone ?? '—'} />
              <LigneInfo collee label="WhatsApp" valeur={personne.whatsapp ?? '—'} />
              <LigneInfo collee label="Adresse" valeur={personne.adresse ?? '—'} />
              <LigneInfo collee label="Ville" valeur={personne.ville ?? '—'} />
              <LigneInfo collee label="Pays" valeur={personne.pays ?? '—'} />
            </>
          )}
          {estProfesseur && (
            <>
              <LigneInfo collee label="Taux horaire individuel" valeur={personne.taux_horaire_individuel ? `${personne.taux_horaire_individuel} Ar/h` : '—'} />
              <LigneInfo collee label="Taux horaire duo" valeur={personne.taux_horaire_duo ? `${personne.taux_horaire_duo} Ar/h` : '—'} />
              <LigneInfo collee label="Taux horaire collectif" valeur={personne.taux_horaire_collectif ? `${personne.taux_horaire_collectif} Ar/h` : '—'} />
              <LigneInfo collee label="Taux horaire corporate" valeur={personne.taux_horaire_corporate ? `${personne.taux_horaire_corporate} Ar/h` : '—'} />
              <LigneInfo collee label="Taux horaire chat & chill" valeur={personne.taux_horaire_chat_chill ? `${personne.taux_horaire_chat_chill} Ar/h` : '—'} />
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <Champ label="Nom">
            <input value={nom} onChange={(e) => setNom(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="Prénom">
            <input value={prenom} onChange={(e) => setPrenom(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="E-mail" aide="L’e-mail sert d’identifiant de connexion : il se modifie depuis le compte, pas ici.">
            <input value={personne.email ?? ''} disabled style={{ ...champStyle, opacity: 0.55, cursor: 'not-allowed' }} />
          </Champ>
          <Champ label="Téléphone">
            <input value={telephone} onChange={(e) => setTelephone(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="WhatsApp" aide="Facultatif : à renseigner seulement s’il diffère du téléphone.">
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="Adresse">
            <input value={adresse} onChange={(e) => setAdresse(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="Ville">
            <input value={ville} onChange={(e) => setVille(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="Pays">
            <input value={pays} onChange={(e) => setPays(e.target.value)} style={champStyle} />
          </Champ>
          {estProfesseur && (
            <>
              <Champ label="Taux horaire individuel (Ar/h)" aide="Appliqué à une séance individuelle enseignée.">
                <input type="number" value={tauxIndividuel} onChange={(e) => setTauxIndividuel(e.target.value)} style={champStyle} />
              </Champ>
              <Champ label="Taux horaire duo (Ar/h)" aide="Appliqué à une séance en binôme DUO enseignée.">
                <input type="number" value={tauxDuo} onChange={(e) => setTauxDuo(e.target.value)} style={champStyle} />
              </Champ>
              <Champ label="Taux horaire collectif (Ar/h)" aide="Appliqué à une séance de classe collective enseignée.">
                <input type="number" value={tauxCollectif} onChange={(e) => setTauxCollectif(e.target.value)} style={champStyle} />
              </Champ>
              {/* L'aide ne promet pas une application automatique, contrairement aux trois taux
                  ci-dessus : aucun type de séance « corporate » ni « chat & chill » n'existe dans
                  l'application, donc rien ne déclenche encore ces deux taux au calcul des heures
                  (voir le commentaire de la migration 0130). Mieux vaut le dire que de laisser
                  croire qu'une rémunération en découlera. */}
              <Champ label="Taux horaire corporate (Ar/h)" aide="Taux de référence pour une prestation corporate. Pas encore appliqué automatiquement : ce type de cours n’existe pas dans l’application.">
                <input type="number" value={tauxCorporate} onChange={(e) => setTauxCorporate(e.target.value)} style={champStyle} />
              </Champ>
              <Champ label="Taux horaire chat & chill (Ar/h)" aide="Taux de référence pour une séance chat & chill. Pas encore appliqué automatiquement : ce type de cours n’existe pas dans l’application.">
                <input type="number" value={tauxChatChill} onChange={(e) => setTauxChatChill(e.target.value)} style={champStyle} />
              </Champ>
            </>
          )}
          {erreur && <MessageErreur>{erreur}</MessageErreur>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={annuler} style={{ ...boutonNeutreStyle, flexGrow: 1, fontSize: 12.5, padding: 9 }}>
              Annuler
            </button>
            <button onClick={enregistrer} disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, flexGrow: 1, fontSize: 12.5, padding: 9, opacity: enCours ? 0.6 : 1 }}>
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {extra}
    </Conteneur>
  )
}

/* Variante DUO de ce panneau (0058/0063) : les deux membres d'un binôme, chacun avec ses propres
   informations personnelles — reprise à l'identique par l'espace admin (EtudiantsAdmin.tsx) ET
   l'espace professeur (EtudiantsProfesseur.tsx, en lecture seule) plutôt que le même bloc à deux
   colonnes recopié aux deux endroits, demande client du 2026-09-23 : « il faut que l'espace
   professeur reprenne exactement les mêmes informations que l'espace admin ». Retombe sur le
   panneau simple si l'étudiant n'a pas de partenaire. */
export function PanneauInformationsDuo({
  etudiant,
  duoPartenaire,
  onChange,
  lectureSeule = false,
  masquerCoordonnees = false,
}: {
  etudiant: Profile
  duoPartenaire: Profile | null
  onChange: () => void
  lectureSeule?: boolean
  masquerCoordonnees?: boolean
}) {
  if (!duoPartenaire) {
    return <InformationsPersonnelles personne={etudiant} onChange={onChange} carte={false} lectureSeule={lectureSeule} masquerCoordonnees={masquerCoordonnees} />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <span style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
          {etudiant.prenom} {etudiant.nom} (principal·e du binôme)
        </span>
        <InformationsPersonnelles personne={etudiant} onChange={onChange} carte={false} lectureSeule={lectureSeule} masquerCoordonnees={masquerCoordonnees} />
      </div>
      <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 18 }}>
        <span style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
          {duoPartenaire.prenom} {duoPartenaire.nom} (second·e membre du duo)
        </span>
        <InformationsPersonnelles personne={duoPartenaire} onChange={onChange} carte={false} lectureSeule={lectureSeule} masquerCoordonnees={masquerCoordonnees} />
      </div>
    </div>
  )
}
