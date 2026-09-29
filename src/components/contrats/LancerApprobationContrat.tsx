import { useMemo, useState, type FormEvent } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { useEtablissement } from '../../hooks/useEtablissement'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { useProfesseurDetailAdmin } from '../../hooks/useProfesseurDetailAdmin'
import { useClassesAvecMembres } from '../../hooks/useClassesAvecMembres'
import { LABEL_NIVEAU_CLASSE } from '../../lib/classesCollectif'
import { supabase } from '../../lib/supabaseClient'
import { libelleTypeProgramme, preparerVariables, substituerVariablesDuo, type ContexteProgramme } from '../../lib/contrats'
import type { Database, Role } from '../../types/database.types'
import { Champ, LigneInfo, champStyle } from '../ui/Champ'
import { ChampRechercheChoix, type OptionRecherche } from '../ui/ChampRechercheChoix'
import { MessageErreur } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'

type ContractTemplate = Database['public']['Tables']['contract_templates']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

const PREFIXE_CLASSE = 'classe:'

interface LancerApprobationContratProps {
  etablissementId: string
  modeles: ContractTemplate[]
  onLance: () => void
  onAnnuler: () => void
}

/* Trois choix et un bouton : type de contrat, personne concernée, modèle. Chaque variable du
   modèle porte une `source` explicite choisie par l'admin dans l'éditeur de modèle (voir
   CreerContratTemplate.tsx) — c'est ce mapping, pas une convention de nom, qui détermine si elle
   se remplit seule depuis la fiche ou reste à saisir ici (au besoin avec une valeur par défaut
   suggérée). Le contrat part directement au statut « envoyé » : lancer l'approbation, c'est le
   rendre visible et signable dans l'espace du destinataire. */
