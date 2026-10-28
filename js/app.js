/**
 * Campus Corner - Main Application Logic
 */

(function () {
  'use strict';

  // État de l'application
  const state = {
    items: [],
    view: 'stock',
    filter: 'dispo', // 'dispo' | 'vendu' | 'tous'
    dropFilter: '',
    categoryFilter: '',
    sortBy: 'recent', // 'recent' | 'price_desc' | 'price_asc' | 'margin_desc'
    searchQuery: '',
    period: 'mois', // 'jour' | 'semaine' | 'mois' | 'annee' | 'tout'
    draftPhoto: '',
    editingItem: null,
    activeSheetItem: null
  };

  // Sélecteur DOM rapide
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  // Initialisation au chargement
  window.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initServiceWorker();
    initNetworkStatus();
    initNavigation();
    initGlobalEvents();

    try {
      await window.appDB.init();
      state.items = await window.appDB.getAll();
    } catch (e) {
      console.error('Erreur chargement DB:', e);
      window.toast.error('Erreur d\'accès au stockage local.');
    }

    render();
  });

  // Gestion du Thème (Sombre / Clair)
  function initTheme() {
    const saved = localStorage.getItem('cc_theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    applyTheme(theme);

    const themeBtn = $('#theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem('cc_theme', next);
      });
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const themeBtn = $('#theme-toggle');
    if (themeBtn) {
      themeBtn.innerHTML = theme === 'dark' ? getIcon('sun') : getIcon('moon');
      themeBtn.setAttribute('title', theme === 'dark' ? 'Passer au mode clair' : 'Passer au mode sombre');
    }
  }

  // Service Worker PWA
  function initServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.log('Service Worker non enregistré:', err);
        });
      });
    }
  }

  // Détection Online / Offline
  function initNetworkStatus() {
    const banner = $('#offline-banner');
    const update = () => {
      if (!banner) return;
      if (navigator.onLine) {
        banner.classList.remove('active');
      } else {
        banner.classList.add('active');
        banner.textContent = 'Mode hors-ligne actif. Vos données restent enregistrées localement.';
      }
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }

  // Navigation
  function initNavigation() {
    $$('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetView = btn.dataset.view;
        if (targetView) {
          switchView(targetView);
        }
      });
    });
  }

  function switchView(viewName) {
    state.view = viewName;
    if (viewName !== 'add') {
      state.editingItem = null;
      state.draftPhoto = '';
    }
    $$('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function initGlobalEvents() {
    const sheetOverlay = $('#sheet');
    if (sheetOverlay) {
      sheetOverlay.addEventListener('click', (e) => {
        if (e.target === sheetOverlay) {
          closeSheet();
        }
      });
    }
  }

  // Helpers Métier
  function nextNumber() {
    return state.items.reduce((max, item) => Math.max(max, Number(item.n) || 0), 0) + 1;
  }

  function getDropName(item) {
    return item.drop && item.drop.trim() ? item.drop.trim() : 'Sans drop';
  }

  function getDropsList() {
    const list = [];
    const sorted = [...state.items].sort((a, b) => (b.n || 0) - (a.n || 0));
    sorted.forEach((i) => {
      const d = getDropName(i);
      if (!list.includes(d)) list.push(d);
    });
    return list;
  }

  function getLastDrop() {
    const sorted = [...state.items].sort((a, b) => (b.n || 0) - (a.n || 0));
    return sorted.length && sorted[0].drop ? sorted[0].drop : '';
  }

  function getCategoriesList() {
    return ['Hauts', 'Bas', 'Vestes', 'Chaussures', 'Accessoires', 'Autre'];
  }

  // Rendu Principal
  function render() {
    const app = $('#app');
    if (!app) return;

    if (state.view === 'stock') {
      app.innerHTML = renderStockView();
      bindStockEvents();
    } else if (state.view === 'add') {
      app.innerHTML = renderAddView();
      bindAddEvents();
    } else if (state.view === 'bilan') {
      app.innerHTML = renderBilanView();
      bindBilanEvents();
    } else if (state.view === 'settings') {
      app.innerHTML = renderSettingsView();
      bindSettingsEvents();
    }
  }

  // ==========================================
  // VUE 1 : STOCK & ARTICLES
  // ==========================================
  function renderStockView() {
    // Calcul des compteurs
    let countDispo = 0;
    let countVendu = 0;

    state.items.forEach((item) => {
      // Filtrage drop
      if (state.dropFilter && getDropName(item) !== state.dropFilter) return;
      if (state.categoryFilter && item.categorie !== state.categoryFilter) return;

      if (item.vendu) countVendu++;
      else countDispo++;
    });

    const totalFiltered = countDispo + countVendu;

    // Filtrage et Tri
    let filtered = state.items.filter((item) => {
      // Drop
      if (state.dropFilter && getDropName(item) !== state.dropFilter) return false;
      // Catégorie
      if (state.categoryFilter && item.categorie !== state.categoryFilter) return false;
      // Statut
      if (state.filter === 'dispo' && item.vendu) return false;
      if (state.filter === 'vendu' && !item.vendu) return false;
      // Recherche textuelle
      if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        const refMatch = `#${item.n}`.toLowerCase().includes(q);
        const nomMatch = (item.nom || '').toLowerCase().includes(q);
        const dropMatch = getDropName(item).toLowerCase().includes(q);
        const tailleMatch = (item.taille || '').toLowerCase().includes(q);
        const clientMatch = (item.client || '').toLowerCase().includes(q);
        if (!refMatch && !nomMatch && !dropMatch && !tailleMatch && !clientMatch) return false;
      }
      return true;
    });

    // Tri
    filtered.sort((a, b) => {
      if (state.sortBy === 'recent') return (b.n || 0) - (a.n || 0);
      if (state.sortBy === 'price_desc') return (b.prevu || b.prixVente || 0) - (a.prevu || a.prixVente || 0);
      if (state.sortBy === 'price_asc') return (a.prevu || a.prixVente || 0) - (b.prevu || b.prixVente || 0);
      if (state.sortBy === 'margin_desc') {
        const marginA = (a.vendu ? a.prixVente : a.prevu) - a.achat;
        const marginB = (b.vendu ? b.prixVente : b.prevu) - b.achat;
        return marginB - marginA;
      }
      return 0;
    });

    const drops = getDropsList();
    const categories = getCategoriesList();

    let html = `
      <div class="toolbar">
        <div class="search-box">
          <span class="search-icon">${getIcon('search')}</span>
          <input 
            type="search" 
            id="search-input" 
            class="search-input" 
            placeholder="Rechercher par nom, #réf, drop, taille..." 
            value="${esc(state.searchQuery)}"
          />
          <button id="search-clear" class="search-clear ${state.searchQuery ? 'visible' : ''}">
            ${getIcon('x')}
          </button>
        </div>

        <div class="filter-row">
          <select id="drop-filter" class="select-filter">
            <option value="">Tous les drops (${drops.length})</option>
            ${drops.map((d) => `<option value="${esc(d)}" ${state.dropFilter === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
          </select>

          <select id="sort-select" class="select-filter">
            <option value="recent" ${state.sortBy === 'recent' ? 'selected' : ''}>Plus récents</option>
            <option value="price_desc" ${state.sortBy === 'price_desc' ? 'selected' : ''}>Prix décroissant</option>
            <option value="price_asc" ${state.sortBy === 'price_asc' ? 'selected' : ''}>Prix croissant</option>
            <option value="margin_desc" ${state.sortBy === 'margin_desc' ? 'selected' : ''}>Marge potentielle</option>
          </select>
        </div>

        <div class="chips-scroll">
          <button class="chip-btn ${state.filter === 'dispo' ? 'active' : ''}" data-filter="dispo">
            En Stock <span class="badge-count">${countDispo}</span>
          </button>
          <button class="chip-btn ${state.filter === 'vendu' ? 'active' : ''}" data-filter="vendu">
            Vendus <span class="badge-count">${countVendu}</span>
          </button>
          <button class="chip-btn ${state.filter === 'tous' ? 'active' : ''}" data-filter="tous">
            Tous <span class="badge-count">${totalFiltered}</span>
          </button>
        </div>
      </div>
    `;

    if (!filtered.length) {
      html += `
        <div class="empty-state">
          <div class="empty-icon">${getIcon('package')}</div>
          <div class="empty-title">Aucun article trouvé</div>
          <p class="empty-desc">
            ${state.searchQuery || state.dropFilter 
              ? 'Aucun résultat ne correspond à vos filtres actuels.' 
              : 'Votre stock est vide pour le moment. Cliquez sur « Ajouter » pour enregistrer votre première pièce.'}
          </p>
          <button class="btn btn-primary" id="btn-empty-add" style="max-width:240px; margin:0 auto;">
            ${getIcon('plus')} Ajouter un article
          </button>
        </div>
      `;
      return html;
    }

    html += `<div class="items-list">`;
    filtered.forEach((item) => {
      const isVendu = !!item.vendu;
      const margin = isVendu ? (item.prixVente - item.achat) : (item.prevu - item.achat);

      html += `
        <div class="item-card" data-id="${item.id}">
          <div class="item-thumb-wrapper">
            ${item.photo 
              ? `<img src="${item.photo}" alt="${esc(item.nom)}" loading="lazy">` 
              : getIcon('package')}
          </div>
          <div class="item-content">
            <div class="item-header-line">
              <span class="item-ref">#${item.n}</span>
              <span class="badge-status ${isVendu ? 'badge-sold' : 'badge-stock'}">
                ${isVendu ? getIcon('check') + ' Vendu' : 'En stock'}
              </span>
            </div>
            <div class="item-title">${esc(item.nom)}</div>
            <div class="item-meta">
              <span class="item-meta-drop">${esc(getDropName(item))}</span>
              ${item.taille ? `<span>• T. ${esc(item.taille)}</span>` : ''}
              ${item.categorie ? `<span>• ${esc(item.categorie)}</span>` : ''}
            </div>
            <div class="item-financials">
              <span class="item-price">
                ${isVendu ? fmt(item.prixVente) : fmt(item.prevu || item.achat)}
              </span>
              <span style="font-size:11px; color:${margin >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">
                ${isVendu ? 'Gain: ' : 'Marge prev: '} ${margin >= 0 ? '+' : ''}${fmt(margin)}
              </span>
            </div>
          </div>
        </div>
      `;
    });
    html += `</div>`;

    return html;
  }

  function bindStockEvents() {
    const searchInput = $('#search-input');
    const searchClear = $('#search-clear');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        if (searchClear) searchClear.classList.toggle('visible', !!state.searchQuery);
        render();
      });
    }

    if (searchClear) {
      searchClear.addEventListener('click', () => {
        state.searchQuery = '';
        render();
      });
    }

    const dropFilter = $('#drop-filter');
    if (dropFilter) {
      dropFilter.addEventListener('change', (e) => {
        state.dropFilter = e.target.value;
        render();
      });
    }

    const sortSelect = $('#sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        render();
      });
    }

    $$('.chip-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filter = btn.dataset.filter;
        render();
      });
    });

    $$('.item-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = Number(card.dataset.id);
        const item = state.items.find((i) => i.id === id);
        if (item) openDetailSheet(item);
      });
    });

    const emptyAddBtn = $('#btn-empty-add');
    if (emptyAddBtn) {
      emptyAddBtn.addEventListener('click', () => switchView('add'));
    }
  }

  // ==========================================
  // VUE 2 : AJOUTER / MODIFIER UN ARTICLE
  // ==========================================
  function renderAddView() {
    const isEdit = !!state.editingItem;
    const it = state.editingItem || {};
    const drops = getDropsList();
    const categories = getCategoriesList();
    const photoSrc = state.draftPhoto || it.photo || '';

    return `
      <div class="form-card">
        <h2 style="font-size:18px; font-weight:800; margin-bottom:16px;">
          ${isEdit ? `Modifier l'article #${it.n}` : 'Ajouter un nouveau vêtement'}
        </h2>

        <!-- Téléversement Photo -->
        <label class="photo-uploader" for="photo-file-input">
          ${photoSrc ? `
            <img class="photo-preview" src="${photoSrc}" alt="Aperçu">
            <button type="button" class="photo-remove-btn" id="photo-remove-btn" title="Supprimer la photo">
              ${getIcon('x')}
            </button>
          ` : `
            <div style="margin-bottom:8px;">${getIcon('camera')}</div>
            <div style="font-size:14px; font-weight:600;">Prendre ou choisir une photo</div>
            <div style="font-size:12px; opacity:0.8;">Compression automatique HD</div>
          `}
        </label>
        <input type="file" id="photo-file-input" accept="image/*" style="display:none;">

        <!-- Drop & Catégorie -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Drop / Collection</label>
            <input 
              type="text" 
              id="form-drop" 
              class="form-input" 
              list="drops-datalist" 
              placeholder="Ex: Drop Denim" 
              value="${esc(isEdit ? it.drop : (state.dropFilter || getLastDrop()))}"
            />
            <datalist id="drops-datalist">
              ${drops.map((d) => `<option value="${esc(d)}">`).join('')}
            </datalist>
          </div>

          <div class="form-group">
            <label class="form-label">Catégorie</label>
            <select id="form-cat" class="form-select">
              ${categories.map((c) => `<option value="${esc(c)}" ${(it.categorie || '') === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Nom & Taille -->
        <div class="form-group">
          <label class="form-label">Nom de la pièce *</label>
          <input 
            type="text" 
            id="form-nom" 
            class="form-input" 
            placeholder="Ex: Jean Levi's 501 brut" 
            value="${esc(it.nom || '')}"
            required
          />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Taille</label>
            <input 
              type="text" 
              id="form-taille" 
              class="form-input" 
              placeholder="Ex: M, L, 32, 42..." 
              value="${esc(it.taille || '')}"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Date d'achat</label>
            <input 
              type="date" 
              id="form-date-achat" 
              class="form-input" 
              value="${esc(it.dateAchat || today())}"
            />
          </div>
        </div>

        <!-- Prix d'achat & Prix prévu -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Prix d'achat (FCFA) *</label>
            <input 
              type="number" 
              id="form-achat" 
              class="form-input" 
              placeholder="Ex: 3500" 
              inputmode="numeric"
              value="${it.achat || ''}"
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label">Prix de vente prévu (FCFA)</label>
            <input 
              type="number" 
              id="form-prevu" 
              class="form-input" 
              placeholder="Ex: 9000" 
              inputmode="numeric"
              value="${it.prevu || ''}"
            />
          </div>
        </div>

        <!-- Notes / Emplacement -->
        <div class="form-group">
          <label class="form-label">Notes & Acheteur (optionnel)</label>
          <input 
            type="text" 
            id="form-client" 
            class="form-input" 
            placeholder="Ex: Réservé pour Sarah, petite tache au dos..." 
            value="${esc(it.client || '')}"
          />
        </div>

        <div style="display:flex; gap:10px; margin-top:20px;">
          ${isEdit ? `
            <button type="button" class="btn btn-secondary" id="btn-cancel-edit">Annuler</button>
          ` : ''}
          <button type="button" class="btn btn-primary" id="btn-save-item">
            ${getIcon('check')} ${isEdit ? 'Mettre à jour' : 'Enregistrer la pièce'}
          </button>
        </div>
      </div>
    `;
  }

  function bindAddEvents() {
    const fileInput = $('#photo-file-input');
    const removePhotoBtn = $('#photo-remove-btn');

    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        window.toast.info('Traitement de la photo...');
        const compressed = await compressImage(file, 800, 0.75);
        if (compressed) {
          state.draftPhoto = compressed;
          render();
        } else {
          window.toast.error('Erreur lors du traitement de la photo');
        }
      });
    }

    if (removePhotoBtn) {
      removePhotoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.draftPhoto = '';
        if (state.editingItem) state.editingItem.photo = '';
        render();
      });
    }

    const cancelBtn = $('#btn-cancel-edit');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        state.editingItem = null;
        state.draftPhoto = '';
        switchView('stock');
      });
    }

    const saveBtn = $('#btn-save-item');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const nom = ($('#form-nom').value || '').trim();
        const achat = parseFloat($('#form-achat').value);
        const prevu = parseFloat($('#form-prevu').value) || 0;
        const drop = ($('#form-drop').value || '').trim() || 'Sans drop';
        const taille = ($('#form-taille').value || '').trim();
        const categorie = $('#form-cat').value;
        const dateAchat = $('#form-date-achat').value || today();
        const client = ($('#form-client').value || '').trim();

        if (!nom) {
          window.toast.error('Veuillez indiquer le nom de la pièce.');
          $('#form-nom').focus();
          return;
        }

        if (isNaN(achat) || achat < 0) {
          window.toast.error('Veuillez renseigner un prix d\'achat valide.');
          $('#form-achat').focus();
          return;
        }

        const isEdit = !!state.editingItem;

        if (isEdit) {
          // Mise à jour de l'article existant
          const item = state.editingItem;
          item.nom = nom;
          item.achat = achat;
          item.prevu = prevu;
          item.drop = drop;
          item.taille = taille;
          item.categorie = categorie;
          item.dateAchat = dateAchat;
          item.client = client;
          if (state.draftPhoto) item.photo = state.draftPhoto;

          if (!item.log) item.log = [];
          item.log.push({
            d: today(),
            t: `Article modifié (Achat: ${fmt(achat)}, Prévu: ${fmt(prevu)})`
          });

          await window.appDB.put(item);
          window.toast.success('Article mis à jour avec succès !');
          state.editingItem = null;
          state.draftPhoto = '';
          switchView('stock');
        } else {
          // Création d'un nouvel article
          const newItem = {
            id: Date.now(),
            n: nextNumber(),
            drop,
            categorie,
            nom,
            taille,
            photo: state.draftPhoto || '',
            achat,
            prevu,
            dateAchat,
            vendu: false,
            prixVente: 0,
            dateVente: '',
            client,
            log: [
              { d: dateAchat, t: `Acheté ${fmt(achat)}` }
            ]
          };

          state.items.push(newItem);
          await window.appDB.put(newItem);
          window.toast.success(`Article #${newItem.n} enregistré !`);
          state.draftPhoto = '';
          state.filter = 'dispo';
          switchView('stock');
        }
      });
    }
  }

  // ==========================================
  // VUE 3 : BILAN & FINANCES (ANALYTICS)
  // ==========================================
  function inPeriod(dateStr, period) {
    if (!dateStr) return false;
    if (period === 'tout') return true;

    const t = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    const todayStr = today();

    if (period === 'jour') {
      return dateStr === todayStr;
    }
    if (period === 'semaine') {
      const startOfWeek = new Date(now);
      const day = (startOfWeek.getDay() + 6) % 7; // lundi = 0
      startOfWeek.setDate(startOfWeek.getDate() - day);
      startOfWeek.setHours(0, 0, 0, 0);
      return t >= startOfWeek;
    }
    if (period === 'mois') {
      return t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth();
    }
    if (period === 'annee') {
      return t.getFullYear() === now.getFullYear();
    }
    return true;
  }

  function renderBilanView() {
    // Filtrer ventes de la période
    const soldInPeriod = state.items.filter((i) => i.vendu && inPeriod(i.dateVente, state.period));
    const boughtInPeriod = state.items.filter((i) => inPeriod(i.dateAchat, state.period));

    // Métriques Période
    const ca = soldInPeriod.reduce((sum, i) => sum + (Number(i.prixVente) || 0), 0);
    const costOfSold = soldInPeriod.reduce((sum, i) => sum + (Number(i.achat) || 0), 0);
    const beneficeNet = ca - costOfSold;
    const totalAchats = boughtInPeriod.reduce((sum, i) => sum + (Number(i.achat) || 0), 0);
    const marginRate = costOfSold > 0 ? ((beneficeNet / costOfSold) * 100).toFixed(0) : 0;

    // Métriques Stock Actuel
    const currentStock = state.items.filter((i) => !i.vendu);
    const stockCostVal = currentStock.reduce((sum, i) => sum + (Number(i.achat) || 0), 0);
    const stockPotentialVal = currentStock.reduce((sum, i) => sum + (Number(i.prevu) || 0), 0);
    const stockPotentialProfit = stockPotentialVal - stockCostVal;

    // Périodes tabs
    const periods = [
      { key: 'jour', label: 'Aujourd\'hui' },
      { key: 'semaine', label: '7 Jours' },
      { key: 'mois', label: 'Ce Mois' },
      { key: 'annee', label: 'Cette Année' },
      { key: 'tout', label: 'Global' }
    ];

    let html = `
      <div class="toolbar" style="margin-bottom:12px;">
        <div class="chips-scroll">
          ${periods.map((p) => `
            <button class="chip-btn ${state.period === p.key ? 'active' : ''}" data-period="${p.key}">
              ${p.label}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- KPIs Période -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-title">Chiffre d'Affaires</div>
          <div class="kpi-val">${fmt(ca)}</div>
          <div class="kpi-subtitle">${soldInPeriod.length} article${soldInPeriod.length > 1 ? 's' : ''} vendu${soldInPeriod.length > 1 ? 's' : ''}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">Bénéfice Réalisé</div>
          <div class="kpi-val ${beneficeNet >= 0 ? 'positive' : 'negative'}">
            ${beneficeNet >= 0 ? '+' : ''}${fmt(beneficeNet)}
          </div>
          <div class="kpi-subtitle">Marge brute: ${marginRate}%</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">Achats engagés</div>
          <div class="kpi-val">${fmt(totalAchats)}</div>
          <div class="kpi-subtitle">${boughtInPeriod.length} pièce${boughtInPeriod.length > 1 ? 's' : ''} achetée${boughtInPeriod.length > 1 ? 's' : ''}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">Panier moyen</div>
          <div class="kpi-val">${soldInPeriod.length ? fmt(ca / soldInPeriod.length) : '0 FCFA'}</div>
          <div class="kpi-subtitle">Par vente conclue</div>
        </div>
      </div>

      <!-- État du Stock -->
      <div class="section-title">
        <span>Inventaire & Capital immobilisé</span>
        <span style="font-size:12px; color:var(--tx-muted); font-weight:500;">${currentStock.length} pièces</span>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-title">Valeur d'Achat Stock</div>
          <div class="kpi-val">${fmt(stockCostVal)}</div>
          <div class="kpi-subtitle">Argent immobilisé</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">Gain Potentiel Attendu</div>
          <div class="kpi-val positive">+${fmt(stockPotentialProfit)}</div>
          <div class="kpi-subtitle">Si tout le stock est vendu</div>
        </div>
      </div>

      <!-- Détail par Drop -->
      <div class="section-title">Performance par Drop</div>
    `;

    const drops = getDropsList();
    if (!drops.length) {
      html += `<div class="empty-state" style="padding:20px 0;"><p>Aucun drop enregistré pour le moment.</p></div>`;
    } else {
      drops.forEach((d) => {
        const dropItems = state.items.filter((i) => getDropName(i) === d);
        const dropSold = dropItems.filter((i) => i.vendu);
        const dropAvailable = dropItems.filter((i) => !i.vendu);

        const totalInvest = dropItems.reduce((s, i) => s + (Number(i.achat) || 0), 0);
        const totalRevenue = dropSold.reduce((s, i) => s + (Number(i.prixVente) || 0), 0);
        const costOfSoldItems = dropSold.reduce((s, i) => s + (Number(i.achat) || 0), 0);
        const dropProfit = totalRevenue - costOfSoldItems;
        const remainingPotentialProfit = dropAvailable.reduce((s, i) => s + Math.max(0, (i.prevu || 0) - (i.achat || 0)), 0);

        const percentSold = dropItems.length > 0 ? Math.round((dropSold.length / dropItems.length) * 100) : 0;

        html += `
          <div class="drop-stat-card">
            <div class="drop-stat-header">
              <span class="drop-stat-name">${esc(d)}</span>
              <span style="font-size:12px; font-weight:700; color:var(--primary);">${percentSold}% écoulé</span>
            </div>

            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${percentSold}%;"></div>
            </div>

            <div style="font-size:12px; color:var(--tx-muted); margin-bottom:8px;">
              ${dropItems.length} article${dropItems.length > 1 ? 's' : ''} • ${dropSold.length} vendu${dropSold.length > 1 ? 's' : ''} • ${dropAvailable.length} restant${dropAvailable.length > 1 ? 's' : ''}
            </div>

            <div class="drop-stat-metrics">
              <div>
                <span style="color:var(--tx-muted);">Investi : </span>
                <strong>${fmt(totalInvest)}</strong>
              </div>
              <div>
                <span style="color:var(--tx-muted);">Encaissé : </span>
                <strong>${fmt(totalRevenue)}</strong>
              </div>
              <div>
                <span style="color:var(--tx-muted);">Bénéfice net : </span>
                <strong style="color:${dropProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">
                  ${dropProfit >= 0 ? '+' : ''}${fmt(dropProfit)}
                </strong>
              </div>
              <div>
                <span style="color:var(--tx-muted);">Bénéfice latent : </span>
                <strong>+${fmt(remainingPotentialProfit)}</strong>
              </div>
            </div>
          </div>
        `;
      });
    }

    return html;
  }

  function bindBilanEvents() {
    $$('.chip-btn[data-period]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.period = btn.dataset.period;
        render();
      });
    });
  }

  // ==========================================
  // VUE 4 : PARAMÈTRES & SAUVEGARDE
  // ==========================================
  function renderSettingsView() {
    const totalItems = state.items.length;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    return `
      <div style="margin-bottom:18px;">
        <h2 style="font-size:18px; font-weight:800;">Paramètres & Données</h2>
        <p style="font-size:13px; color:var(--tx-muted);">Gestion des sauvegardes, exportations et préférences.</p>
      </div>

      <div class="settings-group">
        <div class="settings-item" id="btn-toggle-theme-setting">
          <div class="settings-info">
            <div class="settings-icon">${isDark ? getIcon('sun') : getIcon('moon')}</div>
            <div>
              <div class="settings-title">Apparence de l'application</div>
              <div class="settings-desc">Mode actuel : <strong>${isDark ? 'Sombre' : 'Clair'}</strong></div>
            </div>
          </div>
          <div>${getIcon('arrowUpRight')}</div>
        </div>
      </div>

      <div class="section-title">Sauvegarde & Restauration</div>
      <div class="settings-group">
        <div class="settings-item" id="btn-export-json">
          <div class="settings-info">
            <div class="settings-icon">${getIcon('download')}</div>
            <div>
              <div class="settings-title">Télécharger une sauvegarde JSON</div>
              <div class="settings-desc">Enregistre l'ensemble de votre stock et historique sur votre appareil.</div>
            </div>
          </div>
          <div>${getIcon('arrowUpRight')}</div>
        </div>

        <div class="settings-item" id="btn-import-json">
          <div class="settings-info">
            <div class="settings-icon">${getIcon('upload')}</div>
            <div>
              <div class="settings-title">Restaurer une sauvegarde JSON</div>
              <div class="settings-desc">Importer des données depuis un fichier précédent.</div>
            </div>
          </div>
          <div>${getIcon('arrowUpRight')}</div>
        </div>
        <input type="file" id="import-file-input" accept=".json,application/json" style="display:none;">

        <div class="settings-item" id="btn-export-csv">
          <div class="settings-info">
            <div class="settings-icon">${getIcon('fileSpreadsheet')}</div>
            <div>
              <div class="settings-title">Exporter pour Excel / Google Sheets (CSV)</div>
              <div class="settings-desc">Tableau complet avec prix, bénéfices et dates.</div>
            </div>
          </div>
          <div>${getIcon('arrowUpRight')}</div>
        </div>
      </div>

      <div class="section-title">Outils & Données</div>
      <div class="settings-group">
        <div class="settings-item" id="btn-load-sample">
          <div class="settings-info">
            <div class="settings-icon">${getIcon('sparkles')}</div>
            <div>
              <div class="settings-title">Charger les données de démonstration</div>
              <div class="settings-desc">Ajoute 5 pièces réalistes pour tester toutes les fonctionnalités.</div>
            </div>
          </div>
          <div>${getIcon('arrowUpRight')}</div>
        </div>

        <div class="settings-item" id="btn-clear-db">
          <div class="settings-info">
            <div class="settings-icon" style="color:var(--danger);">${getIcon('trash')}</div>
            <div>
              <div class="settings-title" style="color:var(--danger);">Effacer toutes les données</div>
              <div class="settings-desc">Supprime définitivement les articles stockés (${totalItems} éléments).</div>
            </div>
          </div>
          <div>${getIcon('arrowUpRight')}</div>
        </div>
      </div>

      <div style="text-align:center; padding:24px 0; color:var(--tx-muted); font-size:12px;">
        <strong>Campus Corner</strong> v2.0 • Conçu pour les drops étudiants et friperies<br>
        Déployé sur Vercel • Données privées stockées sur votre appareil
      </div>
    `;
  }

  function bindSettingsEvents() {
    const themeBtn = $('#btn-toggle-theme-setting');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem('cc_theme', next);
        render();
      });
    }

    const exportBtn = $('#btn-export-json');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        if (!state.items.length) {
          window.toast.info('Aucun article à sauvegarder pour l\'instant.');
          return;
        }
        window.appDB.exportJSON(state.items);
        window.toast.success('Sauvegarde téléchargée avec succès !');
      });
    }

    const importBtn = $('#btn-import-json');
    const importInput = $('#import-file-input');
    if (importBtn && importInput) {
      importBtn.addEventListener('click', () => importInput.click());

      importInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const confirmed = await confirmModal({
          title: 'Importer une sauvegarde',
          message: 'Voulez-vous fusionner ces articles avec votre stock actuel ou remplacer tout le contenu existant ?',
          confirmText: 'Fusionner',
          cancelText: 'Remplacer tout'
        });

        const mode = confirmed ? 'merge' : 'replace';

        try {
          const count = await window.appDB.importJSON(file, mode);
          state.items = await window.appDB.getAll();
          window.toast.success(`${count} article(s) importé(s) avec succès !`);
          render();
        } catch (err) {
          window.toast.error('Fichier de sauvegarde invalide.');
          console.error(err);
        }
        importInput.value = '';
      });
    }

    const csvBtn = $('#btn-export-csv');
    if (csvBtn) {
      csvBtn.addEventListener('click', () => {
        if (!state.items.length) {
          window.toast.info('Votre stock est vide, rien à exporter.');
          return;
        }
        window.appDB.exportCSV(state.items);
        window.toast.success('Fichier Excel CSV téléchargé !');
      });
    }

    const sampleBtn = $('#btn-load-sample');
    if (sampleBtn) {
      sampleBtn.addEventListener('click', async () => {
        const samples = window.appDB.getSampleData();
        for (const it of samples) {
          await window.appDB.put(it);
        }
        state.items = await window.appDB.getAll();
        window.toast.success('Données de démo chargées !');
        switchView('stock');
      });
    }

    const clearBtn = $('#btn-clear-db');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        const confirmed = await confirmModal({
          title: 'Supprimer TOUTES les données ?',
          message: 'Cette action est irréversible. Assurez-vous d\'avoir fait une sauvegarde JSON.',
          confirmText: 'Tout supprimer',
          cancelText: 'Annuler',
          isDanger: true
        });

        if (confirmed) {
          await window.appDB.clear();
          state.items = [];
          window.toast.info('Base de données réinitialisée.');
          render();
        }
      });
    }
  }

  // ==========================================
  // MODALE / BOTTOM SHEET DE DÉTAIL D'ARTICLE
  // ==========================================
  function openDetailSheet(item) {
    state.activeSheetItem = item;
    const sheetc = $('#sheet-content');
    const sheet = $('#sheet');
    if (!sheetc || !sheet) return;

    const isVendu = !!item.vendu;
    const profit = isVendu ? (item.prixVente - item.achat) : 0;
    const logs = item.log || [];

    let html = `
      <div class="sheet-handle"></div>

      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
        <div>
          <span class="item-ref">#${item.n}</span>
          <h2 style="font-size:18px; font-weight:800; margin-top:4px;">${esc(item.nom)}</h2>
        </div>
        <span class="badge-status ${isVendu ? 'badge-sold' : 'badge-stock'}">
          ${isVendu ? getIcon('check') + ' Vendu' : 'En stock'}
        </span>
      </div>

      ${item.photo ? `<img class="detail-photo" src="${item.photo}" alt="${esc(item.nom)}">` : ''}

      <div class="kpi-grid" style="margin-top:14px; margin-bottom:12px;">
        <div class="kpi-card">
          <div class="kpi-title">Prix d'Achat</div>
          <div class="kpi-val">${fmt(item.achat)}</div>
          <div class="kpi-subtitle">Acheté le ${fd(item.dateAchat)}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">${isVendu ? 'Prix de Vente' : 'Prix Prévu'}</div>
          <div class="kpi-val ${isVendu ? 'positive' : ''}">
            ${isVendu ? fmt(item.prixVente) : fmt(item.prevu || item.achat)}
          </div>
          <div class="kpi-subtitle">${isVendu ? 'Vendu le ' + fd(item.dateVente) : 'Objectif de revente'}</div>
        </div>
      </div>

      <div style="background:var(--card); border:1px solid var(--border); border-radius:var(--radius-md); padding:12px; margin-bottom:14px; font-size:13px;">
        <div><strong>Drop : </strong>${esc(getDropName(item))}</div>
        ${item.categorie ? `<div style="margin-top:4px;"><strong>Catégorie : </strong>${esc(item.categorie)}</div>` : ''}
        ${item.taille ? `<div style="margin-top:4px;"><strong>Taille : </strong>${esc(item.taille)}</div>` : ''}
        ${item.client ? `<div style="margin-top:4px;"><strong>Client / Notes : </strong>${esc(item.client)}</div>` : ''}
        ${isVendu ? `
          <div style="margin-top:8px; padding-top:8px; border-top:1px dashed var(--border); font-size:14px;">
            <strong>Bénéfice Net : </strong>
            <span style="font-weight:800; color:${profit >= 0 ? 'var(--success)' : 'var(--danger)'};">
              ${profit >= 0 ? '+' : ''}${fmt(profit)}
            </span>
          </div>
        ` : ''}
      </div>

      <!-- Historique -->
      <div style="font-size:13px; font-weight:700; margin-bottom:6px;">Historique des actions</div>
      <div class="timeline">
        ${logs.length ? logs.map((l) => `
          <div class="timeline-item">
            <strong>${fd(l.d)}</strong> — ${esc(l.t)}
          </div>
        `).join('') : '<div style="font-size:12px; color:var(--tx-muted);">Aucun historique disponible.</div>'}
      </div>

      <!-- Zone Vente Rapide si non vendu -->
      ${!isVendu ? `
        <div style="background:var(--bg-subtle); border:1px solid var(--border); border-radius:var(--radius-md); padding:14px; margin:16px 0;">
          <div style="font-size:13px; font-weight:700; margin-bottom:10px;">Enregistrer la vente de cette pièce</div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Prix Vendu Réel (FCFA)</label>
              <input type="number" id="sheet-sell-price" class="form-input" value="${item.prevu || item.achat}">
            </div>
            <div class="form-group">
              <label class="form-label">Date de Vente</label>
              <input type="date" id="sheet-sell-date" class="form-input" value="${today()}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Nom du client (optionnel)</label>
            <input type="text" id="sheet-sell-client" class="form-input" placeholder="Ex: Jean (Chambre 204)" value="${esc(item.client || '')}">
          </div>
          <button class="btn btn-success" id="btn-sheet-confirm-sell">
            ${getIcon('check')} Marquer comme Vendu
          </button>
        </div>
      ` : `
        <button class="btn btn-secondary" id="btn-sheet-unsell" style="margin-top:12px;">
          ${getIcon('rotateCcw')} Annuler la vente (remettre en stock)
        </button>
      `}

      <!-- Actions Générales -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
        <button class="btn btn-secondary" id="btn-sheet-share">
          ${getIcon('share')} Partager ticket
        </button>
        <button class="btn btn-secondary" id="btn-sheet-edit">
          ${getIcon('edit')} Modifier pièce
        </button>
      </div>

      <button class="btn btn-danger" id="btn-sheet-delete" style="margin-top:10px;">
        ${getIcon('trash')} Supprimer définitivement
      </button>

      <button class="btn btn-secondary" id="btn-sheet-close" style="margin-top:8px;">
        Fermer
      </button>
    `;

    sheetc.innerHTML = html;
    sheet.classList.add('active');

    // Événements du sheet
    bindDetailSheetEvents(item);
  }

  function closeSheet() {
    const sheet = $('#sheet');
    if (sheet) sheet.classList.remove('active');
    state.activeSheetItem = null;
  }

  function bindDetailSheetEvents(item) {
    const closeBtn = $('#btn-sheet-close');
    if (closeBtn) closeBtn.onclick = closeSheet;

    // Vendre
    const sellBtn = $('#btn-sheet-confirm-sell');
    if (sellBtn) {
      sellBtn.onclick = async () => {
        const price = parseFloat($('#sheet-sell-price').value);
        const sellDate = $('#sheet-sell-date').value || today();
        const client = ($('#sheet-sell-client').value || '').trim();

        if (isNaN(price) || price <= 0) {
          window.toast.error('Indiquez un prix de vente valide.');
          return;
        }

        item.vendu = true;
        item.prixVente = price;
        item.dateVente = sellDate;
        if (client) item.client = client;
        if (!item.log) item.log = [];

        item.log.push({
          d: sellDate,
          t: `Vendu ${fmt(price)}${client ? ' à ' + client : ''}`
        });

        await window.appDB.put(item);
        window.toast.success(`Vente de la pièce #${item.n} enregistrée !`);
        closeSheet();
        render();
      };
    }

    // Remettre en stock
    const unsellBtn = $('#btn-sheet-unsell');
    if (unsellBtn) {
      unsellBtn.onclick = async () => {
        const confirmed = await confirmModal({
          title: 'Remettre en stock ?',
          message: 'La vente sera annulée et la pièce repassera dans le stock disponible.',
          confirmText: 'Remettre en stock'
        });

        if (confirmed) {
          item.vendu = false;
          item.prixVente = 0;
          item.dateVente = '';
          if (!item.log) item.log = [];
          item.log.push({ d: today(), t: 'Vente annulée, article remis en stock' });

          await window.appDB.put(item);
          window.toast.info('Article remis en stock.');
          closeSheet();
          render();
        }
      };
    }

    // Modifier
    const editBtn = $('#btn-sheet-edit');
    if (editBtn) {
      editBtn.onclick = () => {
        closeSheet();
        state.editingItem = { ...item };
        state.draftPhoto = item.photo || '';
        switchView('add');
      };
    }

    // Supprimer
    const deleteBtn = $('#btn-sheet-delete');
    if (deleteBtn) {
      deleteBtn.onclick = async () => {
        const confirmed = await confirmModal({
          title: 'Supprimer cet article ?',
          message: `Êtes-vous sûr de vouloir supprimer définitivement #${item.n} · ${item.nom} ?`,
          confirmText: 'Supprimer',
          cancelText: 'Annuler',
          isDanger: true
        });

        if (confirmed) {
          state.items = state.items.filter((i) => i.id !== item.id);
          await window.appDB.delete(item.id);
          window.toast.info('Article supprimé.');
          closeSheet();
          render();
        }
      };
    }

    // Partager Ticket / Fiche
    const shareBtn = $('#btn-sheet-share');
    if (shareBtn) {
      shareBtn.onclick = () => {
        const text = `🛍️ *CAMPUS CORNER*\n` +
          `Ref : #${item.n} - ${item.nom}\n` +
          `Drop : ${getDropName(item)}\n` +
          (item.taille ? `Taille : ${item.taille}\n` : '') +
          `Prix : ${item.vendu ? fmt(item.prixVente) : fmt(item.prevu || item.achat)}\n` +
          `Statut : ${item.vendu ? 'Vendu ✅' : 'Disponible en stock 📦'}\n` +
          `✨ Pièce unique Campus Corner !`;

        if (navigator.share) {
          navigator.share({
            title: `Campus Corner #${item.n} ${item.nom}`,
            text: text
          }).catch(() => {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(() => {
            window.toast.success('Fiche copiée dans le presse-papier !');
          });
        } else {
          alert(text);
        }
      };
    }
  }

})();
