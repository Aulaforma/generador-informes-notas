/**
 * js/studentsView.js
 * Módulo de Registro de Estudiantes (Matrícula) y Carga Masiva (Excel/CSV).
 * Permite registrar, editar, listar e importar masivamente estudiantes desde planillas.
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
      // Elementos de la vista principal
      this.tableBody = document.getElementById('students-table-body');
      this.nivelFilter = document.getElementById('students-filter-nivel');
      this.searchInput = document.getElementById('students-search-input');
      this.newStudentBtn = document.getElementById('btn-new-student');
      
      // Modal individual
      this.modal = document.getElementById('student-modal');
      this.studentForm = document.getElementById('student-form');
      this.modalTitle = document.getElementById('student-modal-title');
      this.modalCloseBtn = document.getElementById('modal-close-btn');
      this.modalCancelBtn = document.getElementById('modal-cancel-btn');
      this.rutInput = document.getElementById('student-rut');
      this.dvInput = document.getElementById('student-dv');

      // Modal de Carga Masiva (Excel / CSV)
      this.btnOpenBulkImport = document.getElementById('btn-open-bulk-import');
      this.btnDownloadTemplate = document.getElementById('btn-download-excel-template');
      this.btnDownloadModalTemplate = document.getElementById('btn-download-modal-template');
      this.bulkModal = document.getElementById('bulk-import-modal');
      this.bulkModalCloseBtn = document.getElementById('bulk-modal-close-btn');
      this.bulkModalCancelBtn = document.getElementById('bulk-modal-cancel-btn');
      this.excelDropzone = document.getElementById('excel-dropzone');
      this.excelFileInput = document.getElementById('excel-file-input');
      this.bulkPreviewSection = document.getElementById('bulk-preview-section');
      this.importPreviewTableBody = document.getElementById('import-preview-table-body');
      this.importTotalCount = document.getElementById('import-total-count');
      this.importValidCount = document.getElementById('import-valid-count');
      this.importErrorCount = document.getElementById('import-error-count');
      this.importModeSelect = document.getElementById('import-mode-select');
      this.btnExecuteImport = document.getElementById('btn-execute-import');

      this.currentEditId = null;
      this.parsedStudentsToImport = [];

      this.init();
    }

    init() {
      this.populateNivelesDropdowns();
      this.initEvents();
      this.render();

      window.addEventListener('students_updated', () => {
        this.render();
      });

      window.addEventListener('courses_updated', () => {
        this.populateNivelesDropdowns();
        this.render();
      });
    }

    populateNivelesDropdowns() {
      const courseNames = db.getCourseNames();

      if (this.nivelFilter) {
        this.nivelFilter.innerHTML = '<option value="">Todos los Niveles</option>' +
          courseNames.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
      }

      const formNivel = document.getElementById('student-nivel');
      if (formNivel) {
        if (courseNames.length === 0) {
          formNivel.innerHTML = '<option value="" disabled selected>No hay cursos creados (vaya a Cursos y Asignaturas)</option>';
        } else {
          formNivel.innerHTML = '<option value="" disabled selected>Seleccione un nivel...</option>' +
            courseNames.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
        }
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

      if (this.modal) {
        this.modal.addEventListener('click', (e) => {
          if (e.target === this.modal) this.closeModal();
        });
      }

      // EVENTOS DE CARGA MASIVA EXCEL
      if (this.btnOpenBulkImport) {
        this.btnOpenBulkImport.addEventListener('click', () => this.openBulkModal());
      }

      if (this.btnDownloadTemplate) {
        this.btnDownloadTemplate.addEventListener('click', () => this.downloadExcelTemplate());
      }

      if (this.btnDownloadModalTemplate) {
        this.btnDownloadModalTemplate.addEventListener('click', () => this.downloadExcelTemplate());
      }

      if (this.bulkModalCloseBtn) {
        this.bulkModalCloseBtn.addEventListener('click', () => this.closeBulkModal());
      }

      if (this.bulkModalCancelBtn) {
        this.bulkModalCancelBtn.addEventListener('click', () => this.closeBulkModal());
      }

      if (this.bulkModal) {
        this.bulkModal.addEventListener('click', (e) => {
          if (e.target === this.bulkModal) this.closeBulkModal();
        });
      }

      // Drag and drop en dropzone
      if (this.excelDropzone && this.excelFileInput) {
        this.excelDropzone.addEventListener('click', () => {
          this.excelFileInput.click();
        });

        this.excelFileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) this.processExcelFile(file);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
          this.excelDropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.excelDropzone.classList.add('dragover');
          });
        });

        ['dragleave', 'drop'].forEach(eventName => {
          this.excelDropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.excelDropzone.classList.remove('dragover');
          });
        });

        this.excelDropzone.addEventListener('drop', (e) => {
          const dt = e.dataTransfer;
          const file = dt.files[0];
          if (file) this.processExcelFile(file);
        });
      }

      if (this.btnExecuteImport) {
        this.btnExecuteImport.addEventListener('click', () => this.executeImport());
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

      const countEl = document.getElementById('students-count-badge');
      if (countEl) countEl.textContent = `${students.length} matriculados`;

      if (!this.tableBody) return;

      if (students.length === 0) {
        this.tableBody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 2.5rem; color: #64748b;">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">👨‍🎓</div>
              <strong>No se encontraron estudiantes matriculados</strong>
              <p style="font-size: 0.85rem; margin-top: 0.25rem;">Use el botón "➕ Matricular Nuevo" o "📥 Carga Masiva (Excel / CSV)" para agregar alumnos.</p>
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

    // --- MODAL INDIVIDUAL ---
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

    // --- CARGA MASIVA DE ESTUDIANTES (EXCEL / CSV) ---
    openBulkModal() {
      this.parsedStudentsToImport = [];
      if (this.bulkPreviewSection) this.bulkPreviewSection.style.display = 'none';
      if (this.btnExecuteImport) this.btnExecuteImport.disabled = true;
      if (this.excelFileInput) this.excelFileInput.value = '';
      if (this.bulkModal) this.bulkModal.classList.add('active');
    }

    closeBulkModal() {
      if (this.bulkModal) this.bulkModal.classList.remove('active');
      this.parsedStudentsToImport = [];
    }

    downloadExcelTemplate() {
      if (window.XLSX) {
        // Generar archivo .xlsx enriquecido con dos hojas
        const wb = window.XLSX.utils.book_new();

        // Hoja 1: Ejemplo de Estudiantes
        const sampleData = [
          {
            'RUT': 24518293,
            'DV': 'K',
            'Apellido Paterno': 'Álvarez',
            'Apellido Materno': 'Muñoz',
            'Nombres': 'Lucas Mateo',
            'Nivel': 'Primero Básico A'
          },
          {
            'RUT': 24781034,
            'DV': '4',
            'Apellido Paterno': 'Barra',
            'Apellido Materno': 'Castillo',
            'Nombres': 'Sofía Valentina',
            'Nivel': 'Primero Básico A'
          },
          {
            'RUT': 21980124,
            'DV': '7',
            'Apellido Paterno': 'Aravena',
            'Apellido Materno': 'Poblete',
            'Nombres': 'Alejandro David',
            'Nivel': 'Primero Medio A'
          }
        ];

        const wsEstudiantes = window.XLSX.utils.json_to_sheet(sampleData);
        window.XLSX.utils.book_append_sheet(wb, wsEstudiantes, 'Estudiantes');

        // Hoja 2: Niveles Oficiales Disponibles
        const nivelesData = NIVELES_DISPONIBLES.map((n, i) => ({
          'N°': i + 1,
          'Nivel Oficial Permitido': n
        }));
        const wsNiveles = window.XLSX.utils.json_to_sheet(nivelesData);
        window.XLSX.utils.book_append_sheet(wb, wsNiveles, 'Niveles_Validos');

        window.XLSX.writeFile(wb, 'Plantilla_Carga_Estudiantes_Liceo.xlsx');
        window.showToast('Plantilla Excel descargada exitosamente', 'success');
      } else {
        // Fallback CSV
        const csvContent = "RUT,DV,Apellido Paterno,Apellido Materno,Nombres,Nivel\n" +
          "24518293,K,Álvarez,Muñoz,Lucas Mateo,Primero Básico A\n" +
          "24781034,4,Barra,Castillo,Sofía Valentina,Primero Básico A\n" +
          "21980124,7,Aravena,Poblete,Alejandro David,Primero Medio A\n";
        
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Plantilla_Carga_Estudiantes_Liceo.csv';
        a.click();
        URL.revokeObjectURL(url);
        window.showToast('Plantilla CSV descargada', 'success');
      }
    }

    processExcelFile(file) {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          
          if (!window.XLSX) {
            window.showToast('La biblioteca de procesamiento Excel no está disponible', 'danger');
            return;
          }

          const workbook = window.XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Convertir a JSON
          const rawRows = window.XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          if (!rawRows || rawRows.length === 0) {
            window.showToast('La planilla está vacía o no contiene filas con datos', 'warning');
            return;
          }

          this.parseAndPreviewRows(rawRows);
        } catch (err) {
          console.error('Error al procesar archivo Excel:', err);
          window.showToast('No se pudo leer el archivo Excel. Asegúrese de que sea un .xlsx o .csv válido.', 'danger');
        }
      };

      reader.readAsArrayBuffer(file);
    }

    normalizeKey(k) {
      return String(k || '')
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
    }

    matchNivel(rawNivel) {
      if (!rawNivel) return null;
      const clean = String(rawNivel).trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      // 1. Coincidencia exacta insensible a tildes/mayúsculas
      for (const nivel of NIVELES_DISPONIBLES) {
        const nClean = nivel.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (clean === nClean) return nivel;
      }

      // 2. Coincidencias de abreviaciones comunes:
      // "1 basico a" -> "Primero Básico A"
      const mapping = [
        { patterns: ['transicion 1', 'prekinder', 'pre-kinder', 'pk'], target: 'Transición 1' },
        { patterns: ['transicion 2', 'kinder', 'k'], target: 'Transición 2' },
        { patterns: ['1 basico a', '1° basico a', '1ro basico a', '1ba'], target: 'Primero Básico A' },
        { patterns: ['1 basico b', '1° basico b', '1ro basico b', '1bb'], target: 'Primero Básico B' },
        { patterns: ['2 basico a', '2° basico a', '2do basico a', '2ba'], target: 'Segundo Básico A' },
        { patterns: ['2 basico b', '2° basico b', '2do basico b', '2bb'], target: 'Segundo Básico B' },
        { patterns: ['3 basico a', '3° basico a', '3ro basico a', '3ba'], target: 'Tercero Básico A' },
        { patterns: ['3 basico b', '3° basico b', '3ro basico b', '3bb'], target: 'Tercero Básico B' },
        { patterns: ['4 basico a', '4° basico a', '4to basico a', '4ba'], target: 'Cuarto Básico A' },
        { patterns: ['4 basico b', '4° basico b', '4to basico b', '4bb'], target: 'Cuarto Básico B' },
        { patterns: ['5 basico a', '5° basico a', '5to basico a', '5ba'], target: 'Quinto Básico A' },
        { patterns: ['5 basico b', '5° basico b', '5to basico b', '5bb'], target: 'Quinto Básico B' },
        { patterns: ['6 basico a', '6° basico a', '6to basico a', '6ba'], target: 'Sexto Básico A' },
        { patterns: ['6 basico b', '6° basico b', '6to basico b', '6bb'], target: 'Sexto Básico B' },
        { patterns: ['7 basico a', '7° basico a', '7mo basico a', '7ba'], target: 'Séptimo Básico A' },
        { patterns: ['7 basico b', '7° basico b', '7mo basico b', '7bb'], target: 'Séptimo Básico B' },
        { patterns: ['8 basico a', '8° basico a', '8vo basico a', '8ba'], target: 'Octavo Básico A' },
        { patterns: ['8 basico b', '8° basico b', '8vo basico b', '8bb'], target: 'Octavo Básico B' },
        { patterns: ['1 medio a', '1° medio a', '1ro medio a', '1ma'], target: 'Primero Medio A' },
        { patterns: ['1 medio b', '1° medio b', '1ro medio b', '1mb'], target: 'Primero Medio B' },
        { patterns: ['2 medio a', '2° medio a', '2do medio a', '2ma'], target: 'Segundo Medio A' },
        { patterns: ['2 medio b', '2° medio b', '2do medio b', '2mb'], target: 'Segundo Medio B' },
        { patterns: ['3 medio a', '3° medio a', '3ro medio a', '3ma'], target: 'Tercero Medio A' },
        { patterns: ['3 medio b', '3° medio b', '3ro medio b', '3mb'], target: 'Tercero Medio B' },
        { patterns: ['4 medio a', '4° medio a', '4to medio a', '4ma'], target: 'Cuarto Medio A' },
        { patterns: ['4 medio b', '4° medio b', '4to medio b', '4mb'], target: 'Cuarto Medio B' },
        { patterns: ['laboral', 'curso laboral'], target: 'Curso Laboral' }
      ];

      for (const m of mapping) {
        for (const p of m.patterns) {
          if (clean.includes(p)) return m.target;
        }
      }

      return null;
    }

    parseAndPreviewRows(rawRows) {
      this.parsedStudentsToImport = [];

      rawRows.forEach((row, idx) => {
        // Mapeo inteligente de encabezados de columna
        let rutRaw = '';
        let dvRaw = '';
        let apePaterno = '';
        let apeMaterno = '';
        let nombres = '';
        let nivelRaw = '';

        for (const [key, val] of Object.entries(row)) {
          const normKey = this.normalizeKey(key);
          const strVal = String(val).trim();

          if (['rut', 'run', 'cedula', 'identificacion'].includes(normKey)) {
            rutRaw = strVal;
          } else if (['dv', 'digito', 'digitoverificador', 'dvrun'].includes(normKey)) {
            dvRaw = strVal;
          } else if (['apellidopaterno', 'paterno', 'apaterno', 'primerapellido'].includes(normKey)) {
            apePaterno = strVal;
          } else if (['apellidomaterno', 'materno', 'amaterno', 'segundoapellido'].includes(normKey)) {
            apeMaterno = strVal;
          } else if (['nombres', 'nombre', 'primernombre'].includes(normKey)) {
            nombres = strVal;
          } else if (['nivel', 'curso', 'grado'].includes(normKey)) {
            nivelRaw = strVal;
          } else if (['apellidos'].includes(normKey) && !apePaterno) {
            // Si viene una sola columna de apellidos
            const parts = strVal.split(/\s+/);
            apePaterno = parts[0] || '';
            apeMaterno = parts.slice(1).join(' ') || '';
          } else if (['nombrecompleto', 'alumno', 'estudiante'].includes(normKey) && !nombres) {
            // Si viene todo el nombre junto
            const parts = strVal.split(/\s+/);
            if (parts.length >= 3) {
              apePaterno = parts[0];
              apeMaterno = parts[1];
              nombres = parts.slice(2).join(' ');
            } else {
              nombres = strVal;
            }
          }
        }

        // Extracción de RUT y DV si vienen juntos (ej. 24.518.293-K o 24518293-K)
        let cleanRutNum = null;
        let finalDv = '';

        if (rutRaw) {
          const cleanStr = rutRaw.replace(/\./g, '').replace(/\s+/g, '');
          if (cleanStr.includes('-')) {
            const parts = cleanStr.split('-');
            cleanRutNum = parseInt(parts[0].replace(/[^0-9]/g, ''), 10);
            finalDv = parts[1].trim().toUpperCase();
          } else {
            // Solo dígitos
            const digits = cleanStr.replace(/[^0-9]/g, '');
            if (digits.length >= 7) {
              cleanRutNum = parseInt(digits, 10);
              finalDv = dvRaw ? dvRaw.trim().toUpperCase() : calculateDV(cleanRutNum);
            }
          }
        }

        if (!finalDv && cleanRutNum) {
          finalDv = calculateDV(cleanRutNum);
        }

        const matchedNivel = this.matchNivel(nivelRaw);

        // Validación de fila
        const errors = [];
        if (!cleanRutNum || isNaN(cleanRutNum)) errors.push('RUT no numérico o vacío');
        if (!finalDv) errors.push('Falta Dígito Verificador');
        if (!nombres) errors.push('Falta Nombre');
        if (!apePaterno) errors.push('Falta Ap. Paterno');
        if (!apeMaterno) errors.push('Falta Ap. Materno');
        if (!matchedNivel) errors.push(`Nivel "${nivelRaw || 'vacío'}" no reconocido`);

        const isValid = errors.length === 0;

        this.parsedStudentsToImport.push({
          index: idx + 1,
          rut: cleanRutNum,
          dv: finalDv,
          apellidoPaterno: apePaterno,
          apellidoMaterno: apeMaterno,
          nombres: nombres,
          nivel: matchedNivel || nivelRaw,
          rawNivel: nivelRaw,
          isValid,
          errors
        });
      });

      this.renderBulkPreview();
    }

    renderBulkPreview() {
      if (!this.bulkPreviewSection || !this.importPreviewTableBody) return;

      const total = this.parsedStudentsToImport.length;
      const valid = this.parsedStudentsToImport.filter(s => s.isValid).length;
      const invalid = total - valid;

      if (this.importTotalCount) this.importTotalCount.textContent = total;
      if (this.importValidCount) this.importValidCount.textContent = valid;
      if (this.importErrorCount) this.importErrorCount.textContent = invalid;

      // Renderizar filas de vista previa
      this.importPreviewTableBody.innerHTML = this.parsedStudentsToImport.slice(0, 100).map(s => {
        const rutStr = s.rut ? `${s.rut}-${s.dv}` : '-';
        const badge = s.isValid 
          ? `<span class="status-badge valid">Listo</span>`
          : `<span class="status-badge error" title="${s.errors.join(', ')}">Error</span>`;

        return `
          <tr style="${!s.isValid ? 'background-color: #fff1f2;' : ''}">
            <td style="color: #64748b; font-size: 0.8rem;">${s.index}</td>
            <td>${badge}</td>
            <td><strong style="font-family: monospace;">${rutStr}</strong></td>
            <td>${escapeHtml(s.apellidoPaterno)}</td>
            <td>${escapeHtml(s.apellidoMaterno)}</td>
            <td>${escapeHtml(s.nombres)}</td>
            <td>
              <span style="${!s.isValid && !this.matchNivel(s.rawNivel) ? 'color: #dc2626; font-weight: 700;' : ''}">
                ${escapeHtml(s.nivel)}
              </span>
            </td>
          </tr>
        `;
      }).join('');

      this.bulkPreviewSection.style.display = 'block';

      if (this.btnExecuteImport) {
        this.btnExecuteImport.disabled = valid === 0;
        this.btnExecuteImport.textContent = `✅ Confirmar e Importar (${valid} estudiantes válidos)`;
      }
    }

    executeImport() {
      const validStudents = this.parsedStudentsToImport.filter(s => s.isValid);

      if (validStudents.length === 0) {
        window.showToast('No hay estudiantes válidos para importar', 'danger');
        return;
      }

      const mode = this.importModeSelect ? this.importModeSelect.value : 'merge';

      // Si la modalidad es "replace_course", eliminamos primero los alumnos de los cursos presentes
      if (mode === 'replace_course') {
        const cursosAfectados = new Set(validStudents.map(s => s.nivel));
        cursosAfectados.forEach(nivel => {
          const currentInCourse = db.getStudents(nivel);
          currentInCourse.forEach(std => db.deleteStudent(std.id));
        });
      }

      let importedCount = 0;
      let updatedCount = 0;

      validStudents.forEach(st => {
        // Comprobar si ya existe un estudiante con ese RUT
        const allStudents = db.getStudents();
        const existing = allStudents.find(s => Number(s.rut) === Number(st.rut));

        const studentRecord = {
          id: existing ? existing.id : undefined,
          rut: st.rut,
          dv: st.dv,
          nombres: st.nombres,
          apellidoPaterno: st.apellidoPaterno,
          apellidoMaterno: st.apellidoMaterno,
          nivel: st.nivel
        };

        const saved = db.saveStudent(studentRecord);

        // Asegurar que tenga registro de asistencia base (90 días trabajados por defecto)
        const currentAtt = db.getAttendanceByStudent(saved.id);
        if (!currentAtt) {
          db.saveStudentAttendance(saved.id, st.nivel, 90, 90);
        }

        if (existing) {
          updatedCount++;
        } else {
          importedCount++;
        }
      });

      this.closeBulkModal();
      this.render();

      window.showToast(`¡Carga masiva completada! ${importedCount} nuevos matriculados, ${updatedCount} actualizados.`, 'success');
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
