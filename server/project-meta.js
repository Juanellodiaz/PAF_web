const META_TITLE = "_PAF_INTERNAL";

function metaDocId(projectId) {
  return `_paf_meta_${projectId}`;
}

function isMetaDocument(doc) {
  if (!doc) return false;
  return (
    doc.id === metaDocId(doc.project_id || "") ||
    String(doc.id || "").startsWith("_paf_meta_") ||
    doc.title === META_TITLE
  );
}

function isSchemaColumnError(err) {
  const msg = `${err?.message || ""} ${err?.details || ""} ${err?.hint || ""}`.toLowerCase();
  return (
    err?.code === "PGRST204" ||
    err?.code === "42703" ||
    /column/.test(msg) ||
    /schema cache/.test(msg) ||
    /advances/.test(msg) ||
    /estimations/.test(msg)
  );
}

function buildMetaPayload(project) {
  const advancesByConceptId = {};
  (project.concepts || []).forEach((c) => {
    const adv = Array.isArray(c.advances) ? c.advances : [];
    if (adv.length) advancesByConceptId[c.id] = adv;
  });
  return {
    v: 1,
    estimations: project.estimations || [],
    advancesByConceptId,
  };
}

function metaDocumentFromProject(project) {
  return {
    id: metaDocId(project.id),
    type: "consideration",
    title: META_TITLE,
    content: JSON.stringify(buildMetaPayload(project)),
  };
}

function parseMetaContent(content) {
  if (!content) return null;
  try {
    const data = JSON.parse(content);
    if (data && typeof data === "object") return data;
  } catch {
    return null;
  }
  return null;
}

function applyMetaToProject(project) {
  const docs = project.documents || [];
  const metaDoc = docs.find(
    (d) => d.id === metaDocId(project.id) || d.title === META_TITLE
  );
  const visibleDocs = docs.filter(
    (d) => d.id !== metaDocId(project.id) && d.title !== META_TITLE
  );

  if (!metaDoc) {
    return { ...project, documents: visibleDocs };
  }

  const meta = parseMetaContent(metaDoc.content);
  if (!meta) {
    return { ...project, documents: visibleDocs };
  }

  const advancesByConceptId = meta.advancesByConceptId || {};
  const concepts = (project.concepts || []).map((c) => {
    const fromMeta = advancesByConceptId[c.id];
    const fromCol = Array.isArray(c.advances) ? c.advances : [];
    const advances =
      fromCol.length > 0 ? fromCol : fromMeta || [];
    return { ...c, advances };
  });

  const estimations =
    (project.estimations && project.estimations.length > 0
      ? project.estimations
      : meta.estimations) || [];

  return {
    ...project,
    concepts,
    estimations,
    documents: visibleDocs,
  };
}

function userDocuments(project) {
  return (project.documents || []).filter((d) => !isMetaDocument(d));
}

function documentsForSave(project) {
  return [...userDocuments(project), metaDocumentFromProject(project)];
}

module.exports = {
  META_TITLE,
  metaDocId,
  isMetaDocument,
  isSchemaColumnError,
  applyMetaToProject,
  userDocuments,
  documentsForSave,
  buildMetaPayload,
};
