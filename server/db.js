function useSupabase() {
  return !!(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
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
};
