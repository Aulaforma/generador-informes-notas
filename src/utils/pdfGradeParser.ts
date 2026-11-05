/**
 * pdfGradeParser.ts
 * Parser para extracción y previsualización de notas históricas desde informes en formato PDF (texto digital, no OCR).
 *
 * Soporta formatos:
 * 1. Formato Informe Anual / Rendimiento Escolar (columnas Periodo 1, Periodo 2, Examen Final, Promedio).
 * 2. Formato Informe Parcial de Notas / Libreta de Notas (cuadrícula N1-N15 / Periodo 1).
 *
 * Filtros estrictos:
 * - Importa únicamente calificaciones NUMÉRICAS de Periodo 1 y Periodo 2 (1.0 a 7.0).
 * - Detecta calificaciones conceptuales (MB, B, S, I) y las marca informativamente sin agregarlas a notas numéricas.
 * - Extrae los promedios informados (P1, P2 y Final) exclusivamente como datos de validación (NO los agrega como notas parciales).
 * - No importa asistencia, observaciones, firmas ni exámenes finales como notas parciales.
 */

export interface ParsedSubjectGrade {
  asignatura: string;
  notasPeriodo1: number[];
  notasPeriodo2: number[];
  promedioP1: number | null;
  promedioP2: number | null;
  promedioFinal: number | null;
  promedioInformado: number | null; // Retrocompatibilidad (equivale a promedioP1)
  isConceptual: boolean;
  conceptualNotas?: string[];
  advertencia?: string;
}

export type PdfReportStatus = "LEIDO" | "PDF_SIN_TEXTO" | "ERROR_DE_FORMATO";

export interface ParsedPdfReport {
  fileName: string;
  fileSize: number;
  status: PdfReportStatus;
  statusMessage: string;
  estudiante: string;
  run: number | null;
  dv: string | null;
  rawRun: string;
  curso: string;
  cursoNormalizado: string;
  asignaturas: ParsedSubjectGrade[];
  totalNotasPeriodo1: number;
  totalNotasPeriodo2: number;
  totalAsignaturas: number;
}

/**
 * Normaliza un RUN/RUT chileno.
 * Ej: "12.345.678-K" o "228148636"
 * Retorna { run: 12345678, dv: "K", rawRun: "12345678-K" }
 */
export function normalizeRun(rawText: string | null | undefined): {
  run: number | null;
  dv: string | null;
  rawRun: string;
} {
  if (!rawText) return { run: null, dv: null, rawRun: "" };

  const clean = rawText.toUpperCase().replace(/[^0-9K]/g, "");
  if (clean.length < 2) {
    return { run: null, dv: null, rawRun: rawText.trim() };
  }

  const cuerpo = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const runNum = parseInt(cuerpo, 10);

  if (isNaN(runNum) || runNum <= 0) {
    return { run: null, dv: null, rawRun: rawText.trim() };
  }

  return {
    run: runNum,
    dv,
    rawRun: `${runNum}-${dv}`,
  };
}

/**
 * Normaliza el nombre del curso quitando tildes y espacios extras
 */
export function normalizeCourseName(rawCourse: string): string {
  if (!rawCourse) return "";
  return rawCourse
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(\d+)\s*[°ºª]\s*AÑO/i, "$1°")
    .replace(/(\d+)\s*[°ºª]\s*MEDIO/i, "$1° Medio")
    .replace(/(\d+)\s*[°ºª]\s*BASICO/i, "$1° Básico");
}

interface TextItemInfo {
  str: string;
  x: number;
  y: number;
}

/**
 * Parsea una cadena de texto a valor numérico de nota escolar chilena (1.0 a 7.0).
 * Retorna null si es inválido, vacío o guión.
 */
function parseGradeNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const clean = raw.trim().replace(",", ".");
  if (clean === "-" || clean === "" || clean === "NaN") return null;
  const num = parseFloat(clean);
  if (!isNaN(num) && num >= 1.0 && num <= 7.0) {
    return Number(num.toFixed(1));
  }
  return null;
}

