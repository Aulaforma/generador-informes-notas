import { NextRequest, NextResponse } from "next/server";
import {
  authorizeUtpUser,
  generateTemporaryPassword,
  registrarAuditoriaAcceso,
} from "@/lib/supabaseServerAdmin";

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

    // 11. Auditoría administrativa no bloqueante
    const auditOk = await registrarAuditoriaAcceso(supabaseAdmin, {
      usuarioUtpId: auth.requesterUser.id,
      docenteId: docente.id,
      usuarioDocenteId: newUserId,
      accion: "crear_acceso",
    });

    return NextResponse.json({
      success: true,
      message: "Acceso creado correctamente.",
      docenteId: docente.id,
      email: cleanEmail,
      temporalPassword: temporaryPassword,
      auditWarning: !auditOk,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Error inesperado al procesar la solicitud.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

