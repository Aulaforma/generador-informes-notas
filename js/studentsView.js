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
      this.bulkImportNotice = document.getElementById('bulk-import-notice');

      this.currentEditId = null;
      this.parsedStudentsToImport = [];

      this.init();
    }

    init() {
      this.populateNivelesDropdowns();
      this.initEvents();
      this.render();

      let studentsDebounceTimer = null;
      const debouncedRender = () => {
        if (studentsDebounceTimer) clearTimeout(studentsDebounceTimer);
        studentsDebounceTimer = setTimeout(() => {
          this.render();
        }, 50);
      };

      window.addEventListener('students_updated', () => {
        debouncedRender();
      });

      window.addEventListener('courses_updated', () => {
        this.populateNivelesDropdowns();
        debouncedRender();
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
      if (this.bulkImportNotice) {
        this.bulkImportNotice.style.display = 'none';
        this.bulkImportNotice.innerHTML = '';
      }
      if (this.btnExecuteImport) this.btnExecuteImport.disabled = true;
      if (this.excelFileInput) this.excelFileInput.value = '';
      if (this.bulkModal) this.bulkModal.classList.add('active');
    }

    closeBulkModal() {
      if (this.bulkModal) this.bulkModal.classList.remove('active');
      if (this.bulkImportNotice) {
        this.bulkImportNotice.style.display = 'none';
        this.bulkImportNotice.innerHTML = '';
      }
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
          const rawBuffer = e.target.result;
          const bytes = new Uint8Array(rawBuffer);

          let textPreview = '';
          try {
            textPreview = new TextDecoder('iso-8859-1').decode(bytes.slice(0, 4096));
          } catch (ex) {
            textPreview = '';
          }

          // 1. Detección de archivos de "Marco Web" (Frameset) de Excel / SIGE (como nomina_excel (2).xls)
          if (
            textPreview.includes('<frameset') || 
            textPreview.includes('Excel Workbook Frameset') || 
            (textPreview.includes('<frame ') && textPreview.includes('sheet001'))
          ) {
            const companionMatch = textPreview.match(/src=["']([^"']*sheet001[^"']*)["']/i);
            const sheetPath = companionMatch ? companionMatch[1] : 'sheet001.htm';

            if (this.bulkImportNotice) {
              this.bulkImportNotice.style.display = 'block';
              this.bulkImportNotice.style.background = '#fffbeb';
              this.bulkImportNotice.style.border = '1.5px solid #f59e0b';
              this.bulkImportNotice.style.color = '#78350f';
              this.bulkImportNotice.innerHTML = `
                <div style="font-weight: 800; font-size: 0.95rem; margin-bottom: 0.35rem; color: #b45309;">
                  ⚠️ Nómina Exportada como Marco Web por el SIGE
                </div>
                <p style="margin: 0 0 0.5rem 0; font-size: 0.85rem;">
                  El archivo <code>${escapeHtml(file.name)}</code> es un marco web de Excel que no contiene los datos directamente.
                </p>
                <div style="background: #ffffff; padding: 0.6rem 0.85rem; border-radius: 5px; border: 1px solid #fde68a; font-size: 0.85rem;">
                  <strong>💡 Opciones para continuar de inmediato:</strong>
                  <ul style="margin: 0.3rem 0 0 1.1rem; padding: 0;">
                    <li>Seleccione directamente el archivo <strong><code>sheet001.htm</code></strong> (en la carpeta descargada del SIGE).</li>
                    <li>O seleccione el archivo <strong><code>nomina_oficial_alumnos.xlsx</code></strong> que ya fue convertido a Excel estándar.</li>
                  </ul>
                </div>
              `;
            }
            window.showToast('El archivo .xls es un marco web. Seleccione sheet001.htm o el archivo .xlsx', 'warning', 6000);
            return;
          }

          let sheetMatrix = [];

          // 2. Detección y parseo directo de HTML (.htm, .html o archivos .xls que son HTML de SIGE)
          const isHtml = file.name.endsWith('.htm') || file.name.endsWith('.html') || textPreview.includes('<table') || textPreview.includes('<html');

          if (isHtml) {
            try {
              // Decodificar con ISO-8859-1 para caracteres chilenos (tildes, eñes)
              const fullHtml = new TextDecoder('iso-8859-1').decode(bytes);
              const parser = new DOMParser();
              const doc = parser.parseFromString(fullHtml, 'text/html');
              const table = doc.querySelector('table');

              if (table) {
                const trElements = Array.from(table.querySelectorAll('tr'));
                sheetMatrix = trElements.map(tr => {
                  return Array.from(tr.querySelectorAll('th, td')).map(cell => cell.textContent.replace(/\s+/g, ' ').trim());
                });
              }
            } catch (htmlErr) {
              console.warn('Fallo parseo HTML DOM, intentando con SheetJS:', htmlErr);
            }
          }

          // 3. Si no fue procesado como tabla HTML, usar SheetJS (XLSX, XLS binario BIFF8, CSV)
          if (!sheetMatrix || sheetMatrix.length === 0) {
            if (!window.XLSX) {
              window.showToast('La biblioteca de procesamiento Excel no está disponible', 'danger');
              return;
            }

            const workbook = window.XLSX.read(bytes, { type: 'array' });
            if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
              window.showToast('El archivo no contiene hojas de cálculo legibles', 'warning');
              return;
            }

            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            sheetMatrix = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
          }

          if (!sheetMatrix || sheetMatrix.length === 0) {
            window.showToast('La planilla está vacía o no contiene filas con datos', 'warning');
            return;
          }

          // Detectar dinámicamente qué fila contiene los encabezados (soporta archivos SIGE con membretes iniciales)
          let headerRowIdx = 0;
          for (let r = 0; r < Math.min(sheetMatrix.length, 15); r++) {
            const rowArr = sheetMatrix[r];
            if (!Array.isArray(rowArr)) continue;
            const rowStr = rowArr.map(c => this.normalizeKey(c)).join(' ');
            if (
              (rowStr.includes('run') || rowStr.includes('rut')) &&
              (rowStr.includes('nombre') || rowStr.includes('paterno') || rowStr.includes('grado'))
            ) {
              headerRowIdx = r;
              break;
            }
          }

          const headerRow = sheetMatrix[headerRowIdx].map(c => String(c || '').trim());
          const rawRows = [];

          for (let r = headerRowIdx + 1; r < sheetMatrix.length; r++) {
            const rowArr = sheetMatrix[r];
            if (!Array.isArray(rowArr)) continue;
            // Omitir filas vacías
            if (rowArr.every(val => String(val || '').trim() === '')) continue;

            const rowObj = {};
            headerRow.forEach((colName, cIdx) => {
              if (colName) {
                rowObj[colName] = rowArr[cIdx] !== undefined ? rowArr[cIdx] : '';
              }
            });
            rawRows.push(rowObj);
          }

          if (rawRows.length === 0) {
            window.showToast('No se detectaron registros de estudiantes debajo de los encabezados', 'warning');
            return;
          }

          this.parseAndPreviewRows(rawRows);
        } catch (err) {
          console.error('Error al procesar archivo Excel:', err);
          window.showToast('No se pudo leer el archivo Excel (.xls / .xlsx). Verifique el formato.', 'danger');
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

    matchNivel(rawNivel, existingCourses = null) {
      if (!rawNivel) return null;
      const clean = String(rawNivel).trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      // 0. Si ya coincide exactamente con un curso creado en el sistema
      const courses = existingCourses || db.getCourses();
      for (const c of courses) {
        const cClean = c.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (clean === cClean) return c.nombre;
      }

      // Detectar letra del curso (A, B, C...)
      let letra = '';
      const matchLetra = clean.match(/\b([a-z])\b/i) || clean.match(/\s+([a-z])$/i);
      if (matchLetra) {
        letra = matchLetra[1].toUpperCase();
      }

      // 1. Transición 1 / Pre-kinder
      if (clean.includes('1er nivel de transicion') || clean.includes('primer nivel de transicion') || clean.includes('transicion 1') || clean.includes('prekinder') || clean.includes('pre-kinder') || clean.includes('pk')) {
        const optionWithLetter = `Transición 1 ${letra || 'A'}`;
        const optionSimple = 'Transición 1';
        if (courses.some(c => c.nombre === optionWithLetter)) return optionWithLetter;
        if (courses.some(c => c.nombre === optionSimple)) return optionSimple;
        return letra && letra !== 'A' ? `Transición 1 ${letra}` : 'Transición 1';
      }

      // 2. Transición 2 / Kinder
      if (clean.includes('2 nivel de transicion') || clean.includes('segundo nivel de transicion') || clean.includes('transicion 2') || clean.includes('kinder') || clean.includes(' k')) {
        const optionWithLetter = `Transición 2 ${letra || 'A'}`;
        const optionSimple = 'Transición 2';
        if (courses.some(c => c.nombre === optionWithLetter)) return optionWithLetter;
        if (courses.some(c => c.nombre === optionSimple)) return optionSimple;
        return letra && letra !== 'A' ? `Transición 2 ${letra}` : 'Transición 2';
      }

      // 3. Enseñanza Básica (1° a 8°)
      const basicas = [
        { name: 'Primero Básico', words: ['1 basico', '1ro basico', 'primero basico', '1ba', '1bb'] },
        { name: 'Segundo Básico', words: ['2 basico', '2do basico', 'segundo basico', '2ba', '2bb'] },
        { name: 'Tercero Básico', words: ['3 basico', '3ro basico', 'tercero basico', '3ba', '3bb'] },
        { name: 'Cuarto Básico', words: ['4 basico', '4to basico', 'cuarto basico', '4ba', '4bb'] },
        { name: 'Quinto Básico', words: ['5 basico', '5to basico', 'quinto basico', '5ba', '5bb'] },
        { name: 'Sexto Básico', words: ['6 basico', '6to basico', 'sexto basico', '6ba', '6bb'] },
        { name: 'Séptimo Básico', words: ['7 basico', '7mo basico', 'septimo basico', '7ba', '7bb'] },
        { name: 'Octavo Básico', words: ['8 basico', '8vo basico', 'octavo basico', '8ba', '8bb'] }
      ];

      for (const b of basicas) {
        if (b.words.some(w => clean.includes(w))) {
          const l = letra || (clean.includes(' b') || clean.endsWith('b') ? 'B' : 'A');
          return `${b.name} ${l}`;
        }
      }

      // 4. Enseñanza Media (1° a 4°)
      const medias = [
        { name: 'Primero Medio', words: ['1 medio', '1ro medio', 'primero medio', '1ma', '1mb'] },
        { name: 'Segundo Medio', words: ['2 medio', '2do medio', 'segundo medio', '2ma', '2mb'] },
        { name: 'Tercero Medio', words: ['3 medio', '3ro medio', 'tercero medio', '3ma', '3mb'] },
        { name: 'Cuarto Medio', words: ['4 medio', '4to medio', 'cuarto medio', '4ma', '4mb'] }
      ];

      for (const m of medias) {
        if (m.words.some(w => clean.includes(w))) {
          const l = letra || (clean.includes(' b') || clean.endsWith('b') ? 'B' : 'A');
          return `${m.name} ${l}`;
        }
      }

      // 5. Curso Laboral
      if (clean.includes('laboral')) {
        return 'Curso Laboral';
      }

      // 6. Si no coincide con un estándar previo pero tiene texto, usar el nombre original
      return rawNivel.trim();
    }

    parseAndPreviewRows(rawRows) {
      this.parsedStudentsToImport = [];
      const existingCourses = db.getCourses();

      rawRows.forEach((row, idx) => {
        // Mapeo inteligente de encabezados de columna oficiales SIGE y variantes
        let rutRaw = '';
        let dvRaw = '';
        let apePaterno = '';
        let apeMaterno = '';
        let nombres = '';
        let nivelRaw = '';
        let descGradoRaw = '';
        let letraCursoRaw = '';

        for (const [key, val] of Object.entries(row)) {
          const normKey = this.normalizeKey(key);
          const strVal = String(val !== undefined && val !== null ? val : '').trim();

          if (['run', 'rut', 'cedula', 'identificacion', 'runalumno', 'rutalumno'].includes(normKey)) {
            rutRaw = strVal;
          } else if (['digitover', 'digitoverificador', 'dv', 'digito', 'dvrun', 'digitoverificadorrun'].includes(normKey) || normKey.startsWith('digitover')) {
            dvRaw = strVal;
          } else if (['apellidopaterno', 'paterno', 'apaterno', 'primerapellido'].includes(normKey) || normKey.startsWith('apellidopat')) {
            apePaterno = strVal;
          } else if (['apellidomaterno', 'materno', 'amaterno', 'segundoapellido'].includes(normKey) || normKey.startsWith('apellidomat')) {
            apeMaterno = strVal;
          } else if (['nombres', 'nombre', 'primernombre', 'nombresdelalumno', 'nombrealumno'].includes(normKey)) {
            nombres = strVal;
          } else if (normKey.startsWith('descgrado') || ['grado', 'descripciongrado', 'glosagrado'].includes(normKey)) {
            descGradoRaw = strVal;
          } else if (normKey.startsWith('letra') || ['letracurso', 'letraacurso', 'paralelo'].includes(normKey)) {
            letraCursoRaw = strVal;
          } else if (['nivel', 'curso'].includes(normKey)) {
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

        // Combinar 'Desc Grado' y 'Letra Curso' si vienen en columnas separadas (SIGE oficial)
        if (descGradoRaw) {
          if (letraCursoRaw) {
            nivelRaw = `${descGradoRaw} ${letraCursoRaw}`;
          } else {
            nivelRaw = descGradoRaw;
          }
        }

        // Extracción robusta de RUT y Dígito Verificador (soporta "27581654 K", "27509561-3", etc.)
        let cleanRutNum = null;
        let finalDv = '';

        if (rutRaw) {
          const cleanStr = rutRaw.replace(/\./g, '').trim();

          // Caso A: Formato con guión (ej: "27581654-K" o "27581654-3")
          if (cleanStr.includes('-')) {
            const parts = cleanStr.split('-');
            cleanRutNum = parseInt(parts[0].replace(/[^0-9]/g, ''), 10);
            finalDv = parts[1].trim().toUpperCase();
          } 
          // Caso B: El RUN trae adherido el DV al final (ej: "27581654 K", "27549612 K", "27581654K")
          else if (/^([0-9]{7,9})\s*([0-9kK])$/i.test(cleanStr)) {
            const match = cleanStr.match(/^([0-9]{7,9})\s*([0-9kK])$/i);
            cleanRutNum = parseInt(match[1], 10);
            finalDv = match[2].toUpperCase();
          } 
          // Caso C: Solo dígitos en la columna RUN (ej: "27509561")
          else {
            const digits = cleanStr.replace(/[^0-9]/g, '');
            if (digits.length >= 7) {
              cleanRutNum = parseInt(digits, 10);
            }
          }
        }

        // Si la columna "Dígito Ver." tiene valor válido, la usamos o confirmamos
        if (dvRaw && dvRaw.trim()) {
          finalDv = dvRaw.trim().toUpperCase();
        }

        // Si aún no tenemos DV y el RUT numérico es válido, calcularlo con Módulo 11 oficial
        if (!finalDv && cleanRutNum) {
          finalDv = calculateDV(cleanRutNum);
        }

        const matchedNivel = this.matchNivel(nivelRaw, existingCourses);

        // Validación de fila
        const errors = [];
        if (!cleanRutNum || isNaN(cleanRutNum)) errors.push('RUN no numérico o vacío');
        if (!finalDv) errors.push('Falta Dígito Verificador');
        if (!nombres) errors.push('Falta Nombre');
        if (!apePaterno) errors.push('Falta Ap. Paterno');
        if (!matchedNivel) errors.push(`Nivel "${nivelRaw || 'vacío'}" no reconocido`);

        const isValid = errors.length === 0;

        this.parsedStudentsToImport.push({
          index: idx + 1,
          rut: cleanRutNum,
          dv: finalDv,
          apellidoPaterno: apePaterno,
          apellidoMaterno: apeMaterno || '',
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

      // Renderizar filas de vista previa (primeras 30 para máxima agilidad visual <5ms)
      this.importPreviewTableBody.innerHTML = this.parsedStudentsToImport.slice(0, 30).map(s => {
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

      if (this.btnExecuteImport) {
        this.btnExecuteImport.disabled = true;
        this.btnExecuteImport.textContent = '⏳ Guardando nómina... Por favor espere';
      }

      // Ejecutar en el siguiente ciclo de eventos para permitir que el botón se actualice visualmente y no congele la UI
      setTimeout(() => {
        try {
          const mode = this.importModeSelect ? this.importModeSelect.value : 'merge';
          const cursosAfectados = Array.from(new Set(validStudents.map(s => s.nivel)));

          // Crear los cursos necesarios en un solo lote si aún no existen
          db.saveCoursesBulk(cursosAfectados);

          // Guardar todos los estudiantes en un solo lote ultra rápido (0 bloqueos)
          const result = db.saveStudentsBulk(validStudents, mode, cursosAfectados);

          this.closeBulkModal();
          this.render();

          window.showToast(`¡Carga masiva completada exitosamente! ${result.importedCount} matriculados, ${result.updatedCount} actualizados.`, 'success');
        } catch (err) {
          console.error('Error durante la importación masiva:', err);
          window.showToast('Ocurrió un error al guardar los estudiantes', 'danger');
          if (this.btnExecuteImport) {
            this.btnExecuteImport.disabled = false;
            this.btnExecuteImport.textContent = `✅ Confirmar e Importar (${validStudents.length} estudiantes válidos)`;
          }
        }
      }, 30);
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
