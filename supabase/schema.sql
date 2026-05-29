-- PAF — Esquema inicial (ejecutar en Supabase → SQL Editor)

create table if not exists users (
  id text primary key,
  username text unique not null,
  password text not null,
  role text not null check (role in ('admin', 'client')),
  name text not null
);

create table if not exists projects (
  id text primary key,
  name text not null,
  client_id text references users (id) on delete set null,
  status text not null default 'en_aprobacion',
  completion_date date not null,
  zone3d_image text default '/assets/zone-3d-placeholder.svg',
  estimations jsonb not null default '[]'::jsonb
);

create table if not exists project_concepts (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  name text not null,
  m2 numeric not null,
  unit_price numeric not null,
  total_price numeric not null,
  status text not null default 'en_aprobacion',
  advances jsonb not null default '[]'::jsonb
);

create table if not exists project_documents (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  type text not null check (type in ('consideration', 'notification', 'image')),
  title text not null,
  content text not null
);

-- Usuarios
insert into users (id, username, password, role, name) values
  ('admin-paf', 'paf', 'admin', 'admin', 'PAF Administración'),
  ('client-iwa', 'iwa', 'iwa', 'client', 'IWA Studio')
on conflict (id) do nothing;

-- Proyecto demo
insert into projects (id, name, client_id, status, completion_date, zone3d_image) values
  ('proj-polanco-2026', 'Residencia Polanco — Microcemento', 'client-iwa', 'in_progress', '2026-09-30', '/assets/zone-3d-placeholder.svg')
on conflict (id) do nothing;

insert into project_concepts (id, project_id, name, m2, unit_price, total_price, status) values
  ('c1', 'proj-polanco-2026', 'Microcemento — Sala y comedor', 86, 2850, 245100, 'in_progress'),
  ('c2', 'proj-polanco-2026', 'Microcemento — Baños principales', 24, 3200, 76800, 'pending'),
  ('c3', 'proj-polanco-2026', 'Sellador hidrofóbico — Terraza', 42, 980, 41160, 'pending')
on conflict (id) do nothing;

insert into project_documents (id, project_id, type, title, content) values
  ('d1', 'proj-polanco-2026', 'consideration', 'Consideraciones de sustrato',
   'Verificar humedad relativa < 4% en losa antes de aplicar basecoat. Curado mínimo 72 h entre capas en zona de terraza.'),
  ('d2', 'proj-polanco-2026', 'notification', 'Visita técnica programada',
   'Inspección de avance en baños principales — 28 de junio, 10:00 h.')
on conflict (id) do nothing;

-- Migración (tablas ya existentes):
-- alter table projects add column if not exists estimations jsonb not null default '[]'::jsonb;
-- alter table project_concepts add column if not exists advances jsonb not null default '[]'::jsonb;

-- Gastos indirectos por proyecto (material de protección, etc.) y costos internos
-- por concepto (MO, material) se guardan en el documento interno _PAF_INTERNAL (meta v4).

-- Migración (tablas ya existentes): permitir tipo "image" en documentos
-- alter table project_documents drop constraint if exists project_documents_type_check;
-- alter table project_documents add constraint project_documents_type_check
--   check (type in ('consideration', 'notification', 'image'));
