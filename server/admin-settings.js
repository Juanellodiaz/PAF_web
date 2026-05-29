const ADMIN_SETTINGS_DOC_ID = "_paf_admin_settings";
const ADMIN_SETTINGS_TITLE = "_PAF_ADMIN_SETTINGS";

function normalizeSettings(raw) {
  const order = Array.isArray(raw?.projectOrder) ? raw.projectOrder : [];
  return {
    projectOrder: order.filter((id) => typeof id === "string" && id),
  };
}

function sortProjectsByOrder(projects, order) {
  const list = projects || [];
  const ids = Array.isArray(order) ? order : [];
  if (!ids.length) return [...list];
  const byId = new Map(list.map((p) => [p.id, p]));
  const out = [];
  for (const id of ids) {
    if (byId.has(id)) {
      out.push(byId.get(id));
      byId.delete(id);
    }
  }
  for (const p of byId.values()) out.push(p);
  return out;
}

function mergeProjectOrder(order, projectIds) {
  const ids = Array.isArray(projectIds) ? projectIds : [];
  const merged = [];
  const seen = new Set();
  for (const id of order || []) {
    if (!ids.includes(id) || seen.has(id)) continue;
    merged.push(id);
    seen.add(id);
  }
  for (const id of ids) {
    if (!seen.has(id)) {
      merged.push(id);
      seen.add(id);
    }
  }
  return merged;
}

function appendProjectToOrder(order, projectId, afterId = null) {
  const without = (order || []).filter((id) => id !== projectId);
  if (afterId) {
    const idx = without.indexOf(afterId);
    if (idx >= 0) {
      without.splice(idx + 1, 0, projectId);
      return without;
    }
  }
  return [...without, projectId];
}

function removeProjectFromOrder(order, projectId) {
  return (order || []).filter((id) => id !== projectId);
}

module.exports = {
  ADMIN_SETTINGS_DOC_ID,
  ADMIN_SETTINGS_TITLE,
  normalizeSettings,
  sortProjectsByOrder,
  mergeProjectOrder,
  appendProjectToOrder,
  removeProjectFromOrder,
};
