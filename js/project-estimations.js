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

function estimationDisplayLabel(est, index) {
  return (est.label || "").trim() || `Estimación ${String(index + 1).padStart(2, "0")}`;
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
        expanded: true,
      });
    });
  });
  return Array.from(byId.values());
}

function buildEstimationExportHtml(project, estimation, concepts, clientName) {
  const lines = getEstimationLines(estimation.id, concepts);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const idx = (project.estimations || []).findIndex((e) => e.id === estimation.id);
  const title = estimationDisplayLabel(estimation, idx >= 0 ? idx : 0);
  const paidText = estimation.paid
    ? `Pagada${estimation.paidAt ? ` — ${formatDate(estimation.paidAt)}` : ""}`
    : "Pendiente de pago";

  const rows = lines
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

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} — ${escapeHtml(project.name)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
    h1 { font-size: 1.35rem; margin: 0 0 0.25rem; }
    .meta { color: #555; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .badge { display: inline-block; padding: 0.2rem 0.6rem; border: 1px solid #ccc; font-size: 0.75rem; margin-top: 0.5rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { border: 1px solid #ddd; padding: 0.5rem 0.65rem; text-align: left; font-size: 0.85rem; }
    th { background: #f5f5f5; }
    .num { text-align: right; }
    tfoot td { font-weight: 600; }
    .total-row td { border-top: 2px solid #111; }
    @media print { body { margin: 1rem; } }
  </style>
</head>
<body>
  <p style="letter-spacing:0.15em;font-size:0.7rem;text-transform:uppercase;color:#888">PAF — Premium Architectural Finishes</p>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">
    Proyecto: <strong>${escapeHtml(project.name)}</strong><br>
    Cliente: ${escapeHtml(clientName || "—")}<br>
    Fecha estimación: ${formatDate(estimation.date)}<br>
    <span class="badge">${paidText}</span>
  </p>
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
    <tbody>
      ${rows || '<tr><td colspan="5">Sin partidas</td></tr>'}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="3">Total estimación</td>
        <td class="num">${formatMoney(total)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
  <p style="margin-top:2rem;font-size:0.75rem;color:#888">Generado ${new Date().toLocaleString("es-MX")}</p>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
}

function downloadEstimation(project, estimation, concepts, clientName) {
  const html = buildEstimationExportHtml(
    project,
    estimation,
    concepts,
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
