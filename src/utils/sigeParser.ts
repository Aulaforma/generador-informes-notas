/**
 * sigeParser.ts
 * Parser para archivos de nómina descargados desde SIGE (MINEDUC).
 * 
 * Soporta archivos .xls generados por SIGE que internamente corresponden
 * a tablas HTML (MIME: application/vnd.ms-excel con estructura <table><tr><td>)
 * codificados en ISO-8859-1 / Latin-1.
 * 
 * Incluye módulo de equivalencias canónicas de cursos para comparar
 * denominaciones SIGE (ej. "NT1 A") contra plataformas (ej. "1er nivel de Transición (Pre-kinder) A").
 */

export interface SigeParsedStudent {
  rawIndex: number;
  numeroLista: number;
  nombres: string;
  apellidos: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string;
  run: number | null;
  rawRun: string;
  dv: string;
  codTipoEnsenanza?: string;
  tipoEnsenanza?: string;
  codGrado?: string;
  descGrado?: string;
  grado?: string;
  letra?: string;
  cursoDetected?: string;
}

export interface SigeCourseGroup {
  key: string;
  nombre: string;
  codTipoEnsenanza?: string;
  tipoEnsenanza?: string;
  codGrado?: string;
  descGrado?: string;
  grado?: string;
  letra?: string;
  hasOriginalListNumber: boolean;
  students: SigeParsedStudent[];
}

export interface SigeParseResult {
  success: boolean;
  error?: string;
  totalFound: number;
  groups: SigeCourseGroup[];
  hasHtmlTable: boolean;
  rawTitle?: string;
}

export type ColumnKey =
  | "numero_lista"
  | "run"
  | "dv"
  | "nombres"
  | "apellido_paterno"
  | "apellido_materno"
  | "apellidos"
  | "cod_tipo_ensenanza"
  | "tipo_ensenanza"
  | "cod_grado"
  | "desc_grado"
  | "grado"
  | "letra"
  | "curso"
  // Encabezados adicionales encontrados en el archivo real (detectados y omitidos deliberadamente)
  | "anio"
  | "rbd"
  | "genero"
  | "direccion"
  | "comuna_residencia"
  | "codigo_comuna_residencia"
  | "email"
  | "telefono"
  | "celular"
  | "fecha_nacimiento"
  | "codigo_etnia"
  | "fecha_incorporacion_curso"
  | "fecha_retiro"
  | "porcentaje_asistencia"
  | "promedio_final";

/**
 * Normaliza textos de encabezados para una detección flexible y robusta.
 */
export function normalizeHeader(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar tildes y diacríticos
    .replace(/[°º]/g, "°")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Capitaliza palabras para nombres de cursos institucionales (ej. "1° básico" -> "1° Básico").
 */
function capitalizeWords(text: string): string {
  return text
    .toLowerCase()
    .replace(/(?:^|\s|°)[a-záéíóúñ]/g, (letter) => letter.toUpperCase());
}

/**
 * Comprueba si el contenido del archivo parece contener HTML/tablas
 * o si es un archivo binario no soportado.
 */
export function isHtmlSigeContent(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  // Si contiene bytes nulos característicos de binarios OLE/BIFF (D0 CF 11 E0)
  if (text.includes("\0\0\0")) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes("<table") ||
    (lower.includes("<html") && lower.includes("<tr"))
  );
}

/**
 * Mapea una celda de encabezado normalizada a una clave conocida de columna.
 * Incluye todos los encabezados del archivo SIGE real.
 */
