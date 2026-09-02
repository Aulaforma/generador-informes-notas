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
