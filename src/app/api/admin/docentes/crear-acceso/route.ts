import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";
import crypto from "crypto";

/**
 * Genera una contraseña temporal aleatoria segura.
 * Requisitos:
 * - Al menos 12 caracteres (14 por defecto).
 * - Al menos una letra mayúscula.
 * - Al menos una letra minúscula.
 * - Al menos un dígito numérico.
 * - Al menos un carácter especial.
 */
function generateTemporaryPassword(length: number = 14): string {
  const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
  const NUMBERS = "0123456789";
  const SPECIAL = "!@#$%&*+=-?";

  // Garantizar al menos uno de cada conjunto requerido
  const requiredChars = [
    UPPERCASE[crypto.randomInt(0, UPPERCASE.length)],
    LOWERCASE[crypto.randomInt(0, LOWERCASE.length)],
    NUMBERS[crypto.randomInt(0, NUMBERS.length)],
    SPECIAL[crypto.randomInt(0, SPECIAL.length)],
  ];

  const allChars = UPPERCASE + LOWERCASE + NUMBERS + SPECIAL;
  const remainingCount = Math.max(12, length) - requiredChars.length;
  const passwordChars = [...requiredChars];

  for (let i = 0; i < remainingCount; i++) {
    passwordChars.push(allChars[crypto.randomInt(0, allChars.length)]);
  }

  // Mezclar los caracteres de forma segura (Fisher-Yates)
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
  }

  return passwordChars.join("");
}

/**
 * Helper para autenticar y autorizar que la petición provenga
 * de un usuario con sesión válida, activo y con rol 'utp'.
 */
async function authorizeUtpUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "No se proporcionó token de sesión institucional." },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Token de sesión vacío o inválido." },
        { status: 401 }
      ),
    };
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return {
      authorized: false,
      response: NextResponse.json({ error: msg }, { status: 500 }),
    };
  }

  // 1. Validar el token contra Supabase Auth
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Sesión no válida o expirada. Por favor inicie sesión nuevamente." },
        { status: 401 }
      ),
    };
  }

  // 2. Consultar public.perfiles para verificar rol 'utp' y activo = true
  const { data: perfil, error: perfilError } = await supabaseAdmin
    .from("perfiles")
    .select("id, rol, activo")
    .eq("id", user.id)
    .maybeSingle();

  if (perfilError || !perfil) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "No se encontró el perfil del usuario solicitante." },
        { status: 403 }
      ),
    };
  }

  if (!perfil.activo) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Su cuenta institucional se encuentra desactivada." },
        { status: 403 }
      ),
    };
  }

  if (perfil.rol?.toLowerCase() !== "utp") {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Acceso denegado: Se requiere rol de Unidad Técnico Pedagógica (UTP)." },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    supabaseAdmin,
    requesterUser: user,
  };
}

/**
 * GET: Devuelve los IDs de los docentes que ya cuentan con un acceso activo vinculado.
 */
