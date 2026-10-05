import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testQueryAll() {
  for (let asigId = 1; asigId <= 4; asigId++) {
    const { data: ca } = await supabase
      .from("curso_asignaturas")
      .select("id")
      .eq("curso_id", 1)
      .eq("asignatura_id", asigId)
      .maybeSingle();

    const { data: evals, error } = await supabase
      .from("evaluaciones")
      .select("id, curso_asignatura_id, nombre, periodo, orden")
      .eq("curso_asignatura_id", ca?.id)
      .eq("periodo", 2)
      .order("orden", { ascending: true });

    console.log(`Asignatura ${asigId} (curso_asignatura_id: ${ca?.id}):`, {
      count: evals?.length,
      evals,
      error,
    });
  }
}

testQueryAll();
