function parseIndirectCosts(projectOrList) {
  if (Array.isArray(projectOrList)) return projectOrList;
  return Array.isArray(projectOrList?.indirectCosts)
    ? projectOrList.indirectCosts
    : [];
}

function calcIndirectTotal(indirectCosts) {
  return parseIndirectCosts(indirectCosts).reduce(
    (s, item) => s + (Number(item.amount) || 0),
    0
  );
}

function calcIndirectPercent(conceptsTotal, indirectTotal) {
  const base = Number(conceptsTotal) || 0;
  const indirect = Number(indirectTotal) || 0;
  if (!base || !indirect) return 0;
  return Math.min(100, Math.round((indirect / base) * 1000) / 10);
}

function enrichProjectFinancials(project) {
  const conceptsTotal = Number(project.conceptsTotal) || 0;
  const indirectCosts = parseIndirectCosts(project);
  const indirectTotal = calcIndirectTotal(indirectCosts);
  return {
    ...project,
    indirectCosts,
    indirectTotal,
    indirectPercent: calcIndirectPercent(conceptsTotal, indirectTotal),
  };
}

function formatIndirectNote(indirectTotal) {
  const n = Number(indirectTotal) || 0;
  if (!n) return "";
  return `−${formatMoney(n)} indirectos`;
}

function formatProjectMoneyDisplay(project) {
  const p = enrichProjectFinancials(project);
  const base = formatMoney(p.conceptsTotal || 0);
  const note = formatIndirectNote(p.indirectTotal);
  if (!note) return base;
  return `${base} · ${note}`;
}

function newIndirectCost() {
  return {
    id: `ind-${Math.random().toString(16).slice(2, 10)}`,
    label: "",
    amount: 0,
    date: new Date().toISOString().slice(0, 10),
    note: "",
  };
}

function collectIndirectCostsFromList(list) {
  return (list || [])
    .map((item) => ({
      id: item.id,
      label: (item.label || "").trim(),
      amount: Math.round(Number(item.amount) || 0),
      date: item.date || new Date().toISOString().slice(0, 10),
      note: (item.note || "").trim(),
    }))
    .filter((item) => item.label && item.amount > 0);
}
