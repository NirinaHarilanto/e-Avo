import { describe, expect, it, beforeEach, vi } from 'vitest'

/* Brief SEO du client du 2026-10-30 (point 3 : « pouvoir suivre les visites ») + identifiant
   GA4 fourni par le client. Ce qui est verrouillé ici, et qu'aucun écran ne montre :
   - le suivi ne se déclenche JAMAIS en dehors des pages publiques — ni sur /connexion, ni dans
     aucun espace connecté ;
   - le script externe n'est injecté qu'UNE SEULE FOIS par session de navigation, même si
     l'utilisateur visite dix pages publiques de suite ;
   - chaque page vue envoyée porte le VRAI chemin React Router, pas celui lu au premier chargement
     du script (sans quoi une appli à page unique sous-compterait toutes les pages sauf la
     première). */

describe('estPageSuiviAnalytics', () => {
  it('reconnaît les neuf pages publiques', async () => {
    const { estPageSuiviAnalytics } = await import('../analyticsVitrine')
    for (const chemin of [
      '/',
      '/cours',
      '/professeurs',
      '/temoignages',
      '/events',
      '/a-propos',
      '/rejoignez-nous',
      '/confidentialite',
      '/conditions-utilisation',
    ]) {
      expect(estPageSuiviAnalytics(chemin)).toBe(true)
    }
  })

  it('reconnaît une vitrine d’établissement par slug', async () => {
    const { estPageSuiviAnalytics } = await import('../analyticsVitrine')
    expect(estPageSuiviAnalytics('/e/hari-online-course')).toBe(true)
  })

  it('refuse la connexion et tous les espaces connectés', async () => {
    const { estPageSuiviAnalytics } = await import('../analyticsVitrine')
    for (const chemin of [
      '/connexion',
      '/auth/reinitialiser',
      '/admin/etudiants',
      '/admin/vagues',
      '/professeur/calendrier',
      '/professeur/cours-collectifs',
      '/mon-espace',
      '/mon-espace/agenda',
    ]) {
      expect(estPageSuiviAnalytics(chemin)).toBe(false)
    }
  })
})

describe('signalerPageVue', () => {
  beforeEach(() => {
    vi.resetModules()
    document.head.querySelectorAll('script').forEach((s) => s.remove())
    delete (window as { gtag?: unknown }).gtag
    delete (window as { dataLayer?: unknown }).dataLayer
  })

  it('n’injecte rien et n’appelle pas gtag sur une page privée', async () => {
    const { signalerPageVue } = await import('../analyticsVitrine')
    signalerPageVue('/admin/etudiants')
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull()
    expect(window.gtag).toBeUndefined()
  })

  it('injecte le script une seule fois, même sur plusieurs pages publiques successives', async () => {
    const { signalerPageVue } = await import('../analyticsVitrine')
    signalerPageVue('/')
    signalerPageVue('/cours')
    signalerPageVue('/professeurs')
    expect(document.querySelectorAll('script[src*="googletagmanager.com/gtag/js?id=G-RGTVK45WFE"]')).toHaveLength(1)
  })

  it('désactive la page vue automatique du premier `config`, pour ne pas compter la première page deux fois', async () => {
    const { signalerPageVue } = await import('../analyticsVitrine')
    signalerPageVue('/')
    // `gtag` pousse chacun de ses appels dans `dataLayer` : le lire directement évite de
    // remplacer `gtag` avant que le module ne le définisse lui-même.
    const appels = window.dataLayer as unknown[][]
    expect(appels.some((a) => a[0] === 'config' && (a[2] as Record<string, unknown> | undefined)?.send_page_view === false)).toBe(true)
  })

  it('envoie le vrai chemin de chaque page vue, pas seulement la première', async () => {
    const { signalerPageVue } = await import('../analyticsVitrine')
    signalerPageVue('/')
    signalerPageVue('/cours')
    const appels = window.dataLayer as unknown[][]
    const pagesVues = appels.filter((a) => a[0] === 'event' && a[1] === 'page_view').map((a) => (a[2] as Record<string, unknown>).page_path)
    expect(pagesVues).toEqual(['/', '/cours'])
  })
})
