function draftKey(projectId) {
  return `paf-draft-${projectId}`;
}

function countAdvances(concepts) {
  return (concepts || []).reduce(
    (s, c) => s + (Array.isArray(c.advances) ? c.advances.length : 0),
    0
  );
}

function saveEditorDraft(projectId) {
  if (!projectId || typeof editorConcepts === "undefined") return;
  try {
    const payload = {
      savedAt: Date.now(),
      concepts: editorConcepts.map((c) => {
        const { collapsed: _c, ...rest } = c;
        return rest;
      }),
      estimations: editorEstimations || [],
    };
    sessionStorage.setItem(draftKey(projectId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

function loadEditorDraft(projectId) {
  try {
    const raw = sessionStorage.getItem(draftKey(projectId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearEditorDraft(projectId) {
  try {
    sessionStorage.removeItem(draftKey(projectId));
  } catch {
    /* ignore */
  }
}

function mergeProjectWithDraft(project, draft) {
  if (!draft?.concepts) return project;
  const byId = new Map((project.concepts || []).map((c) => [c.id, c]));
  const concepts = draft.concepts.map((dc) => {
    const server = byId.get(dc.id) || dc;
    const draftAdv = dc.advances || [];
    const serverAdv = server.advances || [];
    return {
      ...server,
      ...dc,
      advances: draftAdv.length >= serverAdv.length ? draftAdv : serverAdv,
    };
  });
  (project.concepts || []).forEach((c) => {
    if (!concepts.find((x) => x.id === c.id)) concepts.push(c);
  });
  const estimations =
    (draft.estimations?.length || 0) >= (project.estimations?.length || 0)
      ? draft.estimations
      : project.estimations || [];
  return { ...project, concepts, estimations };
}

function projectNeedsDraftRestore(project, draft) {
  if (!draft) return false;
  return countAdvances(draft.concepts) > countAdvances(project.concepts);
}