export function matchHeaderColumn(normalizedText: string): ColumnKey | null {
  const norm = normalizedText.trim();

  // 1. RUN / RUT (asegurar que no sea DV)
  if (
    norm === "run" ||
    norm === "rut" ||
    norm === "r.u.n" ||
    norm === "r.u.t" ||
    norm === "run alumno" ||
    norm === "rut alumno" ||
    norm === "run estudiante" ||
    norm === "rut estudiante" ||
    norm === "cuerpo run" ||
    norm === "cuerpo rut"
  ) {
    return "run";
  }

  // 2. DV / Dígito Ver. / Dígito Verificador
  if (
    norm === "digito ver." ||
    norm === "digito ver" ||
    norm === "dv" ||
    norm === "d.v." ||
    norm === "d.v" ||
    norm === "digito verificador" ||
    norm === "digito" ||
    norm === "dig. ver." ||
    norm === "dig. ver" ||
    norm === "d verificador" ||
    norm === "d. verificador"
  ) {
    return "dv";
  }

  // 3. Apellido Paterno
  if (
    norm === "apellido paterno" ||
    norm === "ape. paterno" ||
    norm === "ape paterno" ||
    norm === "paterno" ||
    norm === "primer apellido"
  ) {
    return "apellido_paterno";
  }

  // 4. Apellido Materno
  if (
    norm === "apellido materno" ||
    norm === "ape. materno" ||
    norm === "ape materno" ||
    norm === "materno" ||
    norm === "segundo apellido"
  ) {
    return "apellido_materno";
  }

  // 5. Apellidos (columna combinada alternativa)
  if (
    norm === "apellidos" ||
    norm === "apellidos del alumno" ||
    norm === "apellidos alumno" ||
    norm === "apellidos estudiante"
  ) {
    return "apellidos";
  }

  // 6. Nombres
  if (
    norm === "nombres" ||
    norm === "nombre" ||
    norm === "nombres del alumno" ||
    norm === "nombre alumno" ||
    norm === "nombres estudiante" ||
    norm === "nombre estudiante"
  ) {
    return "nombres";
  }

  // 7. Cod Tipo Enseñanza (SIGE Real)
  if (
    norm === "cod tipo ensenanza" ||
    norm === "cod. tipo ensenanza" ||
    norm === "codigo tipo ensenanza"
  ) {
    return "cod_tipo_ensenanza";
  }

  // 8. Tipo de Enseñanza
  if (
    norm === "tipo de ensenanza" ||
    norm === "ensenanza" ||
    norm === "tipo ensenanza" ||
    norm === "cod ensenanza" ||
    norm === "tipo educacion" ||
    norm === "ensenanza / nivel"
  ) {
    return "tipo_ensenanza";
  }

  // 9. Cod Grado (SIGE Real)
  if (
    norm === "cod grado" ||
    norm === "cod. grado" ||
    norm === "codigo grado"
  ) {
    return "cod_grado";
  }

  // 10. Desc Grado (SIGE Real)
  if (
    norm === "desc grado" ||
    norm === "desc. grado" ||
    norm === "descripcion grado"
  ) {
    return "desc_grado";
  }

  // 11. Grado / Nivel alternativo
  if (
    norm === "grado" ||
    norm === "nivel" ||
    norm === "grado/nivel" ||
    norm === "grado o nivel"
  ) {
    return "grado";
  }

  // 12. Letra Curso (SIGE Real) / Letra
  if (
    norm === "letra curso" ||
    norm === "letra" ||
    norm === "seccion" ||
    norm === "paralelo"
  ) {
    return "letra";
  }

  // 13. Número Lista (si viniera en alguna variante)
  if (
    norm === "n°" ||
    norm === "nº" ||
    norm === "n° lista" ||
    norm === "nº lista" ||
    norm === "numero" ||
    norm === "numero lista" ||
    norm === "lista" ||
    norm === "nro" ||
    norm === "nro." ||
    norm === "n° de lista" ||
    norm === "correlativo" ||
    norm === "n"
  ) {
    return "numero_lista";
  }

  // 14. Curso completo
  if (
    norm === "curso" ||
    norm === "grado y letra" ||
    norm === "curso y letra"
  ) {
    return "curso";
  }

  // Otros campos del archivo real reconocidos explícitamente pero no importados
  if (norm === "ano" || norm === "año") return "anio";
  if (norm === "rbd") return "rbd";
  if (norm === "genero") return "genero";
  if (norm === "direccion") return "direccion";
  if (norm === "comuna residencia") return "comuna_residencia";
  if (norm === "codigo comuna residencia" || norm === "cod comuna residencia") return "codigo_comuna_residencia";
  if (norm === "email" || norm === "correo") return "email";
  if (norm === "telefono") return "telefono";
  if (norm === "celular") return "celular";
  if (norm === "fecha nacimiento" || norm === "fec nacimiento") return "fecha_nacimiento";
  if (norm === "codigo etnia" || norm === "cod etnia") return "codigo_etnia";
  if (norm === "fecha incorporacion curso" || norm === "fec incorporacion") return "fecha_incorporacion_curso";
  if (norm === "fecha retiro" || norm === "fec retiro") return "fecha_retiro";
  if (norm === "%asistenca" || norm === "%asistencia" || norm === "asistencia") return "porcentaje_asistencia";
  if (norm === "promedio final" || norm === "prom final") return "promedio_final";

  return null;
}

