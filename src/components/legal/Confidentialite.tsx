import { BlocLegal, PageLegale } from './PageLegale'

/* Version générique, rédigée pour satisfaire l'exigence de Google (accès sensible Calendar/Meet)
   et donner une base honnête au visiteur — pas un document juridique final. À faire relire par
   un professionnel avant de s'appuyer dessus en cas de litige, et à adapter si l'établissement
   ajoute un traitement de données non listé ici (nouvelle intégration, sous-traitant...). */
export function Confidentialite() {
  return (
    <PageLegale titre="Politique de confidentialité" misAJour="15 septembre 2026">
      <BlocLegal titre="Qui nous sommes">
        <p>
          Hari Online Club (HOC) est une école de langues en ligne. Cette page décrit les données que nous
          collectons sur ce site et dans l'application, pourquoi, et comment les utilisateurs peuvent les
          consulter ou les faire supprimer.
        </p>
      </BlocLegal>

      <BlocLegal titre="Données que nous collectons">
        <p>Selon votre usage du site et de l'application, nous traitons :</p>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>Identité et contact : nom, prénom, e-mail, téléphone, adresse — fournis à l'inscription ou lors d'une demande de contact.</li>
          <li>Suivi pédagogique : niveau, objectifs, historique de séances, comptes rendus de cours, documents partagés avec votre professeur.</li>
          <li>Facturation : forfaits souscrits, paiements, factures et contrats.</li>
          <li>Connexion : e-mail et mot de passe (gérés par notre prestataire d'authentification, jamais stockés en clair par nos soins).</li>
        </ul>
      </BlocLegal>

      <BlocLegal titre="Intégration Google Calendar et Google Meet">
        <p>
          Lorsqu'un professeur ou un administrateur connecte son compte Google, l'application crée un
          événement dans son agenda Google pour chaque séance planifiée, avec une visioconférence Google
          Meet associée. Les élèves et le professeur concernés sont ajoutés comme invités à cet événement
          et reçoivent l'invitation par e-mail.
        </p>
        <p>
          Nous n'accédons qu'aux événements que nous créons nous-mêmes : nous ne lisons pas le reste de
          votre agenda Google, et nous ne partageons ces informations avec aucun tiers en dehors de Google
          (nécessaire au fonctionnement de Calendar et Meet). Le jeton d'accès Google est chiffré et
          accessible uniquement par notre infrastructure serveur, jamais par les autres utilisateurs de
          l'application.
        </p>
      </BlocLegal>

      <BlocLegal titre="Pourquoi nous traitons ces données">
        <p>
          Uniquement pour fournir le service : organiser les cours, suivre la progression, facturer les
          forfaits souscrits, et communiquer avec vous au sujet de votre parcours chez HOC. Nous ne
          revendons aucune donnée personnelle à des tiers.
        </p>
      </BlocLegal>

      <BlocLegal titre="Conservation et sécurité">
        <p>
          Les données sont hébergées chez des prestataires spécialisés (base de données et hébergement
          web), protégées par un contrôle d'accès strict selon votre rôle (élève, professeur,
          administrateur). Elles sont conservées le temps de la relation avec l'établissement, puis
          archivées ou supprimées conformément à nos obligations légales (comptabilité, contrats).
        </p>
      </BlocLegal>

      <BlocLegal titre="Vos droits">
        <p>
          Vous pouvez demander l'accès, la correction ou la suppression de vos données personnelles, ou
          la déconnexion de votre compte Google, en contactant l'établissement via l'adresse indiquée sur
          votre espace personnel ou à <strong>contact@harionlineclub.app</strong>.
        </p>
      </BlocLegal>
    </PageLegale>
  )
}
