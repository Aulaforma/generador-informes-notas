/**
 * MÓDULO DE AUTENTICACIÓN Y GESTIÓN DE CUENTAS (js/auth.js)
 * Maneja registro e inicio de sesión de profesores por correo y clave,
 * sesión de Administrador (Clave Maestra), y control de acceso.
 */

(function(global) {
  'use strict';

  const AUTH_STORAGE_KEYS = {
    USERS: 'laa_school_users',
    CURRENT_SESSION: 'laa_current_session',
    ACTIVITY_LOGS: 'laa_activity_logs'
  };

  class AuthManager {
    constructor() {
      this.currentUser = null;
      this.initSession();
    }

    /**
     * Inicializar o recuperar sesión guardada
     */
    initSession() {
      try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEYS.CURRENT_SESSION);
        const urlParams = new URLSearchParams(window.location.search);
        const isDocenteUrl = urlParams.get('rol') === 'docente';

        if (isDocenteUrl) {
          // Cuando un profesor abre el enlace docente, requiere su propia cuenta de profesor
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.role === 'teacher') {
              this.currentUser = parsed;
            } else {
              this.currentUser = null;
            }
          } else {
            this.currentUser = null;
          }
        } else if (raw) {
          this.currentUser = JSON.parse(raw);
        } else {
          // Por defecto en equipo local iniciamos como Administrador Maestro
          this.currentUser = {
            id: 'admin_master',
            nombre: 'Administrador Maestro',
            email: 'admin@colegio.cl',
            role: 'admin',
            asignatura: 'Todas'
          };
          this.saveSession();
        }
      } catch (e) {
        console.error('Error al inicializar sesión:', e);
        this.currentUser = null;
      }
    }

    saveSession() {
      if (this.currentUser) {
        localStorage.setItem(AUTH_STORAGE_KEYS.CURRENT_SESSION, JSON.stringify(this.currentUser));
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEYS.CURRENT_SESSION);
      }
      window.dispatchEvent(new CustomEvent('auth_state_changed', { detail: { user: this.currentUser } }));
    }

    getCurrentUser() {
      return this.currentUser;
    }

    isAdmin() {
      return this.currentUser && this.currentUser.role === 'admin';
    }

    isTeacher() {
      return this.currentUser && this.currentUser.role === 'teacher';
    }

    /**
     * Obtener todos los docentes registrados
     */
    getUsers() {
      try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEYS.USERS);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    saveUsers(users) {
      localStorage.setItem(AUTH_STORAGE_KEYS.USERS, JSON.stringify(users));
      if (window.cloudSync && typeof window.cloudSync.notifyLocalChange === 'function') {
        window.cloudSync.notifyLocalChange();
      }
    }

    /**
     * Registro de nuevo Docente
     */
    registerTeacher(nombre, email, password, asignatura = 'General') {
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanNombre = String(nombre || '').trim();
      const cleanPassword = String(password || '').trim();

      if (!cleanNombre || !cleanEmail || !cleanPassword) {
        throw new Error('Todos los campos son obligatorios.');
      }

      if (cleanPassword.length < 4) {
        throw new Error('La contraseña debe tener al menos 4 caracteres.');
      }

      const users = this.getUsers();
      const exists = users.find(u => u.email.toLowerCase() === cleanEmail);
      if (exists) {
        throw new Error(`Ya existe una cuenta registrada con el correo "${cleanEmail}".`);
      }

      const newUser = {
        id: 'teacher_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        nombre: cleanNombre,
        email: cleanEmail,
        password: cleanPassword, // En entorno cliente local
        role: 'teacher',
        asignatura: String(asignatura || 'General').trim(),
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };

      users.push(newUser);
      this.saveUsers(users);

      // Iniciar sesión con la nueva cuenta
      this.currentUser = {
        id: newUser.id,
        nombre: newUser.nombre,
        email: newUser.email,
        role: newUser.role,
        asignatura: newUser.asignatura
      };
      this.saveSession();

      this.logActivity('Registro de Docente', `Nuevo profesor registrado: ${newUser.nombre} (${newUser.email}) - Asignatura: ${newUser.asignatura}`);

      return this.currentUser;
    }

    /**
     * Inicio de Sesión de Docente
     */
    loginTeacher(email, password) {
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanPassword = String(password || '').trim();

      const users = this.getUsers();
      const found = users.find(u => u.email.toLowerCase() === cleanEmail);

      if (!found) {
        throw new Error('No se encontró ninguna cuenta registrada con este correo.');
      }

      if (found.password !== cleanPassword) {
        throw new Error('Contraseña incorrecta.');
      }

      // Actualizar último login
      found.lastLogin = new Date().toISOString();
      this.saveUsers(users);

      this.currentUser = {
        id: found.id,
        nombre: found.nombre,
        email: found.email,
        role: found.role,
        asignatura: found.asignatura
      };
      this.saveSession();

      this.logActivity('Inicio de Sesión', `Docente ${found.nombre} inició sesión.`);
      return this.currentUser;
    }

    /**
     * Inicio de Sesión de Administrador con Clave Maestra
     */
    loginAdmin(pin) {
      if (!window.db?.verifyMasterPin(pin)) {
        throw new Error('Clave Maestra de Administrador incorrecta.');
      }

      this.currentUser = {
        id: 'admin_master',
        nombre: 'Administrador Maestro',
        email: 'admin@colegio.cl',
        role: 'admin',
        asignatura: 'Todas'
      };
      this.saveSession();

      if (window.db) {
        window.db.setCurrentRole('admin');
      }

      this.logActivity('Acceso Administrador', 'El Administrador Maestro ha ingresado con su Clave Maestra.');
      return this.currentUser;
    }

    /**
     * Cerrar Sesión
     */
    logout() {
      const user = this.currentUser;
      if (user) {
        this.logActivity('Cierre de Sesión', `Usuario ${user.nombre} (${user.email}) cerró sesión.`);
      }
      this.currentUser = null;
      this.saveSession();
      if (window.db) {
        window.db.setCurrentRole('docente');
      }
    }

    /**
     * Eliminar un usuario docente (Solo Administrador)
     */
    deleteTeacher(userId) {
      if (!this.isAdmin()) {
        throw new Error('Solo el Administrador puede eliminar cuentas docentes.');
      }
      const users = this.getUsers().filter(u => u.id !== userId);
      this.saveUsers(users);
      this.logActivity('Docente Eliminado', `El Administrador eliminó la cuenta del docente con ID: ${userId}`);
    }

    /**
     * Registro de Auditoría de Actividad
     */
    logActivity(action, details) {
      try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEYS.ACTIVITY_LOGS);
        const logs = raw ? JSON.parse(raw) : [];

        logs.unshift({
          id: 'log_' + Date.now(),
          action,
          details,
          userEmail: this.currentUser?.email || 'Anónimo',
          userName: this.currentUser?.nombre || 'Usuario',
          timestamp: new Date().toISOString()
        });

        // Mantener últimos 150 registros
        if (logs.length > 150) logs.length = 150;

        localStorage.setItem(AUTH_STORAGE_KEYS.ACTIVITY_LOGS, JSON.stringify(logs));
      } catch (e) {
        console.warn('Error al guardar log de actividad:', e);
      }
    }

    getActivityLogs() {
      try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEYS.ACTIVITY_LOGS);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }
  }

  global.authManager = new AuthManager();

})(typeof self !== 'undefined' ? self : this);
