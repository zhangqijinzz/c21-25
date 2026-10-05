import {
  createEmptyProject,
  type LatencyProject,
  type WorkspaceDocument,
} from "../../shared/domain/types";

export function isProjectArchived(project: LatencyProject): boolean {
  return project.archived === true;
}

/**
 * 常用入口（侧边栏下拉、项目列表）默认只展示未归档项目；
 * 全部项目都被归档时回退为展示全部，保证始终有项目可选。
 */
export function visibleProjects(projects: LatencyProject[]): LatencyProject[] {
  const open = projects.filter((project) => !isProjectArchived(project));
  return open.length ? open : projects;
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
  return document.projects.some((project) => project.id === projectId)
    ? { ...document, activeProjectId: projectId }
    : document;
}

export function archiveProject(
  document: WorkspaceDocument,
  projectId: string,
  now = Date.now(),
): WorkspaceDocument {
  if (!document.projects.some((project) => project.id === projectId))
    return document;
  const projects = document.projects.map((project) =>
    project.id === projectId
      ? { ...project, archived: true, updatedAt: now }
      : project,
  );
  let activeProjectId = document.activeProjectId;
  if (activeProjectId === projectId) {
    // 归档当前项目时明确落到下一个未归档项目；
    // 全部归档的兜底情况下保留原选中项，避免出现选不中任何项目的状态
    const landing = projects.find((project) => !project.archived);
    activeProjectId = landing ? landing.id : projectId;
  }
  return { ...document, projects, activeProjectId };
}

export function restoreProject(
  document: WorkspaceDocument,
  projectId: string,
  now = Date.now(),
): WorkspaceDocument {
  if (!document.projects.some((project) => project.id === projectId))
    return document;
  return {
    ...document,
    activeProjectId: projectId,
    projects: document.projects.map((project) =>
      project.id === projectId
        ? { ...project, archived: false, updatedAt: now }
        : project,
    ),
  };
}

export function renameProject(
  project: LatencyProject,
  title: string,
  now = Date.now(),
): LatencyProject {
  return { ...project, title: title.trim() || "未命名链路", updatedAt: now };
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
    // 副本视为新的进行中项目：即使复制的是归档项目，副本也不带归档状态
    archived: false,
    createdAt: now,
    updatedAt: now,
    scenarios: [],
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
): WorkspaceDocument {
  const projects = document.projects.filter(
    (project) => project.id !== projectId,
  );
  return {
    ...document,
    projects,
    activeProjectId:
      document.activeProjectId === projectId
        ? // 优先落到未归档项目，全部归档时退化为列表首项
          (projects.find((project) => !project.archived)?.id ??
          projects[0]?.id ??
          "")
        : document.activeProjectId,
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
