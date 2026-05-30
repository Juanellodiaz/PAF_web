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

function syncProjectsForEstimations(currentProject) {
  if (!currentProject?.id) {
    return window.__pafProjectsForEstimations || [];
  }
  const list = [...(window.__pafProjectsForEstimations || [])];
  const idx = list.findIndex((p) => p.id === currentProject.id);
  const merged = {
    ...(idx >= 0 ? list[idx] : {}),
    ...currentProject,
    concepts: currentProject.concepts || [],
  };
  if (idx >= 0) list[idx] = merged;
  else list.push(merged);
  window.__pafProjectsForEstimations = list;
  return list;
}

function projectsForEstimationBreakdown() {
  if (window.__pafProjectData?.id) {
    syncProjectsForEstimations(window.__pafProjectData);
  }
  const list = window.__pafProjectsForEstimations || [];
  const projectId = window.__pafProjectId;
  if (!projectId || typeof editorConcepts === "undefined") return list;
  return list.map((p) =>
    p.id === projectId ? { ...p, concepts: editorConcepts } : p
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
  if (window.__pafProjectData?.id) {
    syncProjectsForEstimations(window.__pafProjectData);
  }
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
  const projects = projectsForEstimationBreakdown();
  const fresh = getEstimationBreakdown(estimationId, projects);
  if (!window.__pafEstimationBreakdowns) {
    window.__pafEstimationBreakdowns = {};
  }
  window.__pafEstimationBreakdowns[estimationId] = fresh;
  return fresh;
}

function estimationGrandTotal(est, estimations, projectsOrConcepts) {
  const isMultiProject =
    Array.isArray(projectsOrConcepts) &&
    projectsOrConcepts.some((p) => p && p.concepts !== undefined);
  if (isMultiProject) {
    return estimationBreakdownFor(est.id, estimations).grandTotal;
  }
  return getEstimationTotal(est.id, projectsOrConcepts || []);
}

function calcTotalPaid(estimations, projectsOrConcepts) {
  const list = mergeEstimationsFromConcepts(estimations, []);
  return list
    .filter((e) => e.paid)
    .reduce(
      (sum, e) => sum + estimationGrandTotal(e, list, projectsOrConcepts),
      0
    );
}

function calcTotalPending(estimations, projectsOrConcepts) {
  const list = mergeEstimationsFromConcepts(estimations, []);
  return list
    .filter((e) => !e.paid)
    .reduce(
      (sum, e) => sum + estimationGrandTotal(e, list, projectsOrConcepts),
      0
    );
}

function computeDashboardSummary(projects, estimations) {
  const list = projects || [];
  const estList = estimations || [];

  const activeMoney = list
    .filter((p) => normalizeProjectStatus(p.status) === "en_proceso")
    .reduce((s, p) => s + (Number(p.conceptsTotal) || 0), 0);

  const pendingApprovalCount = list.filter(
    (p) => normalizeProjectStatus(p.status) === "en_aprobacion"
  ).length;

  const reviewMoney = list
    .filter((p) => normalizeProjectStatus(p.status) === "en_aprobacion")
    .reduce((s, p) => s + (Number(p.conceptsTotal) || 0), 0);

  window.__pafProjectsForEstimations = list;
  const totalPaid = calcTotalPaid(estList, list);
  const totalPending = calcTotalPending(estList, list);

  return {
    activeMoney,
    pendingApprovalCount,
    reviewMoney,
    totalPaid,
    totalPending,
  };
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

function projectProgressForExport(projectId) {
  const project = (window.__pafProjectsForEstimations || []).find(
    (p) => p.id === projectId
  );
  if (!project) return { percent: 0, doneM2: 0, totalM2: 0 };
  return calcProjectProgress(project.concepts || []);
}

function estimationPeriodProgress(group, projectId) {
  const global = projectProgressForExport(projectId);
  const periodM2 = (group.lines || []).reduce(
    (s, l) => s + (Number(l.m2) || 0),
    0
  );
  const periodPercent = global.totalM2
    ? Math.min(100, Math.round((periodM2 / global.totalM2) * 1000) / 10)
    : 0;
  return { periodM2, periodPercent, global };
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
      const { periodM2, periodPercent, global } = estimationPeriodProgress(
        g,
        g.projectId
      );
      const progressLine = `
        Avance durante el periodo de estimación: <strong>+${periodPercent}%</strong> (${periodM2} m² en esta estimación)<br>
        Avance global del proyecto: <strong>${global.percent}%</strong> (${global.doneM2} / ${global.totalM2} m²)`;
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
    <p class="project-progress">${progressLine}</p>
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
    .project-heading { font-size: 1rem; margin: 1.75rem 0 0.35rem; border-bottom: 1px solid #ddd; padding-bottom: 0.35rem; }
    .project-progress { font-size: 0.85rem; color: #444; margin: 0 0 0.65rem; line-height: 1.5; }
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

function clientEstimationCardHtml(est, idx) {
  const breakdown = estimationBreakdownFor(est.id);
  const total = breakdown.grandTotal || 0;
  const lineCount = breakdown.lineCount || 0;
  const projectCount = breakdown.groups?.length || 0;
  const label = estimationDisplayLabel(est, idx);
  const paid = !!est.paid;
  const projectsNote =
    projectCount > 1 ? ` · ${projectCount} proyectos` : "";
  const summary = `${label} · ${lineCount} partida(s)${projectsNote} · ${formatMoney(total)} · ${paid ? "Pagada" : "Pendiente"}`;

  return `
    <div class="estimation-card concept-row is-collapsed" data-client-est-idx="${idx}">
      <div class="concept-row-top estimation-card-head">
        <button type="button" class="concept-toggle" aria-expanded="false" onclick="pafToggleClientEstimation(${idx})">
          <span class="concept-chevron" aria-hidden="true"></span>
          <span class="concept-row-num">EST ${String(idx + 1).padStart(2, "0")}</span>
          <span class="concept-summary">${escapeHtml(summary)}</span>
        </button>
        <div class="estimation-head-actions">
          <span class="estimation-status-badge ${paid ? "paid" : "pending"}">${paid ? "PAGADA" : "PENDIENTE DE PAGO"}</span>
          <span class="estimation-total">${formatMoney(total)}</span>
          <button type="button" class="btn btn-ghost btn-sm" onclick="pafToggleClientEstimation(${idx})">Ver detalle</button>
          <button type="button" class="btn btn-ghost btn-sm" data-client-download-est="${idx}">Descargar</button>
        </div>
      </div>
      <div class="concept-row-body estimation-detail">
        ${est.notes ? `<p class="estimation-notes-readonly">${escapeHtml(est.notes)}</p>` : ""}
        ${estimationLinesGroupedHtml(breakdown)}
      </div>
    </div>`;
}

function renderClientEstimationsList(
  listEl,
  estimations,
  clientName,
  currentProject
) {
  if (!listEl) return [];

  if (currentProject?.id) {
    syncProjectsForEstimations(currentProject);
  }
  const list = mergeEstimationsFromConcepts(
    estimations || [],
    currentProject?.concepts || []
  );
  refreshEstimationBreakdowns(list);

  if (!list.length) {
    listEl.innerHTML =
      '<p class="portal-user">Sin estimaciones generadas.</p>';
    return [];
  }

  const sorted = [...list].sort((a, b) => {
    if (!!a.paid !== !!b.paid) return a.paid ? 1 : -1;
    return (b.date || "").localeCompare(a.date || "");
  });

  listEl.innerHTML = sorted
    .map((est, idx) => clientEstimationCardHtml(est, idx))
    .join("");

  listEl.querySelectorAll("[data-client-download-est]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.clientDownloadEst);
      const est = sorted[idx];
      if (est) {
        if (currentProject?.id) syncProjectsForEstimations(currentProject);
        refreshEstimationBreakdowns(sorted);
        downloadEstimation(est, clientName);
      }
    });
  });

  window.__pafClientEstimationsSorted = sorted;
  return sorted;
}

window.pafToggleClientEstimation = function (idx) {
  const card = document.querySelector(`[data-client-est-idx="${idx}"]`);
  if (!card) return;
  const collapsed = card.classList.toggle("is-collapsed");
  const expanded = !collapsed;
  const toggle = card.querySelector(".concept-toggle");
  if (toggle) toggle.setAttribute("aria-expanded", String(expanded));
  card.querySelectorAll(".estimation-head-actions .btn-ghost").forEach((btn) => {
    if (!btn.hasAttribute("data-client-download-est")) {
      btn.textContent = expanded ? "Ocultar" : "Ver detalle";
    }
  });
};

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
