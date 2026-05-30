const { mergeEstimationRecords, normalizeEstimation } = require("./global-estimations");

function isoWeekParts(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    const today = new Date().toISOString().slice(0, 10);
    return isoWeekParts(today);
  }
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const week = 1 + Math.ceil((firstThursday - target) / 604800000);
  const year = new Date(firstThursday).getFullYear();
  return { year, week };
}

function weekGroupKey(dateStr) {
  const { year, week } = isoWeekParts(dateStr);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function weekGroupLabel(dateStr) {
  const { week } = isoWeekParts(dateStr);
  return `Semana ${week}`;
}

function hasOrphanAdvances(projects) {
  for (const p of projects || []) {
    for (const c of p.concepts || []) {
      for (const a of c.advances || []) {
        if (!a.estimationId) return true;
      }
    }
  }
  return false;
}

function rebuildEstimationsFromOrphanAdvances(projects, existingGlobal = []) {
  const byWeek = new Map();
  let orphanCount = 0;

  for (const p of projects || []) {
    for (const c of p.concepts || []) {
      for (const a of c.advances || []) {
        if (a.estimationId) continue;
        orphanCount += 1;
        const date = a.date || new Date().toISOString().slice(0, 10);
        const key = weekGroupKey(date);
        if (!byWeek.has(key)) {
          const { year, week } = isoWeekParts(date);
          byWeek.set(key, normalizeEstimation({
            id: `est-${year}w${String(week).padStart(2, "0")}`,
            label: weekGroupLabel(date),
            date,
            paid: false,
            paidAt: null,
            notes: "Recuperada automáticamente",
          }));
        }
      }
    }
  }

  if (!orphanCount) {
    return {
      global: existingGlobal,
      projects,
      orphanCount: 0,
      created: [],
      changed: false,
    };
  }

  const created = Array.from(byWeek.values());
  let global = mergeEstimationRecords(existingGlobal, created);

  const weekToId = new Map();
  for (const [key, est] of byWeek.entries()) {
    weekToId.set(key, est.id);
  }

  const nextProjects = (projects || []).map((p) => {
    let changed = false;
    const concepts = (p.concepts || []).map((c) => {
      const advances = (c.advances || []).map((a) => {
        if (a.estimationId) return a;
        const key = weekGroupKey(a.date || new Date().toISOString().slice(0, 10));
        const estimationId = weekToId.get(key);
        if (!estimationId) return a;
        changed = true;
        return { ...a, estimationId };
      });
      if (!changed) return c;
      return { ...c, advances };
    });
    return { ...p, concepts };
  });

  return {
    global,
    projects: nextProjects,
    orphanCount,
    created,
    changed: true,
  };
}

module.exports = {
  isoWeekParts,
  weekGroupKey,
  weekGroupLabel,
  hasOrphanAdvances,
  rebuildEstimationsFromOrphanAdvances,
};
