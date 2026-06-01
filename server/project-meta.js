const { mergeEstimationPaymentFields } = require("./global-estimations");

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

function mergeStoredEstimations(projectEstimations, metaEstimations) {
  const byId = new Map();
  (projectEstimations || []).forEach((e) => {
    if (e?.id) byId.set(e.id, { ...e });
  });
  (metaEstimations || []).forEach((e) => {
    if (!e?.id) return;
    const prev = byId.get(e.id);
    if (!prev) {
      byId.set(e.id, { ...e });
      return;
    }
    byId.set(e.id, {
      ...prev,
      ...e,
      ...mergeEstimationPaymentFields(prev, e),
    });
  });
  return Array.from(byId.values());
}

function mergeEstimationsFromConcepts(stored, concepts) {
  const byId = new Map();
  (stored || []).forEach((e) => {
    byId.set(e.id, { ...e });
  });
  let n = byId.size;
  (concepts || []).forEach((c) => {
    const advances = Array.isArray(c.advances) ? c.advances : [];
    advances.forEach((a) => {
      if (!a.estimationId || byId.has(a.estimationId)) return;
      n += 1;
      byId.set(a.estimationId, {
        id: a.estimationId,
        label: `Estimación ${String(n).padStart(2, "0")}`,
        date: a.date || new Date().toISOString().slice(0, 10),
        paid: false,
        paidAt: null,
        notes: "",
      });
    });
  });
  return Array.from(byId.values());
}

function buildPaidByEstimationId(estimations) {
  const paidByEstimationId = {};
  (estimations || []).forEach((e) => {
    if (!e?.id) return;
    const amountPaid = Math.max(0, Math.round(Number(e.amountPaid) || 0));
    if (!e.paid && amountPaid <= 0) return;
    paidByEstimationId[e.id] = {
      paid: !!e.paid,
      paidAt: e.paidAt || null,
      amountPaid,
      paymentStatus: e.paymentStatus || (e.paid ? "paid" : amountPaid > 0 ? "partial" : "pending"),
    };
  });
  return paidByEstimationId;
}

function applyPaidFromMeta(estimations, paidByEstimationId) {
  if (!paidByEstimationId || typeof paidByEstimationId !== "object") {
    return estimations;
  }
  return (estimations || []).map((e) => {
    const flags = paidByEstimationId[e.id];
    if (!flags) return e;
    return {
      ...e,
      amountPaid: Math.max(0, Math.round(Number(flags.amountPaid) || 0)),
      paid: !!flags.paid,
      paymentStatus: flags.paymentStatus || e.paymentStatus,
      paidAt: flags.paid || Number(flags.amountPaid) > 0 ? e.paidAt || flags.paidAt || null : null,
    };
  });
}

function buildMetaPayload(project) {
  const advancesByConceptId = {};
  const costsByConceptId = {};
  const usedEstimationIds = new Set();
  (project.concepts || []).forEach((c) => {
    if (!c?.id) return;
    const adv = Array.isArray(c.advances) ? c.advances : [];
    if (adv.length) advancesByConceptId[c.id] = adv;
    adv.forEach((a) => {
      if (a?.estimationId) usedEstimationIds.add(a.estimationId);
    });
    costsByConceptId[c.id] = {
      laborCost: Number(c.laborCost) || 0,
      materialCost: Number(c.materialCost) || 0,
    };
  });
  const estimationsArchive = (project.estimations || [])
    .filter((e) => e?.id && usedEstimationIds.has(e.id))
    .map((e) => ({
      id: e.id,
      label: e.label || "",
      date: e.date || "",
      amountPaid: Math.max(0, Math.round(Number(e.amountPaid) || 0)),
      paid: !!e.paid,
      paymentStatus:
        e.paymentStatus || (e.paid ? "paid" : Number(e.amountPaid) > 0 ? "partial" : "pending"),
      paidAt: e.paid || Number(e.amountPaid) > 0 ? e.paidAt || null : null,
      notes: e.notes || "",
      ...(Number.isFinite(Number(e.sortOrder)) ? { sortOrder: Number(e.sortOrder) } : {}),
    }));
  return {
    v: 4,
    advancesByConceptId,
    costsByConceptId,
    indirectCosts: (project.indirectCosts || []).map((item) => ({
      id: item.id,
      label: item.label || "",
      amount: Math.round(Number(item.amount) || 0),
      date: item.date || "",
      note: item.note || "",
    })),
    estimationsArchive,
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
  const costsByConceptId = meta.costsByConceptId || {};
  const concepts = (project.concepts || []).map((c) => {
    const costs = costsByConceptId[c.id] || {};
    return {
      ...c,
      advances: advancesByConceptId[c.id] || [],
      laborCost: Number(costs.laborCost) || Number(c.laborCost) || 0,
      materialCost: Number(costs.materialCost) || Number(c.materialCost) || 0,
    };
  });

  let estimations = project.estimations || [];
  if (meta.v !== 3 && meta.v !== 4) {
    const storedEstimations = mergeStoredEstimations(
      project.estimations,
      meta.estimations
    );
    estimations = mergeEstimationsFromConcepts(storedEstimations, concepts);
    estimations = applyPaidFromMeta(estimations, meta.paidByEstimationId);
  } else if (meta.v === 4 && Array.isArray(meta.estimationsArchive)) {
    const paidById = buildPaidByEstimationId(meta.estimationsArchive);
    estimations = estimations.map((e) => {
      const flags = paidById[e.id];
      if (!flags) return e;
      return {
        ...e,
        ...flags,
        ...mergeEstimationPaymentFields(flags, e, { incomingWins: true }),
      };
    });
  }

  const indirectCosts = Array.isArray(meta.indirectCosts) ? meta.indirectCosts : [];

  return {
    ...project,
    concepts,
    estimations,
    documents: visibleDocs,
    indirectCosts,
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
  metaDocumentFromProject,
  mergeEstimationsFromConcepts,
  mergeStoredEstimations,
};
