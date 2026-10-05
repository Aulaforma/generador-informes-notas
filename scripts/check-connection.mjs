import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log("Iniciando prueba de conexión con Supabase...");
console.log("URL:", supabaseUrl);
console.log("Key presente:", Boolean(supabaseKey));

if (!supabaseUrl || !supabaseKey) {
  console.error("Error: Faltan variables de entorno en .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    const { data, error, status, statusText } = await supabase
      .from("estudiantes")
      .select("*");

    if (error) {
      console.log("\n--- Resultado de la consulta ---");
      console.error("Error al consultar la tabla 'estudiantes':", error);
      console.log("Status HTTP:", status, statusText);
      return;
    }

    console.log("\n--- Conexión exitosa ---");
    console.log("Status HTTP:", status);
    console.log("Cantidad de estudiantes recuperados:", data ? data.length : 0);
    if (data && data.length > 0) {
      console.log("Muestra de datos recuperados:");
      console.table(data);
    } else {
      console.log("La tabla 'estudiantes' devolvió un array vacío [] (posible bloqueo por RLS sin filas permitidas o tabla vacía).");
    }
  } catch (err) {
    console.error("Excepción inesperada durante la consulta:", err);
  }
}

testConnection();
