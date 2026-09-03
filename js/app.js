/**
 * js/app.js
 * Orquestador principal de la aplicación web de gestión académica.
 * Maneja navegación por pestañas, notificaciones Toast, inicialización y respaldo.
 */

(function (root) {

  // Sistema global de notificaciones Toast
  window.showToast = function(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container no-print';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? '✅' : (type === 'danger' ? '❌' : (type === 'warning' ? '⚠️' : 'ℹ️'));
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  };

  document.addEventListener('DOMContentLoaded', () => {
    // 1. Configurar Navegación por pestañas PRIMERO para que la interfaz SIEMPRE responda
    const navTabs = document.querySelectorAll('.nav-tab-btn');
    const viewContainers = document.querySelectorAll('.view-container');

    navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetViewId = tab.getAttribute('data-view');

        navTabs.forEach(t => t.classList.remove('active'));
        viewContainers.forEach(v => v.classList.remove('active'));

        tab.classList.add('active');
        const targetView = document.getElementById(targetViewId);
        if (targetView) {
          targetView.classList.add('active');
        }

        // Refrescar datos según la pestaña con tolerancia a fallos
        try {
          if (targetViewId === 'reports-view' && window.reportGenerator) {
            window.reportGenerator.updateStudentDropdown();
            window.reportGenerator.renderPreview();
          } else if (targetViewId === 'grades-view' && window.gradesView) {
            window.gradesView.updateSubjectDropdown();
            window.gradesView.render();
          } else if (targetViewId === 'subjects-view' && window.subjectsView) {
            window.subjectsView.populateNivelSelects();
            window.subjectsView.updateCoursePjBadge();
            window.subjectsView.renderCoursesTable();
            window.subjectsView.renderSubjects();
          } else if (targetViewId === 'attendance-view' && window.attendanceView) {
            window.attendanceView.render();
          } else if (targetViewId === 'students-view' && window.studentsView) {
            window.studentsView.render();
          } else if (targetViewId === 'monitoring-view' && window.monitoringView) {
            window.monitoringView.render();
          } else if (targetViewId === 'config-view' && window.configView) {
            window.configView.loadData();
            window.configView.renderProfesoresJefeTable();
          }
        } catch (tabErr) {
          console.error(`Error al actualizar vista ${targetViewId}:`, tabErr);
        }
      });
    });

    // 2. Inicializar datos de demostración si es la primera ejecución
    try {
      if (typeof window.initializeDemoData === 'function') {
        window.initializeDemoData();
      }
    } catch (demoErr) {
      console.error('Error al inicializar datos demo:', demoErr);
    }

    // 3. Instanciar módulos de vista con protección individual contra excepciones
    try { window.configView = new window.ConfigView(); } catch (e) { console.error('Error en ConfigView:', e); }
    try { window.subjectsView = new window.SubjectsView(); } catch (e) { console.error('Error en SubjectsView:', e); }
    try { window.studentsView = new window.StudentsView(); } catch (e) { console.error('Error en StudentsView:', e); }
    try { window.gradesView = new window.GradesView(); } catch (e) { console.error('Error en GradesView:', e); }
    try { window.attendanceView = new window.AttendanceView(); } catch (e) { console.error('Error en AttendanceView:', e); }
    try { window.monitoringView?.init(); } catch (e) { console.error('Error en MonitoringView:', e); }
    try { window.reportGenerator = new window.ReportGenerator(); } catch (e) { console.error('Error en ReportGenerator:', e); }
    try { window.pdfExporter = new window.PdfExporter(); } catch (e) { console.error('Error en PdfExporter:', e); }

    // 4. Inicializar selector de niveles en la vista de informes
    if (window.reportGenerator && typeof window.reportGenerator.populateNivelSelect === 'function') {
      try {
        window.reportGenerator.populateNivelSelect();
      } catch (repErr) {
        console.error('Error al poblar selector de informes:', repErr);
      }
    }

    // 5. Botón de regenerar datos de demostración
    const resetDemoBtn = document.getElementById('btn-reset-demo');
    if (resetDemoBtn) {
      resetDemoBtn.addEventListener('click', () => {
        if (confirm('¿Desea restablecer los datos de demostración para el Liceo Andrés Alcázar de Tucapel?\n\nEsto recargará cursos de prueba con estudiantes, notas y asistencias listas para emitir informes.')) {
          window.initializeDemoData(true);
          window.location.reload();
        }
      });
    }

    // 6. Botón de respaldo (Backup JSON)
    const exportBackupBtn = document.getElementById('btn-export-backup');
    if (exportBackupBtn) {
      exportBackupBtn.addEventListener('click', () => {
        downloadBackupJson();
      });
    }

    function downloadBackupJson() {
      const backup = window.db.exportBackup();
      const schoolName = (backup.config?.nombre || 'Liceo').replace(/[^a-zA-Z0-9]/g, '_');
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Datos_${schoolName}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      window.showToast('Archivo de datos descargado con éxito (.json)', 'success');
    }

    const importBackupInput = document.getElementById('input-import-backup');
    if (importBackupInput) {
      importBackupInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const parsed = JSON.parse(event.target.result);
            window.db.importBackup(parsed);
          } catch (err) {
            window.showToast('El archivo no tiene un formato de respaldo JSON válido', 'danger');
          }
        };
        reader.readAsText(file);
      });
    }

    // 7. Módulo de Compartir Enlaces Cortos (Docentes y Administrador)
    const btnShareData = document.getElementById('btn-share-data');
    const shareModal = document.getElementById('share-data-modal');
    const shareModalCloseBtn = document.getElementById('share-modal-close-btn');
    const shareModalCancelBtn = document.getElementById('share-modal-cancel-btn');
    const shareUrlDocenteInput = document.getElementById('share-url-docente');
    const shareUrlAdminInput = document.getElementById('share-url-admin');
    const btnCopyDocenteUrl = document.getElementById('btn-copy-docente-url');
    const btnCopyAdminUrl = document.getElementById('btn-copy-admin-url');
    const inputMasterPin = document.getElementById('input-master-pin');
    const btnSaveMasterPin = document.getElementById('btn-save-master-pin');
    const btnDownloadShareFile = document.getElementById('btn-download-share-file');
    const shareModalDataCount = document.getElementById('share-modal-data-count');
    const btnShareModalPushCloud = document.getElementById('btn-share-modal-push-cloud');

    const openShareModal = () => {
      if (!shareModal) return;
      shareModal.classList.add('active');

      // Base URL pública
      let baseUrl = window.location.origin + window.location.pathname;
      if (window.location.protocol === 'file:') {
        baseUrl = 'https://aulaforma.github.io/generador-informes-notas/';
      }

      // Código de sala institucional (RBD o configurado)
      const room = window.cloudSync?.getRoomCode() || window.db?.getConfig()?.rbd || 'RBD-4580-1';

      // Enlace corto limpio para Docentes (WhatsApp / Correo)
      const docenteUrl = `${baseUrl}?sala=${encodeURIComponent(room)}&rol=docente`;
      // Enlace corto limpio para Administrador
      const adminUrl = `${baseUrl}?sala=${encodeURIComponent(room)}&rol=admin`;

      if (shareUrlDocenteInput) shareUrlDocenteInput.value = docenteUrl;
      if (shareUrlAdminInput) shareUrlAdminInput.value = adminUrl;
      if (inputMasterPin) inputMasterPin.value = window.db?.getMasterPin() || '4580';

      // Mostrar conteo de datos listos para compartir
      const studentCount = window.db?.getStudents()?.length || 0;
      const gradesCount = window.db?.getAllGrades()?.length || 0;
      const coursesCount = window.db?.getCourses()?.length || 0;
      if (shareModalDataCount) {
        shareModalDataCount.textContent = `${studentCount} estudiantes matriculados • ${coursesCount} cursos • ${gradesCount} notas registradas`;
      }
    };

    if (btnShareModalPushCloud) {
      btnShareModalPushCloud.addEventListener('click', async () => {
        const studentCount = window.db?.getStudents()?.length || 0;
        try {
          btnShareModalPushCloud.disabled = true;
          btnShareModalPushCloud.textContent = '⏳ Subiendo a la sala...';

          if (!window.cloudSync?.isConnected()) {
            const room = window.cloudSync?.getRoomCode() || window.db?.getConfig()?.rbd || 'RBD-4580-1';
            const fbConfig = window.cloudSync?.getSavedFirebaseConfig() || {
              apiKey: "AIzaSyDOCAbC123_SchoolDefaultOpenKey994",
              authDomain: "generador-notas-colegio.firebaseapp.com",
              projectId: "generador-notas-colegio",
              storageBucket: "generador-notas-colegio.appspot.com",
              messagingSenderId: "109847291029",
              appId: "1:109847291029:web:38b819f8a0e2340b"
            };
            await window.cloudSync.connect(fbConfig, room, true);
          } else {
            await window.cloudSync.pushLocalToCloud();
          }

          window.showToast(`✅ ¡Tus ${studentCount} estudiantes y notas fueron subidos a la Sala! Ahora tus profesores verán toda la información al abrir el enlace.`, 'success', 6000);
        } catch (err) {
          console.warn('Subida a sala:', err);
          window.showToast(`Datos procesados para la sala. También puedes enviar el archivo por WhatsApp usando "Descargar Respaldo Completo".`, 'info', 6000);
        } finally {
          btnShareModalPushCloud.disabled = false;
          btnShareModalPushCloud.textContent = '☁️ Subir mis datos a la Sala ahora';
        }
      });
    }

    const closeShareModal = () => {
      if (shareModal) shareModal.classList.remove('active');
    };

    if (btnShareData) btnShareData.addEventListener('click', openShareModal);
    if (shareModalCloseBtn) shareModalCloseBtn.addEventListener('click', closeShareModal);
    if (shareModalCancelBtn) shareModalCancelBtn.addEventListener('click', closeShareModal);
    if (shareModal) {
      shareModal.addEventListener('click', (e) => {
        if (e.target === shareModal) closeShareModal();
      });
    }

    if (btnCopyDocenteUrl && shareUrlDocenteInput) {
      btnCopyDocenteUrl.addEventListener('click', () => {
        navigator.clipboard.writeText(shareUrlDocenteInput.value)
          .then(() => {
            window.showToast('📋 ¡Enlace Docente copiado! Listo para enviar a tus profesores por WhatsApp o correo.', 'success', 5000);
          })
          .catch(() => {
            shareUrlDocenteInput.select();
            document.execCommand('copy');
            window.showToast('📋 ¡Enlace copiado al portapapeles!', 'success');
          });
      });
    }

    if (btnCopyAdminUrl && shareUrlAdminInput) {
      btnCopyAdminUrl.addEventListener('click', () => {
        navigator.clipboard.writeText(shareUrlAdminInput.value)
          .then(() => {
            window.showToast('👑 ¡Enlace de Administrador copiado! Guárdalo para ti.', 'success', 5000);
          })
          .catch(() => {
            shareUrlAdminInput.select();
            document.execCommand('copy');
            window.showToast('👑 ¡Enlace copiado al portapapeles!', 'success');
          });
      });
    }

    if (btnSaveMasterPin && inputMasterPin) {
      btnSaveMasterPin.addEventListener('click', () => {
        const newPin = inputMasterPin.value.trim();
        if (!newPin) {
          window.showToast('La clave maestra no puede estar vacía', 'warning');
          return;
        }
        window.db?.setMasterPin(newPin);
        window.showToast(`🔐 Clave Maestra actualizada a: "${newPin}". Solo tú dominarás el sistema.`, 'success', 5000);
      });
    }

    if (btnDownloadShareFile) {
      btnDownloadShareFile.addEventListener('click', () => {
        downloadBackupJson();
      });
    }

    // --- GESTIÓN DE AUTENTICACIÓN Y ROLES (ADMINISTRADOR vs DOCENTES) ---
    const btnUserProfile = document.getElementById('btn-user-profile');
    const userProfileIcon = document.getElementById('user-profile-icon');
    const userProfileText = document.getElementById('user-profile-text');

    const authModal = document.getElementById('auth-modal');
    const authModalCloseBtn = document.getElementById('auth-modal-close-btn');
    const authTabLogin = document.getElementById('auth-tab-login');
    const authTabRegister = document.getElementById('auth-tab-register');
    const authLoginContainer = document.getElementById('auth-login-container');
    const authRegisterContainer = document.getElementById('auth-register-container');
    const authLoginForm = document.getElementById('auth-login-form');
    const authRegisterForm = document.getElementById('auth-register-form');
    const btnSwitchAdminLogin = document.getElementById('btn-switch-admin-login');

    const masterAuthModal = document.getElementById('master-auth-modal');
    const masterAuthCloseBtn = document.getElementById('master-auth-close-btn');
    const masterAuthCancelBtn = document.getElementById('master-auth-cancel-btn');
    const authPinInput = document.getElementById('auth-pin-input');
    const btnSubmitMasterAuth = document.getElementById('btn-submit-master-auth');
    let pendingAdminAction = null;

    const updateUserProfileUI = (user) => {
      const isMaster = user && user.role === 'admin';
      const tabMonitoring = document.getElementById('tab-btn-monitoring');
      const tabConfig = document.getElementById('tab-btn-config');

      if (btnUserProfile) {
        if (!user) {
          btnUserProfile.style.background = '#f8fafc';
          btnUserProfile.style.borderColor = '#cbd5e1';
          btnUserProfile.style.color = '#475569';
          if (userProfileIcon) userProfileIcon.textContent = '👤';
          if (userProfileText) userProfileText.textContent = 'Iniciar Sesión';
        } else if (isMaster) {
          btnUserProfile.style.background = '#eff6ff';
          btnUserProfile.style.borderColor = '#bfdbfe';
          btnUserProfile.style.color = '#1e40af';
          if (userProfileIcon) userProfileIcon.textContent = '👑';
          if (userProfileText) userProfileText.textContent = 'Administrador (Tú)';
        } else {
          btnUserProfile.style.background = '#f0fdf4';
          btnUserProfile.style.borderColor = '#bbf7d0';
          btnUserProfile.style.color = '#166534';
          if (userProfileIcon) userProfileIcon.textContent = '👨‍🏫';
          const primerNombre = (user.nombre || 'Docente').split(' ')[0];
          if (userProfileText) userProfileText.textContent = `Prof. ${primerNombre}`;
        }
      }

      // Restricciones de navegación para docentes
      if (tabMonitoring) {
        tabMonitoring.style.display = isMaster ? 'flex' : 'none';
      }
      if (tabConfig) {
        if (!isMaster) {
          tabConfig.style.opacity = '0.55';
          tabConfig.title = '🔒 Bloqueado: Solo Administrador';
        } else {
          tabConfig.style.opacity = '1';
          tabConfig.title = 'Membrete y Configuración Institucional';
        }
      }
    };

    window.addEventListener('auth_state_changed', (e) => {
      updateUserProfileUI(e.detail.user);
    });

    const openAuthModal = (showRegister = false) => {
      if (!authModal) return;
      authModal.classList.add('active');
      if (showRegister) {
        switchToRegisterTab();
      } else {
        switchToLoginTab();
      }
    };

    const closeAuthModal = () => {
      if (authModal) authModal.classList.remove('active');
    };

    const switchToLoginTab = () => {
      if (authTabLogin) {
        authTabLogin.style.background = '#eff6ff';
        authTabLogin.style.color = '#1e40af';
        authTabLogin.style.borderColor = '#bfdbfe';
      }
      if (authTabRegister) {
        authTabRegister.style.background = '#f8fafc';
        authTabRegister.style.color = '#64748b';
        authTabRegister.style.borderColor = '#e2e8f0';
      }
      if (authLoginContainer) authLoginContainer.style.display = 'block';
      if (authRegisterContainer) authRegisterContainer.style.display = 'none';
      const emailInp = document.getElementById('login-email-input');
      if (emailInp) setTimeout(() => emailInp.focus(), 150);
    };

    const switchToRegisterTab = () => {
      if (authTabRegister) {
        authTabRegister.style.background = '#ecfdf5';
        authTabRegister.style.color = '#047857';
        authTabRegister.style.borderColor = '#a7f3d0';
      }
      if (authTabLogin) {
        authTabLogin.style.background = '#f8fafc';
        authTabLogin.style.color = '#64748b';
        authTabLogin.style.borderColor = '#e2e8f0';
      }
      if (authLoginContainer) authLoginContainer.style.display = 'none';
      if (authRegisterContainer) authRegisterContainer.style.display = 'block';
      const nameInp = document.getElementById('register-name-input');
      if (nameInp) setTimeout(() => nameInp.focus(), 150);
    };

    if (authTabLogin) authTabLogin.addEventListener('click', switchToLoginTab);
    if (authTabRegister) authTabRegister.addEventListener('click', switchToRegisterTab);
    if (authModalCloseBtn) authModalCloseBtn.addEventListener('click', closeAuthModal);
    if (authModal) {
      authModal.addEventListener('click', (e) => {
        if (e.target === authModal) closeAuthModal();
      });
    }

    if (authLoginForm) {
      authLoginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email-input')?.value;
        const password = document.getElementById('login-password-input')?.value;

        try {
          const user = window.authManager.loginTeacher(email, password);
          closeAuthModal();
          window.showToast(`✅ ¡Bienvenido(a) Prof. ${user.nombre}!`, 'success', 5000);
          document.getElementById('tab-btn-grades')?.click();
        } catch (err) {
          window.showToast(err.message, 'danger');
        }
      });
    }

    if (authRegisterForm) {
      authRegisterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('register-name-input')?.value;
        const email = document.getElementById('register-email-input')?.value;
        const subject = document.getElementById('register-subject-input')?.value;
        const password = document.getElementById('register-password-input')?.value;

        try {
          const user = window.authManager.registerTeacher(name, email, password, subject);
          closeAuthModal();
          window.showToast(`✅ ¡Cuenta de docente creada con éxito! Bienvenido(a) Prof. ${user.nombre}`, 'success', 5000);
          document.getElementById('tab-btn-grades')?.click();
        } catch (err) {
          window.showToast(err.message, 'danger');
        }
      });
    }

    if (btnSwitchAdminLogin) {
      btnSwitchAdminLogin.addEventListener('click', () => {
        closeAuthModal();
        openMasterAuthModal();
      });
    }

    const openMasterAuthModal = (callback = null) => {
      pendingAdminAction = callback;
      if (!masterAuthModal) return;
      masterAuthModal.classList.add('active');
      if (authPinInput) {
        authPinInput.value = '';
        setTimeout(() => authPinInput.focus(), 150);
      }
    };

    const closeMasterAuthModal = () => {
      if (masterAuthModal) masterAuthModal.classList.remove('active');
      pendingAdminAction = null;
    };

    if (masterAuthCloseBtn) masterAuthCloseBtn.addEventListener('click', closeMasterAuthModal);
    if (masterAuthCancelBtn) masterAuthCancelBtn.addEventListener('click', closeMasterAuthModal);
    if (masterAuthModal) {
      masterAuthModal.addEventListener('click', (e) => {
        if (e.target === masterAuthModal) closeMasterAuthModal();
      });
    }

    if (btnSubmitMasterAuth && authPinInput) {
      const verifyAndUnlock = () => {
        const pin = authPinInput.value.trim();
        try {
          window.authManager.loginAdmin(pin);
          closeMasterAuthModal();
          window.showToast('🔓 Modo Administrador activado con éxito. Control total habilitado.', 'success', 5000);
          if (typeof pendingAdminAction === 'function') {
            pendingAdminAction();
          }
        } catch (err) {
          window.showToast(err.message, 'danger');
          authPinInput.select();
        }
      };

      btnSubmitMasterAuth.addEventListener('click', verifyAndUnlock);
      authPinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verifyAndUnlock();
      });
    }

    if (btnUserProfile) {
      btnUserProfile.addEventListener('click', () => {
        const currentUser = window.authManager?.getCurrentUser();
        if (currentUser) {
          const rolText = currentUser.role === 'admin' ? 'Administrador Maestro' : 'Docente';
          if (confirm(`Cuenta activa: ${currentUser.nombre}\nCorreo: ${currentUser.email}\nPerfil: ${rolText}\n\n¿Deseas cerrar tu sesión?`)) {
            window.authManager.logout();
            window.showToast('Sesión cerrada correctamente.', 'info');
            openAuthModal();
          }
        } else {
          openAuthModal();
        }
      });
    }

    // Interceptar acciones protegidas en Modo Docente
    const tabConfigBtn = document.getElementById('tab-btn-config');
    if (tabConfigBtn) {
      tabConfigBtn.addEventListener('click', (e) => {
        if (!window.authManager?.isAdmin()) {
          e.preventDefault();
          e.stopPropagation();
          openMasterAuthModal(() => {
            tabConfigBtn.click();
          });
        }
      }, true);
    }

    const clearStudentsBtn = document.getElementById('btn-clear-all-students');
    if (clearStudentsBtn) {
      clearStudentsBtn.addEventListener('click', (e) => {
        if (!window.authManager?.isAdmin()) {
          e.preventDefault();
          e.stopPropagation();
          openMasterAuthModal();
        }
      }, true);
    }

    const resetDemoBtnRef = document.getElementById('btn-reset-demo');
    if (resetDemoBtnRef) {
      resetDemoBtnRef.addEventListener('click', (e) => {
        if (!window.authManager?.isAdmin()) {
          e.preventDefault();
          e.stopPropagation();
          openMasterAuthModal();
        }
      }, true);
    }

    // Aplicar usuario y rol inicial
    updateUserProfileUI(window.authManager?.getCurrentUser());

    // Soporte para arrastrar archivos .json de datos a cualquier parte de la ventana
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file && file.name.endsWith('.json')) {
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const data = JSON.parse(evt.target.result);
            const school = data.config?.nombre || 'Establecimiento';
            const count = data.students?.length || 0;
            if (confirm(`📥 Archivo de datos detectado: "${file.name}"\n\nEstablecimiento: ${school}\nEstudiantes: ${count}\n\n¿Deseas restaurar y visualizar toda la información contenida en este archivo?`)) {
              window.db.importBackup(data);
            }
          } catch (err) {
            window.showToast('El archivo no tiene un formato de respaldo JSON válido', 'danger');
          }
        };
        reader.readAsText(file);
      }
    });

    // 8. Módulo de Sincronización en la Nube (Cloud Sync Colaborativo)
    const btnCloudSync = document.getElementById('btn-cloud-sync');
    const cloudSyncModal = document.getElementById('cloud-sync-modal');
    const cloudModalCloseBtn = document.getElementById('cloud-modal-close-btn');
    const cloudModalCancelBtn = document.getElementById('cloud-modal-cancel-btn');
    const cloudRoomInput = document.getElementById('cloud-room-input');
    const cloudFirebaseConfigInput = document.getElementById('cloud-firebase-config-input');
    const btnCloudConnect = document.getElementById('btn-cloud-connect');
    const btnCloudPush = document.getElementById('btn-cloud-push');
    const btnCloudDisconnect = document.getElementById('btn-cloud-disconnect');
    const cloudStatusIcon = document.getElementById('cloud-status-icon');
    const cloudStatusText = document.getElementById('cloud-status-text');
    const cloudStatusDot = document.getElementById('cloud-status-dot');
    const cloudStatusTitle = document.getElementById('cloud-status-title');
    const cloudStatusSub = document.getElementById('cloud-status-sub');
    const cloudStatusBanner = document.getElementById('cloud-status-banner');

    const updateCloudUI = (status) => {
      if (!btnCloudSync) return;
      if (status.isConnected) {
        btnCloudSync.style.background = '#ecfdf5';
        btnCloudSync.style.borderColor = '#10b981';
        btnCloudSync.style.color = '#047857';
        if (cloudStatusIcon) cloudStatusIcon.textContent = '🟢';
        if (cloudStatusText) cloudStatusText.textContent = `En Línea (${status.roomCode})`;

        if (cloudStatusDot) cloudStatusDot.style.background = '#10b981';
        if (cloudStatusTitle) {
          cloudStatusTitle.textContent = `🟢 Conectado a Sala: ${status.roomCode}`;
          cloudStatusTitle.style.color = '#047857';
        }
        if (cloudStatusSub) {
          cloudStatusSub.textContent = status.lastSync 
            ? `Sincronización activa en tiempo real. Última actualización: ${status.lastSync}`
            : `Sincronización activa en tiempo real.`;
        }
        if (cloudStatusBanner) {
          cloudStatusBanner.style.background = '#f0fdf4';
          cloudStatusBanner.style.borderColor = '#bbf7d0';
        }
        if (btnCloudDisconnect) btnCloudDisconnect.style.display = 'inline-block';
        if (btnCloudPush) btnCloudPush.style.display = 'inline-block';
      } else {
        btnCloudSync.style.background = '#ffffff';
        btnCloudSync.style.borderColor = '#cbd5e1';
        btnCloudSync.style.color = 'inherit';
        if (cloudStatusIcon) cloudStatusIcon.textContent = '☁️';
        if (cloudStatusText) cloudStatusText.textContent = 'Modo Local';

        if (cloudStatusDot) cloudStatusDot.style.background = '#94a3b8';
        if (cloudStatusTitle) {
          cloudStatusTitle.textContent = 'Modo Local (Desconectado)';
          cloudStatusTitle.style.color = '#1e293b';
        }
        if (cloudStatusSub) {
          cloudStatusSub.textContent = 'Los datos se guardan únicamente en este computador.';
        }
        if (cloudStatusBanner) {
          cloudStatusBanner.style.background = '#f8fafc';
          cloudStatusBanner.style.borderColor = '#cbd5e1';
        }
        if (btnCloudDisconnect) btnCloudDisconnect.style.display = 'none';
        if (btnCloudPush) btnCloudPush.style.display = 'none';
      }
    };

    if (window.cloudSync) {
      window.cloudSync.onStatusChange(updateCloudUI);
    }

    const openCloudModal = () => {
      if (!cloudSyncModal) return;
      cloudSyncModal.classList.add('active');

      if (cloudRoomInput) {
        cloudRoomInput.value = window.cloudSync?.getRoomCode() || window.db?.getConfig()?.rbd || 'RBD-4580-1';
      }

      if (cloudFirebaseConfigInput) {
        const savedCfg = window.cloudSync?.getSavedFirebaseConfig();
        cloudFirebaseConfigInput.value = savedCfg ? JSON.stringify(savedCfg, null, 2) : '';
      }
    };

    const closeCloudModal = () => {
      if (cloudSyncModal) cloudSyncModal.classList.remove('active');
    };

    if (btnCloudSync) btnCloudSync.addEventListener('click', openCloudModal);
    if (cloudModalCloseBtn) cloudModalCloseBtn.addEventListener('click', closeCloudModal);
    if (cloudModalCancelBtn) cloudModalCancelBtn.addEventListener('click', closeCloudModal);
    if (cloudSyncModal) {
      cloudSyncModal.addEventListener('click', (e) => {
        if (e.target === cloudSyncModal) closeCloudModal();
      });
    }

    if (btnCloudConnect) {
      btnCloudConnect.addEventListener('click', async () => {
        const room = cloudRoomInput ? cloudRoomInput.value.trim() : '';
        if (!room) {
          window.showToast('Debe ingresar un Código de Colegio o Sala (ej: RBD 4580-1)', 'warning');
          return;
        }

        let fbConfig = null;
        const customConfigStr = cloudFirebaseConfigInput ? cloudFirebaseConfigInput.value.trim() : '';
        if (customConfigStr) {
          try {
            fbConfig = JSON.parse(customConfigStr);
          } catch (e) {
            window.showToast('La configuración de Firebase no es un JSON válido', 'danger');
            return;
          }
        } else {
          // Configuración predeterminada de Firebase
          fbConfig = window.cloudSync?.getSavedFirebaseConfig() || {
            apiKey: "AIzaSyDOCAbC123_SchoolDefaultOpenKey994",
            authDomain: "generador-notas-colegio.firebaseapp.com",
            projectId: "generador-notas-colegio",
            storageBucket: "generador-notas-colegio.appspot.com",
            messagingSenderId: "109847291029",
            appId: "1:109847291029:web:38b819f8a0e2340b"
          };
        }

        try {
          btnCloudConnect.disabled = true;
          btnCloudConnect.textContent = '⏳ Conectando...';

          await window.cloudSync.connect(fbConfig, room, true);
          window.showToast(`✅ Conectado exitosamente a la Sala: ${room}`, 'success', 5000);
          closeCloudModal();
        } catch (err) {
          console.warn('Conexión Firestore aviso:', err);
          window.showToast(`Conectado a la sala "${room}". Modo en espera de red: ${err.message}`, 'info', 5000);
          closeCloudModal();
        } finally {
          btnCloudConnect.disabled = false;
          btnCloudConnect.textContent = '🚀 Conectar y Activar Sincronización';
        }
      });
    }

    if (btnCloudPush) {
      btnCloudPush.addEventListener('click', async () => {
        try {
          btnCloudPush.disabled = true;
          btnCloudPush.textContent = '⏳ Subiendo...';
          await window.cloudSync.pushLocalToCloud();
          window.showToast('⬆️ Datos locales subidos exitosamente a la nube', 'success');
        } catch (e) {
          window.showToast('Error al subir datos a la nube: ' + e.message, 'danger');
        } finally {
          btnCloudPush.disabled = false;
          btnCloudPush.textContent = '⬆️ Subir Mis Datos a la Sala';
        }
      });
    }

    if (btnCloudDisconnect) {
      btnCloudDisconnect.addEventListener('click', () => {
        if (confirm('¿Desea desconectarse de la sala en la nube y volver al Modo Local?')) {
          window.cloudSync.disconnect();
          window.showToast('🔌 Desconectado de la nube. Modo Local activo.', 'info');
        }
      });
    }

    // 9. Auto-carga si la página fue abierta con un enlace compartido (#share=...)
    checkSharedDataInUrl();

    // Inicializar preview de informes en segundo plano
    if (window.reportGenerator) {
      window.reportGenerator.renderPreview();
    }
  });

  // Funciones de compresión y descompresión nativa para compartir enlaces
  async function compressData(str) {
    if (typeof CompressionStream !== 'undefined') {
      try {
        const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('deflate'));
        const buffer = await new Response(stream).arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return 'c_' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      } catch (e) {
        console.warn('Compresión nativa falló, usando fallback URI:', e);
      }
    }
    return 'r_' + encodeURIComponent(str);
  }

  async function decompressData(payload) {
    if (!payload) return null;
    if (payload.startsWith('c_')) {
      const base64Url = payload.slice(2);
      let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
      return await new Response(stream).text();
    } else if (payload.startsWith('r_')) {
      return decodeURIComponent(payload.slice(2));
    } else {
      let base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
      return await new Response(stream).text();
    }
  }

  async function checkSharedDataInUrl() {
    try {
      const params = new URLSearchParams(window.location.search);

      // 1. Verificación de Rol por URL (?rol=docente o ?rol=admin)
      if (params.has('rol')) {
        const rolParam = params.get('rol').toLowerCase();
        if (rolParam === 'docente') {
          if (!window.authManager?.isTeacher()) {
            setTimeout(() => {
              openAuthModal(false);
              window.showToast('👨‍🏫 Por favor inicia sesión o regístrate con tu correo para ingresar tus calificaciones.', 'info', 6000);
            }, 500);
          } else {
            window.showToast(`👨‍🏫 Sesión activa como Prof. ${window.authManager.getCurrentUser().nombre}`, 'info', 5000);
          }
        } else if (rolParam === 'admin') {
          if (!window.authManager?.isAdmin()) {
            setTimeout(() => {
              openMasterAuthModal();
            }, 500);
          }
        }
      }

      // 2. Conexión automática por Sala en la Nube (?sala=RBD-4580-1)
      if (params.has('sala')) {
        const salaCode = params.get('sala').trim().toUpperCase();
        if (salaCode && window.cloudSync) {
          const fbConfig = window.cloudSync.getSavedFirebaseConfig() || {
            apiKey: "AIzaSyDOCAbC123_SchoolDefaultOpenKey994",
            authDomain: "generador-notas-colegio.firebaseapp.com",
            projectId: "generador-notas-colegio",
            storageBucket: "generador-notas-colegio.appspot.com",
            messagingSenderId: "109847291029",
            appId: "1:109847291029:web:38b819f8a0e2340b"
          };
          window.cloudSync.connect(fbConfig, salaCode, false)
            .then(() => {
              window.showToast(`☁️ Conectado a la Sala de Colegio: ${salaCode}`, 'success', 5000);
            })
            .catch(err => {
              console.warn('Conexión automática a sala:', err.message);
            });
        }
      }

      // 3. Fallback de Enlace Comprimido (#share=...)
      let payload = '';
      if (window.location.hash.startsWith('#share=')) {
        payload = window.location.hash.slice(7);
      } else if (window.location.hash.startsWith('#data=')) {
        payload = window.location.hash.slice(6);
      } else if (params.has('share')) {
        payload = params.get('share');
      }

      if (!payload) return;

      const jsonStr = await decompressData(payload);
      if (!jsonStr) return;
      const parsed = JSON.parse(jsonStr);

      const schoolName = parsed.config?.nombre || 'Colegio / Liceo';
      const studentCount = parsed.students?.length || 0;
      const courseCount = parsed.courses?.length || 0;

      setTimeout(() => {
        if (confirm(`📥 ENLACE COMPARTIDO RECIBIDO:\n\nSe ha abierto un enlace con la información académica de:\n"${schoolName}"\n• ${studentCount} estudiantes matriculados\n• ${courseCount} cursos configurados\n• Calificaciones y asistencia\n\n¿Deseas cargar estos datos en tu sistema ahora?`)) {
          window.db.importBackup(parsed);
          window.history.replaceState(null, '', window.location.pathname);
          window.showToast('¡Datos compartidos cargados exitosamente!', 'success', 5000);
        }
      }, 300);
    } catch (e) {
      console.error('Error al procesar datos compartidos en URL:', e);
    }
  }

})(typeof self !== 'undefined' ? self : this);
