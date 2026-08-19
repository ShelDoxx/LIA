import type { CSSProperties, ReactNode } from "react";
import {
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, cn } from "@/components/ui";

export function useKanbanSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );
}

export function KanbanColumn({
  id,
  itemIds,
  title,
  children,
}: {
  id: string;
  itemIds: string[];
  title: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn("min-h-48 space-y-2 rounded-xl p-1", isOver && "bg-gold/10")}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">
        {title} · {itemIds.length}
      </p>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </div>
  );
}

export function KanbanCard({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 20 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card className="cursor-grab p-3 touch-none active:cursor-grabbing">{children}</Card>
    </div>
  );
}

export function columnFromOver(
  overId: string | number,
  itemToColumn: Map<string, string>,
  columnIds: string[],
): string | null {
  const id = String(overId);
  if (columnIds.includes(id)) return id;
  return itemToColumn.get(id) ?? null;
}
