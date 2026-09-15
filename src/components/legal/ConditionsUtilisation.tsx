import { BlocLegal, PageLegale } from './PageLegale'

/* Version générique, même logique que Confidentialite.tsx : suffisante pour la publication
   Google, à faire relire par un professionnel avant de s'en servir en cas de litige réel. */
export function ConditionsUtilisation() {
  return (
    <PageLegale titre="Conditions d'utilisation" misAJour="15 septembre 2026">
      <BlocLegal titre="Objet">
        <p>
          Ces conditions régissent l'utilisation du site et de l'application Hari Online Club (HOC),
          plateforme de cours de langues en visioconférence, par les élèves, professeurs et
          administrateurs qui y créent un compte.
        </p>
      </BlocLegal>

      <BlocLegal titre="Compte et accès">
        <p>
          Chaque compte est personnel. Les élèves et professeurs sont invités par un administrateur de
          l'établissement ; l'accès aux espaces (élève, professeur, admin) dépend du rôle attribué au
          compte. Il est de votre responsabilité de garder vos identifiants confidentiels.
        </p>
      </BlocLegal>

      <BlocLegal titre="Cours et visioconférence">
        <p>
          Les séances sont planifiées par l'établissement ou le professeur selon le forfait souscrit.
          Quand un compte Google est connecté côté établissement, chaque séance génère un lien Google
          Meet réel ; en son absence, un lien de remplacement est utilisé jusqu'à connexion du compte.
          Une séance reprogrammée ou annulée met à jour l'agenda et prévient les participants.
        </p>
      </BlocLegal>

      <BlocLegal titre="Paiements et contrats">
        <p>
          Les tarifs, forfaits et conditions de paiement propres à votre parcours sont ceux communiqués
          par l'établissement (devis, facture, contrat signé). Ces conditions générales ne remplacent pas
          un contrat individuel déjà signé avec l'établissement, qui prévaut en cas de différence.
        </p>
      </BlocLegal>

      <BlocLegal titre="Usage autorisé">
        <p>
          Le service est réservé à un usage pédagogique personnel. Il est interdit de partager son accès
          avec un tiers non inscrit, d'enregistrer ou de diffuser une séance sans l'accord des personnes
          présentes, ou d'utiliser la plateforme à des fins autres que le suivi de cours.
        </p>
      </BlocLegal>

      <BlocLegal titre="Responsabilité">
        <p>
          Nous mettons en œuvre des moyens raisonnables pour assurer la disponibilité du service, sans
          garantie d'absence totale d'interruption (maintenance, panne d'un prestataire tiers comme
          Google Meet). En cas d'indisponibilité de la visioconférence, l'établissement reprogramme la
          séance concernée.
        </p>
      </BlocLegal>

      <BlocLegal titre="Contact">
        <p>
          Pour toute question sur ces conditions, contactez l'établissement via votre espace personnel ou
          à <strong>contact@harionlineclub.app</strong>.
        </p>
      </BlocLegal>
    </PageLegale>
  )
}
