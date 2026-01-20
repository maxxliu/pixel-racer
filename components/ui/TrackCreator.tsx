'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DrawingCanvas from './DrawingCanvas';
import type { Point2D } from '@/lib/track/TrackGeometryUtils';
import type { TrackWaypoint } from '@/lib/game/TrackBuilder';
import { processDrawingToWaypoints } from '@/lib/track/PathProcessor';
import { validateTrack, ValidationResult } from '@/lib/track/TrackValidator';
import { generateTrack, generateOvalTrack } from '@/lib/track/ProceduralTrackGenerator';
import { serializeTrack } from '@/lib/game/TrackSerializer';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';

type CreatorMode = 'draw' | 'generate';
type GenerateDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

export default function TrackCreator() {
  const router = useRouter();
  const [clearTrigger, setClearTrigger] = useState(0);

  const [mode, setMode] = useState<CreatorMode>('draw');
  const [rawPoints, setRawPoints] = useState<Point2D[]>([]);
  const [waypoints, setWaypoints] = useState<TrackWaypoint[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Generate mode options
  const [generateDifficulty, setGenerateDifficulty] = useState<GenerateDifficulty>('medium');

  // Save dialog
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [trackName, setTrackName] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Handle points change from drawing
  const handlePointsChange = useCallback((points: Point2D[]) => {
    setRawPoints(points);
    setWaypoints([]);
    setValidation(null);
  }, []);

  // Process drawn points into waypoints
  const handleProcessTrack = useCallback(async () => {
    if (rawPoints.length < 10) {
      setValidation({
        isValid: false,
        errors: [{ type: 'too_few_points', message: 'Draw more of a track path' }],
        warnings: [],
        stats: { length: 0, pointCount: rawPoints.length, turnCount: 0, avgWidth: 14, minWidth: 14, difficulty: 'easy', bounds: { width: 0, height: 0 }, isClosed: false }
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Process in a setTimeout to allow UI to update
      await new Promise(resolve => setTimeout(resolve, 50));

      const processed = processDrawingToWaypoints(rawPoints);
      const validationResult = validateTrack(
        processed.map(wp => ({ x: wp.x, z: wp.z })),
        processed.map(wp => wp.width)
      );

      setWaypoints(processed);
      setValidation(validationResult);
    } catch (error) {
      console.error('Error processing track:', error);
      setValidation({
        isValid: false,
        errors: [{ type: 'invalid_geometry', message: 'Failed to process track' }],
        warnings: [],
        stats: { length: 0, pointCount: rawPoints.length, turnCount: 0, avgWidth: 14, minWidth: 14, difficulty: 'easy', bounds: { width: 0, height: 0 }, isClosed: false }
      });
    } finally {
      setIsProcessing(false);
    }
  }, [rawPoints]);

  // Generate procedural track
  const handleGenerateTrack = useCallback(async () => {
    setIsProcessing(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 50));

      const generated = generateTrack({
        difficulty: generateDifficulty,
        worldSize: 200,
        maxAttempts: 15
      });

      if (generated && generated.length > 0) {
        setWaypoints(generated);
        setRawPoints(generated.map(wp => ({ x: wp.x, z: wp.z })));

        const validationResult = validateTrack(
          generated.map(wp => ({ x: wp.x, z: wp.z })),
          generated.map(wp => wp.width)
        );
        setValidation(validationResult);
      } else {
        // Fallback to oval track
        const oval = generateOvalTrack(200);
        setWaypoints(oval);
        setRawPoints(oval.map(wp => ({ x: wp.x, z: wp.z })));

        const validationResult = validateTrack(
          oval.map(wp => ({ x: wp.x, z: wp.z })),
          oval.map(wp => wp.width)
        );
        setValidation(validationResult);
      }
    } catch (error) {
      console.error('Error generating track:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [generateDifficulty]);

  // Clear everything
  const handleClear = useCallback(() => {
    setClearTrigger(prev => prev + 1);
    setRawPoints([]);
    setWaypoints([]);
    setValidation(null);
  }, []);

  // Play the track
  const handlePlayTrack = useCallback(() => {
    if (!validation?.isValid || waypoints.length === 0) return;

    // Store track data in sessionStorage for the play page
    const trackData = {
      waypoints,
      startPosition: {
        x: waypoints[0].x,
        z: waypoints[0].z,
        rotation: Math.atan2(
          waypoints[1].x - waypoints[0].x,
          waypoints[1].z - waypoints[0].z
        )
      }
    };

    sessionStorage.setItem('customTrack', JSON.stringify(trackData));
    router.push('/play?mode=time-trial&custom=true');
  }, [validation, waypoints, router]);

  // Save track to database
  const handleSaveTrack = useCallback(async () => {
    if (!validation?.isValid || waypoints.length === 0) return;
    if (!trackName.trim() || !authorName.trim()) return;

    if (!isSupabaseConfigured() || !supabase) {
      setSaveError('Database not configured. Track can only be played locally.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const startPosition = {
        x: waypoints[0].x,
        z: waypoints[0].z,
        rotation: Math.atan2(
          waypoints[1].x - waypoints[0].x,
          waypoints[1].z - waypoints[0].z
        )
      };

      const trackInsert = serializeTrack(
        trackName.trim(),
        authorName.trim(),
        waypoints,
        startPosition
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('tracks')
        .insert(trackInsert)
        .select()
        .single();

      if (error) throw error;

      // Redirect to the track page
      router.push(`/tracks/${(data as { id: string }).id}`);
    } catch (error: unknown) {
      console.error('Error saving track:', error);
      let errorMessage = 'Unknown error';
      if (error && typeof error === 'object') {
        if ('message' in error) errorMessage = String(error.message);
        if ('details' in error) errorMessage += ` - ${error.details}`;
      }
      setSaveError(`Failed to save track: ${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  }, [validation, waypoints, trackName, authorName, router]);

  return (
    <div className="min-h-screen bg-pixel-black p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-pixel text-white">Create Track</h1>
          <button
            onClick={() => router.push('/')}
            className="pixel-btn text-sm"
          >
            Back
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Canvas Area */}
          <div className="lg:col-span-2">
            {/* Mode Tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setMode('draw')}
                className={`pixel-btn text-sm ${mode === 'draw' ? 'pixel-btn-primary' : ''}`}
              >
                Draw
              </button>
              <button
                onClick={() => setMode('generate')}
                className={`pixel-btn text-sm ${mode === 'generate' ? 'pixel-btn-primary' : ''}`}
              >
                Generate
              </button>
            </div>

            {/* Drawing Canvas */}
            {mode === 'draw' && (
              <DrawingCanvas
                key={clearTrigger}
                width={600}
                height={600}
                onPointsChange={handlePointsChange}
                disabled={isProcessing}
              />
            )}

            {/* Generate Options */}
            {mode === 'generate' && (
              <div className="pixel-panel">
                <h3 className="text-lg font-pixel text-white mb-4">Generation Options</h3>

                <div className="mb-4">
                  <label className="block text-sm font-pixel-body text-pixel-gray mb-2">
                    Difficulty
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {(['easy', 'medium', 'hard', 'expert'] as GenerateDifficulty[]).map(diff => (
                      <button
                        key={diff}
                        onClick={() => setGenerateDifficulty(diff)}
                        className={`pixel-btn text-xs ${generateDifficulty === diff ? 'pixel-btn-primary' : ''}`}
                      >
                        {diff.charAt(0).toUpperCase() + diff.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleGenerateTrack}
                  disabled={isProcessing}
                  className="pixel-btn pixel-btn-primary w-full"
                >
                  {isProcessing ? 'Generating...' : 'Generate Track'}
                </button>

                {/* Preview of generated track */}
                {waypoints.length > 0 && (
                  <div className="mt-4">
                    <svg
                      viewBox="-160 -160 320 320"
                      className="w-full max-w-md mx-auto bg-pixel-dark border-4 border-white"
                    >
                      <path
                        d={`M ${waypoints[0].x} ${waypoints[0].z} ${waypoints.slice(1).map(wp => `L ${wp.x} ${wp.z}`).join(' ')} Z`}
                        fill="none"
                        stroke="#dc2626"
                        strokeWidth="3"
                      />
                      <circle cx={waypoints[0].x} cy={waypoints[0].z} r="5" fill="#00e436" />
                    </svg>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 mt-4 flex-wrap">
              {mode === 'draw' && (
                <>
                  <button
                    onClick={handleClear}
                    className="pixel-btn"
                    disabled={isProcessing || rawPoints.length === 0}
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleProcessTrack}
                    className="pixel-btn pixel-btn-secondary"
                    disabled={isProcessing || rawPoints.length < 10}
                  >
                    {isProcessing ? 'Processing...' : 'Process Track'}
                  </button>
                </>
              )}
              {validation?.isValid && (
                <>
                  <button
                    onClick={handlePlayTrack}
                    className="pixel-btn pixel-btn-primary"
                  >
                    Play Track
                  </button>
                  <button
                    onClick={() => setShowSaveDialog(true)}
                    className="pixel-btn pixel-btn-secondary"
                  >
                    Save Track
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Stats Panel */}
          <div className="lg:col-span-1">
            <div className="pixel-panel">
              <h3 className="text-lg font-pixel text-white mb-4">Track Info</h3>

              {!validation && rawPoints.length === 0 && (
                <p className="text-pixel-gray font-pixel-body">
                  {mode === 'draw' ? 'Draw a track to see stats' : 'Generate a track to see stats'}
                </p>
              )}

              {!validation && rawPoints.length > 0 && (
                <p className="text-pixel-gray font-pixel-body">
                  Click "Process Track" to validate
                </p>
              )}

              {validation && (
                <div className="space-y-4">
                  {/* Validation Status */}
                  <div className={`p-2 rounded ${validation.isValid ? 'bg-green-900/30' : 'bg-red-900/30'}`}>
                    <span className={`font-pixel text-sm ${validation.isValid ? 'text-green-400' : 'text-red-400'}`}>
                      {validation.isValid ? 'VALID' : 'INVALID'}
                    </span>
                  </div>

                  {/* Errors */}
                  {validation.errors.length > 0 && (
                    <div>
                      <h4 className="text-sm font-pixel text-red-400 mb-2">Errors</h4>
                      <ul className="text-sm font-pixel-body text-red-300 space-y-1">
                        {validation.errors.map((err, i) => (
                          <li key={i}>• {err.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Warnings */}
                  {validation.warnings.length > 0 && (
                    <div>
                      <h4 className="text-sm font-pixel text-yellow-400 mb-2">Warnings</h4>
                      <ul className="text-sm font-pixel-body text-yellow-300 space-y-1">
                        {validation.warnings.map((warn, i) => (
                          <li key={i}>• {warn.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Stats */}
                  {validation.isValid && (
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-pixel-gray font-pixel-body">Length</span>
                        <span className="text-white font-pixel-body">
                          {validation.stats.length >= 1000
                            ? `${(validation.stats.length / 1000).toFixed(2)} km`
                            : `${Math.round(validation.stats.length)} m`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-pixel-gray font-pixel-body">Turns</span>
                        <span className="text-white font-pixel-body">{validation.stats.turnCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-pixel-gray font-pixel-body">Difficulty</span>
                        <span className={`font-pixel-body ${
                          validation.stats.difficulty === 'easy' ? 'text-green-400' :
                          validation.stats.difficulty === 'medium' ? 'text-yellow-400' :
                          validation.stats.difficulty === 'hard' ? 'text-orange-400' :
                          'text-red-400'
                        }`}>
                          {validation.stats.difficulty.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-pixel-gray font-pixel-body">Avg Width</span>
                        <span className="text-white font-pixel-body">{Math.round(validation.stats.avgWidth)}m</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tips */}
            <div className="pixel-panel mt-4">
              <h3 className="text-sm font-pixel text-white mb-2">Tips</h3>
              <ul className="text-xs font-pixel-body text-pixel-gray space-y-1">
                <li>• Draw a closed loop</li>
                <li>• Avoid crossing over your path</li>
                <li>• Include some variety in turns</li>
                <li>• Minimum track length: 200m</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="pixel-panel max-w-md w-full">
            <h2 className="text-xl font-pixel text-white mb-4">Save Track</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-pixel-body text-pixel-gray mb-1">
                  Track Name
                </label>
                <input
                  type="text"
                  value={trackName}
                  onChange={(e) => setTrackName(e.target.value)}
                  maxLength={50}
                  className="w-full bg-pixel-black border-2 border-pixel-gray text-white px-3 py-2 font-pixel-body"
                  placeholder="My Awesome Track"
                />
              </div>

              <div>
                <label className="block text-sm font-pixel-body text-pixel-gray mb-1">
                  Author Name
                </label>
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  maxLength={30}
                  className="w-full bg-pixel-black border-2 border-pixel-gray text-white px-3 py-2 font-pixel-body"
                  placeholder="Your Name"
                />
              </div>

              {saveError && (
                <p className="text-red-400 text-sm font-pixel-body">{saveError}</p>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="pixel-btn"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTrack}
                  className="pixel-btn pixel-btn-primary"
                  disabled={isSaving || !trackName.trim() || !authorName.trim()}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
