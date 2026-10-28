import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServerAdmin";

/**
 * RUTA ADMINISTRATIVA TEMPORAL: RECUPERACIÓN DE ACCESO UTP
 *
 * Permite restablecer la contraseña del usuario con rol UTP en Supabase Auth
 * de forma directa y segura cuando no se tiene acceso a la consola de Supabase.
 *
 * SEGURIDAD:
 * - Protegida mediante el header 'x-recovery-secret' comparado con RECOVERY_ADMIN_SECRET.
 * - Validación estricta en public.perfiles (rol = 'utp' y activo = true).
 * - No modifica tablas de perfiles, roles, cursos ni notas.
 * - No expone secretos ni claves en logs ni respuestas.
 */
export async function POST(request: NextRequest) {
  // 1. Verificación del secreto administrativo temporal
  const expectedSecret = process.env.RECOVERY_ADMIN_SECRET;
  const providedSecret = request.headers.get("x-recovery-secret");

  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json(
      { error: "Acceso no autorizado." },
      { status: 403 }
    );
  }

  // 2. Validación del payload
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "El cuerpo de la solicitud no es un JSON válido." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "El cuerpo de la solicitud es requerido." },
      { status: 400 }
    );
  }

  const { email, nuevaPassword } = body as Record<string, unknown>;

  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json(
      { error: "El parámetro 'email' es obligatorio y debe ser un texto." },
      { status: 400 }
    );
  }

  if (typeof nuevaPassword !== "string" || !nuevaPassword.trim()) {
    return NextResponse.json(
      { error: "El parámetro 'nuevaPassword' es obligatorio y debe ser un texto." },
      { status: 400 }
    );
  }

  if (nuevaPassword.length < 6) {
    return NextResponse.json(
      { error: "La contraseña debe tener un mínimo de 6 caracteres." },
      { status: 400 }
    );
  }

  const targetEmail = email.trim().toLowerCase();

  // 3. Obtener cliente administrativo Supabase
  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error de configuración de Supabase Admin.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    // 4. Buscar el usuario por email en Supabase Auth (paginado seguro)
    let page = 1;
    let authUser: { id: string; email?: string } | null = null;

    while (true) {
      const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 100,
      });

      if (listError) {
        return NextResponse.json(
          { error: `Error al buscar usuario en Supabase Auth: ${listError.message}` },
          { status: 500 }
        );
      }

      const match = usersData.users.find(
        (u) => u.email?.trim().toLowerCase() === targetEmail
      );

      if (match) {
        authUser = match;
        break;
      }

      if (!usersData.nextPage || usersData.users.length === 0) {
        break;
      }

      page = usersData.nextPage;
    }

    if (!authUser) {
      return NextResponse.json(
        { error: "No se encontró un usuario con el email proporcionado en Supabase Auth." },
        { status: 404 }
      );
    }

    // 5. Validar que exista perfil en public.perfiles con rol = 'utp' y activo = true
    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from("perfiles")
      .select("id, rol, activo")
      .eq("id", authUser.id)
      .maybeSingle();

    if (perfilError) {
      return NextResponse.json(
        { error: `Error al verificar perfil en la base de datos: ${perfilError.message}` },
        { status: 500 }
      );
    }

    if (!perfil) {
      return NextResponse.json(
        { error: "No existe un perfil asociado para el usuario indicado." },
        { status: 404 }
      );
    }

    const isUtp = perfil.rol?.toLowerCase() === "utp";
    const isActivo = Boolean(perfil.activo);

    if (!isUtp || !isActivo) {
      return NextResponse.json(
        {
          error:
            "El usuario no cumple con las condiciones requeridas (debe poseer rol 'utp' y encontrarse activo).",
        },
        { status: 403 }
      );
    }

    // 6. Restablecer la contraseña en Supabase Auth usando la Admin API
    // NO se modifica rol, docente_id, perfiles, cursos, notas ni RLS.
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      authUser.id,
      {
        password: nuevaPassword,
      }
    );

    if (updateError) {
      return NextResponse.json(
        { error: `Error al actualizar la contraseña: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Contraseña de usuario UTP actualizada correctamente.",
      userId: authUser.id,
      email: authUser.email,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno del servidor.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
