const { advanceEffectiveUnitPrice, advanceAmount } = require("./advance-pricing");

const GLOBAL_PROJECT_ID = "_paf_system";
const GLOBAL_DOC_ID = "_paf_global_estimations";
const GLOBAL_TITLE = "_PAF_GLOBAL_ESTIMATIONS";

function normalizePaymentStatus(value) {
  if (value === "paid" || value === "partial" || value === "pending") {
    return value;
  }
  return null;
}

function normalizeEstimation(e) {
  if (!e || typeof e !== "object" || !e.id) return null;
  const amountPaid = Math.max(0, Math.round(Number(e.amountPaid) || 0));
  const paid = !!e.paid;
  let paymentStatus = normalizePaymentStatus(e.paymentStatus);
  if (!paymentStatus) {
    paymentStatus = paid ? "paid" : amountPaid > 0 ? "partial" : "pending";
  }
  const sortOrder = Number(e.sortOrder);
  const out = {
    id: e.id,
    label: (e.label || "").trim(),
    date: e.date || new Date().toISOString().slice(0, 10),
    amountPaid,
    paid,
    paymentStatus,
    paidAt: amountPaid > 0 || paid ? e.paidAt || null : null,
    notes: (e.notes || "").trim(),
  };
  if (Number.isFinite(sortOrder)) out.sortOrder = sortOrder;
  return out;
}

/**
 * @param {object} opts
 * @param {boolean} [opts.incomingWins] — al guardar un proyecto, el payload manda sobre el global
 */
function mergeEstimationPaymentFields(prev, next, opts = {}) {
  const prevAmt = Math.max(0, Math.round(Number(prev?.amountPaid) || 0));
  const nextAmt = Math.max(0, Math.round(Number(next?.amountPaid) || 0));
  if (opts.incomingWins) {
    const amountPaid = nextAmt;
    const paid = !!next?.paid;
    const paymentStatus =
      normalizePaymentStatus(next?.paymentStatus) ||
      (paid ? "paid" : amountPaid > 0 ? "partial" : "pending");
    return {
      amountPaid,
      paid,
      paymentStatus,
      paidAt:
        amountPaid > 0 || paid
          ? next?.paidAt || prev?.paidAt || null
          : null,
    };
  }
  const amountPaid = Math.max(prevAmt, nextAmt);
  const paid = !!prev?.paid || !!next?.paid;
  const paymentStatus =
    normalizePaymentStatus(next?.paymentStatus) ||
    normalizePaymentStatus(prev?.paymentStatus) ||
    (paid ? "paid" : amountPaid > 0 ? "partial" : "pending");
  return {
    amountPaid,
    paid,
    paymentStatus,
    paidAt:
      amountPaid > 0 || paid
        ? (nextAmt >= prevAmt ? next?.paidAt : null) ||
          prev?.paidAt ||
          next?.paidAt ||
          null
        : null,
  };
}

function mergeEstimationRecords(existing, incoming, opts = {}) {
  const byId = new Map();
  (existing || []).forEach((e) => {
    if (!e?.id) return;
    const norm = normalizeEstimation(e);
    if (norm) byId.set(e.id, norm);
  });
  (incoming || []).forEach((e) => {
    if (!e?.id) return;
    const prev = byId.get(e.id);
    const next = normalizeEstimation(e);
    if (!next) return;
    if (!prev) {
      byId.set(e.id, next);
      return;
    }
    const merged = {
      ...prev,
      ...next,
      ...mergeEstimationPaymentFields(prev, next, opts),
    };
    const nextOrder = Number(next.sortOrder);
    const prevOrder = Number(prev.sortOrder);
    if (opts.incomingWins && Number.isFinite(nextOrder)) {
      merged.sortOrder = nextOrder;
    } else if (Number.isFinite(prevOrder)) {
      merged.sortOrder = prevOrder;
    } else if (Number.isFinite(nextOrder)) {
      merged.sortOrder = nextOrder;
    }
    byId.set(e.id, merged);
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
      (meta.estimationsArchive || []).forEach((e) => list.push(e));
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
        const unit = advanceEffectiveUnitPrice(a, c);
        lines.push({
          projectId: project.id,
          projectName: project.name,
          conceptId: c.id,
          conceptName: c.name,
          m2,
          unitPrice: unit,
          amount: advanceAmount(a, c),
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
  return (estimations || []).reduce((sum, e) => {
    const b = buildEstimationBreakdown(e.id, projects);
    const total = b.grandTotal || 0;
    let amountPaid = Math.max(0, Math.round(Number(e.amountPaid) || 0));
    if (e.paid && amountPaid === 0 && total > 0) amountPaid = total;
    if (amountPaid > total && total > 0) amountPaid = total;
    return sum + amountPaid;
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
