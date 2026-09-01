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
    const db = window.db;
    const NIVELES_DISPONIBLES = window.NIVELES_DISPONIBLES;
    const initializeDemoData = window.initializeDemoData;

    // 1. Inicializar datos de demostración si es la primera ejecución
    if (typeof initializeDemoData === 'function') {
      initializeDemoData();
    }

    // 2. Instanciar módulos de vista
    window.configView = new window.ConfigView();
    window.subjectsView = new window.SubjectsView();
    window.studentsView = new window.StudentsView();
    window.gradesView = new window.GradesView();
    window.attendanceView = new window.AttendanceView();
    window.reportGenerator = new window.ReportGenerator();
    window.pdfExporter = new window.PdfExporter();

    // 3. Inicializar selector de niveles en la vista de informes
    const reportNivelSelect = document.getElementById('report-select-nivel');
    if (reportNivelSelect && NIVELES_DISPONIBLES) {
      reportNivelSelect.innerHTML = NIVELES_DISPONIBLES.map(n => `<option value="${n}">${n}</option>`).join('');
      // Seleccionar por defecto 'Primero Básico A'
      const p1Opt = Array.from(reportNivelSelect.options).find(o => o.value === 'Primero Básico A');
      if (p1Opt) reportNivelSelect.value = 'Primero Básico A';
      
      window.reportGenerator.updateStudentDropdown();
    }

    // 4. Configurar Navegación por pestañas
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

        // Refrescar datos según la pestaña
        if (targetViewId === 'reports-view') {
          window.reportGenerator.updateStudentDropdown();
          window.reportGenerator.renderPreview();
        } else if (targetViewId === 'grades-view') {
          window.gradesView.updateSubjectDropdown();
          window.gradesView.render();
        } else if (targetViewId === 'subjects-view') {
          window.subjectsView.render();
        } else if (targetViewId === 'attendance-view') {
          window.attendanceView.render();
        } else if (targetViewId === 'students-view') {
          window.studentsView.render();
        } else if (targetViewId === 'config-view') {
          window.configView.loadData();
          window.configView.renderProfesoresJefeTable();
        }
      });
    });

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
        const backup = window.db.exportBackup();
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Respaldo_Liceo_Andres_Alcazar_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        window.showToast('Respaldo del sistema descargado en JSON', 'success');
      });
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

    // Inicializar preview de informes en segundo plano
    if (window.reportGenerator) {
      window.reportGenerator.renderPreview();
    }
  });

})(typeof self !== 'undefined' ? self : this);
