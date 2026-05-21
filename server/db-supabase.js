const { createClient } = require("@supabase/supabase-js");
const {
  isSchemaColumnError,
  applyMetaToProject,
  userDocuments,
  metaDocumentFromProject,
  metaDocId,
} = require("./project-meta");

let client;

const DEFAULT_SUPABASE_URL =
  "https://wxubwrjdtylnpvjtogjp.supabase.co";

function getClient() {
  if (!client) {
    const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
      throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
    }
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

function mapConcept(row) {
  return {
    id: row.id,
    name: row.name,
    m2: Number(row.m2),
    unitPrice: Number(row.unit_price),
    totalPrice: Number(row.total_price),
    status: row.status,
    advances: row.advances || [],
  };
}

function mapDocument(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
  };
}

function mapProject(row) {
  const project = {
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    status: row.status,
    completionDate: row.completion_date,
    zone3dImage: row.zone3d_image,
    estimations: row.estimations || [],
    concepts: (row.project_concepts || []).map(mapConcept),
    documents: (row.project_documents || []).map(mapDocument),
  };
  return applyMetaToProject(project);
}

const PROJECT_SELECT =
  "*, project_concepts(*), project_documents(*)";

function conceptRow(c, includeAdvances) {
  const row = {
    id: c.id,
    project_id: c.projectId,
    name: c.name,
    m2: c.m2,
    unit_price: c.unitPrice,
    total_price: c.totalPrice,
    status: c.status,
  };
  if (includeAdvances) {
    row.advances = c.advances || [];
  }
  return row;
}

async function upsertProjectRow(project) {
  const full = {
    id: project.id,
    name: project.name,
    client_id: project.clientId || null,
    status: project.status,
    completion_date: project.completionDate,
    zone3d_image: project.zone3dImage,
    estimations: project.estimations || [],
  };
  const minimal = {
    id: full.id,
    name: full.name,
    client_id: full.client_id,
    status: full.status,
    completion_date: full.completion_date,
    zone3d_image: full.zone3d_image,
  };

  let { error } = await getClient().from("projects").upsert(full, {
    onConflict: "id",
  });
  if (error && isSchemaColumnError(error)) {
    ({ error } = await getClient().from("projects").upsert(minimal, {
      onConflict: "id",
    }));
  }
  if (error) throw error;
}

async function upsertMetaDocument(project) {
  const meta = metaDocumentFromProject(project);
  const { error } = await getClient()
    .from("project_documents")
    .upsert(
      {
        id: meta.id,
        project_id: project.id,
        type: meta.type,
        title: meta.title,
        content: meta.content,
      },
      { onConflict: "id" }
    );
  if (error) throw error;
}

async function insertConcepts(project) {
  if (!project.concepts?.length) return;

  const rowsFull = project.concepts.map((c) =>
    conceptRow({ ...c, projectId: project.id }, true)
  );
  let { error } = await getClient().from("project_concepts").insert(rowsFull);
  if (error && isSchemaColumnError(error)) {
    const rowsMinimal = project.concepts.map((c) =>
      conceptRow({ ...c, projectId: project.id }, false)
    );
    ({ error } = await getClient().from("project_concepts").insert(rowsMinimal));
  }
  if (error) throw error;
}

async function findUser(username, password) {
  const { data, error } = await getClient()
    .from("users")
    .select("id, username, role, name")
    .eq("username", username)
    .eq("password", password)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getUserById(id) {
  const { data, error } = await getClient()
    .from("users")
    .select("id, username, role, name")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function listUsers() {
  const { data, error } = await getClient()
    .from("users")
    .select("id, username, role, name");

  if (error) throw error;
  return data;
}

async function listProjectsForUser(user) {
  let query = getClient().from("projects").select(PROJECT_SELECT);

  if (user.role !== "admin") {
    query = query.eq("client_id", user.id);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapProject);
}

async function getProject(id) {
  const { data, error } = await getClient()
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapProject(data) : null;
}

async function saveProject(project) {
  await upsertProjectRow(project);

  // Persist avances/estimaciones primero (no se borra en el delete de documentos)
  await upsertMetaDocument(project);

  await getClient()
    .from("project_concepts")
    .delete()
    .eq("project_id", project.id);

  await insertConcepts(project);

  const metaId = metaDocId(project.id);
  await getClient()
    .from("project_documents")
    .delete()
    .eq("project_id", project.id)
    .neq("id", metaId);

  const docs = userDocuments(project);
  if (docs.length) {
    const { error } = await getClient().from("project_documents").insert(
      docs.map((d) => ({
        id: d.id,
        project_id: project.id,
        type: d.type,
        title: d.title,
        content: d.content,
      }))
    );
    if (error) throw error;
  }

  // Refrescar meta con el estado más reciente
  await upsertMetaDocument(project);

  const loaded = await getProject(project.id);
  if (loaded) return loaded;

  return applyMetaToProject({
    id: project.id,
    name: project.name,
    clientId: project.clientId || null,
    status: project.status,
    completionDate: project.completionDate,
    zone3dImage: project.zone3dImage,
    estimations: project.estimations || [],
    concepts: project.concepts || [],
    documents: [],
  });
}

async function deleteProject(id) {
  const { error } = await getClient().from("projects").delete().eq("id", id);
  if (error) throw error;
}

module.exports = {
  findUser,
  getUserById,
  listUsers,
  listProjectsForUser,
  getProject,
  saveProject,
  deleteProject,
};
