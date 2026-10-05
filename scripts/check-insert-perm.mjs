import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkInsertPermission() {
  console.log("=== Verificando permisos de INSERT con periodo numérico ===");
  const testInsert = await supabase
    .from("evaluaciones")
    .insert({
      curso_asignatura_id: 1,
      nombre: "Prueba Test Permisos",
      orden: 999,
      periodo: 2,
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

  if (testInsert.data && testInsert.data.length > 0) {
    const idToDelete = testInsert.data[0].id;
    await supabase.from("evaluaciones").delete().eq("id", idToDelete);
    console.log("Registro de prueba eliminado:", idToDelete);
  }
}

checkInsertPermission();
