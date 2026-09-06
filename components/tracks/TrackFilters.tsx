'use client';

import type { Difficulty } from '@/lib/supabase/types';

export type SortOption = 'play_count' | 'created_at' | 'track_length_m' | 'turn_count';
export type SortOrder = 'asc' | 'desc';

interface TrackFiltersProps {
  difficulty: Difficulty | null;
  sort: SortOption;
  order: SortOrder;
  search: string;
  onDifficultyChange: (difficulty: Difficulty | null) => void;
  onSortChange: (sort: SortOption) => void;
  onOrderChange: (order: SortOrder) => void;
  onSearchChange: (search: string) => void;
}

const DIFFICULTIES: (Difficulty | null)[] = [null, 'easy', 'medium', 'hard', 'expert'];
const SORTS: { value: SortOption; label: string }[] = [
  { value: 'play_count', label: 'Most played' },
  { value: 'created_at', label: 'Newest' },
  { value: 'track_length_m', label: 'Length' },
  { value: 'turn_count', label: 'Turns' },
];

export default function TrackFilters({ difficulty, sort, order, search, onDifficultyChange, onSortChange, onOrderChange, onSearchChange }: TrackFiltersProps) {
  return (
    <div className="glass mb-6 flex flex-wrap items-center gap-3 p-3">
      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search tracks"
        aria-label="Search tracks"
        className="input min-w-[180px] flex-1"
      />
      <div className="flex gap-1 rounded-lg bg-ink/60 p-1" role="group" aria-label="Difficulty">
        {DIFFICULTIES.map((d) => (
          <button key={d ?? 'all'} type="button" onClick={() => onDifficultyChange(d)} aria-pressed={difficulty === d}
            className={`rounded-md px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wider ${difficulty === d ? 'bg-coral text-ink' : 'text-muted hover:text-cream'}`}>
            {d ?? 'All'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <select value={sort} onChange={(e) => onSortChange(e.target.value as SortOption)} aria-label="Sort by" className="input w-auto py-2">
          {SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="button" onClick={() => onOrderChange(order === 'asc' ? 'desc' : 'asc')} aria-label={order === 'asc' ? 'Ascending' : 'Descending'} className="input w-10 py-2 text-center">
          {order === 'asc' ? '↑' : '↓'}
        </button>
      </div>
    </div>
  );
}
