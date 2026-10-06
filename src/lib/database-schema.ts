import { Prisma } from "@prisma/client";

type Column = { table_name: string; column_name: string };

// Connectivity alone does not show whether a deployment's migrations were run.
// Derive the required columns from the deployed Prisma client so this check stays
// in sync with the application without reading any business or member records.
export const requiredDatabaseColumns = Prisma.dmmf.datamodel.models.flatMap(
  (model) =>
    model.fields
      .filter((field) => field.kind !== "object")
      .map((field) => ({
        table_name: model.dbName ?? model.name,
        column_name: field.dbName ?? field.name,
      })),
);

export const requiredDatabaseTables = [
  ...new Set(requiredDatabaseColumns.map((column) => column.table_name)),
];

export function missingDatabaseColumns(columns: Column[]) {
  const present = new Set(
    columns.map((column) => `${column.table_name}.${column.column_name}`),
  );
  return requiredDatabaseColumns.filter(
    (column) => !present.has(`${column.table_name}.${column.column_name}`),
  );
}
