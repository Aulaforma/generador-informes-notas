/**
 * js/subjectsView.js
 * Módulo de Gestión de Asignaturas por Curso.
 * Permite al usuario escribir y configurar las asignaturas de cada nivel:
 * - Define cuáles inciden en el promedio final y cuáles no (diferenciadas con asterisco *).
 * - Define cuáles se evalúan con conceptos (I, S, B, MB para Orientación, Religiones, etc.).
 * - Permite ordenar, editar, eliminar y copiar el plan de asignaturas entre cursos.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./db.js'));
  } else {
    root.SubjectsView = factory(root);
  }
})(typeof self !== 'undefined' ? self : this, function (dbModule) {

  const db = dbModule.db;
  const NIVELES_DISPONIBLES = dbModule.NIVELES_DISPONIBLES;
  const isTypicallyConceptual = dbModule.isTypicallyConceptual;

  class SubjectsView {
    constructor() {
      this.nivelSelect = document.getElementById('subjects-select-nivel');
      this.form = document.getElementById('subject-add-form');
      this.nameInput = document.getElementById('subject-input-name');
      this.incideCheckbox = document.getElementById('subject-check-incide');
      this.conceptualCheckbox = document.getElementById('subject-check-conceptual');
      this.listContainer = document.getElementById('subjects-list-container');
      this.countBadge = document.getElementById('subjects-count-badge');
      
      // Herramienta de copiado entre cursos
      this.copyFromSelect = document.getElementById('copy-subjects-from-select');
      this.btnCopySubjects = document.getElementById('btn-copy-subjects');

      this.currentNivel = '';

      this.init();
    }

    init() {
      this.populateNivelSelects();
      this.initEvents();

      if (this.nivelSelect && this.nivelSelect.options.length > 0) {
        // Seleccionar 'Primero Básico A' por defecto
        const p1 = Array.from(this.nivelSelect.options).find(o => o.value === 'Primero Básico A');
        if (p1) {
          this.nivelSelect.value = 'Primero Básico A';
        } else {
          this.nivelSelect.selectedIndex = 0;
        }
        this.currentNivel = this.nivelSelect.value;
      }

      this.render();

      window.addEventListener('subjects_updated', (e) => {
        if (!e.detail || !e.detail.nivel || e.detail.nivel === this.currentNivel) {
          this.render();
        }
      });
    }

    populateNivelSelects() {
      if (this.nivelSelect) {
        this.nivelSelect.innerHTML = NIVELES_DISPONIBLES.map(n => `<option value="${n}">${n}</option>`).join('');
      }

      if (this.copyFromSelect) {
        this.copyFromSelect.innerHTML = '<option value="" disabled selected>Seleccione curso origen...</option>' +
          NIVELES_DISPONIBLES.map(n => `<option value="${n}">${n}</option>`).join('');
      }
    }

    initEvents() {
      if (this.nivelSelect) {
        this.nivelSelect.addEventListener('change', (e) => {
          this.currentNivel = e.target.value;
          this.render();
        });
      }

      // Auto-detección amigable: si el usuario tipea Orientación o Religión
      if (this.nameInput && this.conceptualCheckbox && this.incideCheckbox) {
        this.nameInput.addEventListener('input', (e) => {
          const val = e.target.value;
          if (isTypicallyConceptual(val)) {
            this.conceptualCheckbox.checked = true;
            this.incideCheckbox.checked = false; // Orientación y Religión por defecto no inciden
          }
        });
      }

      if (this.form) {
        this.form.addEventListener('submit', (e) => this.handleAddSubject(e));
      }

      if (this.btnCopySubjects) {
        this.btnCopySubjects.addEventListener('click', () => this.handleCopySubjects());
      }
    }

    render() {
      if (!this.currentNivel || !this.listContainer) return;

      const subjects = db.getSubjectsForCourse(this.currentNivel);

      if (this.countBadge) {
        this.countBadge.textContent = `${subjects.length} asignaturas configuradas`;
      }

      if (subjects.length === 0) {
        this.listContainer.innerHTML = `
          <div style="text-align: center; padding: 3rem 1.5rem; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: var(--radius-md); color: #64748b;">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📚</div>
            <strong style="color: #1e293b; font-size: 1.05rem;">No has registrado asignaturas para ${escapeHtml(this.currentNivel)}</strong>
            <p style="font-size: 0.88rem; margin-top: 0.4rem; max-width: 500px; margin-left: auto; margin-right: auto;">
              Escribe el nombre de las asignaturas en el formulario superior para agregarlas a este curso, o utiliza el botón inferior para copiar el plan desde otro nivel.
            </p>
          </div>
        `;
        return;
      }

      this.listContainer.innerHTML = subjects.map((sub, idx) => {
        const noIncide = sub.incideEnPromedio === false;
        const displayName = noIncide ? `${escapeHtml(sub.nombre)} *` : escapeHtml(sub.nombre);

        const incideBadge = noIncide
          ? `<span class="header-badge-tag" style="background: #fef3c7; color: #92400e; border: 1px solid #fde68a;">* No Incide en Promedio</span>`
          : `<span class="header-badge-tag" style="background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;">✓ Incide en Promedio</span>`;

        const evalBadge = sub.esConceptual
          ? `<span class="header-badge-tag" style="background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff;">Escala Conceptual (I, S, B, MB)</span>`
          : `<span class="header-badge-tag" style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;">Escala Numérica (1.0 - 7.0)</span>`;

        return `
          <div class="card" style="margin-bottom: 0.65rem; padding: 0.85rem 1.15rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; border-left: 4px solid ${noIncide ? '#f59e0b' : '#2563eb'};">
            <div style="display: flex; align-items: center; gap: 0.85rem; flex: 1;">
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <button type="button" class="btn btn-secondary btn-sm" style="padding: 2px 6px; font-size: 0.7rem;" onclick="window.subjectsView.moveSubject('${sub.id}', -1)" title="Subir orden" ${idx === 0 ? 'disabled' : ''}>▲</button>
                <button type="button" class="btn btn-secondary btn-sm" style="padding: 2px 6px; font-size: 0.7rem;" onclick="window.subjectsView.moveSubject('${sub.id}', 1)" title="Bajar orden" ${idx === subjects.length - 1 ? 'disabled' : ''}>▼</button>
              </div>
              <span style="font-weight: 700; color: #64748b; width: 24px; text-align: center;">${idx + 1}</span>
              <div>
                <strong style="font-size: 1rem; color: #0f172a; display: block;">${displayName}</strong>
                <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem; flex-wrap: wrap;">
                  ${incideBadge}
                  ${evalBadge}
                </div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <button class="btn btn-secondary btn-sm" onclick="window.subjectsView.toggleIncidencia('${sub.id}')" title="Cambiar si incide o no en el promedio final">
                ${noIncide ? 'Hacer que Incida' : 'Marcar No Incide (*)'}
              </button>
              <button class="btn btn-secondary btn-sm" onclick="window.subjectsView.toggleConceptual('${sub.id}')" title="Cambiar entre escala numérica o conceptual">
                ${sub.esConceptual ? 'Cambiar a Numérica' : 'Cambiar a Conceptos'}
              </button>
              <button class="btn btn-danger btn-sm" onclick="window.subjectsView.deleteSubject('${sub.id}')" title="Eliminar asignatura del curso">
                🗑️
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    handleAddSubject(e) {
      e.preventDefault();
      const name = this.nameInput ? this.nameInput.value.trim() : '';

      if (!name) {
        window.showToast('Debe escribir el nombre de la asignatura', 'warning');
        return;
      }

      const incide = this.incideCheckbox ? this.incideCheckbox.checked : true;
      const conceptual = this.conceptualCheckbox ? this.conceptualCheckbox.checked : false;

      db.saveSubjectForCourse(this.currentNivel, {
        nombre: name,
        incideEnPromedio: incide,
        esConceptual: conceptual
      });

      this.form.reset();
      // Restablecer defaults
      if (this.incideCheckbox) this.incideCheckbox.checked = true;
      if (this.conceptualCheckbox) this.conceptualCheckbox.checked = false;
      if (this.nameInput) this.nameInput.focus();

      window.showToast(`Asignatura "${name}" agregada a ${this.currentNivel}`, 'success');
      this.render();
    }

    deleteSubject(subjectId) {
      const subjects = db.getSubjectsForCourse(this.currentNivel);
      const sub = subjects.find(s => s.id === subjectId);
      if (!sub) return;

      if (confirm(`¿Está seguro de eliminar la asignatura "${sub.nombre}" del curso ${this.currentNivel}?`)) {
        db.deleteSubjectForCourse(this.currentNivel, subjectId);
        window.showToast(`Asignatura eliminada de ${this.currentNivel}`, 'info');
        this.render();
      }
    }

    toggleIncidencia(subjectId) {
      const subjects = db.getSubjectsForCourse(this.currentNivel);
      const sub = subjects.find(s => s.id === subjectId);
      if (!sub) return;

      const newIncide = !sub.incideEnPromedio;
      db.saveSubjectForCourse(this.currentNivel, {
        ...sub,
        incideEnPromedio: newIncide
      });

      window.showToast(`Asignatura "${sub.nombre}" ahora ${newIncide ? 'INCIDE' : 'NO INCIDE (*)'} en el promedio`, 'success');
      this.render();
    }

    toggleConceptual(subjectId) {
      const subjects = db.getSubjectsForCourse(this.currentNivel);
      const sub = subjects.find(s => s.id === subjectId);
      if (!sub) return;

      const newConceptual = !sub.esConceptual;
      db.saveSubjectForCourse(this.currentNivel, {
        ...sub,
        esConceptual: newConceptual
      });

      window.showToast(`Asignatura "${sub.nombre}" ahora evalúa con ${newConceptual ? 'CONCEPTOS (I, S, B, MB)' : 'ESCALA NUMÉRICA'}`, 'success');
      this.render();
    }

    moveSubject(subjectId, direction) {
      const subjects = db.getSubjectsForCourse(this.currentNivel);
      const idx = subjects.findIndex(s => s.id === subjectId);
      if (idx === -1) return;

      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= subjects.length) return;

      const temp = subjects[idx];
      subjects[idx] = subjects[targetIdx];
      subjects[targetIdx] = temp;

      const ids = subjects.map(s => s.id);
      db.reorderCourseSubjects(this.currentNivel, ids);
      this.render();
    }

    handleCopySubjects() {
      const sourceNivel = this.copyFromSelect ? this.copyFromSelect.value : '';
      if (!sourceNivel) {
        window.showToast('Seleccione el curso de origen desde el cual desea copiar', 'warning');
        return;
      }

      if (sourceNivel === this.currentNivel) {
        window.showToast('El curso de origen y el curso de destino deben ser distintos', 'warning');
        return;
      }

      const sourceSubjects = db.getSubjectsForCourse(sourceNivel);
      if (sourceSubjects.length === 0) {
        window.showToast(`El curso de origen "${sourceNivel}" no tiene asignaturas para copiar`, 'warning');
        return;
      }

      if (confirm(`¿Copiar las ${sourceSubjects.length} asignaturas de "${sourceNivel}" hacia "${this.currentNivel}"?\n\n(Esto creará las asignaturas en ${this.currentNivel} respetando si inciden en el promedio y si son conceptuales).`)) {
        const count = db.copySubjectsBetweenCourses(sourceNivel, this.currentNivel);
        window.showToast(`Se copiaron ${count} asignaturas exitosamente hacia ${this.currentNivel}`, 'success');
        this.render();
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

  return SubjectsView;
});
