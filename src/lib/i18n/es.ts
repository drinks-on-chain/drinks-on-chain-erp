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
    revoked: "Tu sesión se cerró por seguridad. Vuelve a entrar.",
    wrongAudience: "Este acceso no es para esta aplicación",
    wrongAudienceBody:
      "Tu cuenta no tiene acceso a esta aplicación. Si crees que es un error, contacta con la administración.",
    sessionError: "No se pudo cargar tu sesión",
  },
  organization: {
    label: "Organización activa",
    switched: (name: string) => `Ahora trabajas en ${name}.`,
    none: "Sin organización",
  },
  roles: {
    SUPERADMIN: "Superadministración",
    ADMIN: "Administración",
    OPERATIONS: "Operaciones",
    SUPPORT: "Soporte",
    OWNER: "Dirección",
    ENOLOGIST: "Enología",
    AGRONOMIST: "Agronomía",
    OPERATOR: "Operario",
    ACCOUNTANT: "Contabilidad",
    MANAGER: "Encargado",
    CASHIER: "Caja",
  } as Record<string, string>,
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
    expire: "Caducar el acceso (15 min)",
    expireDone: "Acceso caducado: la próxima petición renovará la sesión.",
  },
} as const;

export type Dictionary = typeof es;
