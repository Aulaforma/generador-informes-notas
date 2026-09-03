/**
 * js/cloudSync.js
 * Gestor de Sincronización en la Nube en Tiempo Real (Cloud Sync).
 * Permite que varios profesores y directivos editen el sistema colaborativamente.
 * Utiliza Firebase Firestore (SDK Compat) en arquitectura Local-First.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.cloudSync = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const CLOUD_STORAGE_KEYS = {
    FIREBASE_CONFIG: 'ga_cloud_firebase_config',
    ROOM_CODE: 'ga_cloud_room_code',
    AUTO_SYNC: 'ga_cloud_auto_sync',
    LAST_SYNC: 'ga_cloud_last_sync'
  };

  const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyAvySbZy42kqtZrXc_f58csHio1n7G6xLk",
    authDomain: "liceo-alcazar.firebaseapp.com",
    projectId: "liceo-alcazar",
    storageBucket: "liceo-alcazar.firebasestorage.app",
    messagingSenderId: "707408760273",
    appId: "1:707408760273:web:fb0c77570638613a2724f0"
  };

  class CloudSyncManager {
    constructor() {
      this.firebaseApp = null;
      this.firestore = null;
      this.unsubscribeSnapshot = null;
      this.isSyncing = false;
      this.isApplyingRemote = false;
      this.roomCode = localStorage.getItem(CLOUD_STORAGE_KEYS.ROOM_CODE) || 'RBD-4580-1';
      this.autoSync = localStorage.getItem(CLOUD_STORAGE_KEYS.AUTO_SYNC) !== 'false';
      this.debounceTimer = null;
      this.statusListeners = [];

      this.init();
    }

    init() {
      const savedConfig = this.getSavedFirebaseConfig();
      if (savedConfig && this.roomCode) {
        this.connect(savedConfig, this.roomCode, false).catch(err => {
          console.warn('Conexión inicial a la nube en espera:', err.message);
        });
      }
    }

    getSavedFirebaseConfig() {
      try {
        const raw = localStorage.getItem(CLOUD_STORAGE_KEYS.FIREBASE_CONFIG);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.projectId && parsed.projectId !== 'generador-notas-colegio') {
            return parsed;
          }
        }
        return DEFAULT_FIREBASE_CONFIG;
      } catch (e) {
        return DEFAULT_FIREBASE_CONFIG;
      }
    }

    saveFirebaseConfig(config) {
      if (!config) {
        localStorage.removeItem(CLOUD_STORAGE_KEYS.FIREBASE_CONFIG);
      } else {
        localStorage.setItem(CLOUD_STORAGE_KEYS.FIREBASE_CONFIG, JSON.stringify(config));
      }
    }

    isConnected() {
      return !!(this.firestore && this.roomCode);
    }

    getRoomCode() {
      return this.roomCode;
    }

    onStatusChange(cb) {
      if (typeof cb === 'function') {
        this.statusListeners.push(cb);
        cb(this.getStatus());
      }
    }

    notifyStatus() {
      const status = this.getStatus();
      this.statusListeners.forEach(cb => {
        try { cb(status); } catch (e) { console.error(e); }
      });
    }

    getStatus() {
      return {
        isConnected: this.isConnected(),
        roomCode: this.roomCode,
        isSyncing: this.isSyncing,
        lastSync: localStorage.getItem(CLOUD_STORAGE_KEYS.LAST_SYNC) || null
      };
    }

    /**
     * Conectar con Firebase Firestore a una sala de colegio específica.
     */
    async connect(firebaseConfig, roomCode, pushLocalFirst = false) {
      if (!firebaseConfig || !firebaseConfig.apiKey || !firebaseConfig.projectId) {
        throw new Error('Configuración de Firebase incompleta (se requiere apiKey y projectId).');
      }

      const cleanRoom = String(roomCode || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
      if (!cleanRoom) {
        throw new Error('Debe especificar un Código de Colegio o Sala válido (ej: RBD-4580-1).');
      }

      // Inicializar Firebase si aún no está inicializado
      if (!window.firebase) {
        throw new Error('Firebase SDK no está disponible en la página.');
      }

      try {
        if (!this.firebaseApp) {
          const existingApps = window.firebase.apps || [];
          const appName = 'SchoolSyncApp';
          this.firebaseApp = existingApps.find(a => a.name === appName) || 
                             window.firebase.initializeApp(firebaseConfig, appName);
        }

        this.firestore = this.firebaseApp.firestore();
        try {
          this.firestore.settings({
            experimentalForceLongPolling: true,
            merge: true
          });
        } catch (settingErr) {
          // Ignorar si ya se habían establecido las opciones
        }
        this.roomCode = cleanRoom;

        // Guardar credenciales y sala para reconexión automática
        this.saveFirebaseConfig(firebaseConfig);
        localStorage.setItem(CLOUD_STORAGE_KEYS.ROOM_CODE, cleanRoom);

        // Si se solicitó subir datos locales iniciales
        if (pushLocalFirst) {
          await this.pushLocalToCloud();
        }

        // Iniciar escucha en tiempo real
        this.startRealtimeListener();

        this.notifyStatus();
        return true;
      } catch (err) {
        this.disconnect();
        throw err;
      }
    }

    /**
     * Escuchar cambios en la nube provenientes de otros usuarios.
     */
    startRealtimeListener() {
      if (this.unsubscribeSnapshot) {
        this.unsubscribeSnapshot();
        this.unsubscribeSnapshot = null;
      }

      if (!this.firestore || !this.roomCode) return;

      const docRef = this.firestore.collection('school_rooms').doc(this.roomCode);

      this.unsubscribeSnapshot = docRef.onSnapshot(
        docSnapshot => {
          if (!docSnapshot.exists) {
            console.log('La sala en la nube está vacía. Lista para recibir datos locales.');
            return;
          }

          const remoteData = docSnapshot.data();
          if (!remoteData || remoteData.updatedBy === this.getClientId()) {
            // Ignorar actualizaciones generadas por esta misma sesión
            return;
          }

          this.handleRemoteUpdate(remoteData);
        },
        error => {
          console.error('Error en listener de sincronización Firestore:', error);
          this.notifyStatus();
        }
      );
    }

    /**
     * Procesar actualización recibida desde la nube.
     */
    handleRemoteUpdate(remoteData) {
      if (this.isApplyingRemote || this.isSyncing) return;

      try {
        this.isApplyingRemote = true;
        const db = window.db;
        if (!db) return;

        let hasChanges = false;

        // Actualizar configuración
        if (remoteData.config) {
          localStorage.setItem('laa_school_config', JSON.stringify(remoteData.config));
          hasChanges = true;
        }

        // Actualizar cursos
        if (remoteData.courses && Array.isArray(remoteData.courses)) {
          localStorage.setItem('laa_courses', JSON.stringify(remoteData.courses));
          hasChanges = true;
        }

        // Actualizar asignaturas por curso
        if (remoteData.courseSubjects) {
          localStorage.setItem('laa_course_subjects', JSON.stringify(remoteData.courseSubjects));
          hasChanges = true;
        }

        // Actualizar nómina de estudiantes
        if (remoteData.students && Array.isArray(remoteData.students)) {
          localStorage.setItem('laa_students', JSON.stringify(remoteData.students));
          hasChanges = true;
        }

        // Actualizar calificaciones
        if (remoteData.grades && Array.isArray(remoteData.grades)) {
          localStorage.setItem('laa_grades', JSON.stringify(remoteData.grades));
          hasChanges = true;
        }

        // Actualizar asistencia
        if (remoteData.attendance && Array.isArray(remoteData.attendance)) {
          localStorage.setItem('laa_attendance', JSON.stringify(remoteData.attendance));
          hasChanges = true;
        }

        if (hasChanges) {
          localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC, new Date().toLocaleTimeString('es-CL'));
          this.notifyStatus();

          // Notificar a las vistas activas para que re-rendericen sus tablas sin reiniciar
          window.dispatchEvent(new CustomEvent('cloud-data-updated', { detail: { remoteData } }));
          window.showToast('🔄 Datos actualizados en tiempo real desde la nube', 'info', 3000);
        }
      } catch (err) {
        console.error('Error aplicando datos remotos:', err);
      } finally {
        this.isApplyingRemote = false;
      }
    }

    /**
     * Enviar todos los datos locales actuales a la nube.
     */
    async pushLocalToCloud() {
      if (!this.isConnected()) return false;

      try {
        this.isSyncing = true;
        this.notifyStatus();

        const db = window.db;
        if (!db) return false;

        const backup = db.exportBackup();
        const payload = {
          ...backup,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: this.getClientId(),
          schoolName: backup.config?.nombre || 'Establecimiento'
        };

        const docRef = this.firestore.collection('school_rooms').doc(this.roomCode);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Tiempo de espera agotado al conectar con Firebase (10s).')), 10000)
        );
        await Promise.race([docRef.set(payload, { merge: true }), timeoutPromise]);

        const nowStr = new Date().toLocaleTimeString('es-CL');
        localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC, nowStr);
        return true;
      } catch (err) {
        console.error('Error al subir datos a Firestore:', err);
        throw err;
      } finally {
        this.isSyncing = false;
        this.notifyStatus();
      }
    }

    /**
     * Descargar y sobreescribir datos locales con los existentes en la nube.
     */
    async pullCloudToLocal() {
      if (!this.isConnected()) return false;

      try {
        this.isSyncing = true;
        this.notifyStatus();

        const docRef = this.firestore.collection('school_rooms').doc(this.roomCode);
        const snap = await docRef.get();

        if (!snap.exists) {
          throw new Error(`La sala "${this.roomCode}" no contiene datos en la nube todavía.`);
        }

        const data = snap.data();
        window.db.importBackup(data);
        return true;
      } catch (err) {
        console.error('Error al descargar datos de la nube:', err);
        throw err;
      } finally {
        this.isSyncing = false;
        this.notifyStatus();
      }
    }

    /**
     * Disparador llamado cada vez que el usuario modifica algo localmente (nota, estudiante, etc.).
     * Utiliza debounce para agrupar cambios rápidos de digitación.
     */
    notifyLocalChange() {
      if (!this.isConnected() || this.isApplyingRemote || !this.autoSync) return;

      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        this.pushLocalToCloud().catch(err => {
          console.warn('Error en autosincronización a la nube:', err.message);
        });
      }, 1200);
    }

    /**
     * Desconectar de la nube y volver al modo 100% local.
     */
    disconnect() {
      if (this.unsubscribeSnapshot) {
        this.unsubscribeSnapshot();
        this.unsubscribeSnapshot = null;
      }

      this.firestore = null;
      this.roomCode = '';
      localStorage.removeItem(CLOUD_STORAGE_KEYS.ROOM_CODE);
      this.notifyStatus();
    }

    getClientId() {
      let id = sessionStorage.getItem('ga_session_client_id');
      if (!id) {
        id = 'cli_' + Math.random().toString(36).substring(2, 10);
        sessionStorage.setItem('ga_session_client_id', id);
      }
      return id;
    }
  }

  const cloudSync = new CloudSyncManager();
  return cloudSync;
});
