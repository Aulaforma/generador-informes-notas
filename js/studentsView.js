/**
 * js/studentsView.js
 * Módulo de Registro de Estudiantes (Matrícula).
 * Permite registrar, editar y listar estudiantes con RUT, DV, Nombres, Apellidos y Nivel.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./db.js'), require('./seedData.js'));
  } else {
    root.StudentsView = factory(root, root);
  }
})(typeof self !== 'undefined' ? self : this, function (dbModule, seedModule) {

  const db = dbModule.db;
  const NIVELES_DISPONIBLES = dbModule.NIVELES_DISPONIBLES;
  const calculateDV = seedModule.calculateDV;

  class StudentsView {
    constructor() {
      this.tableBody = document.getElementById('students-table-body');
      this.nivelFilter = document.getElementById('students-filter-nivel');
      this.searchInput = document.getElementById('students-search-input');
      this.newStudentBtn = document.getElementById('btn-new-student');
      this.modal = document.getElementById('student-modal');
      this.studentForm = document.getElementById('student-form');
      this.modalTitle = document.getElementById('student-modal-title');
      this.modalCloseBtn = document.getElementById('modal-close-btn');
      this.modalCancelBtn = document.getElementById('modal-cancel-btn');
      this.rutInput = document.getElementById('student-rut');
      this.dvInput = document.getElementById('student-dv');

      this.currentEditId = null;

      this.init();
    }

    init() {
      this.populateNivelesDropdowns();
      this.initEvents();
      this.render();

      window.addEventListener('students_updated', () => {
        this.render();
      });
    }

    populateNivelesDropdowns() {
      // Dropdown de filtro
      if (this.nivelFilter) {
        this.nivelFilter.innerHTML = '<option value="">Todos los Niveles</option>' +
          NIVELES_DISPONIBLES.map(n => `<option value="${n}">${n}</option>`).join('');
      }

      // Dropdown del formulario modal
      const formNivel = document.getElementById('student-nivel');
      if (formNivel) {
        formNivel.innerHTML = '<option value="" disabled selected>Seleccione un nivel...</option>' +
          NIVELES_DISPONIBLES.map(n => `<option value="${n}">${n}</option>`).join('');
      }
    }

    initEvents() {
      if (this.nivelFilter) {
        this.nivelFilter.addEventListener('change', () => this.render());
      }

      if (this.searchInput) {
        this.searchInput.addEventListener('input', () => this.render());
      }

      if (this.newStudentBtn) {
        this.newStudentBtn.addEventListener('click', () => this.openModal());
      }

      if (this.modalCloseBtn) {
        this.modalCloseBtn.addEventListener('click', () => this.closeModal());
      }

      if (this.modalCancelBtn) {
        this.modalCancelBtn.addEventListener('click', () => this.closeModal());
      }

      if (this.studentForm) {
        this.studentForm.addEventListener('submit', (e) => this.handleSave(e));
      }

      // Auto-cálculo sugerido del Dígito Verificador al tipear RUT
      if (this.rutInput && this.dvInput) {
        this.rutInput.addEventListener('input', (e) => {
          const cleanRut = e.target.value.replace(/[^0-9]/g, '');
          e.target.value = cleanRut;
          if (cleanRut.length >= 7) {
            this.dvInput.value = calculateDV(cleanRut);
          }
        });

        this.dvInput.addEventListener('input', (e) => {
          let val = e.target.value.toUpperCase();
          if (val !== 'K' && (val < '0' || val > '9')) {
            e.target.value = '';
          } else {
            e.target.value = val;
          }
        });
      }

      // Cerrar modal al hacer clic en el fondo
      if (this.modal) {
        this.modal.addEventListener('click', (e) => {
          if (e.target === this.modal) this.closeModal();
        });
      }
    }

    render() {
      const filterNivel = this.nivelFilter ? this.nivelFilter.value : '';
      const query = this.searchInput ? this.searchInput.value.trim().toLowerCase() : '';

      let students = db.getStudents(filterNivel || null);

      if (query) {
        students = students.filter(s => {
          const fullName = `${s.apellidoPaterno} ${s.apellidoMaterno} ${s.nombres}`.toLowerCase();
          const rutStr = `${s.rut}-${s.dv}`.toLowerCase();
          return fullName.includes(query) || rutStr.includes(query);
        });
      }

      // Actualizar contadores
      const countEl = document.getElementById('students-count-badge');
      if (countEl) countEl.textContent = `${students.length} matriculados`;

      if (!this.tableBody) return;

      if (students.length === 0) {
        this.tableBody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 2.5rem; color: #64748b;">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">👨‍🎓</div>
              <strong>No se encontraron estudiantes matriculados</strong>
              <p style="font-size: 0.85rem; margin-top: 0.25rem;">Añada un nuevo estudiante con el botón superior o cambie los filtros.</p>
            </td>
          </tr>
        `;
        return;
      }

      this.tableBody.innerHTML = students.map((std, index) => {
        const formattedRut = this.formatRutDisplay(std.rut, std.dv);
        return `
          <tr>
            <td style="text-align: center; color: #64748b; font-weight: 600;">${index + 1}</td>
            <td><strong style="color: #0f172a; font-family: monospace; font-size: 0.95rem;">${formattedRut}</strong></td>
            <td><strong>${escapeHtml(std.apellidoPaterno)}</strong></td>
            <td>${escapeHtml(std.apellidoMaterno)}</td>
            <td>${escapeHtml(std.nombres)}</td>
            <td><span class="header-badge-tag" style="background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;">${escapeHtml(std.nivel)}</span></td>
            <td style="text-align: center; white-space: nowrap;">
              <button class="btn btn-secondary btn-sm" onclick="window.studentsView.openModal('${std.id}')" title="Editar estudiante">
                ✏️ Editar
              </button>
              <button class="btn btn-danger btn-sm" onclick="window.studentsView.confirmDelete('${std.id}')" title="Eliminar matrícula">
                🗑️
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    formatRutDisplay(rut, dv) {
      if (!rut) return '-';
      const sRut = String(rut);
      let result = '';
      let j = 0;
      for (let i = sRut.length - 1; i >= 0; i--) {
        result = sRut.charAt(i) + result;
        j++;
        if (j === 3 && i > 0) {
          result = '.' + result;
          j = 0;
        }
      }
      return `${result}-${dv || ''}`;
    }

    openModal(studentId = null) {
      this.currentEditId = studentId;
      this.studentForm.reset();

      if (studentId) {
        this.modalTitle.textContent = 'Editar Estudiante Matriculado';
        const student = db.getStudentById(studentId);
        if (student) {
          document.getElementById('student-rut').value = student.rut || '';
          document.getElementById('student-dv').value = student.dv || '';
          document.getElementById('student-nombres').value = student.nombres || '';
          document.getElementById('student-ape-paterno').value = student.apellidoPaterno || '';
          document.getElementById('student-ape-materno').value = student.apellidoMaterno || '';
          document.getElementById('student-nivel').value = student.nivel || '';
        }
      } else {
        this.modalTitle.textContent = 'Nuevo Registro de Estudiante';
        const currentNivel = this.nivelFilter ? this.nivelFilter.value : '';
        if (currentNivel) {
          document.getElementById('student-nivel').value = currentNivel;
        }
      }

      this.modal.classList.add('active');
    }

    closeModal() {
      this.modal.classList.remove('active');
      this.currentEditId = null;
    }

    handleSave(e) {
      e.preventDefault();

      const rutNum = parseInt(document.getElementById('student-rut').value.trim(), 10);
      const dv = document.getElementById('student-dv').value.trim().toUpperCase();
      const nombres = document.getElementById('student-nombres').value.trim();
      const apellidoPaterno = document.getElementById('student-ape-paterno').value.trim();
      const apellidoMaterno = document.getElementById('student-ape-materno').value.trim();
      const nivel = document.getElementById('student-nivel').value;

      if (!rutNum || isNaN(rutNum)) {
        window.showToast('El RUT debe ser un número válido', 'danger');
        return;
      }
      if (!dv) {
        window.showToast('El Dígito Verificador es obligatorio', 'danger');
        return;
      }
      if (!nombres || !apellidoPaterno || !apellidoMaterno) {
        window.showToast('Debe ingresar Nombres, Apellido Paterno y Apellido Materno', 'danger');
        return;
      }
      if (!nivel) {
        window.showToast('Debe seleccionar un Nivel de la lista', 'danger');
        return;
      }

      const studentData = {
        id: this.currentEditId || undefined,
        rut: rutNum,
        dv: dv,
        nombres,
        apellidoPaterno,
        apellidoMaterno,
        nivel
      };

      db.saveStudent(studentData);
      this.closeModal();
      window.showToast(this.currentEditId ? 'Estudiante actualizado exitosamente' : 'Estudiante matriculado con éxito', 'success');
    }

    confirmDelete(studentId) {
      const student = db.getStudentById(studentId);
      if (!student) return;

      const nombreCompleto = `${student.apellidoPaterno} ${student.apellidoMaterno}, ${student.nombres}`;
      if (confirm(`¿Está seguro de eliminar de la matrícula al estudiante:\n"${nombreCompleto}"?\n\nEsta acción también eliminará sus calificaciones y registro de asistencia.`)) {
        db.deleteStudent(studentId);
        window.showToast(`Estudiante ${nombreCompleto} eliminado`, 'warning');
      }
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

  return StudentsView;
});
