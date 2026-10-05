import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEvaluaciones() {
  console.log("=== Comprobando tabla 'evaluaciones' ===");

  // 1. Consultar evaluaciones existentes
  const { data, error, status } = await supabase
    .from("evaluaciones")
    .select("*")
    .order("orden", { ascending: true });

  console.log("Status:", status);
  console.log("Error:", error);
  console.log("Cantidad total de evaluaciones en Supabase:", data?.length);
  if (data && data.length > 0) {
    console.log("Columnas de 'evaluaciones':", Object.keys(data[0]));
    console.table(data);
  }

  // 2. Comprobar si RLS permite o bloquea INSERT en 'evaluaciones'
  console.log("\n=== Verificando permisos de INSERT en 'evaluaciones' ===");
  const testInsert = await supabase
    .from("evaluaciones")
    .insert({
      curso_asignatura_id: 1,
      nombre: "Prueba Test Permisos",
      orden: 999,
      periodo: "Segundo semestre",
    })
    .select();

  console.log("Resultado prueba INSERT:", {
    status: testInsert.status,
    error: testInsert.error ? {
      code: testInsert.error.code,
      message: testInsert.error.message,
      details: testInsert.error.details,
    } : null,
    insertedData: testInsert.data,
  });

  // Si se insertó por prueba, limpiarlo
  if (testInsert.data && testInsert.data.length > 0) {
    const idToDelete = testInsert.data[0].id;
    await supabase.from("evaluaciones").delete().eq("id", idToDelete);
    console.log("Registro de prueba eliminado:", idToDelete);
  }
}

checkEvaluaciones();
