import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export { arrayMove };

// Mouse/caneta: arrastar a foto inteira. Toque: só pelo ícone ⠿ (.drag-grip), para que
// deslizar o dedo sobre as fotos continue rolando a página no celular.
class MouseSensor extends PointerSensor {
  static activators = [{
    eventName: 'onPointerDown',
    handler: (event, opts) => event.nativeEvent.pointerType !== 'touch' && PointerSensor.activators[0].handler(event, opts),
  }];
}
class GripTouchSensor extends TouchSensor {
  static activators = [{
    eventName: 'onTouchStart',
    handler: (event, opts) => !!event.nativeEvent.target?.closest?.('.drag-grip') && TouchSensor.activators[0].handler(event, opts),
  }];
}

/** Ícone de arrastar para telas de toque (coloque dentro do elemento que recebe handleProps). */
export const DragGrip = () => <span className="drag-grip" aria-hidden="true">⠿</span>;

/** Drag-and-drop grid. renderItem(item, index, handleProps) — spread handleProps on the drag handle. */
export function SortableGrid({ items, onReorder, renderItem, renderOverlay, className = 'sort-grid' }) {
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(GripTouchSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const active = items.find((i) => i.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={({ active, over }) => {
        setActiveId(null);
        if (!over || active.id === over.id) return;
        const from = items.findIndex((i) => i.id === active.id);
        const to = items.findIndex((i) => i.id === over.id);
        onReorder(arrayMove(items, from, to));
      }}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div className={className}>
          {items.map((item, i) => (
            <SortableItem key={item.id} id={item.id}>
              {(handleProps, isDragging) => renderItem(item, i, handleProps, isDragging)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
      <DragOverlay>{active && renderOverlay?.(active)}</DragOverlay>
    </DndContext>
  );
}

function SortableItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      {children({ ...attributes, ...listeners }, isDragging)}
    </div>
  );
}

/** Move an item in a list by a step (-1, +1) or to 'first'. Returns a new array or null. */
export function moveBy(items, id, dir) {
  const i = items.findIndex((x) => x.id === id);
  const j = dir === 'first' ? 0 : i + dir;
  if (j < 0 || j >= items.length || i === j) return null;
  return arrayMove(items, i, j);
}
