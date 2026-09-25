// Diccionario de la aplicación. Las apps operativas son solo en español (06, decisiones
// del 25-09); los textos viven aquí para no dispersarlos por los componentes.
export const es = {
  app: {
    name: "Drinks on Chain",
  },
  common: {
    loading: "Cargando…",
    retry: "Reintentar",
    cancel: "Cancelar",
    save: "Guardar",
    close: "Cerrar",
    back: "Volver",
    empty: "No hay nada por aquí todavía.",
  },
  auth: {
    title: "Entrar",
    email: "Correo electrónico",
    password: "Contraseña",
    submit: "Entrar",
    submitting: "Entrando…",
    logout: "Cerrar sesión",
    invalid: "Correo o contraseña incorrectos.",
    expired: "Tu sesión caducó. Vuelve a entrar.",
  },
  errors: {
    notFoundTitle: "Página no encontrada",
    notFoundBody: "La dirección no existe o se ha movido.",
    genericTitle: "Algo salió mal",
    offline: "Sin conexión. Revisa la red e inténtalo de nuevo.",
  },
  mocks: {
    title: "Datos de prueba",
    scenario: "Escenario",
    users: "Entrar como",
    reset: "Restablecer datos",
    resetDone: "Datos restablecidos.",
  },
} as const;

export type Dictionary = typeof es;
