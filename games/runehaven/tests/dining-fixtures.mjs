import { createDiningTable, updateDiningTable } from '../dining.mjs';

// Explicit artificial layout for isolated tests; normal progression purchases tables.
export function expandDining(state, count = 4) {
  state.dining.tableCount = count;
  state.dining.tables = state.dining.tables.map((table, id) => ({ ...createDiningTable(id < count), cash: table.cash ?? 0 }));
}
export function setSeatState(state, tableId, seatId, status, fields = {}) {
  Object.assign(state.dining.tables[tableId].seats[seatId], { status }, fields);
  updateDiningTable(state.dining.tables[tableId]);
}
