const { normalizeEstimation } = require("./global-estimations");

const STORE_VERSION = 2;

function parseGlobalEstimationStore(parsed) {
  if (Array.isArray(parsed)) {
    return {
      estimations: parsed.map(normalizeEstimation).filter(Boolean),
      deletedIds: [],
    };
  }
  if (parsed && typeof parsed === "object") {
    const estimations = Array.isArray(parsed.estimations)
      ? parsed.estimations.map(normalizeEstimation).filter(Boolean)
      : [];
    const deletedIds = Array.isArray(parsed.deletedIds)
      ? parsed.deletedIds.filter((id) => typeof id === "string" && id)
      : [];
    return { estimations, deletedIds };
  }
  return { estimations: [], deletedIds: [] };
}

function serializeGlobalEstimationStore(store) {
  return JSON.stringify({
    v: STORE_VERSION,
    estimations: (store.estimations || []).map(normalizeEstimation).filter(Boolean),
    deletedIds: [
      ...new Set(
        (store.deletedIds || []).filter((id) => typeof id === "string" && id)
      ),
    ],
  });
}

function mergeDeletedEstimationIds(existing, incoming) {
  return [
    ...new Set([
      ...(existing || []).filter(Boolean),
      ...(incoming || []).filter(Boolean),
    ]),
  ];
}

module.exports = {
  STORE_VERSION,
  parseGlobalEstimationStore,
  serializeGlobalEstimationStore,
  mergeDeletedEstimationIds,
};
