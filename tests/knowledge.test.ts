import { describe, expect, it } from "vitest";
import { buildKnowledgeTree, findKnowledgeTreeItem, flattenKnowledgeTree } from "@openexam/core/knowledge";

describe("knowledge tree helpers", () => {
  it("builds stable roots, child metadata, descendant counts, and paths", () => {
    const tree = buildKnowledgeTree([
      { id: "db", parentId: null, code: "1", title: "数据库" },
      { id: "tx", parentId: "db", code: "1.1", title: "事务" },
      { id: "iso", parentId: "tx", code: "1.1.1", title: "隔离级别" },
      { id: "uml", parentId: null, code: "2", title: "UML" }
    ]);

    expect(tree.map((node) => node.id)).toEqual(["db", "uml"]);
    expect(tree[0]).toMatchObject({
      id: "db",
      depth: 0,
      directChildCount: 1,
      descendantCount: 2
    });
    expect(tree[0]?.children[0]).toMatchObject({
      id: "tx",
      depth: 1,
      directChildCount: 1,
      descendantCount: 1,
      path: [
        { id: "db", code: "1", title: "数据库" },
        { id: "tx", code: "1.1", title: "事务" }
      ]
    });
  });

  it("finds and flattens tree items in preorder", () => {
    const tree = buildKnowledgeTree([
      { id: "root", parentId: null, code: null, title: "根" },
      { id: "child", parentId: "root", code: null, title: "子项" }
    ]);

    expect(findKnowledgeTreeItem(tree, "child")?.title).toBe("子项");
    expect(findKnowledgeTreeItem(tree, "missing")).toBeNull();
    expect(flattenKnowledgeTree(tree).map((item) => item.id)).toEqual(["root", "child"]);
  });
});
