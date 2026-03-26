# Proyecto Supabase para Together Farm

Guía paso a paso para crear y configurar el backend en [Supabase](https://supabase.com) y conectarlo a la app web.

## 1. Crear el proyecto en Supabase

1. Inicia sesión en [supabase.com](https://supabase.com) y pulsa **New project**.
2. Elige la **organización**, un **nombre** para el proyecto y una **contraseña** para la base de datos (guárdala en un gestor seguro).
3. Selecciona una **región** cercana a la mayoría de tus usuarios.
4. Espera a que termine el aprovisionamiento (suele tardar unos minutos).

No necesitas activar opciones extra (Storage, Edge Functions, etc.) para el MVP de Together Farm.

## 2. Aplicar el esquema (SQL)

Todo el backend de este repositorio está definido en un solo archivo de migración:

[`../supabase/migrations/20260325180000_together_farm.sql`](../supabase/migrations/20260325180000_together_farm.sql)

### Desde el panel (recomendado para empezar)

1. En el dashboard: **SQL Editor** → **New query**.
2. Abre el archivo anterior en tu editor, copia **todo** el contenido y pégalo en el editor SQL.
3. Pulsa **Run** (o el atajo que indique la UI).

Eso crea o actualiza:

- **Tablas:** `farms`, `farm_members`, `invites`, `pets`
- **Row Level Security (RLS)** en esas tablas
- **Triggers** (por ejemplo límite de 2 miembros por granja, `updated_at` en `farms`)
- **Funciones RPC** que usa el cliente (`create_farm`, `save_farm_state`, `commit_harvest`, invitaciones, mascota, etc.)
- **Realtime:** intenta añadir `public.farms` y `public.pets` a la publicación `supabase_realtime` (si ya estaban, el script ignora el error de duplicado)

Si la ejecución falla, revisa el mensaje en rojo: a veces choca con objetos que ya existían con otro nombre o permisos. En un proyecto **nuevo** vacío suele aplicarse sin problemas.

### Alternativa: Supabase CLI

Si usas la [CLI de Supabase](https://supabase.com/docs/guides/cli):

```bash
# En la raíz del repo (con CLI instalada y proyecto enlazado)
supabase link --project-ref TU_PROJECT_REF
supabase db push
```

`project-ref` aparece en **Project Settings → General → Reference ID**. Asegúrate de que las migraciones locales coincidan con lo que quieres aplicar (este repo tiene la migración en `supabase/migrations/`).

## 3. Autenticación (Auth)

1. Ve a **Authentication** → **Providers**.
2. Activa **Email** (correo + contraseña), que es lo que usa la pantalla de login de la app.
3. Opcional: en **Authentication** → **Providers** → **Email**, configura **Confirm email**:
   - **Desactivado:** registro más rápido en desarrollo (el usuario puede entrar al instante si tu proyecto lo permite).
   - **Activado:** más parecido a producción (el usuario debe confirmar el correo).

La app no usa proveedores OAuth en el MVP; si los añades después, habrá que extender el flujo en el frontend.

## 4. URL y claves para el frontend

1. **Project Settings** (icono de engranaje) → **API**.
2. Copia:
   - **Project URL** → variable de entorno `VITE_SUPABASE_URL` (ej. `https://abcdefgh.supabase.co`).
   - **anon public** → `VITE_SUPABASE_ANON_KEY`.

Colócalas en un archivo `.env` en la raíz del repositorio (puedes partir de `.env.example`).

### Importante sobre seguridad

- La clave **anon** está pensada para usarse en el navegador. La protección de datos la dan las **políticas RLS** y el diseño de las RPC.
- **No** pongas la clave **service_role** en el frontend ni en repositorios públicos; solo en servidor o entornos totalmente privados.

## 5. Realtime (comprobación opcional)

La migración SQL intenta publicar las tablas `farms` y `pets` para que el cliente reciba `postgres_changes`.

1. En el dashboard: **Database** → busca la sección relacionada con **Replication** / publicaciones (el menú puede variar ligeramente según la versión del panel).
2. Comprueba que **`farms`** y **`pets`** figuren en la publicación que usa **Realtime** (a menudo ligada a `supabase_realtime`).

Si Realtime no estuviera bien publicado, la aplicación **sigue funcionando** gracias al refetch periódico implementado en el cliente; solo perderías actualizaciones instantáneas cuando el compañero cambia algo.

## 6. Cómo encaja con el código

| Recurso Supabase | Uso en Together Farm |
|------------------|----------------------|
| **Auth** | Sesión del usuario; `auth.uid()` en RLS y dentro de las RPC |
| **Tabla `farms`** | Estado serializado del juego, versión, inventario de comida para la mascota |
| **Tabla `farm_members`** | Quién puede ver y editar cada granja (máximo 2 usuarios) |
| **Tabla `invites`** | Enlaces de invitación generados desde la app |
| **Tabla `pets`** | Estado de la mascota compartida |
| **RPC** | Operaciones transaccionales (guardar estado, cosechar, mascota, invitaciones) |
| **Realtime** | Sincronizar cambios entre dos navegadores en la misma granja |

No se usa **Storage** ni **Edge Functions** en el MVP actual.

## 7. Checklist rápido

- [ ] Proyecto creado en Supabase
- [ ] Ejecutada la migración SQL completa sin errores
- [ ] Email provider activado en Auth
- [ ] `.env` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
- [ ] `npm run dev` y prueba de registro / login
- [ ] (Opcional) Realtime verificado para `farms` y `pets`

## 8. Despliegue del frontend

Supabase solo aloja la API y la base de datos. La app Vite (React) debes desplegarla donde prefieras (Vercel, Netlify, Cloudflare Pages, etc.). En ese hosting define las mismas variables `VITE_*` para el build de producción.
