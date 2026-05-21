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

## Despliegue

El proyecto incluye `vercel.json` para servir API y frontend juntos. Los cambios en `data/db.json` desde el panel admin persisten en entornos con disco escribible (local, VPS). En serverless, considera migrar a una base de datos externa para producción.
