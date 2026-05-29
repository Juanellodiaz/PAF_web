const crypto = require("crypto");

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
}

function duplicateProjectName(name, existingNames = []) {
  const base = (name || "").trim() || "Proyecto";
  const taken = new Set(
    (existingNames || []).map((n) => String(n || "").trim().toLowerCase())
  );
  let candidate = `${base} (duplicado)`;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base} (duplicado ${n})`;
    n += 1;
  }
  return candidate;
}

function cloneProject(source, { newName, projectId } = {}) {
  const concepts = (source.concepts || []).map((c) => {
    const id = newId("c");
    const { collapsed: _c, ...rest } = c;
    return {
      ...rest,
      id,
      advances: (c.advances || []).map((a) => ({
        ...a,
        id: newId("adv"),
      })),
    };
  });

  const documents = (source.documents || [])
    .filter(
      (d) =>
        !String(d.id || "").startsWith("_paf_meta_") &&
        d.title !== "_PAF_INTERNAL"
    )
    .map((d) => ({
      ...d,
      id: newId("d"),
    }));

  const indirectCosts = (source.indirectCosts || []).map((item) => ({
    ...item,
    id: newId("ind"),
  }));

  return {
    id: projectId || newId("proj"),
    name: newName,
    clientId: source.clientId || "",
    status: source.status || "en_aprobacion",
    completionDate: source.completionDate,
    zone3dImage: source.zone3dImage || "/assets/zone-3d-placeholder.svg",
    concepts,
    documents,
    estimations: source.estimations || [],
    indirectCosts,
  };
}

module.exports = {
  newId,
  duplicateProjectName,
  cloneProject,
};
