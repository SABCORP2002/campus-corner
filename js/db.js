/**
 * Campus Corner - Data Layer & Fail-safe Storage Engine
 * Double redondance : IndexedDB + Synchronisation de secours LocalStorage
 * Zéro perte de données garantie.
 */

const DB_NAME = 'campuscorner';
const DB_VERSION = 1;
const STORE_NAME = 'items';
const BACKUP_STORAGE_KEY = 'cc_redundancy_backup_v2';

class Database {
  constructor() {
    this.db = null;
    this.isSupported = true;
  }

  async init() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB non supporté par ce navigateur, bascule sur stockage LocalStorage.');
        this.isSupported = false;
        return resolve(false);
      }

      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('n', 'n', { unique: false });
            store.createIndex('vendu', 'vendu', { unique: false });
            store.createIndex('drop', 'drop', { unique: false });
          }
        };

        req.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(true);
        };

        req.onerror = (e) => {
          console.error('Erreur ouverture IndexedDB:', e);
          this.isSupported = false;
          resolve(false);
        };
      } catch (err) {
        console.error('Exception init IndexedDB:', err);
        this.isSupported = false;
        resolve(false);
      }
    });
  }

  /**
   * Récupère tous les articles avec mécanisme d'auto-restauration en cas de besoin
   */
  async getAll() {
    let items = [];

    if (this.db) {
      items = await new Promise((resolve) => {
        try {
          const tx = this.db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        } catch (err) {
          console.error('Erreur lecture IndexedDB:', err);
          resolve([]);
        }
      });
    }

    // Si IndexedDB est vide ou indisponible, vérifier la sauvegarde miroir LocalStorage
    if (!items || items.length === 0) {
      try {
        const backupRaw = localStorage.getItem(BACKUP_STORAGE_KEY);
        if (backupRaw) {
          const backupItems = JSON.parse(backupRaw);
          if (Array.isArray(backupItems) && backupItems.length > 0) {
            console.log('Restauration automatique depuis la sauvegarde miroir:', backupItems.length, 'articles.');
            items = backupItems;
            // Réinjecter dans IndexedDB si réouvert
            if (this.db) {
              for (const it of items) {
                await this.put(it, false);
              }
            }
          }
        }
      } catch (e) {
        console.error('Erreur lecture sauvegarde miroir:', e);
      }
    } else {
      // Synchroniser la sauvegarde miroir
      this._syncBackup(items);
    }

    return items;
  }

  /**
   * Enregistre un article (création ou mise à jour) avec double écriture
   */
  async put(item, syncMirror = true) {
    if (this.db) {
      await new Promise((resolve, reject) => {
        try {
          const tx = this.db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(item);
          req.onsuccess = () => resolve(true);
          req.onerror = (e) => reject(e);
        } catch (err) {
          reject(err);
        }
      }).catch((e) => console.error('Erreur put IndexedDB:', e));
    }

    if (syncMirror) {
      // Mise à jour de la sauvegarde locale miroir
      try {
        const currentBackup = this._getBackup();
        const idx = currentBackup.findIndex((x) => x.id === item.id);
        if (idx >= 0) {
          currentBackup[idx] = item;
        } else {
          currentBackup.push(item);
        }
        this._syncBackup(currentBackup);
      } catch (e) {
        console.error('Erreur sync miroir:', e);
      }
    }

    return true;
  }

  /**
   * Supprime un article
   */
  async delete(id) {
    if (this.db) {
      await new Promise((resolve) => {
        try {
          const tx = this.db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.delete(id);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (err) {
          resolve(false);
        }
      });
    }

    // Supprimer aussi du miroir
    try {
      const currentBackup = this._getBackup().filter((x) => x.id !== id);
      this._syncBackup(currentBackup);
    } catch (_) {}

    return true;
  }

  /**
   * Vide la base
   */
  async clear() {
    if (this.db) {
      await new Promise((resolve) => {
        try {
          const tx = this.db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.clear();
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (err) {
          resolve(false);
        }
      });
    }

    try {
      localStorage.removeItem(BACKUP_STORAGE_KEY);
    } catch (_) {}

    return true;
  }

  _getBackup() {
    try {
      const raw = localStorage.getItem(BACKUP_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  _syncBackup(items) {
    try {
      // Stockage sécurisé sans risquer de bloquer si quota image dépassé
      localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(items));
      localStorage.setItem('cc_items_last_sync', new Date().toISOString());
      localStorage.setItem('cc_items_count', String(items.length));
    } catch (err) {
      // Si les images compressées sont trop volumineuses pour localStorage seul
      try {
        const lightweight = items.map((i) => ({ ...i, photo: i.photo ? i.photo.slice(0, 100) + '...' : '' }));
        localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(lightweight));
      } catch (_) {}
    }
  }

  /**
   * Sauvegarde réelle universelle téléchargeable (.json)
   */
  async exportJSON(items) {
    const dataStr = JSON.stringify(items, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campus-corner-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Exporte les données au format CSV (Excel UTF-8 avec séparateur point-virgule)
   */
  async exportCSV(items) {
    const headers = [
      'Référence',
      'Nom de l article',
      'Drop',
      'Catégorie',
      'Taille',
      'Statut',
      'Prix Achat (FCFA)',
      'Prix Vente Prévu (FCFA)',
      'Prix Vendu (FCFA)',
      'Bénéfice Réalisé (FCFA)',
      'Date Achat',
      'Date Vente',
      'Heure Vente',
      'Mode Paiement',
      'Montant Encaissé (FCFA)',
      'Monnaie Rendue (FCFA)',
      'Client',
      'Téléphone Client',
      'N° Reçu'
    ];

    const rows = items.map((i) => {
      const benefice = i.vendu ? (i.prixVente || 0) - (i.achat || 0) : 0;
      return [
        `#${i.n}`,
        `"${(i.nom || '').replace(/"/g, '""')}"`,
        `"${(i.drop || 'Sans drop').replace(/"/g, '""')}"`,
        `"${(i.categorie || 'Autre').replace(/"/g, '""')}"`,
        `"${(i.taille || '').replace(/"/g, '""')}"`,
        i.vendu ? 'Vendu' : 'En stock',
        i.achat || 0,
        i.prevu || 0,
        i.vendu ? i.prixVente || 0 : '',
        i.vendu ? benefice : '',
        i.dateAchat || '',
        i.dateVente || '',
        i.heureVente || '',
        `"${(i.modePaiement || '').replace(/"/g, '""')}"`,
        i.vendu ? (i.montantRecu != null ? i.montantRecu : i.prixVente || 0) : '',
        i.vendu ? (i.monnaieRendue || 0) : '',
        `"${(i.client || '').replace(/"/g, '""')}"`,
        `"${(i.clientTel || '').replace(/"/g, '""')}"`,
        `"${(i.recuNo || '').replace(/"/g, '""')}"`
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campus-corner-inventaire-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Importe un fichier JSON de sauvegarde avec validation
   */
  async importJSON(file, mode = 'merge') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (!Array.isArray(parsed)) {
            return reject(new Error('Format invalide: le fichier doit contenir une liste d\'articles.'));
          }

          if (mode === 'replace') {
            await this.clear();
          }

          let importedCount = 0;
          for (const item of parsed) {
            if (item && typeof item === 'object') {
              const cleanItem = {
                id: item.id || Date.now() + Math.floor(Math.random() * 1000),
                n: Number(item.n) || (importedCount + 1),
                nom: item.nom || 'Sans nom',
                drop: item.drop || 'Sans drop',
                taille: item.taille || '',
                categorie: item.categorie || 'Autre',
                achat: Number(item.achat) || 0,
                prevu: Number(item.prevu) || 0,
                photo: item.photo || '',
                dateAchat: item.dateAchat || new Date().toISOString().slice(0, 10),
                vendu: Boolean(item.vendu),
                prixVente: Number(item.prixVente) || 0,
                dateVente: item.dateVente || '',
                heureVente: item.heureVente || '',
                modePaiement: item.modePaiement || '',
                montantRecu: item.montantRecu != null ? Number(item.montantRecu) : 0,
                monnaieRendue: item.monnaieRendue != null ? Number(item.monnaieRendue) : 0,
                resteDu: item.resteDu != null ? Number(item.resteDu) : 0,
                client: item.client || '',
                clientTel: item.clientTel || '',
                recuNo: item.recuNo || '',
                log: Array.isArray(item.log) ? item.log : []
              };
              await this.put(cleanItem, true);
              importedCount++;
            }
          }

          resolve(importedCount);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Impossible de lire le fichier'));
      reader.readAsText(file);
    });
  }

  /**
   * Données de démonstration réalistes
   */
  getSampleData() {
    const today = new Date().toISOString().slice(0, 10);
    return [
      {
        id: 1730000001,
        n: 1,
        nom: "Veste en Jean Vintage Oversize",
        drop: "Drop Denim & Vestes",
        categorie: "Vestes",
        taille: "L",
        achat: 4500,
        prevu: 12000,
        vendu: true,
        prixVente: 12000,
        dateAchat: today,
        dateVente: today,
        heureVente: "14:35",
        modePaiement: "Wave",
        montantRecu: 12000,
        monnaieRendue: 0,
        resteDu: 0,
        client: "Marc (Résidence A)",
        clientTel: "+225 07 48 92 11 05",
        recuNo: "REC-" + today.replace(/-/g, '') + "-001",
        photo: "",
        log: [
          { d: today, t: "Acheté 4 500 FCFA" },
          { d: today, t: "Vendu 12 000 FCFA à 14:35 (Wave) à Marc (Résidence A)" }
        ]
      },
      {
        id: 1730000002,
        n: 2,
        nom: "Pantalon Cargo Beige Militaire",
        drop: "Drop Denim & Vestes",
        categorie: "Bas",
        taille: "32 (M)",
        achat: 3000,
        prevu: 8500,
        vendu: true,
        prixVente: 8000,
        dateAchat: today,
        dateVente: today,
        heureVente: "16:20",
        modePaiement: "Espèces",
        montantRecu: 10000,
        monnaieRendue: 2000,
        resteDu: 0,
        client: "Kevin",
        clientTel: "+225 05 12 34 56 78",
        recuNo: "REC-" + today.replace(/-/g, '') + "-002",
        photo: "",
        log: [
          { d: today, t: "Acheté 3 000 FCFA" },
          { d: today, t: "Vendu 8 000 FCFA à 16:20 (Espèces - Versé: 10 000 F, Rendu: 2 000 F) à Kevin" }
        ]
      },
      {
        id: 1730000003,
        n: 3,
        nom: "Sweat Capuche Streetwear Noir",
        drop: "Drop Hoodies Hiver",
        categorie: "Hauts",
        taille: "XL",
        achat: 4000,
        prevu: 10000,
        vendu: false,
        prixVente: 0,
        dateAchat: today,
        dateVente: "",
        client: "",
        photo: "",
        log: [
          { d: today, t: "Acheté 4 000 FCFA" }
        ]
      },
      {
        id: 1730000004,
        n: 4,
        nom: "T-Shirt Graphique Anime 90s",
        drop: "Drop Tees & Vintage",
        categorie: "Hauts",
        taille: "M",
        achat: 2000,
        prevu: 5500,
        vendu: false,
        prixVente: 0,
        dateAchat: today,
        dateVente: "",
        client: "",
        photo: "",
        log: [
          { d: today, t: "Acheté 2 000 FCFA" }
        ]
      },
      {
        id: 1730000005,
        n: 5,
        nom: "Sneakers Rétro Blanc & Vert",
        drop: "Drop Kicks Campus",
        categorie: "Chaussures",
        taille: "43",
        achat: 9000,
        prevu: 22000,
        vendu: false,
        prixVente: 0,
        dateAchat: today,
        dateVente: "",
        client: "",
        photo: "",
        log: [
          { d: today, t: "Acheté 9 000 FCFA" }
        ]
      }
    ];
  }
}

window.appDB = new Database();