/**
 * Normalización flexible de nombres de cursos para:
 * - Parvularia: NT1, NT2, Pre-Kínder, Kínder
 * - Básica: 1° Básico a 8° Básico
 * - Media: 1° Medio a 4° Medio
 * - Especial / Laboral: Laboral, Nivel Laboral 1, Nivel Laboral 2
 * 
 * Prioriza "Desc Grado" + "Letra Curso" (ej. "1° básico" + "A" -> "1° Básico A").
 */
export function normalizeCourseName(params: {
  codTipoEnsenanza?: string;
  tipoEnsenanza?: string;
  codGrado?: string;
  descGrado?: string;
  grado?: string;
  letra?: string;
  cursoCompleto?: string;
}): string {
  const {
    codTipoEnsenanza = "",
    tipoEnsenanza = "",
    descGrado = "",
    grado = "",
    letra = "",
    cursoCompleto = "",
  } = params;

  // Prioridad 1: Desc Grado + Letra Curso (del archivo real)
  const effectiveGrado = (descGrado || grado || "").trim();
  const cleanLetra = letra.trim().toUpperCase();

  if (effectiveGrado) {
    // Si viene solo un número aislado (ej. "1", "7"), estructurarlo según tipo de enseñanza
    const numOnlyMatch = effectiveGrado.match(/^([1-8])([°º]?)$/);
    if (numOnlyMatch) {
      const num = parseInt(numOnlyMatch[1], 10);
      const normE = normalizeHeader(tipoEnsenanza);
      const isMedia =
        normE.includes("media") ||
        codTipoEnsenanza === "310" ||
        codTipoEnsenanza === "410" ||
        codTipoEnsenanza === "510" ||
        codTipoEnsenanza === "610";

      if (isMedia || (num <= 4 && normE.includes("media"))) {
        return cleanLetra ? `${num}° Medio ${cleanLetra}` : `${num}° Medio`;
      }
      return cleanLetra ? `${num}° Básico ${cleanLetra}` : `${num}° Básico`;
    }

    // Conservar denominación original de SIGE (Requisito 5: Nombres mostrados)
    // Ej: "1er nivel de Transición (Pre-kinder)", "1° básico", "Laboral 1"
    if (cleanLetra) {
      const endsWithLetter = new RegExp(`(?:[\\s\\-_/()]|\\b)${cleanLetra}[\\)\\]]?$`, "i").test(effectiveGrado);
      if (!endsWithLetter) {
        return `${effectiveGrado} ${cleanLetra}`;
      }
    }
    return effectiveGrado;
  }

  // Prioridad 2: cursoCompleto (membrete)
  if (cursoCompleto && cursoCompleto.trim().length > 0) {
    const raw = cursoCompleto.trim().replace(/\s+/g, " ");
    const cleaned = cleanSingleCourseText(raw);
    if (cleaned) return cleaned;
    return raw;
  }

  // Fallback si sólo hay tipo de enseñanza o letra
  if (tipoEnsenanza.trim() && cleanLetra) {
    return `${tipoEnsenanza.trim()} ${cleanLetra}`;
  }

  if (cleanLetra) {
    return `Curso ${cleanLetra}`;
  }

  return "Curso detectado en archivo";
}

/**
 * Limpia y estandariza textos individuales de curso como "7° Basico A"
 */
