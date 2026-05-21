const GLOBAL_PROJECT_ID = "_paf_system";
const GLOBAL_DOC_ID = "_paf_global_estimations";
const GLOBAL_TITLE = "_PAF_GLOBAL_ESTIMATIONS";

function normalizeEstimation(e) {
  return {
    id: e.id,
    label: (e.label || "").trim(),
    date: e.date || new Date().toISOString().slice(0, 10),
    paid: !!e.paid,
    paidAt: e.paid ? e.paidAt || null : null,
    notes: (e.notes || "").trim(),
  };
}

function mergeEstimationPaidState(prev, next) {
  if (prev?.paid === false || next?.paid === false) {
    return { paid: false, paidAt: null };
  }
  if (prev?.paid || next?.paid) {
    return {
      paid: true,
      paidAt: prev?.paidAt || next?.paidAt || null,
    };
  }
  return { paid: false, paidAt: null };
}

function mergeEstimationRecords(existing, incoming) {
  const byId = new Map();
  (existing || []).forEach((e) => {
    if (e?.id) byId.set(e.id, normalizeEstimation(e));
  });
  (incoming || []).forEach((e) => {
    if (!e?.id) return;
    const prev = byId.get(e.id);
    const next = normalizeEstimation(e);
    if (!prev) {
      byId.set(e.id, next);
      return;
    }
    byId.set(e.id, {
      ...prev,
      ...next,
      ...mergeEstimationPaidState(prev, next),
    });
  });
  return Array.from(byId.values());
}

function collectEstimationsFromProject(project) {
  const list = [];
  const fromRow = project.estimations || [];
  fromRow.forEach((e) => list.push(e));
  const metaDoc = (project.documents || []).find(
    (d) =>
      String(d.id || "").startsWith("_paf_meta_") || d.title === "_PAF_INTERNAL"
  );
  if (metaDoc?.content) {
    try {
      const meta = JSON.parse(metaDoc.content);
      (meta.estimations || []).forEach((e) => list.push(e));
    } catch {
      /* ignore */
    }
  }
  return list;
}

function buildEstimationBreakdown(estimationId, projects) {
  const groups = [];
  let grandTotal = 0;

  (projects || []).forEach((project) => {
    const concepts = project.concepts || [];
    const lines = [];
    concepts.forEach((c) => {
      const advances = Array.isArray(c.advances) ? c.advances : [];
      advances.forEach((a) => {
        if (a.estimationId !== estimationId) return;
        const m2 = Number(a.m2) || 0;
        const unit = Number(c.unitPrice) || 0;
        lines.push({
          projectId: project.id,
          projectName: project.name,
          conceptId: c.id,
          conceptName: c.name,
          m2,
          unitPrice: unit,
          amount: Math.round(m2 * unit),
          date: a.date || "",
          note: a.note || "",
        });
      });
    });
    if (!lines.length) return;
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    grandTotal += subtotal;
    groups.push({
      projectId: project.id,
      projectName: project.name,
      lines,
      subtotal,
    });
  });

  return {
    estimationId,
    groups,
    grandTotal,
    lineCount: groups.reduce((s, g) => s + g.lines.length, 0),
  };
}

function buildAllEstimationBreakdowns(estimations, projects) {
  const breakdowns = {};
  (estimations || []).forEach((est) => {
    if (!est?.id) return;
    breakdowns[est.id] = buildEstimationBreakdown(est.id, projects);
  });
  return breakdowns;
}

function calcGlobalTotalPaid(estimations, projects) {
  return (estimations || [])
    .filter((e) => e.paid)
    .reduce((sum, e) => {
      const b = buildEstimationBreakdown(e.id, projects);
      return sum + b.grandTotal;
    }, 0);
}

module.exports = {
  GLOBAL_PROJECT_ID,
  GLOBAL_DOC_ID,
  GLOBAL_TITLE,
  normalizeEstimation,
  mergeEstimationRecords,
  collectEstimationsFromProject,
  buildEstimationBreakdown,
  buildAllEstimationBreakdowns,
  calcGlobalTotalPaid,
};
