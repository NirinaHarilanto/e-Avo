import { useState, type CSSProperties } from 'react'
import { jetonAcces } from '../../lib/jetonAcces'
import { useProfileContext } from '../../context/ProfileContext'
import { useTarifs } from '../../hooks/useTarifs'
import { useCohortes } from '../../hooks/useCohortes'
import { useCohortClasses } from '../../hooks/useCohortClasses'
import { trierVaguesChronologiquement } from '../../lib/cohortes'
import { LABEL_NIVEAU_CLASSE, libelleCreneau } from '../../lib/classesCollectif'
import { useCreneauxClasses } from '../../hooks/useCreneauxClasses'
import { nomGroupeDuo } from '../../lib/duo'
import { formaterHeures } from '../../lib/heures'
import { Champ, champStyle } from '../ui/Champ'
import { MessageErreur, MessageSucces } from '../ui/Etats'
import { boutonPrimaireStyle, boutonNeutreStyle, boutonSecondaireStyle } from '../ui/Boutons'
import type { Database } from '../../types/database.types'

type TypeProgramme = Database['public']['Tables']['packages']['Row']['type_programme']

const TYPES: { valeur: TypeProgramme; titre: string; description: string }[] = [
  { valeur: 'individuel', titre: 'Individuel', description: 'Un élève, un professeur, un forfait d’heures à lui seul.' },
  { valeur: 'duo', titre: 'DUO', description: 'Deux élèves qui suivent ensemble : deux accès, un seul forfait partagé.' },
  { valeur: 'collectif', titre: 'Collectif', description: 'Une classe de niveau au sein d’une promotion, 32 heures de cours.' },
]

interface Personne {
  prenom: string
  nom: string
  email: string
}

const PERSONNE_VIDE: Personne = { prenom: '', nom: '', email: '' }

/* Assistant de création d'un étudiant, en trois étapes qui se dévoilent au fur et à mesure —
   demande client du 2026-10-30, capture à l'appui : « il faut suivre ces étapes qui s'affichent
   dynamiquement étape par étape selon les choix :
     1) définir le type de cours souhaité, Individuel, DUO ou collectif ;
     2) en fonction du type de cours souhaité, il faut récupérer les informations indispensables
        à la création d'espace personnel pour chaque type de cours. Enregistrer, valider et
        classer l'étudiant dans la bonne classe pour les cours collectifs ;
     3) création de son espace personnel avec les informations à jour. »

   Il remplace, sur la seule page Étudiants, le formulaire à trois champs (FormulaireInvitation),
   qui créait un compte nu : l'admin devait ensuite rouvrir la fiche pour y poser le forfait, et
   passer par Cours collectifs pour la vague et la classe. Rien de tout cela n'était deviné par
   l'écran — d'où des dossiers laissés à moitié faits.

   Les professeurs et les admins plateforme gardent FormulaireInvitation : eux n'ont ni
   programme, ni forfait, ni classe à choisir.

   Ce que l'assistant NE fait pas, volontairement : encaisser un paiement. Un forfait naît ici
   avec son montant, la trace financière se saisit depuis Paiements — c'est déjà la frontière
   posée partout ailleurs (convert-prospect.ts n'y déroge que pour les frais d'inscription
   collectifs, décidés au même instant que la conversion). */
