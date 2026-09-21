import { useMemo, useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useSeancesAdmin, type SeanceAdmin } from '../../hooks/useSeancesAdmin'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useRendezVous } from '../../hooks/useRendezVous'
import { useEvenementsAdmin } from '../../hooks/useEvenementsAdmin'
import { agendaAdminComplet } from '../../lib/agendaEvenements'
import { BadgeStatutSeance } from '../shared/BadgeStatutSeance'
import { EditerSeancePlanifieeModale } from '../shared/EditerSeancePlanifieeModale'
import { PopupEvenementAdmin, estEvenementAdmin } from '../shared/PopupEvenementAdmin'
import { initiales } from '../etudiants/DossierEtudiantVue'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { GroupeSection } from '../ui/Section'
import { Onglets } from '../ui/Onglets'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { AgendaHebdo } from '../ui/AgendaHebdo'
import { useProfileContext } from '../../context/ProfileContext'
import { estLienReel, getJoinUrl } from '../../lib/visio'
import { ajouterJours, lundiDeLaSemaine, type EvenementAgenda } from '../../lib/agenda'

type Vue = 'semaine' | 'globale'

/* Une teinte par professeur, stable d'une semaine à l'autre : sur l'agenda de l'établissement,
   la couleur est le seul repère qui permet de distinguer d'un coup d'œil les cours de chacun
   quand aucun filtre n'est actif. */
const TONS_PROFESSEUR = ['bleu', 'or', 'teal', 'violet'] as const

function tonDuProfesseur(professeurIds: string[], id: string | undefined): EvenementAgenda['ton'] {
  const index = id ? professeurIds.indexOf(id) : -1
  return index === -1 ? 'neutre' : TONS_PROFESSEUR[index % TONS_PROFESSEUR.length]
}

/* Pseudo-identifiant pour « l'agenda de l'admin » (rendez-vous prospects + événements créés par
   l'admin) dans la liste de personnes sélectionnables — jamais un UUID réel, donc jamais en
   conflit avec un professeur ou un étudiant. Demande client du 2026-09-21 : pouvoir cocher
   plusieurs professeurs et/ou étudiants à la fois, plus « Admin » pour voir son propre agenda. */
const ID_ADMIN = '__admin__'