export async function GET(request: NextRequest) {
  const auth = await authorizeUtpUser(request);
  if (!auth.authorized || !auth.supabaseAdmin) {
    return auth.response;
  }

  try {
    const { data: perfiles, error } = await auth.supabaseAdmin
      .from("perfiles")
      .select("docente_id")
      .not("docente_id", "is", null);

    if (error) {
      return NextResponse.json(
        { error: `Error al consultar accesos: ${error.message}` },
        { status: 500 }
      );
    }

    const docenteIdsConAcceso: number[] = (perfiles || [])
      .map((p) => p.docente_id)
      .filter((id): id is number => typeof id === "number");

    return NextResponse.json({
      success: true,
      docenteIdsConAcceso,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error inesperado.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST: Crea el acceso institucional para un docente registrado.
 * Body esperado: { docenteId: number }
 */
export async function POST(request: NextRequest) {
  const auth = await authorizeUtpUser(request);
  if (!auth.authorized || !auth.supabaseAdmin) {
    return auth.response;
  }

  const { supabaseAdmin } = auth;

  try {
    const body = await request.json();
    const docenteId = Number(body?.docenteId);

    if (!docenteId || isNaN(docenteId)) {
      return NextResponse.json(
        { error: "El identificador del docente es requerido y debe ser numérico." },
        { status: 400 }
      );
    }

    // 5. Buscar el docente en Supabase
    const { data: docente, error: docenteError } = await supabaseAdmin
      .from("docentes")
      .select("id, nombres, apellidos, email, activo")
      .eq("id", docenteId)
      .maybeSingle();

    if (docenteError) {
      return NextResponse.json(
        { error: `Error al consultar la tabla docentes: ${docenteError.message}` },
        { status: 500 }
      );
    }

    if (!docente) {
      return NextResponse.json(
        { error: "El docente especificado no existe en el sistema." },
        { status: 404 }
      );
    }

    // 6. Validar que tenga correo registrado
    const cleanEmail = docente.email?.trim().toLowerCase();
    if (!cleanEmail) {
      return NextResponse.json(
        { error: "El docente no tiene un correo institucional registrado. Edite el docente y asigne un correo antes de generar su acceso." },
        { status: 400 }
      );
    }

    // 7. Comprobar si ya existe un perfil vinculado a este docente_id
    const { data: perfilExistente, error: checkPerfilError } = await supabaseAdmin
      .from("perfiles")
      .select("id, docente_id")
      .eq("docente_id", docente.id)
      .maybeSingle();

    if (checkPerfilError) {
      return NextResponse.json(
        { error: `Error al comprobar perfiles existentes: ${checkPerfilError.message}` },
        { status: 500 }
      );
    }

    if (perfilExistente) {
      return NextResponse.json(
        { error: "Este docente ya posee acceso al sistema." },
        { status: 409 }
      );
    }

    // 8. Generar contraseña temporal aleatoria segura (mínimo 12 caracteres, mayúscula, minúscula, número, especial)
    const temporaryPassword = generateTemporaryPassword(14);

    // 9. Crear usuario en Supabase Auth mediante Supabase Admin API
    const { data: authCreatedData, error: createAuthError } =
      await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          nombre_completo: `Prof. ${docente.apellidos}, ${docente.nombres}`,
          docente_id: docente.id,
        },
      });

    if (createAuthError) {
      const errorMsg = createAuthError.message.toLowerCase();
      // Si el correo ya existe en Supabase Auth
      if (
        errorMsg.includes("already") ||
        errorMsg.includes("registered") ||
        errorMsg.includes("exists") ||
        createAuthError.status === 422
      ) {
        return NextResponse.json(
          { error: "Este docente ya posee acceso al sistema." },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: `Error al crear el usuario en Supabase Auth: ${createAuthError.message}` },
        { status: 500 }
      );
    }

    const newUserId = authCreatedData.user.id;

    // 9. Crear / Vincular registro en public.perfiles
    const { error: insertPerfilError } = await supabaseAdmin
      .from("perfiles")
      .upsert({
        id: newUserId,
        nombre: `Prof. ${docente.nombres} ${docente.apellidos}`.trim(),
        rol: "docente",
        docente_id: docente.id,
        activo: true,
        debe_cambiar_password: true,
      });

    // 10. Integridad y Rollback si falla la creación del perfil
    if (insertPerfilError) {
      console.error(
        `[CREAR_ACCESO] Falla al crear perfil para usuario ${newUserId}. Iniciando rollback en Auth...`,
        insertPerfilError
      );

      try {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        console.log(`[CREAR_ACCESO] Rollback exitoso: usuario ${newUserId} eliminado de Auth.`);
      } catch (rollbackError) {
        console.error(
          `[CREAR_ACCESO_CRITICO] Falla al eliminar usuario ${newUserId} durante rollback:`,
          rollbackError
        );
      }

      return NextResponse.json(
        {
          error: `Error al vincular el perfil en la base de datos: ${insertPerfilError.message}. Se revirtió la creación de la cuenta para mantener la integridad.`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Acceso creado correctamente.",
      docenteId: docente.id,
      email: cleanEmail,
      temporalPassword: temporaryPassword,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Error inesperado al procesar la solicitud.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
