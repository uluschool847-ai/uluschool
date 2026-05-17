"use client";

import { useEffect, useState } from "react";

import {
  getLinkedChildren,
  getParentScopedStudentData,
} from "@/lib/repositories/portal-repository";

type ParentDashboardProps = {
  parentId: string;
};

type LinkedChild = {
  id: string;
  fullName: string;
};

type ScopedChildData = {
  childId: string;
  childName?: string;
};

export function ParentDashboard({ parentId }: ParentDashboardProps) {
  const [children, setChildren] = useState<LinkedChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [childData, setChildData] = useState<ScopedChildData | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadChildren() {
      const linkedChildren = (await getLinkedChildren(parentId)) as LinkedChild[];
      if (!isMounted) return;

      setChildren(linkedChildren);
      if (linkedChildren.length > 0) {
        setSelectedChildId(linkedChildren[0].id);
      }
    }

    void loadChildren();

    return () => {
      isMounted = false;
    };
  }, [parentId]);

  useEffect(() => {
    if (!selectedChildId) return;

    let isMounted = true;

    async function loadScopedData() {
      const scopedData = (await getParentScopedStudentData({
        parentId,
        childId: selectedChildId,
      })) as ScopedChildData;

      if (!isMounted) return;
      setChildData(scopedData);
    }

    void loadScopedData();

    return () => {
      isMounted = false;
    };
  }, [parentId, selectedChildId]);

  return (
    <section>
      {children.length > 1 ? (
        <select
          data-testid="child-selector"
          value={selectedChildId}
          onChange={(event) => setSelectedChildId(event.target.value)}
        >
          {children.map((child) => (
            <option key={child.id} value={child.id}>
              {child.fullName}
            </option>
          ))}
        </select>
      ) : null}

      <div>
        <h2>{childData?.childName ?? "Parent Dashboard"}</h2>
      </div>
    </section>
  );
}
