/**
 * js/pdfExport.js
 * Gestor de exportación directa a archivo PDF e Impresión oficial tamaño Carta (Letter).
 * Soporta exportación individual y por lotes (curso completo) con saltos de página obligatorios.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PdfExporter = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  class PdfExporter {
    constructor() {
      this.printBtn = document.getElementById('btn-print-reports');
      this.downloadPdfBtn = document.getElementById('btn-download-pdf');
      this.container = document.getElementById('report-preview-container');
      this.nivelSelect = document.getElementById('report-select-nivel');
      this.modeRadioBatch = document.getElementById('report-mode-batch');

      this.initEvents();
    }

    initEvents() {
      if (this.printBtn) {
        this.printBtn.addEventListener('click', () => {
          this.triggerPrint();
        });
      }

      if (this.downloadPdfBtn) {
        this.downloadPdfBtn.addEventListener('click', () => {
          this.downloadAsPdfFile();
        });
      }
    }

    triggerPrint() {
      window.showToast('Abriendo vista de impresión oficial (Tamaño Carta)...', 'info');
      setTimeout(() => {
        window.print();
      }, 150);
    }

    async downloadAsPdfFile() {
      if (!this.container) return;

      const pages = this.container.querySelectorAll('.report-page');
      if (pages.length === 0) {
        window.showToast('No hay ningún informe generado para descargar', 'warning');
        return;
      }

      const nivel = this.nivelSelect ? this.nivelSelect.value : 'Curso';
      const isBatch = this.modeRadioBatch && this.modeRadioBatch.checked;
      const filename = isBatch 
        ? `Informes_Notas_${nivel.replace(/\s+/g, '_')}_Completo.pdf`
        : `Informe_Notas_Estudiante.pdf`;

      if (window.html2pdf) {
        window.showToast(`Generando archivo PDF (${pages.length} páginas)... por favor espere`, 'info');
        
        const opt = {
          margin: [0, 0, 0, 0],
          filename: filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, letterRendering: true },
          jsPDF: { unit: 'mm', format: 'letter', orientation: 'landscape' },
          pagebreak: { mode: ['css', 'legacy'] }
        };

        try {
          await window.html2pdf().set(opt).from(this.container).save();
          window.showToast('Archivo PDF descargado exitosamente', 'success');
        } catch (err) {
          console.error('Error al generar PDF con html2pdf:', err);
          window.showToast('Generando a través del diálogo del navegador...', 'info');
          window.print();
        }
      } else {
        window.showToast('Abriendo diálogo nativo para Guardar como PDF...', 'info');
        window.print();
      }
    }
  }

  return PdfExporter;
});