function cleanSingleCourseText(raw: string): string {
  const norm = normalizeHeader(raw);

  // NT1 / NT2
  if (norm.includes("nt1") || norm.includes("pre-kinder") || norm.includes("prekinder")) {
    const letterMatch = raw.match(/\b([A-Za-z])\b$/);
    return letterMatch ? `NT1 ${letterMatch[1].toUpperCase()}` : "NT1";
  }
  if (norm.includes("nt2") || (norm.includes("kinder") && !norm.includes("pre"))) {
    const letterMatch = raw.match(/\b([A-Za-z])\b$/);
    return letterMatch ? `NT2 ${letterMatch[1].toUpperCase()}` : "NT2";
  }

  // Básica
  const basicaMatch = raw.match(/([1-8])\s*([°º]?)\s*(b[aá]sico?)\s*([A-Za-z])?/i);
  if (basicaMatch) {
    const num = basicaMatch[1];
    const letter = basicaMatch[4] ? ` ${basicaMatch[4].toUpperCase()}` : "";
    return `${num}° Básico${letter}`;
  }

  // Media
  const mediaMatch = raw.match(/([1-4])\s*([°º]?)\s*(medio?)\s*([A-Za-z])?/i);
  if (mediaMatch) {
    const num = mediaMatch[1];
    const letter = mediaMatch[4] ? ` ${mediaMatch[4].toUpperCase()}` : "";
    return `${num}° Medio${letter}`;
  }

  // Laboral
  if (norm.includes("laboral")) {
    return raw.trim();
  }

  return raw.trim();
}

/**
 * =========================================================================
 * ETAPA 13G — NORMALIZACIÓN CANÓNICA DE CURSOS PARA COMPARACIÓN
 * =========================================================================
 */

/**
 * Convierte cualquier denominación o variante de nivel a una clave canónica común.
 * Se usa EXCLUSIVAMENTE para comparación lógica entre cursos (no modifica textos visuales).
 * 
 * Equivalencias implementadas (Etapa 18C):
 * - NT1:
 *     "1er nivel de Transición (Pre-kinder)", "Primer nivel de transición",
 *     "NT1", "Pre-kinder", "Prekinder", "Pre kínder", "Transición Menor",
 *     "1° nivel de transición", "1º nivel de transición", "1er nivel de transición"
 *     → "NT1"
 * - NT2:
 *     "2° nivel de Transición (Kinder)", "Segundo nivel de transición",
 *     "NT2", "Kinder", "Kínder", "Transición Mayor",
 *     "2do nivel de transición", "2° nivel de transición", "2º nivel de transición"
 *     → "NT2"
 * - Básica:
 *     1° básico a 8° básico (y variantes "1º", "1 Basico", "Primero Básico")
 *     → "1B" a "8B"
 * - Media:
 *     1° medio a 4° medio (y variantes "1º", "1 Medio", "Primero Medio")
 *     → "1M" a "4M"
 * - Laboral:
 *     Laboral 1, Nivel Laboral 1, 1 Laboral → "LAB1" (LAB1..LAB4)
 */
