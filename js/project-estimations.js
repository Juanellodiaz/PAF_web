function parseAdvances(c) {
  return Array.isArray(c?.advances) ? c.advances : [];
}

function conceptAdvanceM2(c) {
  return parseAdvances(c).reduce((s, a) => s + (Number(a.m2) || 0), 0);
}

function conceptAdvancePendingM2(c) {
  const total = Number(c.m2) || 0;
  return Math.max(0, total - conceptAdvanceM2(c));
}

function calcProjectProgress(concepts) {
  const list = concepts || [];
  const totalM2 = list.reduce((s, c) => s + (Number(c.m2) || 0), 0);
  const doneM2 = list.reduce((s, c) => s + conceptAdvanceM2(c), 0);
  const percent = totalM2
    ? Math.min(100, Math.round((doneM2 / totalM2) * 1000) / 10)
    : 0;
  return { totalM2, doneM2, percent };
}

function getEstimationLines(estimationId, concepts) {
  const lines = [];
  (concepts || []).forEach((c) => {
    parseAdvances(c).forEach((a) => {
      if (a.estimationId !== estimationId) return;
      const m2 = Number(a.m2) || 0;
      const unit = Number(c.unitPrice) || 0;
      lines.push({
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
  return lines;
}

function getEstimationTotal(estimationId, concepts) {
  return getEstimationLines(estimationId, concepts).reduce(
    (s, l) => s + l.amount,
    0
  );
}

function projectsForEstimationBreakdown() {
  const list = window.__pafProjectsForEstimations || [];
  const projectId = window.__pafProjectId;
  if (!projectId || typeof collectConcepts !== "function") return list;
  const concepts = collectConcepts();
  return list.map((p) =>
    p.id === projectId ? { ...p, concepts } : p
  );
}

function getEstimationBreakdown(estimationId, projects) {
  const groups = [];
  let grandTotal = 0;
  (projects || []).forEach((project) => {
    const lines = getEstimationLines(estimationId, project.concepts || []).map(
      (l) => ({
        ...l,
        projectId: project.id,
        projectName: project.name,
      })
    );
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

function refreshEstimationBreakdowns(estimations) {
  const list =
    estimations ||
    (typeof editorEstimations !== "undefined" ? editorEstimations : []) ||
    window.__pafGlobalEstimations ||
    [];
  const projects = projectsForEstimationBreakdown();
  const breakdowns = {};
  list.forEach((est) => {
    if (!est?.id) return;
    breakdowns[est.id] = getEstimationBreakdown(est.id, projects);
  });
  window.__pafEstimationBreakdowns = breakdowns;
  return breakdowns;
}

function estimationBreakdownFor(estimationId, estimations) {
  if (!window.__pafEstimationBreakdowns) {
    refreshEstimationBreakdowns(estimations);
  }
  return (
    window.__pafEstimationBreakdowns?.[estimationId] ||
    getEstimationBreakdown(estimationId, projectsForEstimationBreakdown())
  );
}

function calcTotalPaid(estimations, projectsOrConcepts) {
  const list = mergeEstimationsFromConcepts(estimations, []);
  const isMultiProject =
    Array.isArray(projectsOrConcepts) &&
    projectsOrConcepts.some((p) => p && p.concepts !== undefined);
  return list
    .filter((e) => e.paid)
    .reduce((sum, e) => {
      if (isMultiProject) {
        return sum + estimationBreakdownFor(e.id, list).grandTotal;
      }
      return sum + getEstimationTotal(e.id, projectsOrConcepts || []);
    }, 0);
}

function estimationLinesGroupedHtml(breakdown) {
  if (!breakdown?.groups?.length) {
    return '<p class="admin-empty admin-empty-inline">Sin partidas en ningún proyecto. Agrega avances en los conceptos y asígnalos a esta estimación.</p>';
  }
  const sections = breakdown.groups
    .map((g) => {
      const rows = g.lines
        .map(
          (l) => `
        <tr>
          <td>${escapeHtml(l.conceptName)}</td>
          <td>${l.m2}</td>
          <td>${formatMoney(l.unitPrice)}</td>
          <td>${formatMoney(l.amount)}</td>
          <td>${l.date ? formatDate(l.date) : "—"}</td>
        </tr>`
        )
        .join("");
      return `
      <div class="estimation-project-group">
        <p class="estimation-project-group-label">${escapeHtml(g.projectName)}</p>
        <table class="estimation-lines-table">
          <thead>
            <tr><th>Concepto</th><th>m²</th><th>P. unit.</th><th>Importe</th><th>Fecha</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="estimation-project-subtotal">Subtotal proyecto: <strong>${formatMoney(g.subtotal)}</strong></p>
      </div>`;
    })
    .join("");
  return `${sections}<p class="estimation-grand-total">Total global: <strong>${formatMoney(breakdown.grandTotal)}</strong></p>`;
}

function estimationDisplayLabel(est, index) {
  return (est.label || "").trim() || `Estimación ${String(index + 1).padStart(2, "0")}`;
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
      ...mergeEstimationPaidState(prev, e),
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
    parseAdvances(c).forEach((a) => {
      if (!a.estimationId || byId.has(a.estimationId)) return;
      n += 1;
      byId.set(a.estimationId, {
        id: a.estimationId,
        label: `Estimación ${String(n).padStart(2, "0")}`,
        date: a.date || new Date().toISOString().slice(0, 10),
        paid: false,
        paidAt: null,
        notes: "",
        expanded: false,
      });
    });
  });
  return Array.from(byId.values());
}

function buildEstimationExportHtml(estimation, breakdown, clientName, estimationsList) {
  const list = estimationsList || window.__pafGlobalEstimations || [];
  const idx = list.findIndex((e) => e.id === estimation.id);
  const title = estimationDisplayLabel(estimation, idx >= 0 ? idx : 0);
  const paidText = estimation.paid
    ? `Pagada${estimation.paidAt ? ` — ${formatDate(estimation.paidAt)}` : ""}`
    : "Pendiente de pago";
  const b =
    breakdown || estimationBreakdownFor(estimation.id, list);
  const total = b.grandTotal || 0;
  const projectCount = b.groups?.length || 0;

  const sections = (b.groups || [])
    .map((g) => {
      const rows = g.lines
        .map(
          (l) => `
      <tr>
        <td>${escapeHtml(l.conceptName)}</td>
        <td class="num">${l.m2}</td>
        <td class="num">${formatMoney(l.unitPrice)}</td>
        <td class="num">${formatMoney(l.amount)}</td>
        <td>${l.date ? formatDate(l.date) : "—"}</td>
      </tr>`
        )
        .join("");
      return `
    <h2 class="project-heading">${escapeHtml(g.projectName)}</h2>
    <table>
      <thead>
        <tr>
          <th>Concepto</th>
          <th class="num">m²</th>
          <th class="num">Precio unit.</th>
          <th class="num">Importe</th>
          <th>Fecha avance</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="subtotal-row">
          <td colspan="3">Subtotal ${escapeHtml(g.projectName)}</td>
          <td class="num">${formatMoney(g.subtotal)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} — PAF</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
    h1 { font-size: 1.35rem; margin: 0 0 0.25rem; }
    .meta { color: #555; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .badge { display: inline-block; padding: 0.2rem 0.6rem; border: 1px solid #ccc; font-size: 0.75rem; margin-top: 0.5rem; }
    .project-heading { font-size: 1rem; margin: 1.75rem 0 0.5rem; border-bottom: 1px solid #ddd; padding-bottom: 0.35rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; margin-bottom: 0.5rem; }
    th, td { border: 1px solid #ddd; padding: 0.5rem 0.65rem; text-align: left; font-size: 0.85rem; }
    th { background: #f5f5f5; }
    .num { text-align: right; }
    tfoot td { font-weight: 600; }
    .subtotal-row td { background: #fafafa; }
    .total-row td { border-top: 2px solid #111; font-size: 1rem; }
    .grand-total { margin-top: 1.5rem; font-size: 1.1rem; font-weight: 700; }
    @media print { body { margin: 1rem; } }
  </style>
</head>
<body>
  <p style="letter-spacing:0.15em;font-size:0.7rem;text-transform:uppercase;color:#888">PAF — Premium Architectural Finishes</p>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">
    Estimación global · ${projectCount} proyecto(s) con partidas<br>
    Cliente: ${escapeHtml(clientName || "—")}<br>
    Fecha estimación: ${formatDate(estimation.date)}<br>
    <span class="badge">${paidText}</span>
  </p>
  ${sections || '<p>Sin partidas en ningún proyecto.</p>'}
  <p class="grand-total">Total global: ${formatMoney(total)}</p>
  <p style="margin-top:2rem;font-size:0.75rem;color:#888">Generado ${new Date().toLocaleString("es-MX")}</p>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
}

function downloadEstimation(estimation, clientName, breakdown) {
  refreshEstimationBreakdowns();
  const html = buildEstimationExportHtml(
    estimation,
    breakdown || estimationBreakdownFor(estimation.id),
    clientName
  );
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `estimacion-${estimation.id}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}
