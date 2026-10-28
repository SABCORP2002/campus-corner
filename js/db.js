/**
 * Campus Corner - Data Layer (IndexedDB & Export/Import)
 * Compatible avec l'ancienne structure IndexedDB "campuscorner" -> store "items"
 */

const DB_NAME = 'campuscorner';
const DB_VERSION = 1;
const STORE_NAME = 'items';

class Database {
  constructor() {
    this.db = null;
    this.isSupported = true;
  }

  async init() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB non supporté par ce navigateur.');
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
          console.error('Erreur IndexedDB:', e);
          this.isSupported = false;
          resolve(false);
        };
      } catch (err) {
        console.error('Exception IndexedDB:', err);
        this.isSupported = false;
        resolve(false);
      }
    });
  }

  async getAll() {
    if (!this.db) {
      const fallback = localStorage.getItem('cc_items_backup');
      return fallback ? JSON.parse(fallback) : [];
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => {
          const items = req.result || [];
          // Sync backup copy to localStorage just in case
          try {
            // Store lightweight version without big photos if exceeds storage
            localStorage.setItem('cc_items_count', items.length.toString());
          } catch (_) {}
          resolve(items);
        };

        req.onerror = () => resolve([]);
      } catch (err) {
        console.error('Erreur getAll:', err);
        resolve([]);
      }
    });
  }

  async put(item) {
    if (!this.db) {
      this._saveFallback(item);
      return true;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(item);

        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(e);
      } catch (err) {
        reject(err);
      }
    });
  }

  async delete(id) {
    if (!this.db) return true;

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);

        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(e);
      } catch (err) {
        reject(err);
      }
    });
  }

  async clear() {
    if (!this.db) return true;

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();

        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(e);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Sauvegarde réelle universelle téléchargeable (.json)
   * Fonctionne sur tous les navigateurs (iOS Safari, Android Chrome, Desktop)
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
      'Client / Notes'
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
        `"${(i.client || '').replace(/"/g, '""')}"`
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
              // Assurer les champs minimaux
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
                client: item.client || '',
                log: Array.isArray(item.log) ? item.log : []
              };
              await this.put(cleanItem);
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
   * Fournit des données de démonstration réalistes pour tester l'application
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
        client: "Marc (Résidence A)",
        photo: "",
        log: [
          { d: today, t: "Acheté 4 500 FCFA" },
          { d: today, t: "Vendu 12 000 FCFA à Marc (Résidence A)" }
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
        client: "Kevin",
        photo: "",
        log: [
          { d: today, t: "Acheté 3 000 FCFA" },
          { d: today, t: "Vendu 8 000 FCFA" }
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
