# PAF — Premium Architectural Finishes

Sitio web bilingüe con portal de clientes y panel de administración.

## Inicio rápido

```bash
npm install
npm start
```

Abre **http://localhost:3000**

## Credenciales de prueba

| Rol     | Usuario | Contraseña |
|---------|---------|------------|
| Admin   | `paf`   | `admin`    |
| Cliente | `iwa`   | `iwa`      |

## Portal

- **Login** — Mismo video de fondo, transición fade desde la landing
- **Cliente (`iwa`)** — Lista de proyectos asignados y dashboard por proyecto
- **Admin (`paf`)** — Crear, editar, asignar y eliminar proyectos

### Dashboard de proyecto

- Conceptos con m² y precio total
- Vista 3D de la zona
- Consideraciones y notificaciones
- Días restantes para culminación
- Inversión total

## Estructura

```
server.js          # Express + API + archivos estáticos
server/db.js       # Persistencia JSON
data/db.json       # Base de datos
login.html         # Acceso
dashboard.html     # Vista cliente
admin.html         # Panel administración
project.html       # Detalle de proyecto
```

## Supabase (producción)

1. En Supabase → **SQL Editor**, ejecuta el contenido de `supabase/schema.sql`.
2. En **Settings → API**, copia:
   - **Project URL** → `SUPABASE_URL`
   - **Secret key** (`sb_secret_...`) → `SUPABASE_SERVICE_ROLE_KEY`
3. Crea `.env` local (ver `.env.example`) o agrega las variables en **Vercel → Environment Variables**.
4. Redespliega en Vercel.

Sin variables de Supabase, el servidor usa `data/db.json` (solo recomendado en local).

## Despliegue

El proyecto usa Vercel: archivos estáticos + API en `api/index.js`. Con Supabase configurado, los cambios del admin persisten en PostgreSQL.
