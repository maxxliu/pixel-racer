'use client';

import type { Difficulty } from '@/lib/supabase/types';

export type SortOption = 'play_count' | 'created_at' | 'track_length_m';
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

export default function TrackFilters({
  difficulty,
  sort,
  order,
  search,
  onDifficultyChange,
  onSortChange,
  onOrderChange,
  onSearchChange
}: TrackFiltersProps) {
  const difficulties: (Difficulty | null)[] = [null, 'easy', 'medium', 'hard', 'expert'];
  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'play_count', label: 'Most Played' },
    { value: 'created_at', label: 'Newest' },
    { value: 'track_length_m', label: 'Length' }
  ];

  return (
    <div className="pixel-panel mb-6">
      <div className="flex flex-wrap gap-4 items-center">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tracks..."
            className="w-full bg-pixel-black border-2 border-pixel-gray text-white px-3 py-2 font-pixel-body text-sm"
          />
        </div>

        {/* Difficulty Filter */}
        <div className="flex gap-1 flex-wrap">
          {difficulties.map((diff) => (
            <button
              key={diff || 'all'}
              onClick={() => onDifficultyChange(diff)}
              className={`px-3 py-1 text-xs font-pixel border-2 transition-colors
                ${difficulty === diff
                  ? 'bg-pixel-red border-white text-white'
                  : 'bg-pixel-dark border-pixel-gray text-pixel-gray hover:border-white hover:text-white'
                }`}
            >
              {diff ? diff.charAt(0).toUpperCase() + diff.slice(1) : 'All'}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="bg-pixel-black border-2 border-pixel-gray text-white px-2 py-1 font-pixel-body text-sm"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => onOrderChange(order === 'asc' ? 'desc' : 'asc')}
            className="px-2 py-1 bg-pixel-dark border-2 border-pixel-gray text-white text-sm"
            title={order === 'asc' ? 'Ascending' : 'Descending'}
          >
            {order === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>
    </div>
  );
}
