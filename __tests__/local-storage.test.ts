/**
 * @jest-environment jsdom
 */
import { saveTrack, listTracks, getTrack, deleteTrack, recordPlay } from '@/lib/tracks';
import { saveScore, getScores, clearScores } from '@/lib/scores';
import { DEFAULT_WAYPOINTS } from '@/lib/game/TrackSpline';

describe('local track library', () => {
  beforeEach(() => localStorage.clear());

  test('saves, lists, reads, counts plays and deletes tracks', () => {
    const saved = saveTrack({ name: ' My Loop ', author: 'Max', waypoints: DEFAULT_WAYPOINTS, startPosition: { x: 0, z: 0, rotation: 0 } });
    expect('error' in saved).toBe(false);
    if ('error' in saved) return;
    expect(saved.name).toBe('My Loop');
    expect(saved.lengthM).toBeGreaterThan(400);
    expect(saved.thumbnailSvg.startsWith('<svg')).toBe(true);
    expect(listTracks().map((t) => t.id)).toEqual([saved.id]);
    recordPlay(saved.id);
    expect(getTrack(saved.id)?.plays).toBe(1);
    deleteTrack(saved.id);
    expect(listTracks()).toEqual([]);
  });

  test('rejects invalid tracks and blank names', () => {
    expect(saveTrack({ name: '', author: 'a', waypoints: DEFAULT_WAYPOINTS, startPosition: { x: 0, z: 0, rotation: 0 } })).toHaveProperty('error');
    expect(saveTrack({ name: 'x', author: 'a', waypoints: [], startPosition: { x: 0, z: 0, rotation: 0 } })).toHaveProperty('error');
  });

  test('ignores corrupted storage', () => {
    localStorage.setItem('pixel-racer-tracks-v1', '{not json');
    expect(listTracks()).toEqual([]);
  });
});

describe('local scores', () => {
  beforeEach(() => clearScores());

  const base = { playerName: 'A', gameMode: 'time-trial' as const, bestLap: 30000, laps: 3, trackId: 't1', trackName: 'T' };

  test('ranks within the same track, mode and lap count', () => {
    expect(saveScore({ ...base, time: 95000, date: '2026-01-01T00:00:00Z' })).toBe(1);
    expect(saveScore({ ...base, time: 90000, date: '2026-01-02T00:00:00Z' })).toBe(1);
    expect(saveScore({ ...base, time: 99000, date: '2026-01-03T00:00:00Z' })).toBe(3);
    expect(saveScore({ ...base, laps: 1, time: 20000, date: '2026-01-04T00:00:00Z' })).toBe(1);
    expect(saveScore({ ...base, trackId: 't2', time: 1000000, date: '2026-01-05T00:00:00Z' })).toBe(1);
    expect(getScores({ trackId: 't1', mode: 'time-trial', laps: 3 }).map((s) => s.time)).toEqual([90000, 95000, 99000]);
    expect(getScores({ mode: 'race' })).toEqual([]);
    expect(getScores().length).toBe(5);
  });
});
