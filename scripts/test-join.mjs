import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testJoin() {
  const { data, error } = await supabase
    .from("curso_asignaturas")
    .select("id, curso_id, asignatura_id, asignaturas(id, nombre, activo)")
    .eq("curso_id", 1);

  console.log("Join result:", { data, error });
}

testJoin();
