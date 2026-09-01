/**
 * js/attendanceView.js
 * Módulo de Asistencia Escolar (Vista Profesor Jefe).
 * Administra Días Trabajados, Días Asistidos y cálculo dinámico de Porcentaje de Asistencia (%).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./db.js'));
  } else {
    root.AttendanceView = factory(root);
  }
})(typeof self !== 'undefined' ? self : this, function (dbModule) {

  const db = dbModule.db;
  const NIVELES_DISPONIBLES = dbModule.NIVELES_DISPONIBLES;

  class AttendanceView {
    constructor() {
      this.nivelSelect = document.getElementById('attendance-select-nivel');
      this.tableBody = document.getElementById('attendance-table-body');
      this.globalWorkedDaysInput = document.getElementById('attendance-global-days');
      this.applyGlobalBtn = document.getElementById('btn-apply-global-days');

      // Stats
      this.statAveragePct = document.getElementById('attendance-stat-avg-pct');
      this.statRiskCount = document.getElementById('attendance-stat-risk');
      this.statNormalCount = document.getElementById('attendance-stat-normal');

      this.currentNivel = '';

      this.init();
    }

    init() {
      this.populateNivelSelect();
      this.initEvents();

      if (this.nivelSelect && this.nivelSelect.options.length > 0) {
        const p1Option = Array.from(this.nivelSelect.options).find(o => o.value === 'Primero Básico A');
        if (p1Option) {
          this.nivelSelect.value = 'Primero Básico A';
        } else {
          this.nivelSelect.selectedIndex = 0;
        }
        this.currentNivel = this.nivelSelect.value;
      }

      this.render();

      window.addEventListener('students_updated', () => {
        this.render();
      });
    }

    populateNivelSelect() {
      if (this.nivelSelect) {
        this.nivelSelect.innerHTML = NIVELES_DISPONIBLES.map(n => 
          `<option value="${n}">${n}</option>`
        ).join('');
      }
    }

    initEvents() {
      if (this.nivelSelect) {
        this.nivelSelect.addEventListener('change', (e) => {
          this.currentNivel = e.target.value;
          this.render();
        });
      }

      if (this.applyGlobalBtn) {
        this.applyGlobalBtn.addEventListener('click', () => {
          this.handleApplyGlobalDays();
        });
      }

      if (this.tableBody) {
        this.tableBody.addEventListener('change', (e) => {
          if (e.target.classList.contains('att-input')) {
            this.handleAttendanceChange(e.target);
          }
        });
      }
    }

    render() {
      if (!this.currentNivel) return;

      const students = db.getStudents(this.currentNivel);

      if (students.length === 0) {
        this.tableBody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; padding: 2.5rem; color: #64748b;">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">📅</div>
              <strong>No hay estudiantes registrados en ${this.currentNivel}</strong>
              <p style="font-size: 0.85rem; margin-top: 0.25rem;">Matricule estudiantes en este curso para registrar su asistencia.</p>
            </td>
          </tr>
        `;
        this.updateStats([]);
        return;
      }

      let recordsList = [];

      this.tableBody.innerHTML = students.map((std, index) => {
        const att = db.getAttendanceByStudent(std.id) || {
          diasTrabajados: 90,
          diasAsistidos: 90,
          porcentaje: 100
        };

        recordsList.push(att);

        const isRisk = att.porcentaje < 85;
        const badgeClass = isRisk ? 'warning' : 'good';
        const badgeIcon = isRisk ? '⚠️' : '✅';

        return `
          <tr data-student-id="${std.id}">
            <td style="text-align: center; color: #64748b; font-weight: 600;">${index + 1}</td>
            <td>
              <strong>${escapeHtml(std.apellidoPaterno)} ${escapeHtml(std.apellidoMaterno)}</strong>, 
              <span style="color: #475569;">${escapeHtml(std.nombres)}</span>
            </td>
            <td style="text-align: center;">
              <input 
                type="number" 
                class="form-control att-input att-worked" 
                data-student-id="${std.id}" 
                data-type="worked" 
                value="${att.diasTrabajados}" 
                min="1" 
                max="365" 
                style="width: 90px; text-align: center; margin: 0 auto;"
              />
            </td>
            <td style="text-align: center;">
              <input 
                type="number" 
                class="form-control att-input att-attended" 
                data-student-id="${std.id}" 
                data-type="attended" 
                value="${att.diasAsistidos}" 
                min="0" 
                max="365" 
                style="width: 90px; text-align: center; margin: 0 auto;"
              />
            </td>
            <td style="text-align: center;">
              <span class="pct-badge ${badgeClass}" id="att-pct-badge-${std.id}">
                ${badgeIcon} ${att.porcentaje.toFixed(1).replace('.', ',')}%
              </span>
            </td>
            <td style="text-align: center;">
              <span id="att-status-text-${std.id}" style="font-size: 0.8rem; font-weight: 600; color: ${isRisk ? '#dc2626' : '#059669'};">
                ${isRisk ? 'Riesgo de Repitencia' : 'Regular (Aprobada)'}
              </span>
            </td>
          </tr>
        `;
      }).join('');

      this.updateStats(recordsList);
    }

    handleAttendanceChange(inputEl) {
      const studentId = inputEl.getAttribute('data-student-id');
      const row = inputEl.closest('tr');
      const workedInput = row.querySelector('.att-worked');
      const attendedInput = row.querySelector('.att-attended');

      let trab = parseInt(workedInput.value, 10) || 0;
      let asist = parseInt(attendedInput.value, 10) || 0;

      if (asist > trab) {
        window.showToast('Los días asistidos no pueden superar los días trabajados', 'warning');
        asist = trab;
        attendedInput.value = asist;
      }

      const saved = db.saveStudentAttendance(studentId, this.currentNivel, trab, asist);

      const badgeEl = document.getElementById(`att-pct-badge-${studentId}`);
      const statusEl = document.getElementById(`att-status-text-${studentId}`);
      const isRisk = saved.porcentaje < 85;

      if (badgeEl) {
        badgeEl.className = `pct-badge ${isRisk ? 'warning' : 'good'}`;
        badgeEl.innerHTML = `${isRisk ? '⚠️' : '✅'} ${saved.porcentaje.toFixed(1).replace('.', ',')}%`;
      }

      if (statusEl) {
        statusEl.style.color = isRisk ? '#dc2626' : '#059669';
        statusEl.textContent = isRisk ? 'Riesgo de Repitencia' : 'Regular (Aprobada)';
      }

      const students = db.getStudents(this.currentNivel);
      const allAtt = students.map(s => db.getAttendanceByStudent(s.id)).filter(Boolean);
      this.updateStats(allAtt);
    }

    handleApplyGlobalDays() {
      const val = parseInt(this.globalWorkedDaysInput?.value, 10);
      if (!val || val <= 0) {
        window.showToast('Ingrese un número de días trabajados válido (ej. 90 o 180)', 'danger');
        return;
      }

      const students = db.getStudents(this.currentNivel);
      if (students.length === 0) {
        window.showToast('No hay estudiantes en este nivel para aplicar días', 'warning');
        return;
      }

      students.forEach(std => {
        const current = db.getAttendanceByStudent(std.id);
        const asist = current ? Math.min(val, current.diasAsistidos) : val;
        db.saveStudentAttendance(std.id, this.currentNivel, val, asist);
      });

      this.render();
      window.showToast(`Se aplicaron ${val} días trabajados a todos los estudiantes de ${this.currentNivel}`, 'success');
    }

    updateStats(records) {
      if (!records || records.length === 0) {
        if (this.statAveragePct) this.statAveragePct.textContent = '-';
        if (this.statRiskCount) this.statRiskCount.textContent = '0';
        if (this.statNormalCount) this.statNormalCount.textContent = '0';
        return;
      }

      const totalPct = records.reduce((acc, r) => acc + (r.porcentaje || 0), 0);
      const avg = totalPct / records.length;
      const risk = records.filter(r => r.porcentaje < 85).length;
      const normal = records.length - risk;

      if (this.statAveragePct) {
        this.statAveragePct.textContent = `${avg.toFixed(1).replace('.', ',')}%`;
        this.statAveragePct.style.color = avg < 85 ? '#dc2626' : '#1e3a8a';
      }

      if (this.statRiskCount) this.statRiskCount.textContent = risk;
      if (this.statNormalCount) this.statNormalCount.textContent = normal;
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

  return AttendanceView;
});
