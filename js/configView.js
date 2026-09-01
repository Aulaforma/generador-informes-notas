/**
 * js/configView.js
 * Módulo de Configuración Institucional (Membrete).
 * Permite gestionar Nombre del Establecimiento, RBD, Insignia/Logo y Año Escolar.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./db.js'));
  } else {
    root.ConfigView = factory(root);
  }
})(typeof self !== 'undefined' ? self : this, function (dbModule) {

  const db = dbModule.db;

  class ConfigView {
    constructor() {
      this.form = document.getElementById('config-form');
      this.logoInput = document.getElementById('config-logo-file');
      this.logoPreview = document.getElementById('config-logo-preview');
      this.logoResetBtn = document.getElementById('config-logo-reset');
      this.currentLogoBase64 = null;
      
      this.initEvents();
      this.loadData();
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
          this.logoPreview.src = this.currentLogoBase64;
          window.showToast('Insignia restablecida a la oficial por defecto', 'info');
        });
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
        window.showToast('Insignia cargada correctamente en vista previa', 'success');
      };
      reader.readAsDataURL(file);
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
      window.showToast('Configuración institucional guardada exitosamente', 'success');
    }

    updateHeaderDisplay(config) {
      const appTitle = document.getElementById('app-school-title');
      const appRbd = document.getElementById('app-school-rbd');
      const appYear = document.getElementById('app-school-year');
      const appLogo = document.getElementById('app-school-logo');

      if (appTitle) appTitle.textContent = config.nombre || 'Liceo Andrés Alcázar de Tucapel';
      if (appRbd) appRbd.textContent = `RBD: ${config.rbd || '4580-1'}`;
      if (appYear) appYear.textContent = `Año Escolar ${config.anioEscolar || '2026'}`;
      if (appLogo && config.logo) appLogo.src = config.logo;
    }
  }

  return ConfigView;
});
