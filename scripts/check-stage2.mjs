import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStage2() {
  console.log("=== Verificando tablas para Etapa 2 ===");

  // 1. Verificar tabla 'cursos'
  const resCursos = await supabase.from("cursos").select("*");
  console.log("\n1. Tabla 'cursos':", {
    status: resCursos.status,
    error: resCursos.error?.message,
    count: resCursos.data?.length,
    data: resCursos.data,
  });

  // 2. Verificar tabla 'asignaturas'
  const resAsignaturas = await supabase.from("asignaturas").select("*");
  console.log("\n2. Tabla 'asignaturas':", {
    status: resAsignaturas.status,
    error: resAsignaturas.error?.message,
    count: resAsignaturas.data?.length,
    data: resAsignaturas.data,
  });

  // 3. Verificar tabla 'curso_asignaturas'
  const resCursoAsignaturas = await supabase.from("curso_asignaturas").select("*");
  console.log("\n3. Tabla 'curso_asignaturas':", {
    status: resCursoAsignaturas.status,
    error: resCursoAsignaturas.error?.message,
    count: resCursoAsignaturas.data?.length,
    data: resCursoAsignaturas.data,
  });
}

checkStage2();
