import {
  createEmptyProject,
  type LatencyProject,
  type WorkspaceDocument,
} from "../../shared/domain/types";

export function isProjectLive(project: LatencyProject): boolean {
  return project.archivedAt === undefined;
}

export function createProject(
  document: WorkspaceDocument,
  now = Date.now(),
): WorkspaceDocument {
  const project = createEmptyProject(now);
  return {
    ...document,
    activeProjectId: project.id,
    projects: [project, ...document.projects],
  };
}

export function selectProject(
  document: WorkspaceDocument,
  projectId: string,
): WorkspaceDocument {
  return document.projects.some(
    (project) => project.id === projectId && isProjectLive(project),
  )
    ? { ...document, activeProjectId: projectId }
    : document;
}

export function renameProject(
  project: LatencyProject,
  title: string,
  now = Date.now(),
): LatencyProject {
  return { ...project, title: title.trim() || "未命名链路", updatedAt: now };
}

/**
 * 归档项目：数据与方案快照全部保留，仅从常用入口隐藏。
 * 归档当前项目时落到下一个未归档项目；若已没有未归档项目，
 * 兜底新建一个空白项目，保证任何时候都有可选中的项目。
 */
export function archiveProject(
  document: WorkspaceDocument,
  projectId: string,
  now = Date.now(),
): WorkspaceDocument {
  const target = document.projects.find((project) => project.id === projectId);
  if (!target || !isProjectLive(target)) return document;
  const projects = document.projects.map((project) =>
    project.id === projectId
      ? { ...project, archivedAt: now, updatedAt: now }
      : project,
  );
  if (document.activeProjectId !== projectId) return { ...document, projects };
  const nextActive = projects.find(isProjectLive);
  if (nextActive)
    return { ...document, projects, activeProjectId: nextActive.id };
  const fallback = createEmptyProject(now);
  return {
    ...document,
    projects: [fallback, ...projects],
    activeProjectId: fallback.id,
  };
}

/** 恢复归档项目：重新出现在常用入口，并设为当前项目。 */
export function unarchiveProject(
  document: WorkspaceDocument,
  projectId: string,
  now = Date.now(),
): WorkspaceDocument {
  const target = document.projects.find((project) => project.id === projectId);
  if (!target || isProjectLive(target)) return document;
  const projects = document.projects.map((project) =>
    project.id === projectId
      ? { ...project, archivedAt: undefined, updatedAt: now }
      : project,
  );
  return { ...document, projects, activeProjectId: projectId };
}

export function duplicateProject(
  document: WorkspaceDocument,
  project: LatencyProject,
  now = Date.now(),
): WorkspaceDocument {
  const idMap = new Map<string, string>();
  const clonedNodes = project.nodes.map((source) => {
    const id = crypto.randomUUID();
    idMap.set(source.id, id);
    return { ...source, id, dependencyIds: [], fallbackNodeId: undefined };
  });
  const copy: LatencyProject = {
    ...structuredClone(project),
    id: `project-${crypto.randomUUID()}`,
    title: `${project.title} · 副本`,
    createdAt: now,
    updatedAt: now,
    scenarios: [],
    // 复制归档项目得到的是新的在用项目，不继承归档状态
    archivedAt: undefined,
    nodes: clonedNodes.map((node, index) => {
      const source = project.nodes[index];
      if (!source) return node;
      const fallbackId = source.fallbackNodeId
        ? idMap.get(source.fallbackNodeId)
        : undefined;
      return {
        ...node,
        dependencyIds: source.dependencyIds
          .map((id) => idMap.get(id))
          .filter((id): id is string => Boolean(id)),
        ...(fallbackId ? { fallbackNodeId: fallbackId } : {}),
      };
    }),
  };
  return {
    ...document,
    activeProjectId: copy.id,
    projects: [copy, ...document.projects],
  };
}

export function removeProject(
  document: WorkspaceDocument,
  projectId: string,
  now = Date.now(),
): WorkspaceDocument {
  const projects = document.projects.filter(
    (project) => project.id !== projectId,
  );
  if (document.activeProjectId !== projectId) return { ...document, projects };
  // 删除当前项目时落到下一个未归档项目，跳过已归档项目
  const nextActive = projects.find(isProjectLive);
  if (nextActive)
    return { ...document, projects, activeProjectId: nextActive.id };
  // 剩余项目均已归档：兜底新建空白项目，避免选不中任何项目
  const fallback = createEmptyProject(now);
  return {
    ...document,
    projects: [fallback, ...projects],
    activeProjectId: fallback.id,
  };
}

export function updateProject(
  document: WorkspaceDocument,
  project: LatencyProject,
): WorkspaceDocument {
  return {
    ...document,
    projects: document.projects.map((item) =>
      item.id === project.id ? project : item,
    ),
  };
}
