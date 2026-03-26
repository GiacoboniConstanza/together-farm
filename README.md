# Together Farm

Plataforma web (no móvil) para que **dos usuarios** compartan una granja: cultivan con un simulador basado en [farmsim](https://github.com/msakuta/farmsim), cosechan alimentos que pasan a un **inventario compartido** y cuidan una **mascota tipo tamagotchi** (sin IA: alimentar, bañar, dormir). Backend con **Supabase** (Postgres, Auth, RLS, Realtime).

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | Vite, React 18, TypeScript, React Router |
| Backend | Supabase (Postgres + Auth + Realtime `postgres_changes`) |
| Simulador de granja | `FarmGame.js` + UI tipo `farmsimDiv` (sin PIXI), embebido en iframe desde `public/farmsim/` |

## Requisitos

- Node.js **18+** funciona; **20 LTS** recomendado (menos avisos de `EBADENGINE` y alineado con dependencias recientes).
- Con **nvm**: en la raíz del repo, `nvm use` lee [`.nvmrc`](.nvmrc) (`20`).
- El cliente `@supabase/supabase-js` está **fijado a 2.49.1** para evitar versiones que exigen Node ≥ 20 solo por el caret (`^`).
- Proyecto en [Supabase](https://supabase.com) con Auth por email/contraseña habilitado

## Puesta en marcha

### 1. Proyecto Supabase (guía detallada)

Sigue la guía paso a paso (crear proyecto, SQL, Auth, claves, Realtime, checklist y despliegue):

**[docs/supabase.md](docs/supabase.md)**

Resumen rápido:

1. Crea un proyecto en [Supabase](https://supabase.com).
2. En **SQL Editor**, ejecuta el contenido completo de [`supabase/migrations/20260325180000_together_farm.sql`](supabase/migrations/20260325180000_together_farm.sql) (tablas, RLS, RPC, Realtime).
3. En **Authentication → Providers**, activa **Email**.

### 2. Variables de entorno

Copia `.env.example` a `.env` y rellena:

| Variable | Descripción |
|----------|-------------|
| `VITE_SUPABASE_URL` | URL del proyecto (`https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Clave anónima (pública en el cliente; la seguridad viene del RLS) |

### 3. Instalación y desarrollo

```bash
npm install
npm run dev
```

Build de producción:

```bash
npm run build
npm run preview   # sirve la carpeta dist localmente
```

Los assets del juego viven en `public/farmsim/` y se copian a `dist/farmsim/` al construir.

## Modelo de datos (resumen)

| Tabla | Rol |
|-------|-----|
| `farms` | `game_state` (JSON del `FarmGame.serialize()`), `version` (optimistic locking), `corn_count` / `potato_count` (inventario para la mascota), `updated_at` |
| `farm_members` | Pareja `(farm_id, user_id)`; trigger que impide más de **2** miembros por granja |
| `invites` | Token de invitación, caducidad, consumo al aceptar |
| `pets` | Una fila por granja: hambre, limpieza, energía, `sleep_until`, `last_tick_at` |

Las políticas RLS limitan lectura/escritura a usuarios que son miembros de esa granja. Las invitaciones se gestionan sobre todo vía RPC (`create_invite`, `accept_invite`).

## Funciones RPC principales

| Función | Uso |
|---------|-----|
| `create_farm()` | Crea granja, te añade como miembro y crea fila en `pets` |
| `save_farm_state(p_farm_id, p_expected_version, p_game_state)` | Guarda el JSON del juego si la versión coincide |
| `commit_harvest(...)` | Valida la celda en el estado anterior, aplica el nuevo `game_state` y suma 1 al inventario (`Corn` / `Potato`) |
| `pet_tick`, `pet_feed`, `pet_bathe`, `pet_sleep` | Decaimiento temporal y acciones de la mascota (inventario en `farms`) |

Detalle de firmas y lógica: ver el SQL de la migración.

## Flujos en la aplicación

### Rutas

- `/login` — registro / acceso
- `/` — listado de granjas del usuario y botón “Nueva granja”
- `/farm/:farmId` — pestañas **Granja** (iframe), **Mascota**, **Invitar**
- `/invite/:token` — aceptar invitación y redirigir a la granja

### Granja (iframe)

- Origen: `/farmsim/embed.html` (misma app, carpeta `public/farmsim`).
- El padre envía `postMessage` con `init` y el último `game_state` de Supabase (o vacío para partida nueva en cliente).
- El juego en modo embed **no** escribe `localStorage` de la granja; los autosaves del simulador llegan al padre y disparan `save_farm_state` (con debounce).
- Tras una **cosecha**, el bridge pide un snapshot serializado y el padre llama a `commit_harvest` para mantener inventario y versión alineados con el servidor.

### Mascota

- UI en React (`src/components/PetPanel.tsx`).
- Las acciones llaman a las RPC; el alimento sale de `corn_count` / `potato_count` en `farms`.

### Invitaciones

- En la pestaña **Invitar** se genera un enlace del tipo `{origen}/invite/{token}` (también se intenta copiar al portapapeles).
- Máximo dos miembros por granja (trigger + comprobaciones en RPC).

### Tiempo real y resiliencia

- Suscripción a cambios en `farms` (filtro `id=eq.{farmId}`) y `pets` (`farm_id=eq.{farmId}`).
- Al recibir un evento, se recarga la fila y, en la pestaña Granja, se reinyecta el estado al iframe.
- **Refetch periódico** (~45 s) como respaldo si Realtime falla o se desconecta.

## Estructura del repositorio

```
src/
  App.tsx                 # Rutas
  pages/                  # Auth, Home, Farm, Invite
  components/PetPanel.tsx
  hooks/useSession.ts
  lib/supabase.ts
public/farmsim/           # Juego embebido (JS parcheado + assets)
vendor/farmsim/           # Copia de referencia del upstream (licencia MIT)
supabase/migrations/      # SQL idempotente orientado a Supabase hosted
```

## Créditos y licencia de farmsim

El simulador se basa en **farmsim** de Masahiro Sakuta (MIT). Copia de referencia y licencia: [`vendor/farmsim/LICENSE`](vendor/farmsim/LICENSE). Conserva el aviso de copyright en distribuciones que incluyan código o assets derivados.

El resto del proyecto Together Farm es tuyo para licenciar como prefieras; indica explícitamente la parte MIT de farmsim si publicas el repo.

## Limitaciones conocidas (MVP)

- Conflictos si dos jugadores editan la granja a la vez: se usa `version`; un guardado fallido muestra error y se puede recargar estado desde servidor.
- El panel de invitaciones almacena el token en claro en `invites.token` (suficiente para MVP; se puede endurecer con hash + comparación en RPC).

## Scripts npm

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo Vite |
| `npm run build` | `tsc -b` + build estático |
| `npm run preview` | Previsualizar `dist/` |
| `npm run lint` | ESLint |
