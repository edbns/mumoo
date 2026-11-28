/**
 * One table for every list in the admin, after the Chronicle kit's data table: search across every column, a filter on one
 * column's values, sort by any column, pages, and CSV of exactly the rows the filters leave (all pages, not only the one shown).
 */
import { useMemo, useState } from 'react';
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type FilterFn, type SortingState,
} from '@tanstack/react-table';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsUpDownIcon, ChevronUpIcon, SearchIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { CsvButton, downloadCsv, formatNumber } from './kit';

export type Column<T> = {
  key: keyof T & string;
  label: string;
  /** What the cell shows; the CSV always has the plain value. */
  cell?: (row: T) => React.ReactNode;
  /** The plain value for the CSV and the search, when it is not the field itself (a duration in seconds, say). */
  text?: (row: T) => string | number | boolean | null;
  align?: 'right';
  /** Hidden on narrow screens. */
  wide?: boolean;
};

const matches: FilterFn<unknown> = (row, _column, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return Object.values(row.original as Record<string, unknown>).some(value => value !== null && value !== undefined && String(value).toLowerCase().includes(needle));
};

export function DataTable<T extends Record<string, unknown>>({ rows, columns, name, facet, initialSort, empty = 'Nothing here yet.' }: {
  rows: T[]; columns: Column<T>[];
  /** The CSV's file name, without the date. */
  name: string;
  /** A filter on one column's values (a status), with how each value reads. */
  facet?: { key: keyof T & string; label: string; values: { value: string; label: string }[] };
  initialSort?: SortingState;
  empty?: string;
}) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string>('');
  const [sorting, setSorting] = useState<SortingState>(initialSort ?? []);
  const shown = useMemo(() => (facet && picked ? rows.filter(row => String(row[facet.key]) === picked) : rows), [rows, facet, picked]);
  const defs = useMemo<ColumnDef<T>[]>(() => columns.map(column => ({
    id: column.key,
    accessorFn: row => (column.text ? column.text(row) : row[column.key]),
    header: column.label,
    cell: info => (column.cell ? column.cell(info.row.original) : (info.getValue() as React.ReactNode) ?? '–'),
    sortUndefined: 'last',
  })), [columns]);
  const table = useReactTable({
    data: shown, columns: defs,
    state: { sorting, globalFilter: search },
    onSortingChange: setSorting, onGlobalFilterChange: setSearch, globalFilterFn: matches as FilterFn<T>,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });
  const filtered = table.getPrePaginationRowModel().rows;
  const exportCsv = () => downloadCsv(`mumoo-${name}-${new Date().toISOString().slice(0, 10)}.csv`, columns.map(column => column.label),
    filtered.map(row => columns.map(column => {
      const value = column.text ? column.text(row.original) : row.original[column.key];
      return value instanceof Date ? value.toISOString() : (value as string | number | boolean | null);
    })));
  const { pageIndex, pageSize } = table.getState().pagination;

  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative flex min-w-56 flex-1 items-center sm:max-w-xs">
        <SearchIcon className="pointer-events-none absolute left-3 size-4 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Search</span>
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search…"
          className="h-9 w-full rounded-full border border-border bg-card pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" />
      </label>
      {facet && <div role="radiogroup" aria-label={facet.label} className="inline-flex flex-wrap rounded-full bg-muted p-1">
        {[{ value: '', label: 'All' }, ...facet.values].map(option => {
          const count = option.value ? rows.filter(row => String(row[facet.key]) === option.value).length : rows.length;
          return <button key={option.value} type="button" role="radio" aria-checked={picked === option.value} onClick={() => setPicked(option.value)}
            className={cn('cursor-pointer rounded-full border-0 px-3 py-1 text-xs font-medium transition-colors', picked === option.value ? 'bg-card text-foreground shadow-sm' : 'bg-transparent text-muted-foreground hover:text-foreground')}>
            {option.label} <span className="font-mono text-muted-foreground tabular-nums">{count}</span>
          </button>;
        })}
      </div>}
      <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">{formatNumber(filtered.length)} of {formatNumber(rows.length)}</span>
      <CsvButton onClick={exportCsv} label="Export CSV" />
    </div>
    <div className="overflow-x-auto rounded-2xl bg-card shadow-[var(--surface-shadow)] ring-1 ring-foreground/5">
      <table className="w-full border-collapse text-sm">
        <thead>{table.getHeaderGroups().map(group => <tr key={group.id} className="border-b border-border">
          {group.headers.map(header => {
            const column = columns.find(item => item.key === header.id)!;
            const sorted = header.column.getIsSorted();
            const Arrow = sorted === 'asc' ? ChevronUpIcon : sorted === 'desc' ? ChevronDownIcon : ChevronsUpDownIcon;
            return <th key={header.id} scope="col" aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
              className={cn('whitespace-nowrap px-4 py-2.5 text-xs font-medium text-muted-foreground', column.align === 'right' ? 'text-right' : 'text-left', column.wide && 'hidden lg:table-cell')}>
              <button type="button" onClick={header.column.getToggleSortingHandler()}
                className={cn('inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:text-foreground', column.align === 'right' && 'flex-row-reverse')}>
                {flexRender(header.column.columnDef.header, header.getContext())}
                <Arrow className={cn('size-3.5', !sorted && 'opacity-40')} aria-hidden="true" />
              </button>
            </th>;
          })}
        </tr>)}</thead>
        <tbody>
          {table.getRowModel().rows.length === 0 && <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-muted-foreground">{rows.length ? 'Nothing matches.' : empty}</td></tr>}
          {table.getRowModel().rows.map(row => <tr key={row.id} className="border-b border-border/70 last:border-b-0 hover:bg-muted/50">
            {row.getVisibleCells().map(cell => {
              const column = columns.find(item => item.key === cell.column.id)!;
              return <td key={cell.id} className={cn('whitespace-nowrap px-4 py-2.5', column.align === 'right' && 'text-right font-mono tabular-nums', column.wide && 'hidden lg:table-cell')}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>;
            })}
          </tr>)}
        </tbody>
      </table>
    </div>
    {table.getPageCount() > 1 && <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
      <span className="font-mono tabular-nums">{pageIndex * pageSize + 1}–{Math.min(filtered.length, (pageIndex + 1) * pageSize)} of {formatNumber(filtered.length)}</span>
      <button type="button" aria-label="Previous page" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}
        className="grid size-8 cursor-pointer place-items-center rounded-full border border-border bg-card disabled:cursor-default disabled:opacity-40"><ChevronLeftIcon className="size-4" aria-hidden="true" /></button>
      <button type="button" aria-label="Next page" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}
        className="grid size-8 cursor-pointer place-items-center rounded-full border border-border bg-card disabled:cursor-default disabled:opacity-40"><ChevronRightIcon className="size-4" aria-hidden="true" /></button>
    </div>}
  </div>;
}

/** A small rounded label for a status, in the colour of what it means. */
export function Badge({ tone = 'muted', children }: { tone?: 'good' | 'bad' | 'busy' | 'muted'; children: React.ReactNode }) {
  const tones = {
    good: 'bg-[var(--success)]/12 text-[var(--success)]',
    bad: 'bg-destructive/10 text-destructive',
    busy: 'bg-amber-500/12 text-amber-700',
    muted: 'bg-muted text-muted-foreground',
  };
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}
