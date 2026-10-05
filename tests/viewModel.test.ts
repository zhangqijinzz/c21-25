import { describe, expect, it } from "vitest";
import {
  archiveProject,
  createProject,
  duplicateProject,
  removeProject,
  restoreProject,
  selectProject,
  visibleProjects,
} from "../src/features/projects/projectViewModel";
import {
  compareScenarios,
  restoreScenario,
  saveScenario,
} from "../src/features/scenarios/scenarioViewModel";
import { simulateProject } from "../src/shared/domain/simulation";
import {
  EXAMPLE_PROJECT,
  type LatencyProject,
  type WorkspaceDocument,
} from "../src/shared/domain/types";

function fixtureProject(id: string, archived = false): LatencyProject {
  return { ...EXAMPLE_PROJECT, id, title: `项目 ${id}`, archived };
}

function fixtureDocument(
  projects: LatencyProject[],
  activeProjectId = projects[0]?.id ?? "",
): WorkspaceDocument {
  return { version: 1, activeProjectId, projects };
}

describe("project and scenario view models", () => {
  it("creates a project and switches the active project", () => {
    const initial = {
      version: 1 as const,
      activeProjectId: EXAMPLE_PROJECT.id,
      projects: [EXAMPLE_PROJECT],
    };
    const created = createProject(initial, 100);
    expect(created.projects).toHaveLength(2);
    expect(created.activeProjectId).not.toBe(EXAMPLE_PROJECT.id);
    expect(selectProject(created, EXAMPLE_PROJECT.id).activeProjectId).toBe(
      EXAMPLE_PROJECT.id,
    );
  });

  it("duplicates a project and remaps its dependency identities", () => {
    const initial = {
      version: 1 as const,
      activeProjectId: EXAMPLE_PROJECT.id,
      projects: [EXAMPLE_PROJECT],
    };
    const duplicated = duplicateProject(initial, EXAMPLE_PROJECT, 10);
    const copy = duplicated.projects[0];
    expect(copy?.nodes[2]?.dependencyIds).toEqual([copy?.nodes[0]?.id]);
    expect(copy?.nodes[4]?.fallbackNodeId).toBe(copy?.nodes[3]?.id);
    expect(copy?.id).not.toBe(EXAMPLE_PROJECT.id);
    expect(copy?.scenarios).toEqual([]);
  });

  it("saves a complete snapshot and restores its parameters", () => {
    const baseline = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.slice(0, 2),
    };
    const result = simulateProject(baseline);
    const saved = saveScenario(baseline, result, "并发方案");
    expect(saved.scenarios).toHaveLength(1);
    const changed = {
      ...saved,
      nodes: saved.nodes.map((node) => ({ ...node, durationMs: 999 })),
    };
    const restored = restoreScenario(changed, saved.scenarios[0]?.id ?? "");
    expect(restored.nodes[0]?.durationMs).toBe(baseline.nodes[0]?.durationMs);
  });

  it("describes node and concurrency differences between snapshots", () => {
    const baseline = {
      ...EXAMPLE_PROJECT,
      nodes: EXAMPLE_PROJECT.nodes.slice(0, 2),
    };
    const baselineSnapshot = saveScenario(
      baseline,
      simulateProject(baseline),
      "不限并发",
    ).scenarios[0];
    const changed = {
      ...baseline,
      concurrencyLimit: 1,
      nodes: baseline.nodes.map((node, index) =>
        index === 0 ? { ...node, durationMs: 900 } : node,
      ),
    };
    const changedSnapshot = saveScenario(
      changed,
      simulateProject(changed),
      "串行优化",
    ).scenarios[0];
    if (!baselineSnapshot || !changedSnapshot)
      throw new Error("Scenario fixtures should be saved");
    const comparison = compareScenarios(baselineSnapshot, changedSnapshot);
    expect(comparison.deltaMs).toBeGreaterThan(0);
    expect(comparison.changes.join(" ")).toContain("并发上限");
    expect(comparison.changes.join(" ")).toContain("耗时");
  });
});

describe("project archiving", () => {
  it("moves the active selection to the next open project when archiving the active one", () => {
    const document = fixtureDocument(
      [fixtureProject("p1"), fixtureProject("p2"), fixtureProject("p3")],
      "p1",
    );
    const next = archiveProject(document, "p1", 100);
    expect(next.projects.find((p) => p.id === "p1")?.archived).toBe(true);
    expect(next.projects.find((p) => p.id === "p1")?.updatedAt).toBe(100);
    expect(next.activeProjectId).toBe("p2");
    // 归档不影响其他项目的选中行为
    expect(selectProject(next, "p3").activeProjectId).toBe("p3");
  });

  it("keeps archived data and scenarios intact", () => {
    const document = fixtureDocument([
      fixtureProject("p1"),
      fixtureProject("p2"),
    ]);
    const next = archiveProject(document, "p1");
    const archived = next.projects.find((p) => p.id === "p1");
    expect(archived?.nodes).toEqual(EXAMPLE_PROJECT.nodes);
    expect(archived?.scenarios).toEqual(EXAMPLE_PROJECT.scenarios);
  });

  it("keeps a resolvable active project and lists everything when all projects are archived", () => {
    let document = fixtureDocument([
      fixtureProject("p1"),
      fixtureProject("p2"),
    ]);
    document = archiveProject(document, "p1");
    document = archiveProject(document, "p2");
    expect(document.projects.every((p) => p.archived)).toBe(true);
    expect(
      document.projects.some((p) => p.id === document.activeProjectId),
    ).toBe(true);
    // 兜底：全部归档时常用入口回退展示全部项目
    expect(visibleProjects(document.projects)).toHaveLength(2);
  });

  it("lists only open projects while some remain unarchived", () => {
    const projects = [
      fixtureProject("p1"),
      fixtureProject("p2", true),
      fixtureProject("p3"),
    ];
    expect(visibleProjects(projects).map((p) => p.id)).toEqual(["p1", "p3"]);
  });

  it("restores an archived project and makes it the active one", () => {
    const document = fixtureDocument(
      [fixtureProject("p1", true), fixtureProject("p2")],
      "p2",
    );
    const next = restoreProject(document, "p1", 200);
    expect(next.projects.find((p) => p.id === "p1")?.archived).toBe(false);
    expect(next.projects.find((p) => p.id === "p1")?.updatedAt).toBe(200);
    expect(next.activeProjectId).toBe("p1");
  });

  it("duplicates an archived project into an unarchived active copy", () => {
    const document = fixtureDocument(
      [fixtureProject("p1", true), fixtureProject("p2")],
      "p2",
    );
    const source = document.projects[0];
    if (!source) throw new Error("fixture missing");
    const next = duplicateProject(document, source, 10);
    const copy = next.projects[0];
    expect(copy?.archived).toBe(false);
    expect(next.activeProjectId).toBe(copy?.id);
    expect(next.projects.find((p) => p.id === "p1")?.archived).toBe(true);
  });

  it("prefers an unarchived successor when the active project is removed", () => {
    const document = fixtureDocument(
      [fixtureProject("p1"), fixtureProject("p2", true), fixtureProject("p3")],
      "p1",
    );
    const next = removeProject(document, "p1");
    expect(next.activeProjectId).toBe("p3");
  });

  it("ignores archive and restore requests for unknown projects", () => {
    const document = fixtureDocument([fixtureProject("p1")]);
    expect(archiveProject(document, "missing")).toBe(document);
    expect(restoreProject(document, "missing")).toBe(document);
  });
});
