import { NextRequest, NextResponse } from "next/server";
import {
  authorizeUtpUser,
  generateTemporaryPassword,
} from "@/lib/supabaseServerAdmin";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/docentes/restablecer-acceso
 *
 * Permite que un usuario UTP activo restablezca el acceso de un docente con cuenta existente.
 * Genera una nueva contraseña temporal aleatoria segura y obliga al docente a cambiarla
 * en su siguiente inicio de sesión (debe_cambiar_password = true).
 *
 * La contraseña temporal nunca se almacena en base de datos ni se registra en logs.
 */
export async function POST(request: NextRequest) {
  // 1-4. Exigir Bearer token válido, verificar solicitante UTP activo
  const auth = await authorizeUtpUser(request);
  if (!auth.authorized || !auth.supabaseAdmin) {
    return auth.response;
  }

  const { supabaseAdmin } = auth;

  try {
    // 5. Recibir únicamente el docente_id (soporta docente_id o docenteId)
    const body = await request.json();
    const rawId = body?.docente_id ?? body?.docenteId;
    const docenteId = Number(rawId);

    if (!docenteId || isNaN(docenteId)) {
      return NextResponse.json(
        { error: "El identificador del docente es requerido y debe ser numérico." },
        { status: 400 }
      );
    }

    // 6. Consultar public.docentes
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

    // 7. Comprobar que el docente existe
    if (!docente) {
      return NextResponse.json(
        { error: "El docente especificado no existe en el sistema." },
        { status: 404 }
      );
    }

    // 8. Localizar su perfil mediante perfiles.docente_id
    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from("perfiles")
      .select("id, nombre, rol, activo, docente_id, debe_cambiar_password")
      .eq("docente_id", docente.id)
      .maybeSingle();

    if (perfilError) {
      return NextResponse.json(
        { error: `Error al consultar perfiles: ${perfilError.message}` },
        { status: 500 }
      );
    }

    // 10. Si el docente NO posee acceso: NO crear automáticamente una cuenta
    if (!perfil) {
      return NextResponse.json(
        { error: "Este docente aún no posee acceso al sistema." },
        { status: 400 }
      );
    }

    // 9. Comprobar rol docente y UUID válido
    if (perfil.rol?.toLowerCase() !== "docente") {
      return NextResponse.json(
        { error: "El perfil asociado no corresponde al rol de docente." },
        { status: 400 }
      );
    }

    if (!perfil.id || !UUID_REGEX.test(perfil.id)) {
      return NextResponse.json(
        { error: "El perfil no tiene un identificador de usuario válido asociado a auth.users." },
        { status: 400 }
      );
    }

    // Verificar existencia del usuario en Supabase Auth
    const { data: authUserData, error: authUserError } =
      await supabaseAdmin.auth.admin.getUserById(perfil.id);

    if (authUserError || !authUserData?.user) {
      return NextResponse.json(
        {
          error:
            "No se encontró la cuenta de usuario correspondiente en el servicio de autenticación.",
        },
        { status: 404 }
      );
    }

    // DOCENTES INACTIVOS: Si el perfil o docente está inactivo, bloquear el restablecimiento
    if (docente.activo === false || perfil.activo === false) {
      return NextResponse.json(
        { error: "El acceso de este docente se encuentra desactivado." },
        { status: 403 }
      );
    }

    // 11. Generar una nueva contraseña temporal ALEATORIA y segura
    const temporaryPassword = generateTemporaryPassword(14);

    // 12. Actualizar la contraseña del usuario mediante Supabase Admin Auth
    const { error: updateAuthError } =
      await supabaseAdmin.auth.admin.updateUserById(perfil.id, {
        password: temporaryPassword,
      });

    // 14. Si falla Auth: NO modificar debe_cambiar_password
    if (updateAuthError) {
      console.error(
        `[RESTABLECER_ACCESO] Falla al actualizar contraseña en Auth para usuario ${perfil.id}:`,
        updateAuthError.message
      );
      return NextResponse.json(
        {
          error: `Error al actualizar la contraseña en el servicio de autenticación: ${updateAuthError.message}`,
        },
        { status: 500 }
      );
    }

    // 13. Solamente después de actualizar Auth: actualizar public.perfiles debe_cambiar_password = true
    // No modificar rol, docente_id, nombre, activo
    const { error: updatePerfilError } = await supabaseAdmin
      .from("perfiles")
      .update({ debe_cambiar_password: true })
      .eq("id", perfil.id);

    // 15. Si Auth se actualiza pero falla la actualización del perfil:
    if (updatePerfilError) {
      console.error(
        `[RESTABLECER_ACCESO_INCOMPLETO] Se actualizó Auth para usuario ${perfil.id}, pero falló la actualización del perfil:`,
        updatePerfilError.message
      );
      return NextResponse.json(
        {
          error:
            "El restablecimiento de acceso quedó incompleto: se actualizó la contraseña en autenticación pero ocurrió un error al marcar el cambio obligatorio en su perfil. Contacte al soporte técnico.",
        },
        { status: 500 }
      );
    }

    const cleanEmail =
      docente.email?.trim().toLowerCase() ||
      authUserData.user.email?.trim().toLowerCase() ||
      "";

    // Retornar la contraseña temporal una sola vez al solicitante UTP
    return NextResponse.json({
      success: true,
      message: "Acceso restablecido correctamente.",
      email: cleanEmail,
      temporalPassword: temporaryPassword,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Error inesperado al procesar el restablecimiento.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
