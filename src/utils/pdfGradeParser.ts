/**
 * pdfGradeParser.ts
 * Parser para extracción y previsualización de notas históricas desde informes en formato PDF (texto digital, no OCR).
 *
 * Soporta dos formatos comunes:
 * 1. Formato Informe de Rendimiento Escolar / Anual (columnas Periodo 1, Periodo 2, Examen Final, Promedio).
 * 2. Formato Libreta de Notas individual/consolidada (cuadrícula N1-N10 / asignaturas).
 *
 * Filtros estrictos:
 * - Importa únicamente calificaciones NUMÉRICAS de Periodo 1 (1.0 a 7.0).
 * - Detecta calificaciones conceptuales (MB, B, S, I) y las marca informativamente sin agregarlas a notas numéricas.
 * - Extrae el promedio informado solo como dato de validación (NO lo agrega como una nota más).
 * - No importa Periodo 2, asistencia, observaciones ni firmas.
 */

export interface ParsedSubjectGrade {
  asignatura: string;
  notasPeriodo1: number[];
  promedioInformado: number | null;
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
 * Procesa el ArrayBuffer de un PDF y extrae las notas del Periodo 1.
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
        totalAsignaturas: 0,
      };
    }

    // Leemos la primera página (cada informe histórico suele ser 1 página por alumno o portada)
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();

    const items: TextItemInfo[] = (textContent.items as any[])
      .map((it) => ({
        str: (it.str || "").trim(),
        x: Math.round(it.transform[4]),
        y: Math.round(it.transform[5]),
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

    // 4. Extracción de Asignaturas y Calificaciones del Periodo 1
    // Agrupamos textos en filas horizontales basadas en coordenada Y
    const rowMap: { [yKey: number]: TextItemInfo[] } = {};
    for (const it of items) {
      // Filtrar cabeceras y pies de página
      if (it.y > 520 || it.y < 120) continue;
      const yKey = Math.round(it.y / 4) * 4;
      if (!rowMap[yKey]) rowMap[yKey] = [];
      rowMap[yKey].push(it);
    }

    const sortedY = Object.keys(rowMap).map(Number).sort((a, b) => b - a);
    const parsedSubjects: ParsedSubjectGrade[] = [];

    // Detectar si el formato es tipo "Informe Anual" con columnas (Periodo 1 notas en x aprox 130 a 390)
    // o tipo "Libreta de Notas" (notas en x aprox 330 a 530)
    const hasP1Header = fullText.includes("Periodo 1") || fullText.includes("Primer Semestre");

    for (const y of sortedY) {
      const row = rowMap[y];
      row.sort((a, b) => a.x - b.x);

      // Descartar encabezados de tabla o líneas de promedio general / observaciones / firmas / metadatos
      const rowCombined = row.map((i) => i.str).join(" ");
      if (
        /PROMEDIO GENERAL|OBSERVACIONES|Porcentaje asistencia|Asignaturas|DOCENTE|EVALUACIONES|Nombre y firma|Nombre Alumno|RUT:|Curso:|Periodo 1|Periodo 2|Año académico|Ex\.Final|Director|profesor\(a\)|^-{5,}$/i.test(
          rowCombined
        ) ||
        rowCombined.includes("----------------")
      ) {
        continue;
      }

      // Si la fila no contiene ninguna nota numérica ni conceptual ni promedio, y se ubica abajo (y < 160), es firma de personas
      const hasAnyGradeOrConcept = row.some(
        (i) => /^(MB|B|S|I)$/i.test(i.str) || /^[1-7][,\.][0-9]$/.test(i.str)
      );
      if (!hasAnyGradeOrConcept && y < 160) {
        continue;
      }

      // El nombre de la asignatura suele estar al extremo izquierdo (x < 150)
      const nameParts = row.filter((i) => i.x < 140).map((i) => i.str);
      const asigName = nameParts
        .join(" ")
        .replace(/^\*\s*/, "") // Quitar asteriscos de notas no incidentes
        .trim();

      if (!asigName || asigName.length < 3) continue;

      // Evaluar si contiene notas conceptuales (MB, B, S, I)
      const conceptualMatches = row.filter((i) => /^(MB|B|S|I)$/i.test(i.str));
      const isConceptual = conceptualMatches.length > 0;

      // Extraer notas de Periodo 1
      // En el formato informe anual:
      // - Las notas parciales de Periodo 1 se ubican entre x >= 140 y x < 390
      // - El promedio informado de Periodo 1 está en la columna Final P1 (x >= 390 y x < 415)
      const p1Items = row.filter((i) => i.x >= 140 && i.x < 390);
      const notasP1: number[] = [];

      for (const it of p1Items) {
        // Puede venir "6.7", "6,7"
        const cleanVal = it.str.replace(",", ".");
        const gradeNum = parseFloat(cleanVal);
        if (!isNaN(gradeNum) && gradeNum >= 1.0 && gradeNum <= 7.0) {
          notasP1.push(gradeNum);
        }
      }

      // Promedio informado en Periodo 1
      let promedioP1: number | null = null;
      const promItem = row.find((i) => i.x >= 390 && i.x < 415);
      if (promItem) {
        const pNum = parseFloat(promItem.str.replace(",", "."));
        if (!isNaN(pNum) && pNum >= 1.0 && pNum <= 7.0) {
          promedioP1 = pNum;
        }
      }

      parsedSubjects.push({
        asignatura: asigName,
        notasPeriodo1: notasP1,
        promedioInformado: promedioP1,
        isConceptual,
        conceptualNotas: isConceptual ? conceptualMatches.map((m) => m.str) : undefined,
        advertencia: isConceptual
          ? "Conceptual — no importada en esta etapa"
          : notasP1.length === 0
          ? "Sin notas en Periodo 1"
          : undefined,
      });
    }

    const totalNotas = parsedSubjects.reduce((acc, s) => acc + s.notasPeriodo1.length, 0);

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
      totalNotasPeriodo1: totalNotas,
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
      totalAsignaturas: 0,
    };
  }
}