export function AssistantNouvelEtudiant({ etablissementId, onTermine }: { etablissementId: string | undefined; onTermine: () => void }) {
  const { session } = useProfileContext()
  const { tarifs } = useTarifs(etablissementId)
  const { cohortes } = useCohortes()
  const { creneaux: creneauxClasses } = useCreneauxClasses()

  const [type, setType] = useState<TypeProgramme | null>(null)
  const [eleve, setEleve] = useState<Personne>(PERSONNE_VIDE)
  const [partenaire, setPartenaire] = useState<Personne>(PERSONNE_VIDE)
  const [nomGroupe, setNomGroupe] = useState('')
  const [tarifId, setTarifId] = useState('')
  const [cohortId, setCohortId] = useState('')
  const [cohortClassId, setCohortClassId] = useState('')
  const [etape2Validee, setEtape2Validee] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [resultat, setResultat] = useState<{ avertissement?: string } | null>(null)

  const { classes } = useCohortClasses(type === 'collectif' && cohortId ? cohortId : null)
  const tarifsDuType = tarifs.filter((t) => type && t.type_programme === type)
  const vagues = trierVaguesChronologiquement(cohortes)

  const personneComplete = (p: Personne) => !!(p.prenom.trim() && p.nom.trim() && p.email.trim())
  const etape2Complete =
    !!type &&
    personneComplete(eleve) &&
    (type !== 'duo' || personneComplete(partenaire)) &&
    (type !== 'collectif' || !!cohortId)

  function choisirType(valeur: TypeProgramme) {
    setType(valeur)
    // Tout ce qui dépendait du type précédent redevient vierge : garder un tarif « individuel »
    // après être passé en DUO le ferait partir silencieusement avec le mauvais programme.
    setTarifId('')
    setCohortId('')
    setCohortClassId('')
    setPartenaire(PERSONNE_VIDE)
    setNomGroupe('')
    setEtape2Validee(false)
    setErreur(null)
  }

  async function creer() {
    if (!session || !type) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/inviter-etudiant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonAcces()}` },
      body: JSON.stringify({
        prenom: eleve.prenom.trim(),
        nom: eleve.nom.trim(),
        email: eleve.email.trim(),
        typeProgramme: type,
        ...(tarifId ? { tarifId } : {}),
        ...(type === 'duo'
          ? {
              partenaire: {
                prenom: partenaire.prenom.trim(),
                nom: partenaire.nom.trim(),
                email: partenaire.email.trim(),
              },
              nomGroupe: nomGroupe.trim() || null,
            }
          : {}),
        ...(type === 'collectif' ? { cohortId, cohortClassId: cohortClassId || null } : {}),
      }),
    })
    const corps = (await reponse.json().catch(() => ({}))) as { error?: string; avertissement?: string }
    setEnCours(false)
    if (!reponse.ok) {
      setErreur(corps.error ?? "La création de l'espace personnel a échoué.")
      return
    }
    setResultat({ avertissement: corps.avertissement })
  }

  if (resultat) {
    return (
      <div className="card" style={{ padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <MessageSucces>
          L’espace personnel de {eleve.prenom} {eleve.nom} est créé
          {type === 'duo' ? `, avec celui de ${partenaire.prenom} ${partenaire.nom}` : ''}.
        </MessageSucces>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
          Un e-mail d’invitation a été envoyé : la personne y choisira elle-même son mot de passe, puis accédera
          directement à son espace. Vous n’avez pas de mot de passe à créer ni à transmettre.
        </p>
        {resultat.avertissement && <MessageErreur>{resultat.avertissement}</MessageErreur>}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onTermine} className="btn-shine" style={boutonPrimaireStyle}>
            Terminer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Etape numero={1} titre="Type de cours souhaité" active>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {TYPES.map((t) => {
            const choisi = type === t.valeur
            return (
              <button
                key={t.valeur}
                type="button"
                onClick={() => choisirType(t.valeur)}
                aria-pressed={choisi}
                style={{
                  flexGrow: 1,
                  minWidth: 180,
                  textAlign: 'left',
                  borderRadius: 14,
                  cursor: 'pointer',
                  /* Le choix doit se voir d'un coup d'œil : la bordure épaissit et se teinte, et
                     une pastille cochée s'ajoute au titre. En BLEU et non en or : sur le thème
                     clair, `--accent-gold` est une couleur sombre faite pour du texte, et la
                     délayer en fond ne donnait qu'un gris — c'est `--accent-blue` qui porte les
                     sélections partout ailleurs (cases à cocher, jetons, badges). */
                  border: choisi ? '2px solid var(--accent-blue)' : '1px solid var(--border)',
                  padding: choisi ? '10px 12px' : '11px 13px',
                  background: choisi ? 'color-mix(in srgb, var(--accent-blue) 13%, transparent)' : 'var(--surface)',
                  color: 'var(--ink)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, marginBottom: 3 }}>
                  {choisi && (
                    <span aria-hidden style={{ color: 'var(--accent-blue)', fontSize: 13, lineHeight: 1 }}>
                      ✓
                    </span>
                  )}
                  {t.titre}
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>{t.description}</span>
              </button>
            )
          })}
        </div>
      </Etape>

      {/* Étape 2 — n'existe qu'une fois le type choisi : c'est lui qui décide des informations
          indispensables, et les demander avant reviendrait à les demander toutes. */}
      {type && (
        <Etape numero={2} titre="Informations indispensables" active>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <BlocPersonne
              titre={type === 'duo' ? 'Première personne du binôme' : 'Étudiant'}
              personne={eleve}
              onChange={(p) => {
                setEleve(p)
                setEtape2Validee(false)
              }}
            />

            {type === 'duo' && (
              <>
                <BlocPersonne
                  titre="Seconde personne du binôme"
                  personne={partenaire}
                  onChange={(p) => {
                    setPartenaire(p)
                    setEtape2Validee(false)
                  }}
                />
                <Champ label="Nom du binôme (optionnel)">
                  <input
                    value={nomGroupe}
                    onChange={(e) => setNomGroupe(e.target.value)}
                    placeholder={nomGroupeDuo(null, eleve.prenom || 'Prénom A', partenaire.prenom || 'Prénom B')}
                    style={champStyle}
                  />
                </Champ>
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted-2)', lineHeight: 1.5 }}>
                  Les deux personnes obtiennent chacune leur accès, mais partagent un seul dossier : même forfait, mêmes
                  séances, même comptage d’heures.
                </p>
              </>
            )}

            {(type === 'individuel' || type === 'duo') && (
              <Champ label="Formule">
                <select
                  value={tarifId}
                  onChange={(e) => {
                    setTarifId(e.target.value)
                    setEtape2Validee(false)
                  }}
                  style={champStyle}
                >
                  <option value="">Aucune formule pour l’instant (forfait à créer plus tard)</option>
                  {tarifsDuType.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.titre}
                      {t.heures != null ? ` · ${formaterHeures(t.heures)}` : ''} · {Number(t.prix).toLocaleString('fr-FR')} Ar
                    </option>
                  ))}
                </select>
              </Champ>
            )}

            {type === 'collectif' && (
              <>
                <Champ label="Vague" obligatoire>
                  <select
                    value={cohortId}
                    onChange={(e) => {
                      setCohortId(e.target.value)
                      setCohortClassId('')
                      setEtape2Validee(false)
                    }}
                    style={champStyle}
                  >
                    <option value="">Choisir une promotion…</option>
                    {vagues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.nom}
                      </option>
                    ))}
                  </select>
                </Champ>
                <Champ label="Classe de niveau">
                  <select
                    value={cohortClassId}
                    onChange={(e) => {
                      setCohortClassId(e.target.value)
                      setEtape2Validee(false)
                    }}
                    disabled={!cohortId}
                    style={champStyle}
                  >
                    <option value="">À classer plus tard</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {LABEL_NIVEAU_CLASSE[c.niveau]}
                        {c.nom ? ` — ${c.nom}` : ''} · {libelleCreneau(creneauxClasses, c.creneau)}
                      </option>
                    ))}
                  </select>
                </Champ>
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted-2)', lineHeight: 1.5 }}>
                  Le forfait de la vague (32 heures par défaut) est créé automatiquement à l’inscription. Une classe
                  pleine refuse un 8ᵉ élève : l’étudiant rejoint alors la vague seule, à classer depuis Cours collectifs.
                </p>
              </>
            )}

            {!etape2Validee && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setEtape2Validee(true)}
                  disabled={!etape2Complete}
                  style={{ ...boutonSecondaireStyle, opacity: etape2Complete ? 1 : 0.5 }}
                >
                  Valider ces informations
                </button>
              </div>
            )}
          </div>
        </Etape>
      )}

      {/* Étape 3 — le récapitulatif de ce qui va être créé, puis la création elle-même. Elle ne
          s'ouvre qu'une fois l'étape 2 validée : c'est ce qui fait de la validation un vrai
          moment de relecture et non un simple clic de plus. */}
      {type && etape2Validee && (
        <Etape numero={3} titre="Création de l’espace personnel" active>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Recapitulatif
              lignes={[
                ['Type de cours', TYPES.find((t) => t.valeur === type)!.titre],
                [type === 'duo' ? 'Binôme' : 'Étudiant', `${eleve.prenom} ${eleve.nom} · ${eleve.email}`],
                ...(type === 'duo'
                  ? ([
                      ['Seconde personne', `${partenaire.prenom} ${partenaire.nom} · ${partenaire.email}`],
                      ['Nom du binôme', nomGroupeDuo(nomGroupe, eleve.prenom, partenaire.prenom)],
                    ] as [string, string][])
                  : []),
                ...(type !== 'collectif'
                  ? ([['Forfait', tarifsDuType.find((t) => t.id === tarifId)?.titre ?? 'Aucun pour l’instant']] as [string, string][])
                  : []),
                ...(type === 'collectif'
                  ? ([
                      ['Vague', vagues.find((v) => v.id === cohortId)?.nom ?? '—'],
                      [
                        'Classe',
                        (() => {
                          const c = classes.find((x) => x.id === cohortClassId)
                          return c ? `${LABEL_NIVEAU_CLASSE[c.niveau]}${c.nom ? ` — ${c.nom}` : ''}` : 'À classer plus tard'
                        })(),
                      ],
                    ] as [string, string][])
                  : []),
              ]}
            />
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
              Un e-mail d’invitation sera envoyé{type === 'duo' ? ' à chacune des deux adresses' : ' à cette adresse'}. La
              personne y choisira elle-même son mot de passe, puis accédera directement à son espace : vous n’avez pas de
              mot de passe à créer ni à transmettre.
            </p>
            {erreur && <MessageErreur>{erreur}</MessageErreur>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setEtape2Validee(false)} disabled={enCours} style={boutonNeutreStyle}>
                Revenir aux informations
              </button>
              <button type="button" onClick={creer} disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, opacity: enCours ? 0.6 : 1 }}>
                {enCours ? 'Création…' : 'Créer l’espace personnel'}
              </button>
            </div>
          </div>
        </Etape>
      )}

      {!type && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onTermine} style={boutonNeutreStyle}>
            Annuler
          </button>
        </div>
      )}
    </div>
  )
}

function Etape({ numero, titre, active, children }: { numero: number; titre: string; active: boolean; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 800,
            flexShrink: 0,
            background: active ? 'var(--accent-gradient)' : 'var(--voile, rgba(255,255,255,.06))',
            color: active ? '#1b1510' : 'var(--muted)',
          }}
        >
          {numero}
        </span>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{titre}</h4>
      </div>
      {children}
    </section>
  )
}

function BlocPersonne({ titre, personne, onChange }: { titre: string; personne: Personne; onChange: (p: Personne) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--muted)' }}>
        {titre}
      </span>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Champ label="Prénom" obligatoire style={{ flexGrow: 1, minWidth: 150 }}>
          <input value={personne.prenom} onChange={(e) => onChange({ ...personne, prenom: e.target.value })} style={champStyle} />
        </Champ>
        <Champ label="Nom" obligatoire style={{ flexGrow: 1, minWidth: 150 }}>
          <input value={personne.nom} onChange={(e) => onChange({ ...personne, nom: e.target.value })} style={champStyle} />
        </Champ>
        <Champ label="E-mail" obligatoire style={{ flexGrow: 2, minWidth: 210 }}>
          <input type="email" value={personne.email} onChange={(e) => onChange({ ...personne, email: e.target.value })} style={champStyle} />
        </Champ>
      </div>
    </div>
  )
}

const ligneRecap: CSSProperties = { display: 'flex', gap: 10, fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid var(--border-soft)' }

function Recapitulatif({ lignes }: { lignes: [string, string][] }) {
  return (
    <div style={{ borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', padding: '4px 14px' }}>
      {lignes.map(([label, valeur]) => (
        <div key={label} style={ligneRecap}>
          <span style={{ color: 'var(--muted)', minWidth: 130 }}>{label}</span>
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{valeur}</span>
        </div>
      ))}
    </div>
  )
}
