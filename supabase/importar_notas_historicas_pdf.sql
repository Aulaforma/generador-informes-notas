-- ==============================================================================
-- ETAPA 19E: FUNCIÓN RPC PARA IMPORTACIÓN SEGURA DE NOTAS HISTÓRICAS DESDE PDF
-- ==============================================================================
-- Esta función permite a usuarios con rol UTP importar calificaciones del Periodo 1
-- directamente a las tablas oficiales de Supabase (evaluaciones y calificaciones).
--
-- CARACTERÍSTICAS PRINCIPALES:
-- 1. SECURITY DEFINER: Se ejecuta con privilegios elevados para permitir inserción
--    histórica incluso cuando el Periodo 1 se encuentre con 'cerrado = true'.
-- 2. search_path = public: Protegido contra ataques de secuestro de esquemas.
-- 3. Identificación estricta de UTP: Valida que auth.uid() pertenezca a un perfil
--    con rol = 'utp' y activo = true.
-- 4. Trazabilidad y Auditoría: Conserva auth.uid() en el contexto de sesión, de modo
--    que los triggers existentes de 'calificaciones' registren automáticamente en
--    'calificaciones_auditoria' con accion = 'INSERT' y el usuario_id del UTP.
-- 5. Manejo idempotente de evaluaciones: Intenta INSERT con ON CONFLICT DO NOTHING.
--    Si se insertó, incrementa el contador. Si ya existía, recupera el id existente.
-- 6. Detección de duplicados y conflictos: Si la calificación ya existe con el mismo
--    valor, se omite. Si existe con valor diferente, se marca como conflicto y NO se
--    sobrescribe.
-- 7. Tolerancia a fallos: Cada elemento se evalúa en un bloque seguro para no abortar
--    el lote completo si un registro puntual presenta error.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.importar_notas_historicas_pdf(p_notas JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_perfil RECORD;
  v_items JSONB;
  v_item JSONB;
  
  -- Variables por cada nota
  v_estudiante_id BIGINT;
  v_curso_asignatura_id BIGINT;
  v_periodo INT;
  v_orden INT;
  v_nota NUMERIC;
  v_nombre_eval TEXT;
  
  -- Variables de validación cruzada
  v_estudiante_curso_id BIGINT;
  v_ca_curso_id BIGINT;
  v_evaluacion_id BIGINT;
  v_calif_id BIGINT;
  v_calif_nota NUMERIC;
  
  -- Contadores de resultado
  v_insertadas INT := 0;
  v_duplicadas INT := 0;
  v_conflictos INT := 0;
  v_evaluaciones_creadas INT := 0;
  v_errores JSONB := '[]'::JSONB;
BEGIN
  -- ----------------------------------------------------------------------------
  -- 1. VERIFICACIÓN DE AUTENTICACIÓN Y ROL UTP
  -- ----------------------------------------------------------------------------
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: Se requiere sesión de usuario autenticada.';
  END IF;

  SELECT id, nombre, rol, activo
  INTO v_perfil
  FROM public.perfiles
  WHERE id = v_caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acceso denegado: No existe perfil registrado para el usuario autenticado.';
  END IF;

  IF v_perfil.rol <> 'utp' THEN
    RAISE EXCEPTION 'Acceso denegado: Esta función es exclusiva para usuarios con rol UTP.';
  END IF;

  IF v_perfil.activo IS NOT TRUE THEN
    RAISE EXCEPTION 'Acceso denegado: El perfil UTP se encuentra inactivo.';
  END IF;

  -- ----------------------------------------------------------------------------
  -- 2. NORMALIZACIÓN Y VALIDACIÓN DEL PAYLOAD
  -- ----------------------------------------------------------------------------
  IF jsonb_typeof(p_notas) = 'object' AND p_notas ? 'notas' THEN
    v_items := p_notas->'notas';
  ELSIF jsonb_typeof(p_notas) = 'array' THEN
    v_items := p_notas;
  ELSE
    RAISE EXCEPTION 'Formato de payload inválido. Se espera un arreglo JSON o un objeto con la propiedad "notas".';
  END IF;

  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' THEN
    RAISE EXCEPTION 'El conjunto de notas a procesar debe ser un arreglo JSON válido.';
  END IF;

  IF jsonb_array_length(v_items) = 0 THEN
    RETURN jsonb_build_object(
      'insertadas', 0,
      'duplicadas', 0,
      'conflictos', 0,
      'evaluaciones_creadas', 0,
      'errores', '[]'::JSONB
    );
  END IF;

  -- ----------------------------------------------------------------------------
  -- 3. PROCESAMIENTO ELEMENTO POR ELEMENTO (CON SAVEPOINTS / EXCEPCIONES AISLADAS)
  -- ----------------------------------------------------------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    BEGIN
      -- Extracción de datos con casteo seguro
      v_estudiante_id := NULLIF(TRIM(v_item->>'estudiante_id'), '')::BIGINT;
      v_curso_asignatura_id := NULLIF(TRIM(v_item->>'curso_asignatura_id'), '')::BIGINT;
      v_periodo := COALESCE(NULLIF(TRIM(v_item->>'periodo'), '')::INT, 1);
      v_orden := NULLIF(TRIM(v_item->>'orden'), '')::INT;
      v_nota := NULLIF(TRIM(v_item->>'nota'), '')::NUMERIC;
      v_nombre_eval := NULLIF(TRIM(v_item->>'nombre_evaluacion'), '');

      -- Validación 1: Campos requeridos presentes
      IF v_estudiante_id IS NULL OR v_curso_asignatura_id IS NULL OR v_orden IS NULL OR v_nota IS NULL THEN
        RAISE EXCEPTION 'Faltan parámetros obligatorios (estudiante_id, curso_asignatura_id, orden o nota).';
      END IF;

      -- Validación 2: Rango de nota (1.0 a 7.0 en escala oficial chilena)
      IF v_nota < 1.0 OR v_nota > 7.0 THEN
        RAISE EXCEPTION 'Nota inválida (%). Debe estar en la escala de 1.0 a 7.0.', v_nota;
      END IF;

      -- Validación 3: Restricción exclusiva a Periodo 1 en esta etapa
      IF v_periodo <> 1 THEN
        RAISE EXCEPTION 'Período no permitido (%). Solo se permite importar Periodo 1 en esta etapa.', v_periodo;
      END IF;

      -- Validación 4: Orden válido
      IF v_orden < 1 THEN
        RAISE EXCEPTION 'Orden de evaluación inválido (%). Debe ser mayor o igual a 1.', v_orden;
      END IF;

      IF v_nombre_eval IS NULL THEN
        v_nombre_eval := 'Nota histórica ' || v_orden;
      END IF;

      -- Validación 5: Existencia del estudiante y obtención de su curso
      SELECT curso_id
      INTO v_estudiante_curso_id
      FROM public.estudiantes
      WHERE id = v_estudiante_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Estudiante con ID % no encontrado en el sistema.', v_estudiante_id;
      END IF;

      -- Validación 6: Existencia de curso_asignatura y verificación de coherencia de curso
      SELECT curso_id
      INTO v_ca_curso_id
      FROM public.curso_asignaturas
      WHERE id = v_curso_asignatura_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Asignatura con curso_asignatura_id % no existe.', v_curso_asignatura_id;
      END IF;

      IF v_estudiante_curso_id <> v_ca_curso_id THEN
        RAISE EXCEPTION 'Inconsistencia de curso: el estudiante (curso %) y la asignatura (curso %) no coinciden.',
          v_estudiante_curso_id, v_ca_curso_id;
      END IF;

      -- ------------------------------------------------------------------------
      -- 4. GESTIÓN DE EVALUACIONES (REUTILIZAR O CREAR HISTÓRICA)
      -- ------------------------------------------------------------------------
      v_evaluacion_id := NULL;

      INSERT INTO public.evaluaciones (
        curso_asignatura_id,
        nombre,
        periodo,
        orden,
        fecha,
        created_at
      ) VALUES (
        v_curso_asignatura_id,
        v_nombre_eval,
        1,
        v_orden,
        NULL,
        NOW()
      )
      ON CONFLICT (curso_asignatura_id, periodo, orden) DO NOTHING
      RETURNING id INTO v_evaluacion_id;

      IF v_evaluacion_id IS NOT NULL THEN
        v_evaluaciones_creadas := v_evaluaciones_creadas + 1;
      ELSE
        SELECT id
        INTO v_evaluacion_id
        FROM public.evaluaciones
        WHERE curso_asignatura_id = v_curso_asignatura_id
          AND periodo = 1
          AND orden = v_orden;
      END IF;

      -- ------------------------------------------------------------------------
      -- 5. GESTIÓN DE CALIFICACIONES (INSERT / DUPLICADO / CONFLICTO)
      -- ------------------------------------------------------------------------
      v_calif_id := NULL;
      v_calif_nota := NULL;

      SELECT id, nota
      INTO v_calif_id, v_calif_nota
      FROM public.calificaciones
      WHERE estudiante_id = v_estudiante_id
        AND evaluacion_id = v_evaluacion_id;

      IF NOT FOUND THEN
        -- No existe calificación previa -> Inserción oficial
        -- El trigger de auditoría sobre 'calificaciones' registrará automáticamente
        -- la acción 'INSERT' con usuario_id = auth.uid().
        INSERT INTO public.calificaciones (
          estudiante_id,
          evaluacion_id,
          nota,
          created_at,
          updated_at
        ) VALUES (
          v_estudiante_id,
          v_evaluacion_id,
          ROUND(v_nota, 1),
          NOW(),
          NOW()
        );

        v_insertadas := v_insertadas + 1;
      ELSE
        -- Ya existe calificación previa
        IF v_calif_nota IS NOT NULL AND ROUND(v_calif_nota, 1) = ROUND(v_nota, 1) THEN
          -- DUPLICADO: exactamente el mismo valor numérico
          v_duplicadas := v_duplicadas + 1;
        ELSE
          -- CONFLICTO: valor existente difiere del PDF -> NO sobrescribir
          v_conflictos := v_conflictos + 1;
        END IF;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- Capturar error individual sin cancelar las demás notas del lote
      v_errores := v_errores || jsonb_build_object(
        'estudiante_id', v_item->>'estudiante_id',
        'curso_asignatura_id', v_item->>'curso_asignatura_id',
        'orden', v_item->>'orden',
        'nota', v_item->>'nota',
        'error', SQLERRM
      );
    END;
  END LOOP;

  -- ----------------------------------------------------------------------------
  -- 6. RETORNO DE RESUMEN ESTRUCTURADO
  -- ----------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'insertadas', v_insertadas,
    'duplicadas', v_duplicadas,
    'conflictos', v_conflictos,
    'evaluaciones_creadas', v_evaluaciones_creadas,
    'errores', v_errores
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- POLÍTICAS DE ACCESO: SOLO AUTENTICADOS (REVOCADO A ANON Y PUBLIC)
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.importar_notas_historicas_pdf(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.importar_notas_historicas_pdf(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.importar_notas_historicas_pdf(JSONB) TO authenticated;

COMMENT ON FUNCTION public.importar_notas_historicas_pdf(JSONB) IS
  'Importación masiva segura de calificaciones del Periodo 1 desde PDF por UTP. Crea evaluaciones históricas faltantes y audita con auth.uid().';
