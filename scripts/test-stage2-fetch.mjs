import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFetch() {
  const { data: curso } = await supabase
    .from("cursos")
    .select("id, nombre")
    .eq("nombre", "7° Básico A")
    .maybeSingle();

  console.log("Curso encontrado:", curso);

  const { data, error } = await supabase
    .from("curso_asignaturas")
    .select("id, curso_id, asignatura_id, asignaturas(id, nombre, activo)")
    .eq("curso_id", curso?.id || 1)
    .order("asignatura_id", { ascending: true });

  console.log("Resultado asignaturas vinculadas:", { data, error });
}

testFetch();
