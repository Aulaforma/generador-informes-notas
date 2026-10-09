"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { User } from "@supabase/supabase-js";
import { DbPerfil } from "@/types/dashboard";
import { supabase } from "@/lib/supabase";

interface AuthContextType {
  user: User | null;
  profile: DbPerfil | null;
  isLoading: boolean;
  login: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: string; debeCambiarPassword?: boolean }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<DbPerfil | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Inicializar y validar sesión existente (Soporte F5 y persistencia)
  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user) {
          if (isMounted) {
            setUser(null);
            setProfile(null);
            setIsLoading(false);
          }
          return;
        }

        // Consultar la tabla perfiles para el usuario autenticado
        const { data: perfilData, error: perfilError } = await supabase
          .from("perfiles")
          .select("id, nombre, rol, docente_id, activo, debe_cambiar_password")
          .eq("id", session.user.id)
          .maybeSingle();

        const allowedRoles = ["utp", "docente"];
        const userRole = perfilData?.rol?.toLowerCase();

        if (isMounted) {
          if (
            !perfilError &&
            perfilData &&
            perfilData.activo &&
            userRole &&
            allowedRoles.includes(userRole)
          ) {
            setUser(session.user);
            setProfile(perfilData as DbPerfil);
          } else {
            // Si el perfil no cumple los requisitos, cerrar sesión
            await supabase.auth.signOut();
            setUser(null);
            setProfile(null);
          }
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Error al validar sesión de Supabase:", err);
        if (isMounted) {
          setUser(null);
          setProfile(null);
          setIsLoading(false);
        }
      }
    };

    checkSession();

    // Escuchar cambios de estado en Supabase Auth
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        if (isMounted) {
          setUser(null);
          setProfile(null);
          setIsLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Función de inicio de sesión con Supabase Auth y validación de perfil
  const login = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{
      success: boolean;
      error?: string;
      debeCambiarPassword?: boolean;
    }> => {
      try {
        // 1. Iniciar sesión exclusivamente mediante Supabase Auth
        const { data: authData, error: authError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password,
          });

        if (authError) {
          let errorMsg = "Credenciales incorrectas: verifique su correo y contraseña.";
          if (authError.message.includes("Invalid login credentials") || authError.status === 400) {
            errorMsg = "Correo electrónico o contraseña incorrectos.";
          } else if (authError.message.includes("Email not confirmed")) {
            errorMsg = "El correo electrónico no ha sido confirmado en el sistema.";
          } else {
            errorMsg = `Error de autenticación: ${authError.message}`;
          }
          return { success: false, error: errorMsg };
        }

        const authUser = authData?.user;
        if (!authUser) {
          return {
            success: false,
            error: "No se pudo recuperar la información del usuario autenticado.",
          };
        }

        // 2. Consultar la tabla perfiles utilizando el ID del usuario autenticado
        const { data: perfilData, error: perfilError } = await supabase
          .from("perfiles")
          .select("id, nombre, rol, docente_id, activo, debe_cambiar_password")
          .eq("id", authUser.id)
          .maybeSingle();

        if (perfilError) {
          await supabase.auth.signOut();
          return {
            success: false,
            error: `Error al consultar perfil en Supabase: ${perfilError.message}`,
          };
        }

        // 3. Verificar que exista perfil, activo = true y rol = "utp"
        if (!perfilData) {
          await supabase.auth.signOut();
          return {
            success: false,
            error: "Acceso denegado: El usuario no posee un perfil institucional registrado.",
          };
        }

        if (!perfilData.activo) {
          await supabase.auth.signOut();
          return {
            success: false,
            error: "Acceso denegado: Su cuenta institucional se encuentra desactivada.",
          };
        }

        const allowedRoles = ["utp", "docente"];
        const userRole = perfilData.rol?.toLowerCase();

        if (!userRole || !allowedRoles.includes(userRole)) {
          await supabase.auth.signOut();
          return {
            success: false,
            error: `Acceso restringido: El rol "${perfilData.rol}" no tiene autorización para acceder al sistema.`,
          };
        }

        // 4. Autenticación y verificación exitosas
        setUser(authUser);
        setProfile(perfilData as DbPerfil);
        return {
          success: true,
          debeCambiarPassword: Boolean(perfilData.debe_cambiar_password),
        };
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Error inesperado durante el inicio de sesión.";
        return { success: false, error: message };
      }
    },
    []
  );

  // Función de cierre de sesión
  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error al cerrar sesión en Supabase:", err);
    } finally {
      setUser(null);
      setProfile(null);
    }
  }, []);

  // Función para refrescar el perfil institucional del usuario autenticado
  const refreshProfile = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setUser(null);
        setProfile(null);
        return;
      }

      const { data: perfilData, error: perfilError } = await supabase
        .from("perfiles")
        .select("id, nombre, rol, docente_id, activo, debe_cambiar_password")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!perfilError && perfilData) {
        setProfile(perfilData as DbPerfil);
      }
    } catch (err) {
      console.error("Error al refrescar perfil en Supabase:", err);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe utilizarse dentro de un AuthProvider.");
  }
  return context;
}
