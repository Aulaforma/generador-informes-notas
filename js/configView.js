/**
 * js/configView.js
 * Módulo de Configuración Institucional (Membrete y Profesores Jefe).
 * Permite gestionar:
 * - Nombre del Establecimiento, RBD, Insignia/Logo y Año Escolar con replicación instantánea.
 * - Designación de Profesor(a) Jefe específico para cada curso.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./db.js'));
  } else {
    root.ConfigView = factory(root);
  }
})(typeof self !== 'undefined' ? self : this, function (dbModule) {

  const db = dbModule.db;
  const NIVELES_DISPONIBLES = dbModule.NIVELES_DISPONIBLES;

  class ConfigView {
    constructor() {
      this.form = document.getElementById('config-form');
      this.logoInput = document.getElementById('config-logo-file');
      this.logoPreview = document.getElementById('config-logo-preview');
      this.logoResetBtn = document.getElementById('config-logo-reset');
      
      // Contenedor de asignación de profesores jefe
      this.profesoresTableBody = document.getElementById('config-profesores-table-body');
      this.btnSaveProfesores = document.getElementById('btn-save-profesores-jefe');
      this.quickProfesorInput = document.getElementById('config-quick-profesor-input');
      this.btnApplyQuickProfesor = document.getElementById('btn-apply-quick-profesor');

      this.currentLogoBase64 = null;
      
      this.initEvents();
      this.loadData();
      this.renderProfesoresJefeTable();
    }

    initEvents() {
      if (this.form) {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
      }

      if (this.logoInput) {
        this.logoInput.addEventListener('change', (e) => this.handleLogoUpload(e));
      }

      if (this.logoResetBtn) {
        this.logoResetBtn.addEventListener('click', () => {
          this.currentLogoBase64 = './assets/default_badge.svg';
          if (this.logoPreview) {
            this.logoPreview.src = this.currentLogoBase64;
          }
          // Replicar inmediatamente en el encabezado de la aplicación
          this.replicateHeaderImmediate();
          window.showToast('Insignia restablecida a la oficial por defecto', 'info');
        });
      }

      // Replicación inmediata en vivo al tipear en el formulario
      ['config-nombre', 'config-rbd', 'config-anio'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('input', () => this.replicateHeaderImmediate());
        }
      });

      if (this.btnSaveProfesores) {
        this.btnSaveProfesores.addEventListener('click', () => this.saveProfesoresJefeFromTable());
      }

      if (this.btnApplyQuickProfesor) {
        this.btnApplyQuickProfesor.addEventListener('click', () => this.applyQuickProfesorToEmpty());
      }

      // Escuchar actualizaciones externas de configuración
      window.addEventListener('school_config_updated', (e) => {
        this.updateHeaderDisplay(e.detail);
      });
    }

    loadData() {
      const config = db.getConfig();
      
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
      };

      setVal('config-nombre', config.nombre || 'Liceo Andrés Alcázar de Tucapel');
      setVal('config-rbd', config.rbd || '4580-1');
      setVal('config-anio', config.anioEscolar || '2026');
      setVal('config-comuna', config.comuna || 'Tucapel');
      setVal('config-region', config.region || 'Región del Biobío');
      setVal('config-director', config.director || 'Director(a) Establecimiento');
      setVal('config-profesor-jefe', config.profesorJefe || 'Profesor(a) Jefe');

      this.currentLogoBase64 = config.logo || './assets/default_badge.svg';
      if (this.logoPreview) {
        this.logoPreview.src = this.currentLogoBase64;
      }

      this.updateHeaderDisplay(config);
    }

    renderProfesoresJefeTable() {
      if (!this.profesoresTableBody) return;

      const config = db.getConfig();
      const profesoresMap = config.profesoresJefe || {};
      const defaultPj = config.profesorJefe || 'Profesor(a) Jefe';

      this.profesoresTableBody.innerHTML = NIVELES_DISPONIBLES.map((nivel, idx) => {
        const currentName = profesoresMap[nivel] !== undefined ? profesoresMap[nivel] : '';
        const placeholderText = currentName ? '' : `Por defecto: ${defaultPj}`;

        return `
          <tr>
            <td style="text-align: center; color: #64748b; font-weight: 600; width: 40px;">${idx + 1}</td>
            <td style="width: 260px;">
              <strong style="color: #0f172a;">${escapeHtml(nivel)}</strong>
            </td>
            <td>
              <input 
                type="text" 
                class="form-control pj-input" 
                data-nivel="${escapeHtml(nivel)}" 
                value="${escapeHtml(currentName)}" 
                placeholder="${escapeHtml(placeholderText)}"
                style="width: 100%; font-weight: 500;"
              />
            </td>
            <td style="text-align: center; width: 110px;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.configView.saveSingleProfesor('${escapeHtml(nivel)}', this)" title="Guardar cambios de este curso">
                💾 Guardar
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    saveSingleProfesor(nivel, btnEl) {
      const row = btnEl.closest('tr');
      const input = row.querySelector('.pj-input');
      const val = input ? input.value.trim() : '';

      db.saveProfesorJefeForCourse(nivel, val);
      window.showToast(`Profesor(a) Jefe asignado a ${nivel}: "${val || 'Por defecto'}"`, 'success');
    }

    saveProfesoresJefeFromTable() {
      if (!this.profesoresTableBody) return;

      const inputs = this.profesoresTableBody.querySelectorAll('.pj-input');
      const map = {};

      inputs.forEach(inp => {
        const nivel = inp.getAttribute('data-nivel');
        const val = inp.value.trim();
        if (nivel) {
          map[nivel] = val;
        }
      });

      db.saveAllProfesoresJefe(map);
      window.showToast('Asignación de Profesores Jefe guardada exitosamente para todos los cursos', 'success');
    }

    applyQuickProfesorToEmpty() {
      const val = this.quickProfesorInput ? this.quickProfesorInput.value.trim() : '';
      if (!val) {
        window.showToast('Escriba un nombre en el campo rápido', 'warning');
        return;
      }

      if (!this.profesoresTableBody) return;
      const inputs = this.profesoresTableBody.querySelectorAll('.pj-input');
      let count = 0;

      inputs.forEach(inp => {
        if (!inp.value.trim()) {
          inp.value = val;
          count++;
        }
      });

      window.showToast(`Se rellenaron ${count} cursos vacíos con "${val}". Haga clic en "💾 Guardar Todos los Profesores Jefe" para confirmar.`, 'info');
    }

    handleLogoUpload(e) {
      const file = e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        window.showToast('Por favor seleccione un archivo de imagen válido (PNG, JPG o SVG)', 'danger');
        return;
      }

      if (file.size > 2 * 1024 * 1024) {
        window.showToast('La imagen es demasiado pesada. Máximo recomendado: 2 MB', 'warning');
        return;
      }

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        this.currentLogoBase64 = loadEvent.target.result;
        if (this.logoPreview) {
          this.logoPreview.src = this.currentLogoBase64;
        }
        // Replicar de inmediato en toda la aplicación
        this.replicateHeaderImmediate();
        window.showToast('Insignia cargada y replicada en toda la aplicación', 'success');
      };
      reader.readAsDataURL(file);
    }

    replicateHeaderImmediate() {
      const getVal = (id) => document.getElementById(id)?.value?.trim();

      const partialConfig = {
        nombre: getVal('config-nombre') || 'Liceo Andrés Alcázar de Tucapel',
        rbd: getVal('config-rbd') || '4580-1',
        anioEscolar: getVal('config-anio') || '2026',
        logo: this.currentLogoBase64 || './assets/default_badge.svg'
      };

      this.updateHeaderDisplay(partialConfig);
    }

    handleSubmit(e) {
      e.preventDefault();

      const getVal = (id) => document.getElementById(id)?.value?.trim();

      const updatedConfig = {
        nombre: getVal('config-nombre') || 'Liceo Andrés Alcázar de Tucapel',
        rbd: getVal('config-rbd') || '4580-1',
        anioEscolar: getVal('config-anio') || '2026',
        comuna: getVal('config-comuna') || 'Tucapel',
        region: getVal('config-region') || 'Región del Biobío',
        director: getVal('config-director') || 'Director(a) Establecimiento',
        profesorJefe: getVal('config-profesor-jefe') || 'Profesor(a) Jefe',
        logo: this.currentLogoBase64 || './assets/default_badge.svg'
      };

      db.saveConfig(updatedConfig);
      this.updateHeaderDisplay(updatedConfig);
      window.showToast('Configuración institucional guardada y replicada exitosamente en todos los módulos e informes', 'success');
    }

    updateHeaderDisplay(config) {
      const appTitle = document.getElementById('app-school-title');
      const appRbd = document.getElementById('app-school-rbd');
      const appYear = document.getElementById('app-school-year');
      const appLogo = document.getElementById('app-school-logo');

      const schoolName = config.nombre || 'Liceo Andrés Alcázar de Tucapel';
      const rbdStr = config.rbd || '4580-1';
      const yearStr = config.anioEscolar || '2026';

      if (appTitle) appTitle.textContent = schoolName;
      if (appRbd) appRbd.textContent = `RBD: ${rbdStr}`;
      if (appYear) appYear.textContent = `Año Escolar ${yearStr}`;
      if (appLogo && config.logo) appLogo.src = config.logo;

      // Actualizar también el título del documento en la pestaña del navegador
      document.title = `Sistema de Gestión Académica - ${schoolName} (RBD: ${rbdStr})`;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return ConfigView;
});