export function SeancesAdmin() {
  const { profile, session } = useProfileContext()
  const { seances, loading, erreur, recharger } = useSeancesAdmin()
  const { professeurs } = useProfesseurs()
  const { etudiants } = useEtudiants()
  const { rendezVous, recharger: rechargerRendezVous } = useRendezVous()
  const { evenements: evenementsAdmin, recharger: rechargerEvenementsAdmin } = useEvenementsAdmin()
  const [vue, setVue] = useState<Vue>('semaine')
  const [semaineDebut, setSemaineDebut] = useState(() => lundiDeLaSemaine(new Date()))
  const [personnesSelectionnees, setPersonnesSelectionnees] = useState<Set<string>>(new Set())

  const [seanceOuverteId, setSeanceOuverteId] = useState<string | null>(null)

  function basculerPersonne(id: string) {
    setPersonnesSelectionnees((s) => {
      const copie = new Set(s)
      if (copie.has(id)) copie.delete(id)
      else copie.add(id)
      return copie
    })
  }

  const semaineFin = useMemo(() => ajouterJours(semaineDebut, 7), [semaineDebut])

  const seancesSemaine = useMemo(
    () => seances.filter((s) => s.session.debut >= semaineDebut.toISOString() && s.session.debut < semaineFin.toISOString()),
    [seances, semaineDebut, semaineFin],
  )

  const professeurIds = useMemo(() => professeurs.map((p) => p.id), [professeurs])

  const adminSelectionne = personnesSelectionnees.has(ID_ADMIN)
  const profsSelectionnes = useMemo(
    () => new Set([...personnesSelectionnees].filter((id) => professeurIds.includes(id))),
    [personnesSelectionnees, professeurIds],
  )
  const etudiantIds = useMemo(() => etudiants.map((e) => e.id), [etudiants])
  const etudiantsSelectionnes = useMemo(
    () => new Set([...personnesSelectionnees].filter((id) => etudiantIds.includes(id))),
    [personnesSelectionnees, etudiantIds],
  )

  const evenements = useMemo(() => {
    // Rien coché : comportement d'origine, toutes les séances de la semaine, aucun agenda admin.
    const visibles =
      personnesSelectionnees.size === 0
        ? seancesSemaine
        : seancesSemaine.filter(
            (s) =>
              (s.professeur && profsSelectionnes.has(s.professeur.id)) ||
              s.inscriptions.some((i) => i.etudiant && etudiantsSelectionnes.has(i.etudiant.id)),
          )
    const seancesEvenements = visibles.map((seance): EvenementAgenda => {
      const eleves = seance.inscriptions.map((i) => `${i.etudiant?.prenom ?? '?'} ${i.etudiant?.nom ?? ''}`.trim())
      return {
        id: seance.session.id,
        debut: seance.session.debut,
        dureeMinutes: seance.session.duree_minutes,
        titre: seance.professeur ? `${seance.professeur.prenom} ${seance.professeur.nom}` : 'Professeur inconnu',
        sousTitre: eleves.join(', ') || 'Aucun élève inscrit',
        ton: seance.session.statut === 'annulee' ? 'neutre' : tonDuProfesseur(professeurIds, seance.professeur?.id),
        attenue: seance.session.statut === 'annulee',
      }
    })

    if (!adminSelectionne) return seancesEvenements

    const evenementsAgendaAdmin = agendaAdminComplet(rendezVous, evenementsAdmin).filter((e) => {
      const debutIso = e.debut
      return debutIso >= semaineDebut.toISOString() && debutIso < semaineFin.toISOString()
    })
    return [...seancesEvenements, ...evenementsAgendaAdmin]
  }, [
    seancesSemaine,
    personnesSelectionnees,
    profsSelectionnes,
    etudiantsSelectionnes,
    professeurIds,
    adminSelectionne,
    rendezVous,
    evenementsAdmin,
    semaineDebut,
    semaineFin,
  ])

  // Seule une séance encore planifiée s'ouvre en édition, comme dans la vue liste. Quand le
  // filtre « Admin » est coché, l'agenda mélange aussi des rendez-vous prospects et des
  // événements admin (ids préfixés, voir lib/agendaEvenements.ts) : un clic dessus doit ouvrir
  // leur propre fiche plutôt que de chercher en vain une séance qui n'existe pas (bug relevé le
  // 2026-09-21 — le clic ne faisait alors rien).
  const clicEstEvenementAdmin = estEvenementAdmin(seanceOuverteId)
  const seanceOuverte = !clicEstEvenementAdmin
    ? seances.find((s) => s.session.id === seanceOuverteId && s.session.statut === 'planifiee') ?? null
    : null

  const maintenant = new Date().toISOString()
  const aVenir = seances
    .filter((s) => s.session.statut === 'planifiee')
    .sort((a, b) => a.session.debut.localeCompare(b.session.debut))
  // Chronologique comme le reste des plannings de l'app, y compris l'historique.
  const passees = seances
    .filter((s) => s.session.statut !== 'planifiee')
    .sort((a, b) => a.session.debut.localeCompare(b.session.debut))

  return (
    <AdminLayout actif="Séances & visio">
      <EnTetePage
        compact
        titre="Séances & visio"
        description="Le planning de tous les cours de l’établissement. Les séances sont créées par les professeurs depuis leur propre espace, ou en lot depuis un forfait étudiant : cette page sert à les consulter et à les suivre."
        actions={
          <Onglets
            etiquette="Mode d’affichage du planning"
            actif={vue}
            onChange={setVue}
            onglets={[
              { value: 'semaine', label: 'Vue par semaine' },
              { value: 'globale', label: 'Vue globale' },
            ]}
          />
        }
      />

      <GuidePage
        id="admin-seances"
        compact
        etapes={[
          <>
            La <strong>vue par semaine</strong> montre l’agenda jour par jour et permet de filtrer par professeur :
            c’est la vue à utiliser pour repérer les chevauchements et les trous dans un planning.
          </>,
          <>
            La <strong>vue globale</strong> liste toutes les séances à venir puis toutes les séances passées, sans
            limite de période : pratique pour retrouver une séance ancienne.
          </>,
          <>
            Une séance passe de « Planifiée » à « Terminée » quand le professeur la clôture depuis son espace. C’est ce
            geste qui alimente les compteurs d’heures et le taux d’assiduité.
          </>,
          <>
            Le <strong>lien Google Meet</strong> de chaque séance à venir apparaît sur sa ligne. S’il manque — séance
            créée avant la connexion du compte Google — le bouton <strong>Générer le lien Meet</strong> le crée et
            prévient les participants.
          </>,
        ]}
      />

      {erreur && (
        <div style={{ marginBottom: 16 }}>
          <MessageErreur>{erreur}</MessageErreur>
        </div>
      )}

      {!loading && seances.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <GrilleStats min={160} compact>
            <Stat compact libelle="Séances au total" valeur={seances.length} ton="or" />
            <Stat compact libelle="À venir" valeur={aVenir.length} ton="bleu" aide="Statut « planifiée »" />
            <Stat compact libelle="Cette semaine" valeur={seancesSemaine.length} ton="teal" aide="Sur la semaine affichée" />
            <Stat
              compact
              libelle="Annulées"
              valeur={seances.filter((s) => s.session.statut === 'annulee').length}
              ton="neutre"
            />
          </GrilleStats>
        </div>
      )}

      {loading ? (
        <EtatChargement lignes={4} hauteur={74} />
      ) : vue === 'globale' ? (
        seances.length === 0 ? (
          <EtatVide
            icone="seances"
            titre="Aucune séance planifiée"
            description="Les séances apparaîtront ici dès qu’un professeur en programmera depuis son calendrier, ou dès qu’un forfait étudiant sera planifié en lot depuis son dossier."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <GroupeSection compact titre={`À venir · ${aVenir.length}`}>
              {aVenir.length === 0 ? (
                <EtatVide compact icone="seances" titre="Aucune séance à venir" description="Toutes les séances programmées sont déjà passées." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {aVenir.map((seance) => (
                    <LigneSeance key={seance.session.id} seance={seance} maintenant={maintenant} onChange={recharger} />
                  ))}
                </div>
              )}
            </GroupeSection>
            <GroupeSection compact titre={`Passées · ${passees.length}`}>
              {passees.length === 0 ? (
                <EtatVide compact icone="seances" titre="Aucune séance passée" description="L’historique se remplira au fil des séances clôturées." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {passees.map((seance) => (
                    <LigneSeance key={seance.session.id} seance={seance} maintenant={maintenant} onChange={recharger} />
                  ))}
                </div>
              )}
            </GroupeSection>
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="grille-agenda-filtre">
            <aside style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              {personnesSelectionnees.size > 0 && (
                <button
                  onClick={() => setPersonnesSelectionnees(new Set())}
                  style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Tout décocher
                </button>
              )}

              <LigneFiltrePersonne
                id={ID_ADMIN}
                libelle="Admin"
                sousTitre="Rendez-vous et événements créés par l’admin"
                coche={adminSelectionne}
                onBasculer={() => basculerPersonne(ID_ADMIN)}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted-2)', padding: '2px 4px' }}>
                  Professeurs
                </span>
                {professeurs.map((prof) => {
                  const nb = seancesSemaine.filter((s) => s.professeur?.id === prof.id).length
                  return (
                    <LigneFiltrePersonne
                      key={prof.id}
                      id={prof.id}
                      libelle={`${prof.prenom} ${prof.nom}`}
                      compteur={nb}
                      initiales={initiales(prof)}
                      coche={profsSelectionnes.has(prof.id)}
                      onBasculer={() => basculerPersonne(prof.id)}
                    />
                  )
                })}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted-2)', padding: '2px 4px' }}>
                  Étudiants
                </span>
                {etudiants.map((etu) => {
                  const nb = seancesSemaine.filter((s) => s.inscriptions.some((i) => i.etudiant?.id === etu.id)).length
                  return (
                    <LigneFiltrePersonne
                      key={etu.id}
                      id={etu.id}
                      libelle={`${etu.prenom} ${etu.nom}`}
                      compteur={nb}
                      initiales={initiales(etu)}
                      coche={etudiantsSelectionnes.has(etu.id)}
                      onBasculer={() => basculerPersonne(etu.id)}
                    />
                  )
                })}
              </div>
            </aside>

            <div style={{ minWidth: 0 }}>
              <AgendaHebdo
                evenements={evenements}
                semaineDebut={semaineDebut}
                onSemaineChange={setSemaineDebut}
                onSelectionner={(evenement) => setSeanceOuverteId(evenement.id)}
                videMessage={
                  personnesSelectionnees.size > 0
                    ? 'Aucun événement pour les personnes cochées cette semaine. Changez la sélection ou de semaine.'
                    : 'Aucune séance cette semaine. Les professeurs les créent depuis leur propre calendrier, ou l’admin en lot depuis un forfait étudiant.'
                }
              />
            </div>
          </div>
        </div>
      )}

      {seanceOuverte && (
        <EditerSeancePlanifieeModale
          session={seanceOuverte.session}
          etudiants={seanceOuverte.inscriptions.map((i) => i.etudiant).filter((e): e is NonNullable<typeof e> => !!e)}
          professeur={seanceOuverte.professeur}
          video={seanceOuverte.video}
          onFermer={() => setSeanceOuverteId(null)}
          onEnregistre={() => {
            setSeanceOuverteId(null)
            recharger()
          }}
        />
      )}

      {clicEstEvenementAdmin && (
        <PopupEvenementAdmin
          elementOuvertId={seanceOuverteId}
          onFermer={() => setSeanceOuverteId(null)}
          rendezVous={rendezVous}
          evenementsAdmin={evenementsAdmin}
          profile={profile}
          session={session}
          onChange={() => {
            rechargerRendezVous()
            rechargerEvenementsAdmin()
          }}
        />
      )}
    </AdminLayout>
  )
}