/**
 * Procesa el ArrayBuffer de un PDF y extrae las notas de Periodo 1 y Periodo 2.
 */
export async function parsePdfGrades(
  fileBuffer: ArrayBuffer,
  fileName: string,
  fileSize: number
): Promise<ParsedPdfReport> {
  // Import dinámico de pdfjs-dist para entornos de navegador y Node
  const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs");

  // Configurar worker de pdfjs en browser si está disponible
  if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }

  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(fileBuffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;

    if (pdf.numPages === 0) {
      return {
        fileName,
        fileSize,
        status: "PDF_SIN_TEXTO",
        statusMessage: "El archivo no contiene páginas legibles.",
        estudiante: "",
        run: null,
        dv: null,
        rawRun: "",
        curso: "",
        cursoNormalizado: "",
        asignaturas: [],
        totalNotasPeriodo1: 0,
        totalNotasPeriodo2: 0,
        totalAsignaturas: 0,
      };
    }

    // Leemos la primera página (cada informe histórico suele ser 1 página por alumno o portada)
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();

    // Extraer items de texto con sus coordenadas
    const rawItems: Array<{ str?: string; transform?: number[] }> = textContent.items as Array<{
      str?: string;
      transform?: number[];
    }>;
    const items: TextItemInfo[] = rawItems
      .map((it) => ({
        str: (it.str || "").trim(),
        x: Math.round(it.transform ? it.transform[4] : 0),
        y: Math.round(it.transform ? it.transform[5] : 0),
      }))
      .filter((it) => it.str.length > 0);

    if (items.length === 0) {
      return {
        fileName,
        fileSize,
        status: "PDF_SIN_TEXTO",
        statusMessage: "El PDF no contiene texto digital (posible escaneo o imagen).",
        estudiante: "",
        run: null,
        dv: null,
        rawRun: "",
        curso: "",
        cursoNormalizado: "",
        asignaturas: [],
        totalNotasPeriodo1: 0,
        totalNotasPeriodo2: 0,
        totalAsignaturas: 0,
      };
    }

    const fullText = items.map((i) => i.str).join(" ");

    // 1. Detección de Estudiante
    let estudiante = "";
    const nombreHeader = items.find((i) => /Nombre\s+Alumno/i.test(i.str) || /ESTUDIANTE:/i.test(i.str));
    if (nombreHeader) {
      const sameLineItems = items.filter(
        (i) => Math.abs(i.y - nombreHeader.y) <= 8 && i.x > nombreHeader.x + 30
      );
      sameLineItems.sort((a, b) => a.x - b.x);
      estudiante = sameLineItems.map((i) => i.str).join(" ").trim();
      // Si en la misma línea no estaba, buscar en la línea inmediatamente debajo
      if (!estudiante) {
        const nextLineItems = items.filter(
          (i) => nombreHeader.y - i.y > 0 && nombreHeader.y - i.y <= 16 && Math.abs(i.x - nombreHeader.x) <= 80
        );
        nextLineItems.sort((a, b) => a.x - b.x);
        estudiante = nextLineItems.map((i) => i.str).join(" ").trim();
      }
    }

    // 2. Detección de RUN / RUT
    let rawRut = "";
    const rutMatch = fullText.match(/(?:RUT|RUN):\s*([\d\.\-kK]+)/i);
    if (rutMatch) {
      rawRut = rutMatch[1];
    } else {
      // Buscar patrón de RUT en cualquier texto
      const genericRut = fullText.match(/\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b/);
      if (genericRut) rawRut = genericRut[0];
    }
    const { run, dv, rawRun } = normalizeRun(rawRut);

    // 3. Detección de Curso
    let curso = "";
    const cursoHeader = items.find((i) => /Curso:/i.test(i.str) || /CURSO:/i.test(i.str));
    if (cursoHeader) {
      const sameLineCurso = items.filter(
        (i) => Math.abs(i.y - cursoHeader.y) <= 8 && i.x > cursoHeader.x + 10
      );
      sameLineCurso.sort((a, b) => a.x - b.x);
      curso = sameLineCurso.map((i) => i.str).join(" ").trim();
      if (!curso) {
        const nextLineCurso = items.filter(
          (i) => cursoHeader.y - i.y > 0 && cursoHeader.y - i.y <= 16 && Math.abs(i.x - cursoHeader.x) <= 60
        );
        nextLineCurso.sort((a, b) => a.x - b.x);
        curso = nextLineCurso.map((i) => i.str).join(" ").trim();
      }
    }
    const cursoNormalizado = normalizeCourseName(curso);

    // 4. Extracción de Asignaturas y Calificaciones de Periodo 1 y Periodo 2
    // Agrupamos textos en filas horizontales basadas en coordenada Y
    const rowMap: { [yKey: number]: TextItemInfo[] } = {};
    for (const it of items) {
      // Filtrar cabeceras superiores y pies de página
      if (it.y > 520 || it.y < 120) continue;
      const yKey = Math.round(it.y / 4) * 4;
      if (!rowMap[yKey]) rowMap[yKey] = [];
      rowMap[yKey].push(it);
    }

    const sortedY = Object.keys(rowMap).map(Number).sort((a, b) => b - a);
    const parsedSubjects: ParsedSubjectGrade[] = [];

    // Detectar si el formato es Informe Anual (columnas separadas Periodo 1 y Periodo 2)
    const isAnual = items.some(
      (i) => i.str.includes("Periodo 1") || i.str.includes("Periodo 2")
    );

    for (const y of sortedY) {
      const row = rowMap[y];
      row.sort((a, b) => a.x - b.x);

      // Descartar encabezados de tabla, líneas de resumen, observaciones o firmas
      const rowCombined = row.map((i) => i.str).join(" ");
      if (
        /PROMEDIO GENERAL|OBSERVACIONES|Porcentaje asistencia|Asignaturas|DOCENTE|EVALUACIONES|Nombre y firma|Nombre Alumno|RUT:|Curso:|Periodo 1|Periodo 2|Año académico|Ex\.Final|Director|profesor\(a\)|Promedio del periodo|Anotaciones|^-{5,}$/i.test(
          rowCombined
        ) ||
        rowCombined.includes("----------------")
      ) {
        continue;
      }

      // Descartar líneas aisladas de pie de página
      const hasAnyGradeOrConcept = row.some(
        (i) => /^(MB|B|S|I)$/i.test(i.str) || /^[1-7][,\.][0-9]$/.test(i.str)
      );
      if (!hasAnyGradeOrConcept && y < 160) {
        continue;
      }

      let nameParts: TextItemInfo[] = [];
      let p1Items: TextItemInfo[] = [];
      let promP1Item: TextItemInfo | undefined;
      let p2Items: TextItemInfo[] = [];
      let promP2Item: TextItemInfo | undefined;
      let promFinalItem: TextItemInfo | undefined;

      if (isAnual) {
        // En formato Informe Anual:
        // - Asignatura: x < 140
        // - Periodo 1 notas: x >= 140 && x < 390
        // - Periodo 1 promedio (Final P1): x >= 390 && x < 415
        // - Periodo 2 notas: x >= 415 && x < 670
        // - Periodo 2 promedio (Final P2): x >= 670 && x < 695
        // - Promedio final: x >= 710 && x < 770
        nameParts = row.filter((i) => i.x < 140);
        p1Items = row.filter((i) => i.x >= 140 && i.x < 390);
        promP1Item = row.find((i) => i.x >= 390 && i.x < 415);
        p2Items = row.filter((i) => i.x >= 415 && i.x < 670);
        promP2Item = row.find((i) => i.x >= 670 && i.x < 695);
        promFinalItem = row.find((i) => i.x >= 710 && i.x < 770);
      } else {
        // En formato Informe Parcial (solo Periodo 1):
        // - Asignatura: x < 200
        // - Periodo 1 notas: x >= 200 && x < 530
        // - Periodo 1 promedio: x >= 530 && x < 560
        nameParts = row.filter((i) => i.x < 200);
        p1Items = row.filter((i) => i.x >= 200 && i.x < 530);
        promP1Item = row.find((i) => i.x >= 530 && i.x < 560);
      }

      const asigName = nameParts
        .map((i) => i.str)
        .join(" ")
        .replace(/^\*\s*/, "") // Quitar asteriscos de notas no incidentes
        .trim();

      if (!asigName || asigName.length < 3) continue;

      // Evaluar si contiene notas conceptuales (MB, B, S, I)
      const conceptualMatches = row.filter((i) => /^(MB|B|S|I)$/i.test(i.str));
      const isConceptual = conceptualMatches.length > 0;

      // Extraer notas de Periodo 1
      const notasP1: number[] = [];
      for (const it of p1Items) {
        const val = parseGradeNumber(it.str);
        if (val !== null) notasP1.push(val);
      }

      // Extraer notas de Periodo 2
      const notasP2: number[] = [];
      for (const it of p2Items) {
        const val = parseGradeNumber(it.str);
        if (val !== null) notasP2.push(val);
      }

      // Promedios informados exclusivamente como validación
      const promedioP1 = parseGradeNumber(promP1Item?.str);
      const promedioP2 = parseGradeNumber(promP2Item?.str);
      const promedioFinal = parseGradeNumber(promFinalItem?.str);

      parsedSubjects.push({
        asignatura: asigName,
        notasPeriodo1: notasP1,
        notasPeriodo2: notasP2,
        promedioP1,
        promedioP2,
        promedioFinal,
        promedioInformado: promedioP1,
        isConceptual,
        conceptualNotas: isConceptual ? conceptualMatches.map((m) => m.str) : undefined,
        advertencia: isConceptual
          ? "Conceptual — no importada en esta etapa"
          : notasP1.length === 0 && notasP2.length === 0
          ? "Sin notas en Periodo 1 ni Periodo 2"
          : undefined,
      });
    }

    const totalNotasP1 = parsedSubjects.reduce((acc, s) => acc + s.notasPeriodo1.length, 0);
    const totalNotasP2 = parsedSubjects.reduce((acc, s) => acc + s.notasPeriodo2.length, 0);

    // Validación de estado de extracción
    let status: PdfReportStatus = "LEIDO";
    let statusMessage = "Informe analizado correctamente.";

    if (parsedSubjects.length === 0) {
      status = "ERROR_DE_FORMATO";
      statusMessage = "No se reconocieron asignaturas ni cuadrícula de notas.";
    } else if (!estudiante && !run) {
      status = "ERROR_DE_FORMATO";
      statusMessage = "No se pudo identificar el nombre ni el RUN del estudiante.";
    }

    return {
      fileName,
      fileSize,
      status,
      statusMessage,
      estudiante: estudiante || "Estudiante no identificado",
      run,
      dv,
      rawRun,
      curso: curso || "Curso no especificado",
      cursoNormalizado,
      asignaturas: parsedSubjects,
      totalNotasPeriodo1: totalNotasP1,
      totalNotasPeriodo2: totalNotasP2,
      totalAsignaturas: parsedSubjects.length,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Error desconocido al procesar el archivo PDF.";
    return {
      fileName,
      fileSize,
      status: "ERROR_DE_FORMATO",
      statusMessage: `Fallo al leer PDF: ${errorMsg}`,
      estudiante: "",
      run: null,
      dv: null,
      rawRun: "",
      curso: "",
      cursoNormalizado: "",
      asignaturas: [],
      totalNotasPeriodo1: 0,
      totalNotasPeriodo2: 0,
      totalAsignaturas: 0,
    };
  }
}