export function getCanonicalLevel(rawText?: string): string | null {
  if (!rawText) return null;

  let norm = rawText
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar tildes
    .replace(/[°º]/g, "°")
    .replace(/[\(\)\[\]\-]/g, " ") // normalizar paréntesis y guiones
    .replace(/\s+/g, " ")
    .trim();

  // Quitar letra final aislada si viene en el texto (ej. "nt1 a", "1° basico b")
  norm = norm.replace(/\s+[a-z]$/i, "").trim();

  // Claves canónicas directas ya formateadas
  const directBasica = norm.match(/^([1-8])\s*b$/);
  if (directBasica) return `${directBasica[1]}B`;

  const directMedia = norm.match(/^([1-4])\s*m$/);
  if (directMedia) return `${directMedia[1]}M`;

  const directLab = norm.match(/^lab\s*([1-4])?$/);
  if (directLab) return directLab[1] ? `LAB${directLab[1]}` : "LAB1";

  // 1. PARVULARIA: NT1 (Pre-Kínder / 1er Nivel de Transición)
  if (
    /\bnt1\b/.test(norm) ||
    /pre\s*kinder/.test(norm) ||
    /prekinder/.test(norm) ||
    /(?:1er|1ero|1°|1º|1|primer|primero)\s+nivel\s+(?:de\s+)?transicion/.test(norm) ||
    /transicion\s+menor/.test(norm)
  ) {
    return "NT1";
  }

  // 2. PARVULARIA: NT2 (Kínder / 2do Nivel de Transición)
  if (
    /\bnt2\b/.test(norm) ||
    (/(?:2do|2°|2º|2|segundo)\s+nivel\s+(?:de\s+)?transicion/.test(norm) && !/\bpre\b/.test(norm)) ||
    /transicion\s+mayor/.test(norm) ||
    (/\bkinder\b/.test(norm) && !/\bpre\s*kinder\b/.test(norm) && !/\bpre\b/.test(norm))
  ) {
    return "NT2";
  }

  // 3. CURSO LABORAL / ESPECIAL
  const labMatch =
    norm.match(/(?:nivel\s+)?laboral\s*([1-4])/) ||
    norm.match(/([1-4])\s*(?:°|º)?\s*(?:nivel\s+)?laboral/);
  if (labMatch) {
    return `LAB${labMatch[1]}`;
  }
  if (/\blaboral\b/.test(norm)) {
    return "LAB1";
  }

  // 4. BÁSICA: 1B a 8B
  const wordToNum: Record<string, string> = {
    primero: "1",
    primer: "1",
    segundo: "2",
    tercero: "3",
    tercer: "3",
    cuarto: "4",
    quinto: "5",
    sexto: "6",
    septimo: "7",
    octavo: "8",
  };

  const basicaWordMatch = norm.match(
    /\b(primero|primer|segundo|tercero|tercer|cuarto|quinto|sexto|septimo|octavo)\s+basic[oa]/
  );
  if (basicaWordMatch) {
    const n = wordToNum[basicaWordMatch[1]];
    if (n) return `${n}B`;
  }

  const basicaNumMatch = norm.match(/([1-8])\s*(?:°|º|er|ero|ro|to|do|vo)?\s*basic[oa]/);
  if (basicaNumMatch) {
    return `${basicaNumMatch[1]}B`;
  }

  const basicaInvertedMatch = norm.match(/basic[oa]\s*(?:de\s+)?([1-8])/);
  if (basicaInvertedMatch) {
    return `${basicaInvertedMatch[1]}B`;
  }

  // 5. MEDIA: 1M a 4M
  const mediaWordMatch = norm.match(
    /\b(primero|primer|segundo|tercero|tercer|cuarto)\s+medi[oa]/
  );
  if (mediaWordMatch) {
    const n = wordToNum[mediaWordMatch[1]];
    if (n && parseInt(n, 10) <= 4) return `${n}M`;
  }

  const mediaNumMatch = norm.match(/([1-4])\s*(?:°|º|er|ero|ro|to|do)?\s*medi[oa]/);
  if (mediaNumMatch) {
    return `${mediaNumMatch[1]}M`;
  }

  const mediaInvertedMatch = norm.match(/medi[oa]\s*(?:de\s+)?([1-4])/);
  if (mediaInvertedMatch) {
    return `${mediaInvertedMatch[1]}M`;
  }

  return null;
}

/**
 * Extrae la letra del curso comparándola por separado.
 */
export function extractCourseLetter(text?: string, explicitLetter?: string): string {
  if (explicitLetter && /^[a-zA-Z]$/.test(explicitLetter.trim())) {
    return explicitLetter.trim().toUpperCase();
  }
  if (!text) return "";
  const trimmed = text.trim();
  if (/^[a-zA-Z]$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  const match = trimmed.match(/(?:[\s\-_/()]|\b)([a-zA-Z])(?:\s*[\)\]])?$/);
  if (match) {
    return match[1].toUpperCase();
  }
  return "";
}

/**
 * Genera la clave canónica completa para un curso (Nivel Canónico + Letra).
 * Ejemplos: "NT1_A", "NT2_B", "1B_A", "4M_C", "LAB1_A"
 */
