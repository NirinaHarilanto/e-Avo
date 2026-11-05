import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SeanceDuParcours } from '../../../hooks/useDossierEtudiant'

/* Retrait d'une séance depuis le parcours pédagogique — demande client du 2026-11-05 : « un
   icône qui permet de retirer visuellement la séance. Quand le bouton est sélectionné, un
   pop-up apparaît pour demander confirmation. »

   Le pop-up ne demande pas seulement « êtes-vous sûr ? » : il ANNONCE ce qui part. Une séance
   clôturée a déjà débité l'élève et crédité son professeur, une séance planifiée n'a rien
   compté — et l'admin doit voir la différence avant de cliquer. C'est ce que garde ce fichier. */

vi.mock('../../../lib/jetonAcces', () => ({ jetonAcces: async () => 'jeton' }))

const { RetirerSeanceModale } = await import('../RetirerSeanceModale')

function seance(statut: string, dureeMinutes = 60): SeanceDuParcours {
  return {
    enrollment: { id: 'insc-1', present: true },
    session: {
      id: 'seance-1',
      debut: '2026-10-29T11:00:00+00:00',
      duree_minutes: dureeMinutes,
      statut,
      type: 'individuel',
      teacher_id: 'prof-1',
    },
    video: null,
  } as unknown as SeanceDuParcours
}

function monter(s: SeanceDuParcours, onRetiree = () => {}) {
  return render(
    <RetirerSeanceModale seance={s} nomEleve="Haingo RAMALASON" onFermer={() => {}} onRetiree={onRetiree} />,
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
})

describe('RetirerSeanceModale', () => {
  it('annonce que les heures comptées reviendront, pour une séance clôturée', () => {
    monter(seance('terminee'))

    expect(screen.getByText(/comptés à l’élève et à son professeur/)).toBeTruthy()
    expect(screen.getByText(/reviennent à leur valeur d’avant la clôture/)).toBeTruthy()
  })

  /* Une séance jamais clôturée n'a rien écrit au grand livre : annoncer un retour de compteur
     ferait croire à un impact qui n'existe pas. */
  it('dit qu’aucune heure n’a été comptée, pour une séance planifiée', () => {
    monter(seance('planifiee'))

    expect(screen.getByText(/Aucune heure n’a été comptée/)).toBeTruthy()
    expect(screen.queryByText(/reviennent à leur valeur d’avant la clôture/)).toBeNull()
  })

  /* 0085 : une séance « reportée » n'impacte ni l'élève ni le professeur — elle se lit comme une
     séance non comptée, pas comme une séance terminée. */
  it('traite une séance reportée comme non comptée', () => {
    monter(seance('reportee'))
    expect(screen.getByText(/Aucune heure n’a été comptée/)).toBeTruthy()
  })

  it('rappelle la date et la durée de la séance visée', () => {
    monter(seance('terminee', 90))

    expect(screen.getByText(/29 octobre 2026/)).toBeTruthy()
    /* La durée paraît DEUX fois — la phrase d'introduction et la liste de ce qui part —
       et c'est voulu : l'admin doit la lire là où il regarde. */
    expect(screen.getAllByText(/1h 30m/).length).toBeGreaterThan(0)
  })

  it('prévient que l’action est définitive', () => {
    monter(seance('terminee'))
    expect(screen.getByText(/Cette action est définitive/)).toBeTruthy()
  })

  it('n’appelle le serveur qu’à la confirmation, avec l’identifiant de la séance', async () => {
    monter(seance('terminee'))
    expect(globalThis.fetch).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Retirer la séance'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const appel = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(appel[0]).toBe('/api/admin/retirer-seance')
    expect(JSON.parse((appel[1] as RequestInit).body as string)).toEqual({ sessionId: 'seance-1' })
  })

  /* Le refus du serveur sur des heures déjà payées doit se lire tel quel : c'est lui qui nomme
     la raison et renvoie vers la correction manuelle du compteur. */
  it('affiche le refus du serveur plutôt qu’un message générique', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Les heures de cette séance sont déjà payées.' }), { status: 409 })),
    )
    monter(seance('terminee'))

    fireEvent.click(screen.getByText('Retirer la séance'))
    await waitFor(() => expect(screen.getByText(/déjà payées/)).toBeTruthy())
  })

  it('ne prévient le parent qu’après un retrait réussi', async () => {
    const onRetiree = vi.fn()
    monter(seance('terminee'), onRetiree)

    fireEvent.click(screen.getByText('Retirer la séance'))
    await waitFor(() => expect(onRetiree).toHaveBeenCalledTimes(1))
  })
})
