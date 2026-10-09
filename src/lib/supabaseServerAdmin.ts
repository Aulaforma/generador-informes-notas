import { createClient } from "@supabase/supabase-js";

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