/* Ligne à case à cocher du filtre multi-personnes — demande client du 2026-09-21 : pouvoir
   sélectionner plusieurs professeurs et/ou étudiants à la fois, plus « Admin », et voir d'un
   coup d'œil qui est coché. */
function LigneFiltrePersonne({
  id,
  libelle,
  sousTitre,
  compteur,
  initiales: initialesPersonne,
  coche,
  onBasculer,
}: {
  id: string
  libelle: string
  sousTitre?: string
  compteur?: number
  initiales?: string
  coche: boolean
  onBasculer: () => void
}) {
  return (
    <label
      htmlFor={`filtre-personne-${id}`}
      className="carte-ligne"
      style={{
        textAlign: 'left',
        borderRadius: 12,
        border: coche ? '1px solid rgba(94,179,255,.5)' : '1px solid var(--border)',
        background: 'var(--surface)',
        padding: '8px 11px',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        cursor: 'pointer',
      }}
    >
      <input id={`filtre-personne-${id}`} type="checkbox" checked={coche} onChange={onBasculer} style={{ flexShrink: 0 }} />
      {initialesPersonne && (
        <span style={{ width: 26, height: 26, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
          {initialesPersonne}
        </span>
      )}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flexGrow: 1, minWidth: 0 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)' }}>{libelle}</span>
        {sousTitre && <span style={{ fontSize: 10, color: 'var(--muted-2)' }}>{sousTitre}</span>}
      </span>
      {compteur !== undefined && <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{compteur}</span>}
    </label>
  )
}

function LigneSeance({ seance, onChange }: { seance: SeanceAdmin; maintenant: string; onChange: () => void }) {
  const { session: authSession } = useProfileContext()
  const [editionOuverte, setEditionOuverte] = useState(false)
  const [generationEnCours, setGenerationEnCours] = useState(false)
  const [erreurVisio, setErreurVisio] = useState<string | null>(null)
  const modifiable = seance.session.statut === 'planifiee'
  const lienReel = seance.video ? estLienReel(seance.video) : false

  async function genererLienMeet() {
    if (!authSession) return
    setGenerationEnCours(true)
    setErreurVisio(null)
    const reponse = await fetch('/api/admin/generer-lien-visio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authSession.access_token}` },
      body: JSON.stringify({ sessionId: seance.session.id }),
    })
    setGenerationEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreurVisio(corps?.error ?? 'La génération du lien a échoué.')
      return
    }
    onChange()
  }

  return (
    <div
      onClick={modifiable ? () => setEditionOuverte(true) : undefined}
      className={modifiable ? 'card card-lift row-hl' : 'card card-lift'}
      style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', cursor: modifiable ? 'pointer' : 'default' }}
    >
      <span style={{ fontSize: 12.5, color: 'var(--muted)', width: 150, flexShrink: 0 }}>
        {new Date(seance.session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
      </span>
      <span className="brand-font" style={{ fontSize: 13.5, color: 'var(--ink)', width: 170, flexShrink: 0 }}>
        {seance.professeur ? `${seance.professeur.prenom} ${seance.professeur.nom}` : 'Professeur inconnu'}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flexGrow: 1, minWidth: 200 }}>
        {seance.session.type === 'individuel' ? 'Individuel' : 'Collectif'} · {seance.session.duree_minutes} min ·{' '}
        {seance.inscriptions.map((i) => `${i.etudiant?.prenom ?? '?'} ${i.etudiant?.nom ?? ''}`).join(', ') || 'aucun élève inscrit'}
      </span>
      <BadgeStatutSeance statut={seance.session.statut} />

      {modifiable &&
        (lienReel && seance.video ? (
          <a
            href={getJoinUrl(seance.video)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-teal)' }}
          >
            Lien Meet
          </a>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              genererLienMeet()
            }}
            disabled={generationEnCours}
            style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {generationEnCours ? 'Génération…' : 'Générer le lien Meet'}
          </button>
        ))}

      {erreurVisio && (
        <span style={{ fontSize: 11, color: 'var(--danger)', flexBasis: '100%' }} onClick={(e) => e.stopPropagation()}>
          {erreurVisio}
        </span>
      )}

      {editionOuverte && (
        <div onClick={(e) => e.stopPropagation()}>
          <EditerSeancePlanifieeModale
            session={seance.session}
            etudiants={seance.inscriptions.map((i) => i.etudiant).filter((e): e is NonNullable<typeof e> => !!e)}
            professeur={seance.professeur}
            video={seance.video}
            onFermer={() => setEditionOuverte(false)}
            onEnregistre={() => {
              setEditionOuverte(false)
              onChange()
            }}
          />
        </div>
      )}
    </div>
  )
}
