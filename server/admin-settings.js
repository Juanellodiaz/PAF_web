const ADMIN_SETTINGS_DOC_ID = "_paf_admin_settings";
const ADMIN_SETTINGS_TITLE = "_PAF_ADMIN_SETTINGS";

function normalizeFolder(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return null;
  const name =
    typeof raw.name === "string" && raw.name.trim()
      ? raw.name.trim()
      : "Carpeta";
  const projectIds = Array.isArray(raw.projectIds)
    ? raw.projectIds.filter((pid) => typeof pid === "string" && pid)
    : [];
  return {
    id,
    name,
    collapsed: !!raw.collapsed,
    projectIds,
  };
}

function normalizeSettings(raw) {
  const order = Array.isArray(raw?.projectOrder) ? raw.projectOrder : [];
  const folders = Array.isArray(raw?.projectFolders)
    ? raw.projectFolders.map(normalizeFolder).filter(Boolean)
    : [];
  return {
    projectOrder: order.filter((id) => typeof id === "string" && id),
    projectFolders: folders,
  };
}

function getUngroupedProjectIds(projectOrder, folders) {
  const inFolder = new Set(
    (folders || []).flatMap((f) => f.projectIds || [])
  );
  return (projectOrder || []).filter((id) => !inFolder.has(id));
}

function deriveFlatProjectOrder(folders, ungroupedIds, allProjectIds) {
  const allIds = Array.isArray(allProjectIds) ? allProjectIds : [];
  const allSet = new Set(allIds);
  const seen = new Set();
  const flat = [];

  for (const folder of folders || []) {
    for (const id of folder.projectIds || []) {
      if (!allSet.has(id) || seen.has(id)) continue;
      flat.push(id);
      seen.add(id);
    }
  }

  for (const id of ungroupedIds || []) {
    if (!allSet.has(id) || seen.has(id)) continue;
    flat.push(id);
    seen.add(id);
  }

  for (const id of allIds) {
    if (!seen.has(id)) flat.push(id);
  }

  return flat;
}

function reconcileProjectLayout(folders, projectOrder, allProjectIds) {
  const allIds = Array.isArray(allProjectIds) ? allProjectIds : [];
  const allSet = new Set(allIds);
  const seen = new Set();
  const cleanFolders = [];

  for (const folder of folders || []) {
    const normalized = normalizeFolder(folder);
    if (!normalized) continue;
    normalized.projectIds = normalized.projectIds.filter((id) => {
      if (!allSet.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    cleanFolders.push(normalized);
  }

  const ungrouped = getUngroupedProjectIds(projectOrder, cleanFolders).filter(
    (id) => allSet.has(id) && !seen.has(id)
  );
  for (const id of ungrouped) seen.add(id);

  for (const id of allIds) {
    if (!seen.has(id)) ungrouped.push(id);
  }

  return {
    projectFolders: cleanFolders,
    projectOrder: deriveFlatProjectOrder(cleanFolders, ungrouped, allIds),
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

function appendProjectToLayout(settings, projectId, afterProjectId = null) {
  const normalized = normalizeSettings(settings);
  const folders = normalized.projectFolders.map((f) => ({
    ...f,
    projectIds: [...f.projectIds],
  }));
  const allIds = [...new Set([...normalized.projectOrder, projectId])];

  if (afterProjectId) {
    for (const folder of folders) {
      const idx = folder.projectIds.indexOf(afterProjectId);
      if (idx >= 0) {
        folder.projectIds.splice(idx + 1, 0, projectId);
        return reconcileProjectLayout(folders, normalized.projectOrder, allIds);
      }
    }
  }

  const ungrouped = getUngroupedProjectIds(normalized.projectOrder, folders);
  const nextUngrouped = appendProjectToOrder(ungrouped, projectId, afterProjectId);
  return reconcileProjectLayout(
    folders,
    deriveFlatProjectOrder(folders, nextUngrouped, allIds),
    allIds
  );
}

function removeProjectFromLayout(settings, projectId) {
  const normalized = normalizeSettings(settings);
  const folders = normalized.projectFolders.map((f) => ({
    ...f,
    projectIds: f.projectIds.filter((id) => id !== projectId),
  }));
  const order = removeProjectFromOrder(normalized.projectOrder, projectId);
  return reconcileProjectLayout(folders, order, order);
}

module.exports = {
  ADMIN_SETTINGS_DOC_ID,
  ADMIN_SETTINGS_TITLE,
  normalizeSettings,
  normalizeFolder,
  getUngroupedProjectIds,
  deriveFlatProjectOrder,
  reconcileProjectLayout,
  sortProjectsByOrder,
  mergeProjectOrder,
  appendProjectToOrder,
  appendProjectToLayout,
  removeProjectFromLayout,
  removeProjectFromOrder,
};
