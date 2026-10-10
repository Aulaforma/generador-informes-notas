import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * Cliente administrativo de Supabase con privilegios elevados (service_role).
 * Este cliente debe ejecutarse exclusivamente en el entorno de servidor (Node.js/Next.js Server)
 * y NUNCA debe ser expuesto ni importado en componentes del cliente ("use client").
 */
export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "Error de configuración del servidor: Falta NEXT_PUBLIC_SUPABASE_URL."
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "Error de configuración del servidor: Falta la variable SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor. Esta clave es indispensable para invocar la API administrativa de Supabase Auth."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Genera una contraseña temporal aleatoria segura.
 * Requisitos:
 * - Al menos 12 caracteres (14 por defecto).
 * - Al menos una letra mayúscula.
 * - Al menos una letra minúscula.
 * - Al menos un dígito numérico.
 * - Al menos un carácter especial.
 */
export function generateTemporaryPassword(length: number = 14): string {
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

export type AuthorizeUtpResult =
  | {
      authorized: true;
      supabaseAdmin: SupabaseClient;
      requesterUser: User;
    }
  | {
      authorized: false;
      response: NextResponse;
      supabaseAdmin?: undefined;
      requesterUser?: undefined;
    };

/**
 * Helper para autenticar y autorizar que la petición provenga
 * de un usuario con sesión válida, activo y con rol 'utp'.
 */
export async function authorizeUtpUser(request: NextRequest): Promise<AuthorizeUtpResult> {
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

  let supabaseAdmin: SupabaseClient;
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
