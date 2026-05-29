const DEFAULT_SUPABASE_URL =
  "https://wxubwrjdtylnpvjtogjp.supabase.co";

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
}

function useSupabase() {
  return !!(
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    (process.env.SUPABASE_URL || process.env.VERCEL)
  );
}

function getBackend() {
  return useSupabase()
    ? require("./db-supabase")
    : require("./db-json");
}

function wrap(fn) {
  return (...args) => Promise.resolve(getBackend()[fn](...args));
}

module.exports = {
  useSupabase,
  findUser: wrap("findUser"),
  getUserById: wrap("getUserById"),
  listUsers: wrap("listUsers"),
  listProjectsForUser: wrap("listProjectsForUser"),
  getProject: wrap("getProject"),
  saveProject: wrap("saveProject"),
  deleteProject: wrap("deleteProject"),
  loadGlobalEstimations: wrap("loadGlobalEstimations"),
  loadAdminSettings: wrap("loadAdminSettings"),
  saveAdminSettings: wrap("saveAdminSettings"),
};
