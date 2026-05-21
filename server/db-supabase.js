const { createClient } = require("@supabase/supabase-js");

let client;

function getClient() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
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
  return {
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    status: row.status,
    completionDate: row.completion_date,
    zone3dImage: row.zone3d_image,
    concepts: (row.project_concepts || []).map(mapConcept),
    documents: (row.project_documents || []).map(mapDocument),
  };
}

const PROJECT_SELECT =
  "*, project_concepts(*), project_documents(*)";

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
  const row = {
    id: project.id,
    name: project.name,
    client_id: project.clientId || null,
    status: project.status,
    completion_date: project.completionDate,
    zone3d_image: project.zone3dImage,
  };

  const { error: projectError } = await getClient()
    .from("projects")
    .upsert(row, { onConflict: "id" });

  if (projectError) throw projectError;

  await getClient()
    .from("project_concepts")
    .delete()
    .eq("project_id", project.id);

  await getClient()
    .from("project_documents")
    .delete()
    .eq("project_id", project.id);

  if (project.concepts?.length) {
    const { error } = await getClient().from("project_concepts").insert(
      project.concepts.map((c) => ({
        id: c.id,
        project_id: project.id,
        name: c.name,
        m2: c.m2,
        unit_price: c.unitPrice,
        total_price: c.totalPrice,
        status: c.status,
      }))
    );
    if (error) throw error;
  }

  if (project.documents?.length) {
    const { error } = await getClient().from("project_documents").insert(
      project.documents.map((d) => ({
        id: d.id,
        project_id: project.id,
        type: d.type,
        title: d.title,
        content: d.content,
      }))
    );
    if (error) throw error;
  }

  const loaded = await getProject(project.id);
  if (loaded) return loaded;

  return {
    id: project.id,
    name: project.name,
    clientId: project.clientId || null,
    status: project.status,
    completionDate: project.completionDate,
    zone3dImage: project.zone3dImage,
    concepts: project.concepts || [],
    documents: project.documents || [],
  };
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