export function LancerApprobationContrat({ etablissementId, modeles, onLance, onAnnuler }: LancerApprobationContratProps) {
  const { profile, session } = useProfileContext()
  const etablissement = useEtablissement(etablissementId)
  const { etudiants } = useEtudiants()
  const { professeurs } = useProfesseurs()
  const { classes } = useClassesAvecMembres()

  const [typeContrat, setTypeContrat] = useState<Role>('etudiant')
  const [destinataireId, setDestinataireId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [complements, setComplements] = useState<Record<string, string>>({})
  /* Clause de minorité (0087, demande client du 2026-09-30) : une case à cocher par variable
     `estClauseMineur`, indépendante de `complements` — cochée, le texte de la clause (voir
     `defaut`, éditable) est inséré ; décochée (par défaut), rien ne l'est. Voir `valeurs`
     plus bas pour l'endroit où ce choix devient la valeur réellement substituée. */
  const [mineurCoche, setMineurCoche] = useState<Record<string, boolean>>({})
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  /* DUO (0066, demande client du 2026-09-23 : « quand je cherche des étudiants DUO, il faudrait
     que dans la liste deux prénoms s'affichent sur la même ligne »). `etudiants` contient les
     deux membres séparément (voir useEtudiants()) — on retire le second de la liste déroulante
     et on affiche le binôme comme une seule entrée « Prénom1/Prénom2 », le premier (principal ou
     secondaire, peu importe lequel) restant sélectionnable pour représenter les deux à la fois. */
  const secondaireParPrincipal = useMemo(() => {
    const table = new Map<string, (typeof etudiants)[number]>()
    for (const e of etudiants) {
      if (e.duo_partenaire_id) table.set(e.duo_partenaire_id, e)
    }
    return table
  }, [etudiants])
  const etudiantsGroupes = useMemo(() => etudiants.filter((e) => !e.duo_partenaire_id), [etudiants])

  const personnes = typeContrat === 'professeur' ? professeurs : etudiantsGroupes
  const modelesDuType = modeles.filter((m) => m.public_cible === typeContrat)

  /* Classe de cours collectif (demande client du 2026-09-29) : la choisir revient à lancer un
     contrat INDIVIDUEL entre HOC et chacun de ses élèves — un contrat par personne, pas un
     contrat collectif signé à plusieurs. */
  const classeChoisie = destinataireId.startsWith(PREFIXE_CLASSE)
    ? (classes.find((c) => c.classe.id === destinataireId.slice(PREFIXE_CLASSE.length)) ?? null)
    : null
  const membresClasse = useMemo(() => {
    if (!classeChoisie) return [] as Profile[]
    const parId = new Map(etudiants.map((e) => [e.id, e]))
    return classeChoisie.membreIds.map((id) => parId.get(id)).filter((p): p is Profile => !!p)
  }, [classeChoisie, etudiants])

  const options: OptionRecherche[] = useMemo(() => {
    const listePersonnes = personnes.map((p) => {
      const partenaire = secondaireParPrincipal.get(p.id)
      return {
        id: p.id,
        libelle: partenaire ? `${p.prenom}/${partenaire.prenom}` : `${p.prenom} ${p.nom}`,
        detail: typeContrat === 'professeur' ? 'Professeur' : partenaire ? 'Duo' : 'Étudiant',
      }
    })
    if (typeContrat !== 'etudiant') return listePersonnes
    const listeClasses = classes
      .filter((c) => c.membreIds.length > 0)
      .map((c) => ({
        id: `${PREFIXE_CLASSE}${c.classe.id}`,
        libelle: `${LABEL_NIVEAU_CLASSE[c.classe.niveau]}${c.classe.nom ? ` — ${c.classe.nom}` : ''}${c.cohorte ? ` · ${c.cohorte.nom}` : ''}`,
        detail: `Cours collectif · ${c.membreIds.length} élève${c.membreIds.length > 1 ? 's' : ''}`,
      }))
    return [...listeClasses, ...listePersonnes]
  }, [personnes, secondaireParPrincipal, typeContrat, classes])

  // Pour une classe, l'aperçu et le récapitulatif sont ceux du premier élève : les champs
  // d'identité changent d'un élève à l'autre, le reste du contrat est identique pour tous.
  const destinataire = classeChoisie ? (membresClasse[0] ?? null) : (personnes.find((p) => p.id === destinataireId) ?? null)
  // Second membre du binôme DUO du destinataire choisi (0066) — `null` pour un professeur ou un
  // étudiant individuel, qui n'a par définition personne dans cette table.
  const destinataireSecondaire = typeContrat === 'etudiant' && !classeChoisie ? secondaireParPrincipal.get(destinataireId) ?? null : null
  const modele = modelesDuType.find((m) => m.id === templateId) ?? null

  /* Ce que la fiche du destinataire seule ne porte pas — forfait, vague, affectation pour un
     étudiant ; élèves actifs et heures enseignées pour un professeur — vient de son dossier
     pédagogique complet, chargé via les mêmes hooks (et le même cache) que les pages Étudiants/
     Professeurs de l'admin. Un seul des deux hooks interroge réellement Supabase à la fois : les
     deux sont montés en permanence, mais chacun suspend sa requête tant que l'id qu'on lui passe
     n'est pas le sien (voir `useCacheRequete`, `cle` à `undefined`). */
  const { dossier } = useDossierEtudiant(typeContrat === 'etudiant' && !classeChoisie ? destinataireId || undefined : undefined)
  const { detail } = useProfesseurDetailAdmin(typeContrat === 'professeur' ? destinataireId || undefined : undefined)

  let contexteProgramme: ContexteProgramme | undefined
  if (classeChoisie) {
    const cohorte = classeChoisie.cohorte
    contexteProgramme = {
      langueProgramme: cohorte?.langue ?? null,
      typeProgrammeLabel: libelleTypeProgramme('collectif'),
      heuresProgramme: cohorte?.heures_forfait ?? etablissement?.heures_forfait_collectif ?? null,
      dateDebutProgramme: cohorte?.date_debut ?? null,
      dateEcheanceProgramme: cohorte?.date_fin ?? null,
    }
  } else if (typeContrat === 'etudiant' && dossier) {
    const periodeActuelle = dossier.periodes[0] ?? null
    const forfait = dossier.packages[0] ?? null
    contexteProgramme = {
      langueProgramme: dossier.cohorte?.langue ?? periodeActuelle?.affectation.langue ?? null,
      typeProgrammeLabel: dossier.cohorte ? libelleTypeProgramme('collectif') : forfait ? libelleTypeProgramme(forfait.type_programme) : null,
      heuresProgramme: forfait?.total_heures ?? null,
      montantProgramme: forfait?.montant ?? null,
      dateDebutProgramme: dossier.cohorte?.date_debut ?? periodeActuelle?.affectation.date_debut ?? null,
      dateEcheanceProgramme: forfait?.echeance ?? dossier.cohorte?.date_fin ?? null,
      rythmeProgramme: dossier.diagnostic?.rythme_convenu ?? null,
    }
  } else if (typeContrat === 'professeur' && detail) {
    contexteProgramme = {
      languesEnseignees: [...new Set(detail.eleves.map((e) => e.affectation.langue).filter((l): l is string => !!l))],
      nombreElevesActifs: detail.eleves.length,
      heuresEnseignees: detail.heuresTotalEnseignees,
    }
  }

  const variables = modele
    ? preparerVariables(modele.corps_template, modele.variables_disponibles, destinataire, etablissement, contexteProgramme, destinataireSecondaire)
    : []
  const remplies = variables.filter((v) => !!v.valeurAuto)
  // La clause de minorité (0087) a son propre rendu — case à cocher, pas un champ de texte libre
  // parmi les autres — donc exclue d'ici malgré `valeurAuto === undefined`. Voir plus bas.
  const aCompleter = variables.filter((v) => v.valeurAuto === undefined && !v.estClauseMineur)
  const clausesMineur = variables.filter((v) => v.estClauseMineur)

  const valeurs: Record<string, string> = {}
  // Le second membre d'un DUO (0066, repli du 2026-09-23) ne pèse jamais sur `valeurs` : il ne
  // doit apparaître qu'au paragraphe dupliqué par `substituerVariablesDuo`, jamais fusionné dans
  // la valeur du principal.
  const valeursSecondaires: Record<string, string> = {}
  for (const variable of variables) {
    /* Clause de minorité : jamais `variable.defaut` en repli silencieux (contrairement aux
       autres champs manuels) — sans la case cochée, la clause doit rester absente du contrat,
       pas s'y glisser parce que personne n'a encore touché le champ. */
    const valeur = variable.estClauseMineur
      ? mineurCoche[variable.cle]
        ? (complements[variable.cle] ?? variable.defaut ?? '')
        : ''
      : (complements[variable.cle] ?? variable.valeurAuto ?? variable.defaut)
    if (valeur !== undefined) valeurs[variable.cle] = valeur
    if (variable.valeurAutoSecondaire !== undefined) valeursSecondaires[variable.cle] = variable.valeurAutoSecondaire
  }
  const corpsGenere = modele ? substituerVariablesDuo(modele.corps_template, valeurs, valeursSecondaires) : ''

  function changerType(nouveau: Role) {
    setTypeContrat(nouveau)
    setDestinataireId('')
    setTemplateId('')
    setComplements({})
    setMineurCoche({})
  }

  const pret = !!(profile && destinataire && modele)

  /* Une ligne de contrat par élève de la classe. Le montant du forfait collectif est propre à
     chaque élève (trigger creer_forfait_collectif, 0071) : relu au moment du lancement plutôt
     que supposé identique pour tous. */
  async function lancerPourClasse(modeleClasse: ContractTemplate) {
    if (!profile || !classeChoisie) return
    const ids = membresClasse.map((m) => m.id)
    const { data: forfaits } = await supabase
      .from('packages')
      .select('student_id, montant, total_heures, created_at')
      .in('student_id', ids)
      .order('created_at', { ascending: false })
    const forfaitParEleve = new Map<string, { montant: number | null; total_heures: number }>()
    for (const f of forfaits ?? []) if (!forfaitParEleve.has(f.student_id)) forfaitParEleve.set(f.student_id, f)

    const aujourdhui = new Date().toISOString().slice(0, 10)
    const lignes = membresClasse.map((membre) => {
      const forfait = forfaitParEleve.get(membre.id)
      const contexte: ContexteProgramme = {
        ...contexteProgramme,
        heuresProgramme: forfait?.total_heures ?? contexteProgramme?.heuresProgramme ?? null,
        montantProgramme: forfait?.montant ?? null,
      }
      const vars = preparerVariables(modeleClasse.corps_template, modeleClasse.variables_disponibles, membre, etablissement, contexte, null)
      const valeursMembre: Record<string, string> = {}
      for (const variable of vars) {
        // Même règle que pour un contrat individuel (voir `valeurs` plus haut) : la case à
        // cocher, partagée par tous les élèves de la classe, décide seule de la clause.
        const valeur = variable.estClauseMineur
          ? mineurCoche[variable.cle]
            ? (complements[variable.cle] ?? variable.defaut ?? '')
            : ''
          : (complements[variable.cle] ?? variable.valeurAuto ?? variable.defaut)
        if (valeur !== undefined) valeursMembre[variable.cle] = valeur
      }
      return {
        etablissement_id: etablissementId,
        template_id: modeleClasse.id,
        destinataire_profile_id: membre.id,
        destinataire_secondaire_profile_id: null,
        destinataire_role: modeleClasse.public_cible,
        titre: `${modeleClasse.nom} — ${[membre.prenom, membre.nom].filter(Boolean).join(' ')}`,
        corps_genere: substituerVariablesDuo(modeleClasse.corps_template, valeursMembre, {}),
        variables_valeurs: valeursMembre,
        statut: 'envoye' as const,
        date_envoi: aujourdhui,
        created_by_profile_id: profile.id,
      }
    })

    const { error } = await supabase.from('contracts').insert(lignes)
    if (error) {
      setEnCours(false)
      setErreur(error.message)
      return
    }
    if (session) {
      for (const ligne of lignes) {
        fetch('/api/admin/notifier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            destinataireProfileId: ligne.destinataire_profile_id,
            type: 'contrat_a_signer',
            titre: `Contrat à signer · ${ligne.titre}`,
            lien: '/mon-espace/contrats',
          }),
        }).catch(() => undefined)
      }
    }
    setEnCours(false)
    onLance()
  }

  async function lancer(e: FormEvent) {
    e.preventDefault()
    if (!pret || !profile || !destinataire || !modele) return
    setEnCours(true)
    setErreur(null)

    if (classeChoisie) {
      await lancerPourClasse(modele)
      return
    }

    const aujourdhui = new Date().toISOString().slice(0, 10)
    // DUO (0066) : le titre nomme les deux personnes, pas seulement celle sélectionnée dans le
    // menu déroulant — c'est bien un contrat commun aux deux, pas celui du seul destinataire.
    const nomsDestinataires = [destinataire, destinataireSecondaire]
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => [p.prenom, p.nom].filter(Boolean).join(' '))
      .join(' & ')
    const titre = `${modele.nom} — ${nomsDestinataires}`

    const { error } = await supabase.from('contracts').insert({
      etablissement_id: etablissementId,
      template_id: modele.id,
      destinataire_profile_id: destinataire.id,
      destinataire_secondaire_profile_id: destinataireSecondaire?.id ?? null,
      destinataire_role: modele.public_cible,
      titre,
      corps_genere: corpsGenere,
      variables_valeurs: valeurs,
      statut: 'envoye',
      date_envoi: aujourdhui,
      created_by_profile_id: profile.id,
    })

    if (error) {
      setEnCours(false)
      setErreur(error.message)
      return
    }

    /* Le contrat est déjà visible dans l'espace du destinataire une fois au statut « envoyé » :
       si la notification échoue, l'approbation reste valide et la ligne du contrat propose
       « Envoyer un rappel ». On n'y bloque donc pas le lancement — ni sur l'échec (déjà le cas),
       ni sur la durée de l'appel : le insert ci-dessus a déjà réussi, il n'y a plus de raison de
       faire attendre l'admin pour un envoi de notification, sans intérêt pour lui à cet instant.
       DUO (0066) : les deux membres du binôme reçoivent chacun leur propre notification — les
       deux doivent signer le même contrat. */
    if (session) {
      const lien = modele.public_cible === 'professeur' ? '/professeur/contrats' : '/mon-espace/contrats'
      for (const destinataireANotifier of [destinataire, destinataireSecondaire].filter((p): p is NonNullable<typeof p> => !!p)) {
        fetch('/api/admin/notifier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            destinataireProfileId: destinataireANotifier.id,
            type: 'contrat_a_signer',
            titre: `Contrat à signer · ${titre}`,
            lien,
          }),
        }).catch(() => undefined)
      }
    }

    setEnCours(false)
    onLance()
  }

  return (
    <form onSubmit={lancer} className="card" style={{ padding: 18, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>Lancer une approbation de contrat</h3>
        <p style={{ margin: '5px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
          Le contrat est rédigé à partir du modèle et de la fiche de la personne choisie, puis envoyé pour signature.
          Aucune information n'est à ressaisir.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Champ label="1 · Type de contrat" obligatoire>
          <select value={typeContrat} onChange={(e) => changerType(e.target.value as Role)} style={champStyle}>
            <option value="etudiant">Contrat étudiant</option>
            <option value="professeur">Contrat professeur</option>
          </select>
        </Champ>

        <Champ label={typeContrat === 'professeur' ? '2 · Professeur concerné' : '2 · Étudiant ou classe concernés'} obligatoire>
          <ChampRechercheChoix
            options={options}
            valeur={destinataireId}
            onChange={setDestinataireId}
            placeholder={typeContrat === 'professeur' ? 'Nom du professeur…' : 'Nom de l’étudiant ou de la classe…'}
          />
        </Champ>

        <Champ label="3 · Modèle de contrat" obligatoire>
          <select required value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={champStyle}>
            <option value="">Sélectionner…</option>
            {modelesDuType.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom}
              </option>
            ))}
          </select>
        </Champ>
      </div>

      {modelesDuType.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
          Aucun modèle actif pour les {typeContrat === 'professeur' ? 'professeurs' : 'étudiants'} : créez-en un dans
          l'onglet « Modèles » avant de lancer une approbation.
        </p>
      )}

      {remplies.length > 0 && (
        <div style={{ borderRadius: 12, border: '1px solid rgba(111,227,192,.24)', background: 'rgba(111,227,192,.06)', padding: '12px 15px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-teal)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            {remplies.length} champ{remplies.length > 1 ? 's remplis' : ' rempli'} automatiquement
          </div>
          {remplies.map((variable) => (
            <LigneInfo
              key={variable.cle}
              label={variable.label}
              valeur={
                // Même présentation « une personne par ligne » que dans le contrat généré — pas
                // un simple « & » dans la même ligne, qui masquerait que ce champ sera bien
                // dupliqué en deux paragraphes distincts.
                variable.valeurAutoSecondaire ? (
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                    <span>{variable.valeurAuto}</span>
                    <span>{variable.valeurAutoSecondaire}</span>
                  </span>
                ) : (
                  variable.valeurAuto
                )
              }
            />
          ))}
        </div>
      )}

      {modele && aCompleter.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {aCompleter.length === 1 ? 'Une valeur reste à saisir' : `${aCompleter.length} valeurs restent à saisir`} — aucune fiche
            ne les porte. Les valeurs déjà remplies sont des suggestions courantes, à vérifier.
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {aCompleter.map((variable) => (
              <Champ key={variable.cle} label={variable.label}>
                <input
                  value={complements[variable.cle] ?? variable.defaut ?? ''}
                  onChange={(e) => setComplements({ ...complements, [variable.cle]: e.target.value })}
                  style={champStyle}
                />
              </Champ>
            ))}
          </div>
        </div>
      )}

      {/* Clause de minorité (0087, demande client du 2026-09-30) : « mets une checkbox, oui ou
          non, devant l'intitulé. Si la box est cochée, alors l'étudiant est mineur, donc la
          clause de minorité à rajouter, sinon, il ne faut pas mettre la clause ». Décochée par
          défaut — l'établissement n'a plus de date de naissance pour trancher lui-même. */}
      {modele &&
        clausesMineur.map((variable) => (
          <div key={variable.cle} style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 12, border: '1px solid var(--border-soft, var(--border))', padding: '11px 14px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!mineurCoche[variable.cle]}
                onChange={(e) => setMineurCoche({ ...mineurCoche, [variable.cle]: e.target.checked })}
              />
              <span>
                <strong>Élève mineur ?</strong> — {variable.label}
              </span>
            </label>
            {mineurCoche[variable.cle] && (
              <textarea
                value={complements[variable.cle] ?? variable.defaut ?? ''}
                onChange={(e) => setComplements({ ...complements, [variable.cle]: e.target.value })}
                rows={3}
                placeholder="Nom du représentant légal à compléter…"
                style={{ ...champStyle, resize: 'vertical' }}
              />
            )}
          </div>
        ))}

      {classeChoisie && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--accent-gold, #e9cf94)', lineHeight: 1.5 }}>
          Cours collectif : {membresClasse.length} contrat{membresClasse.length > 1 ? 's individuels seront envoyés' : ' individuel sera envoyé'}, un
          par élève ({membresClasse.map((m) => m.prenom).join(', ')}). Chacun signe le sien, entre HOC et lui seul. L’aperçu
          ci-dessous est celui de {destinataire?.prenom}.
        </p>
      )}

      {destinataireSecondaire && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--accent-gold, #e9cf94)', lineHeight: 1.5 }}>
          Binôme DUO : ce contrat portera les informations de {destinataire?.prenom} {destinataire?.nom} et{' '}
          {destinataireSecondaire.prenom} {destinataireSecondaire.nom}, qui devront tous deux le signer.
        </p>
      )}

      {modele && destinataire && (
        <details>
          <summary style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', cursor: 'pointer' }}>
            Aperçu du contrat
          </summary>
          <div style={{ ...champStyle, marginTop: 8, whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto', lineHeight: 1.6 }}>
            {corpsGenere}
          </div>
        </details>
      )}

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        <button type="button" onClick={onAnnuler} style={{ ...boutonNeutreStyle, fontSize: 12.5, padding: '10px 16px' }}>
          Annuler
        </button>
        <button type="submit" disabled={enCours || !pret} className="btn-shine" style={{ ...boutonPrimaireStyle, opacity: enCours || !pret ? 0.6 : 1 }}>
          {enCours ? 'Lancement…' : classeChoisie ? `Lancer ${membresClasse.length} approbation${membresClasse.length > 1 ? 's' : ''}` : "Lancer l'approbation"}
        </button>
      </div>
    </form>
  )
}
