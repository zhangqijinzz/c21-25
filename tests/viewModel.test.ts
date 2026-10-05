import { describe, expect, it } from "vitest";
import {
  archiveProject,
  createProject,
  duplicateProject,
  isProjectLive,
  removeProject,
  selectProject,
  unarchiveProject,
} from "../src/features/projects/projectViewModel";
import {
  compareScenarios,
  restoreScenario,
  saveScenario,
} from "../src/features/scenarios/scenarioViewModel";
import { simulateProject } from "../src/shared/domain/simulation";
import { EXAMPLE_PROJECT } from "../src/shared/domain/types";

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
  const workspace = () => ({
    version: 1 as const,
    activeProjectId: EXAMPLE_PROJECT.id,
    projects: [structuredClone(EXAMPLE_PROJECT)],
  });

  it("archives a project while keeping its nodes and scenarios", () => {
    const withScenario = saveScenario(
      structuredClone(EXAMPLE_PROJECT),
      simulateProject(EXAMPLE_PROJECT),
      "基线",
    );
    const document = { ...workspace(), projects: [withScenario] };
    const archived = archiveProject(document, withScenario.id, 123);
    const target = archived.projects.find(
      (project) => project.id === withScenario.id,
    );
    expect(target?.archivedAt).toBe(123);
    expect(target?.nodes).toEqual(withScenario.nodes);
    expect(target?.scenarios).toHaveLength(1);
    expect(isProjectLive(target!)).toBe(false);
  });

  it("moves the active selection to the next live project when archiving the current one", () => {
    const two = createProject(workspace(), 1);
    const secondId = two.projects[0]!.id;
    const document = selectProject(two, EXAMPLE_PROJECT.id);
    const archived = archiveProject(document, EXAMPLE_PROJECT.id, 2);
    expect(archived.activeProjectId).toBe(secondId);
    expect(
      isProjectLive(
        archived.projects.find(
          (project) => project.id === archived.activeProjectId,
        )!,
      ),
    ).toBe(true);
  });

  it("falls back to a fresh project when every project is archived", () => {
    const document = workspace();
    const archived = archiveProject(document, EXAMPLE_PROJECT.id, 5);
    expect(archived.projects).toHaveLength(2);
    const fallback = archived.projects.find(
      (project) => project.id === archived.activeProjectId,
    );
    expect(fallback).toBeDefined();
    expect(isProjectLive(fallback!)).toBe(true);
    expect(fallback!.id).not.toBe(EXAMPLE_PROJECT.id);
  });

  it("never selects an archived project", () => {
    const archived = archiveProject(workspace(), EXAMPLE_PROJECT.id, 1);
    const reselected = selectProject(archived, EXAMPLE_PROJECT.id);
    expect(reselected.activeProjectId).toBe(archived.activeProjectId);
    expect(reselected.activeProjectId).not.toBe(EXAMPLE_PROJECT.id);
  });

  it("restores an archived project and makes it active", () => {
    const archived = archiveProject(workspace(), EXAMPLE_PROJECT.id, 1);
    const restored = unarchiveProject(archived, EXAMPLE_PROJECT.id, 2);
    const target = restored.projects.find(
      (project) => project.id === EXAMPLE_PROJECT.id,
    );
    expect(isProjectLive(target!)).toBe(true);
    expect(restored.activeProjectId).toBe(EXAMPLE_PROJECT.id);
  });

  it("duplicates an archived project into a live copy", () => {
    const archived = archiveProject(workspace(), EXAMPLE_PROJECT.id, 1);
    const source = archived.projects.find(
      (project) => project.id === EXAMPLE_PROJECT.id,
    )!;
    const duplicated = duplicateProject(archived, source, 7);
    const copy = duplicated.projects[0]!;
    expect(copy.id).not.toBe(source.id);
    expect(isProjectLive(copy)).toBe(true);
    expect(duplicated.activeProjectId).toBe(copy.id);
  });

  it("deleting the active project skips archived ones when choosing the next", () => {
    const two = createProject(workspace(), 1);
    const liveId = two.projects[0]!.id;
    const archived = archiveProject(two, EXAMPLE_PROJECT.id, 2);
    expect(archived.activeProjectId).toBe(liveId);
    const removed = removeProject(archived, liveId, 3);
    const next = removed.projects.find(
      (project) => project.id === removed.activeProjectId,
    );
    expect(next).toBeDefined();
    expect(isProjectLive(next!)).toBe(true);
    expect(next!.id).not.toBe(EXAMPLE_PROJECT.id);
  });

  it("deleting the last live project leaves a live fallback instead of an archived one", () => {
    const archived = archiveProject(workspace(), EXAMPLE_PROJECT.id, 1);
    const liveFallbackId = archived.activeProjectId;
    const removed = removeProject(archived, liveFallbackId, 2);
    const next = removed.projects.find(
      (project) => project.id === removed.activeProjectId,
    );
    expect(next).toBeDefined();
    expect(isProjectLive(next!)).toBe(true);
  });
});