export function getCanonicalCourseKey(params: {
  nombre?: string;
  nivel?: string;
  grado?: string;
  letra?: string;
  descGrado?: string;
}): string {
  const { nombre = "", nivel = "", grado = "", letra = "", descGrado = "" } = params;

  // 1. Obtener nivel canónico a partir del campo más descriptivo disponible
  const levelCandidates = [descGrado, nivel, grado, nombre].filter(Boolean);
  let canonicalLevel: string | null = null;
  for (const candidate of levelCandidates) {
    canonicalLevel = getCanonicalLevel(candidate);
    if (canonicalLevel) break;
  }

  // 2. Extraer letra de curso por separado
  let canonicalLetter = "";
  if (letra && /^[a-zA-Z]$/.test(letra.trim())) {
    canonicalLetter = letra.trim().toUpperCase();
  } else {
    const letterCandidates = [letra, nombre, descGrado, grado].filter(Boolean);
    for (const candidate of letterCandidates) {
      canonicalLetter = extractCourseLetter(candidate, letra);
      if (canonicalLetter) break;
    }
  }

  if (canonicalLevel) {
    return canonicalLetter ? `${canonicalLevel}_${canonicalLetter}` : canonicalLevel;
  }

  // Fallback si no encaja en reglas estándar (limpieza simple sin espacios ni diacríticos)
  return (nombre || `${grado} ${letra}`)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Comprueba si dos cursos corresponden al mismo curso mediante equivalencia canónica.
 * Maneja equivalencias de NT1/NT2, 1B..8B, 1M..4M, LAB1..4 separando la letra.
 */
export function areCoursesEquivalent(
  sigeCourse: {
    nombre?: string;
    nivel?: string;
    grado?: string;
    letra?: string;
    descGrado?: string;
  },
  platformCourse: {
    nombre?: string;
    nivel?: string;
    grado?: string;
    letra?: string;
  }
): boolean {
  const keyA = getCanonicalCourseKey(sigeCourse);
  const keyB = getCanonicalCourseKey(platformCourse);

  if (!keyA || !keyB) return false;
  return keyA === keyB;
}

/**
 * Formatea visualmente un RUN para despliegue en tabla (ej. 12.345.678-9).
 */
export function formatRutDisplay(run: number | null | undefined, dv: string | null | undefined): string {
  if (!run || isNaN(run)) return "";
  const str = run.toLocaleString("es-CL");
  return dv ? `${str}-${dv.toUpperCase()}` : str;
}

/**
 * Ordena estudiantes alfabéticamente por:
 * 1. Apellido Paterno
 * 2. Apellido Materno
 * 3. Nombres
 */
export function sortStudentsAlphabetically(students: SigeParsedStudent[]): SigeParsedStudent[] {
  return [...students].sort((a, b) => {
    // 1. Apellido Paterno
    const patA = (a.apellidoPaterno || a.apellidos || "").trim();
    const patB = (b.apellidoPaterno || b.apellidos || "").trim();
    const cmpPat = patA.localeCompare(patB, "es", { sensitivity: "base" });
    if (cmpPat !== 0) return cmpPat;

    // 2. Apellido Materno
    const matA = (a.apellidoMaterno || "").trim();
    const matB = (b.apellidoMaterno || "").trim();
    const cmpMat = matA.localeCompare(matB, "es", { sensitivity: "base" });
    if (cmpMat !== 0) return cmpMat;

    // 3. Nombres
    const nomA = (a.nombres || "").trim();
    const nomB = (b.nombres || "").trim();
    return nomA.localeCompare(nomB, "es", { sensitivity: "base" });
  });
}

/**
 * Parsea el texto del archivo SIGE (.xls HTML en ISO-8859-1) y extrae las nóminas de estudiantes.
 */
export function parseSigeHtml(htmlContent: string): SigeParseResult {
  if (!isHtmlSigeContent(htmlContent)) {
    return {
      success: false,
      error: "Este archivo SIGE no pudo ser leído con el formato actual. No se realizaron cambios.",
      totalFound: 0,
      groups: [],
      hasHtmlTable: false,
    };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const tables = Array.from(doc.querySelectorAll("table"));

    if (tables.length === 0) {
      return {
        success: false,
        error: "Este archivo SIGE no pudo ser leído con el formato actual. No se realizaron cambios.",
        totalFound: 0,
        groups: [],
        hasHtmlTable: false,
      };
    }

    // Buscar membretes en el documento o filas iniciales
    let docLevelCourse: string | undefined;
    const bodyText = doc.body.textContent || "";
    const courseRegex = /(?:curso|grado y letra)\s*:\s*([^\r\n,;]+)/i;
    const courseMatch = bodyText.match(courseRegex);
    if (courseMatch && courseMatch[1]) {
      docLevelCourse = courseMatch[1].trim();
    }

    const allStudents: SigeParsedStudent[] = [];
    let globalIndex = 0;

    // Procesar cada tabla encontrada
    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length < 2) continue;

      let headerRowIndex = -1;
      const columnMapping: Map<number, ColumnKey> = new Map();

      // Detectar cuál fila contiene los encabezados principales
      for (let r = 0; r < Math.min(rows.length, 15); r++) {
        const cells = Array.from(rows[r].querySelectorAll("th, td"));
        let hasRun = false;
        let hasName = false;
        const currentMap = new Map<number, ColumnKey>();

        cells.forEach((cell, colIndex) => {
          const text = cell.textContent || "";
          const norm = normalizeHeader(text);
          const matched = matchHeaderColumn(norm);
          if (matched) {
            currentMap.set(colIndex, matched);
            if (matched === "run") hasRun = true;
            if (
              matched === "nombres" ||
              matched === "apellido_paterno" ||
              matched === "apellidos"
            ) {
              hasName = true;
            }
          }
        });

        if (hasRun && hasName) {
          headerRowIndex = r;
          currentMap.forEach((v, k) => columnMapping.set(k, v));
          break;
        }
      }

      // Si no encontramos un encabezado válido en esta tabla, continuar con la siguiente
      if (headerRowIndex === -1) {
        continue;
      }

      // Extraer filas de datos a partir de headerRowIndex + 1
      for (let r = headerRowIndex + 1; r < rows.length; r++) {
        const cells = Array.from(rows[r].querySelectorAll("td, th"));
        if (cells.length === 0) continue;

        let rawRun = "";
        let rawDv = "";
        let rawNombres = "";
        let rawPaterno = "";
        let rawMaterno = "";
        let rawApellidos = "";
        let rawNumeroLista = "";
        let rawCodEnsenanza = "";
        let rawEnsenanza = "";
        let rawCodGrado = "";
        let rawDescGrado = "";
        let rawGrado = "";
        let rawLetra = "";
        let rawCurso = "";

        cells.forEach((cell, colIndex) => {
          const colKey = columnMapping.get(colIndex);
          if (!colKey) return;
          const val = (cell.textContent || "").trim();

          switch (colKey) {
            case "run":
              rawRun = val;
              break;
            case "dv":
              rawDv = val;
              break;
            case "nombres":
              rawNombres = val;
              break;
            case "apellido_paterno":
              rawPaterno = val;
              break;
            case "apellido_materno":
              rawMaterno = val;
              break;
            case "apellidos":
              rawApellidos = val;
              break;
            case "numero_lista":
              rawNumeroLista = val;
              break;
            case "cod_tipo_ensenanza":
              rawCodEnsenanza = val;
              break;
            case "tipo_ensenanza":
              rawEnsenanza = val;
              break;
            case "cod_grado":
              rawCodGrado = val;
              break;
            case "desc_grado":
              rawDescGrado = val;
              break;
            case "grado":
              rawGrado = val;
              break;
            case "letra":
              rawLetra = val;
              break;
            case "curso":
              rawCurso = val;
              break;
          }
        });

        // Omitir filas vacías o de totales al final
        if (!rawRun && !rawNombres && !rawPaterno && !rawApellidos) {
          continue;
        }

        // Parsear RUN y DV
        let parsedRunNumber: number | null = null;
        let cleanDv = rawDv.trim().toUpperCase();

        // Limpiar RUN de puntos, guiones y espacios
        let cleanRunStr = rawRun.replace(/[\.\-\s]/g, "");

        // Si el RUN contiene el DV adherido (ej. "21456789-K" o "21456789K") y rawDv estaba vacío:
        if (!cleanDv && cleanRunStr.length >= 2) {
          const matchWithDv = rawRun.match(/^(\d+)[\-\s]?([0-9kK])$/i);
          if (matchWithDv) {
            cleanRunStr = matchWithDv[1];
            cleanDv = matchWithDv[2].toUpperCase();
          }
        }

        // Si aún así no hay DV pero cleanRunStr termina en caracter
        if (!cleanDv && cleanRunStr.length > 7) {
          const lastChar = cleanRunStr.slice(-1).toUpperCase();
          const prevDigits = cleanRunStr.slice(0, -1);
          if (/^\d+$/.test(prevDigits) && /^[0-9K]$/.test(lastChar)) {
            cleanRunStr = prevDigits;
            cleanDv = lastChar;
          }
        }

        if (/^\d+$/.test(cleanRunStr)) {
          const num = parseInt(cleanRunStr, 10);
          if (!isNaN(num) && num > 0) {
            parsedRunNumber = num;
          }
        }

        // Construir nombres
        const nombres = rawNombres.replace(/\s+/g, " ").trim();

        // Construir apellidos
        let apellidos = "";
        if (rawPaterno || rawMaterno) {
          apellidos = `${rawPaterno} ${rawMaterno}`.trim().replace(/\s+/g, " ");
        } else if (rawApellidos) {
          apellidos = rawApellidos.trim().replace(/\s+/g, " ");
        }

        // Número de lista original si viniera en el archivo
        let parsedLista = parseInt(rawNumeroLista.trim(), 10);
        if (isNaN(parsedLista) || parsedLista <= 0) {
          parsedLista = 0;
        }

        // Identificar curso usando Desc Grado + Letra Curso prioritariamente
        const cursoDetected = normalizeCourseName({
          codTipoEnsenanza: rawCodEnsenanza,
          tipoEnsenanza: rawEnsenanza,
          codGrado: rawCodGrado,
          descGrado: rawDescGrado,
          grado: rawGrado,
          letra: rawLetra,
          cursoCompleto: rawCurso || docLevelCourse,
        });

        globalIndex++;
        allStudents.push({
          rawIndex: globalIndex,
          numeroLista: parsedLista,
          nombres,
          apellidos,
          apellidoPaterno: rawPaterno,
          apellidoMaterno: rawMaterno,
          run: parsedRunNumber,
          rawRun,
          dv: cleanDv,
          codTipoEnsenanza: rawCodEnsenanza,
          tipoEnsenanza: rawEnsenanza,
          codGrado: rawCodGrado,
          descGrado: rawDescGrado,
          grado: rawGrado || rawDescGrado,
          letra: rawLetra,
          cursoDetected,
        });
      }
    }

    if (allStudents.length === 0) {
      return {
        success: false,
        error: "Este archivo SIGE no pudo ser leído con el formato actual. No se encontraron filas de estudiantes válidas.",
        totalFound: 0,
        groups: [],
        hasHtmlTable: true,
      };
    }

    // Agrupar estudiantes por curso detectado
    const groupsMap = new Map<string, SigeParsedStudent[]>();

    allStudents.forEach((st) => {
      const groupKey = st.cursoDetected || "Curso detectado en archivo";
      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, []);
      }
      groupsMap.get(groupKey)!.push(st);
    });

    const groups: SigeCourseGroup[] = [];

    groupsMap.forEach((studentsInGroup, key) => {
      // Requisito 4: El archivo SIGE real no contiene número de lista.
      // Si el archivo no tiene número de lista, ordenar alfabéticamente por:
      // Apellido Paterno, Apellido Materno y Nombres, y asignar 1, 2, 3, 4...
      const hasOriginalListNumber = studentsInGroup.some((s) => s.numeroLista > 0);
      let finalStudents = studentsInGroup;

      if (!hasOriginalListNumber) {
        finalStudents = sortStudentsAlphabetically(studentsInGroup);
        finalStudents.forEach((s, idx) => {
          s.numeroLista = idx + 1;
        });
      } else {
        // Si vinieron números de lista, completar cualquier faltante
        const hasMissing = finalStudents.some((s) => s.numeroLista <= 0);
        if (hasMissing) {
          finalStudents.forEach((s, idx) => {
            if (s.numeroLista <= 0) {
              s.numeroLista = idx + 1;
            }
          });
        }
      }

      groups.push({
        key,
        nombre: key,
        codTipoEnsenanza: finalStudents[0]?.codTipoEnsenanza,
        tipoEnsenanza: finalStudents[0]?.tipoEnsenanza,
        codGrado: finalStudents[0]?.codGrado,
        descGrado: finalStudents[0]?.descGrado,
        grado: finalStudents[0]?.grado,
        letra: finalStudents[0]?.letra,
        hasOriginalListNumber,
        students: finalStudents,
      });
    });

    return {
      success: true,
      totalFound: allStudents.length,
      groups,
      hasHtmlTable: true,
      rawTitle: docLevelCourse,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error inesperado al parsear HTML.";
    return {
      success: false,
      error: `Este archivo SIGE no pudo ser leído con el formato actual: ${msg}`,
      totalFound: 0,
      groups: [],
      hasHtmlTable: false,
    };
  }
}
