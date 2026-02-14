/**
 * Bug fix regression tests for Pixel Racer
 * Tests validate that identified bugs have been fixed correctly.
 */

// ============================================================
// TrackSerializer tests
// ============================================================
describe('TrackSerializer', () => {
  // We test the pure functions from TrackSerializer

  describe('calculateStartPosition - findIndex truthy -1 bug', () => {
    // Bug: findIndex returns -1 when no checkpoint found, and -1 is truthy in JS,
    // so `findIndex(...) || 0` would return -1 instead of 0, causing waypoints[-1] crash.
    const { calculateStartPosition } = require('../lib/game/TrackSerializer');

    test('should not crash when no waypoints have isCheckpoint', () => {
      const waypoints = [
        { x: 0, z: 0, width: 12, speedLimit: 100 },
        { x: 10, z: 10, width: 12, speedLimit: 100 },
        { x: 20, z: 0, width: 12, speedLimit: 100 },
      ];
      // This should not throw - previously it would access waypoints[-1]
      const result = calculateStartPosition(waypoints);
      expect(result).toBeDefined();
      expect(result.x).toBe(0);
      expect(result.z).toBe(0);
      expect(typeof result.rotation).toBe('number');
    });

    test('should use first checkpoint when first waypoint is checkpoint (index 0)', () => {
      const waypoints = [
        { x: 5, z: 5, width: 12, speedLimit: 100, isCheckpoint: true },
        { x: 15, z: 15, width: 12, speedLimit: 100 },
        { x: 25, z: 5, width: 12, speedLimit: 100 },
      ];
      const result = calculateStartPosition(waypoints);
      // Should use index 0 (the checkpoint), not fallback
      expect(result.x).toBe(5);
      expect(result.z).toBe(5);
    });

    test('should return default for empty waypoints', () => {
      const result = calculateStartPosition([]);
      expect(result).toEqual({ x: 0, z: 0, rotation: 0 });
    });
  });

  describe('deserializeTrack - nullish coalescing for 0 values', () => {
    // Bug: `track.turn_count || undefined` discards valid 0 values
    const { deserializeTrack } = require('../lib/game/TrackSerializer');

    test('should preserve turn_count of 0', () => {
      const track = {
        name: 'Test',
        author_name: 'Author',
        waypoints: [],
        start_position: { x: 0, z: 0, rotation: 0 },
        thumbnail_svg: null,
        track_length_m: 0,
        difficulty: null,
        turn_count: 0,
      };
      const result = deserializeTrack(track);
      expect(result.turnCount).toBe(0); // Should be 0, not undefined
    });

    test('should preserve track_length_m of 0', () => {
      const track = {
        name: 'Test',
        author_name: 'Author',
        waypoints: [],
        start_position: { x: 0, z: 0, rotation: 0 },
        thumbnail_svg: null,
        track_length_m: 0,
        difficulty: null,
        turn_count: null,
      };
      const result = deserializeTrack(track);
      expect(result.trackLengthM).toBe(0);
    });
  });
});

// ============================================================
// ProceduralTrackGenerator tests
// ============================================================
describe('ProceduralTrackGenerator', () => {
  describe('generateBasePoints - min distance violation', () => {
    // Bug: Points that violate minimum distance constraint were pushed unconditionally
    // after max attempts were exhausted.
    // We can't easily test the internal function, but we can test that generateTrack
    // doesn't hang indefinitely (infinite loop bug).
    const { generateTrack } = require('../lib/track/ProceduralTrackGenerator');

    test('should not hang with expert difficulty (infinite loop bug)', () => {
      // Expert difficulty tries to insert 4 corners. With few points,
      // the old code would infinite-loop trying to find non-adjacent positions.
      // This test should complete within a reasonable time.
      const startTime = Date.now();
      const result = generateTrack({
        difficulty: 'expert',
        minPoints: 6,
        maxPoints: 6,
        maxAttempts: 3,
      });
      const elapsed = Date.now() - startTime;
      // Should complete within 5 seconds (was infinite before fix)
      expect(elapsed).toBeLessThan(5000);
      // Result may be null if validation fails, but should not hang
    });
  });
});

// ============================================================
// InputManager tests
// ============================================================
describe('InputManager - gamepad edge detection', () => {
  // Bug: Gamepad one-shot buttons (pause, camera toggle, reset) fired on every frame
  // while held, instead of only on the rising edge (press).
  // Testing the class directly requires mocking browser APIs.

  test('InputManager class should have prevGamepadButtons property', () => {
    // Mock window APIs
    const origAddEventListener = global.window?.addEventListener;
    const mockAddEventListener = jest.fn();

    // Define minimal globals for InputManager
    if (typeof window === 'undefined') {
      (global as any).window = {
        addEventListener: mockAddEventListener,
        removeEventListener: jest.fn(),
      };
    } else {
      (global as any).window.addEventListener = mockAddEventListener;
    }

    try {
      const { InputManager } = require('../lib/input/InputManager');
      const manager = new InputManager();
      // The fix adds prevGamepadButtons tracking
      expect((manager as any).prevGamepadButtons).toBeDefined();
      expect(Array.isArray((manager as any).prevGamepadButtons)).toBe(true);
      manager.dispose();
    } finally {
      if (origAddEventListener) {
        (global as any).window.addEventListener = origAddEventListener;
      }
    }
  });
});

// ============================================================
// RaceManager tests
// ============================================================
describe('RaceManager', () => {
  describe('checkpoint width/2 fix', () => {
    // Bug: checkCheckpoints used `distance < cp.width` instead of `distance < cp.width / 2`
    // This means checkpoints triggered at twice the expected radius.
    // We verify this by reading the source and checking the fix is in place.

    test('source code should use width / 2 for checkpoint detection', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'lib', 'game', 'RaceManager.ts'),
        'utf8'
      );
      // The fix changes `distance < cp.width` to `distance < cp.width / 2`
      expect(source).toContain('cp.width / 2');
      expect(source).not.toMatch(/distance < cp\.width\)/); // Should not have the old pattern
    });

    test('source code should use performance.now() consistently', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'lib', 'game', 'RaceManager.ts'),
        'utf8'
      );
      expect(source).not.toContain('Date.now()');
      expect(source).toContain('performance.now()');
    });
  });
});

// ============================================================
// GameLoop tests
// ============================================================
describe('GameLoop', () => {
  describe('pause should cancel animation frame', () => {
    // Bug: pause() did not cancel the pending requestAnimationFrame,
    // which could lead to duplicate game loops on resume().

    test('source code should cancel animationFrame in pause()', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'lib', 'game', 'GameLoop.ts'),
        'utf8'
      );
      // The pause method should now cancel the animation frame
      const pauseMethod = source.match(/public pause\(\)[\s\S]*?^\s*\}/m);
      expect(pauseMethod).not.toBeNull();
      expect(pauseMethod![0]).toContain('cancelAnimationFrame');
    });
  });
});

// ============================================================
// VehiclePhysics tests
// ============================================================
describe('VehiclePhysics', () => {
  describe('double addBody fix', () => {
    // Bug: world.addBody(this.body) was called before vehicle.addToWorld(world),
    // but addToWorld internally also adds the chassis body, resulting in double registration.

    test('source code should not call world.addBody before addToWorld', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'lib', 'shared', 'physics', 'VehiclePhysics.ts'),
        'utf8'
      );
      // The fix removes the explicit addBody call
      expect(source).not.toContain('world.addBody(this.body)');
      expect(source).toContain('this.vehicle.addToWorld(world)');
    });
  });

  describe('RPM unit conversion fix', () => {
    // Bug: wheelRPM calculation used speed in km/h but formula expected m/s,
    // inflating RPM by 3.6x.

    test('source code should convert speed from km/h to m/s before RPM calculation', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'lib', 'shared', 'physics', 'VehiclePhysics.ts'),
        'utf8'
      );
      expect(source).toContain('speed / 3.6');
      expect(source).toContain('speedMS');
    });
  });

  describe('hitPointWorld null check fix', () => {
    // Bug: hitPointWorld is always a Vec3 in cannon-es, never null.
    // The truthiness check would always pass even when wheel is not in contact.

    test('source code should use isInContact instead of hitPointWorld truthiness', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'lib', 'shared', 'physics', 'VehiclePhysics.ts'),
        'utf8'
      );
      expect(source).toContain('wheel.isInContact');
      expect(source).not.toContain('wheel.raycastResult.hitPointWorld\n        ?');
    });
  });
});

// ============================================================
// Game.ts tests
// ============================================================
describe('Game', () => {
  describe('wheel rotation frame-rate independence', () => {
    test('source code should use fixedTimeStep for wheel rotation', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'lib', 'game', 'Game.ts'),
        'utf8'
      );
      // Should use getFixedTimeStep() instead of constant 0.1
      expect(source).toContain('getFixedTimeStep()');
      expect(source).not.toContain('this.carSpeed * 0.1');
    });
  });

  describe('RPM should be updated in game state', () => {
    test('source code should compute rpm in updateGameState', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'lib', 'game', 'Game.ts'),
        'utf8'
      );
      // The game state should include a computed rpm value
      expect(source).toMatch(/rpm.*Math\.(min|round)/);
    });
  });

  describe('resetCar should reset finish line crossing state', () => {
    test('source code should reset lastZ and crossedFinishLine in resetCar', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'lib', 'game', 'Game.ts'),
        'utf8'
      );
      // Find the resetCar method and check it resets crossing state
      const resetMethod = source.slice(source.indexOf('private resetCar'));
      expect(resetMethod).toContain('this.lastZ = 5');
      expect(resetMethod).toContain('this.crossedFinishLine = false');
    });
  });

  describe('dispose should clean up GPU resources', () => {
    test('source code should traverse and dispose car mesh in dispose()', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'lib', 'game', 'Game.ts'),
        'utf8'
      );
      const disposeMethod = source.slice(source.indexOf('public dispose'));
      expect(disposeMethod).toContain('carMesh');
      expect(disposeMethod).toContain('geometry.dispose()');
      expect(disposeMethod).toContain('material.dispose()');
    });
  });
});

// ============================================================
// AIRacer tests
// ============================================================
describe('AIRacer', () => {
  describe('dynamic finish line detection', () => {
    // Bug: AI used hardcoded finish line at (x=0, z=-10) instead of actual track start position.

    test('source code should use projection-based finish line detection', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'lib', 'game', 'AIRacer.ts'),
        'utf8'
      );
      // Should NOT contain the hardcoded check
      expect(source).not.toContain('z=-10, x=0');
      expect(source).not.toContain('this.lastZ < -10 && currentZ >= -10');
      // Should contain projection-based detection (same approach as Game.ts)
      expect(source).toContain('this.startPosition');
      expect(source).toContain('forwardDist');
      expect(source).toContain('lateralDist');
    });
  });

  describe('dispose should clean up GPU resources', () => {
    test('source code should traverse and dispose mesh in dispose()', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'lib', 'game', 'AIRacer.ts'),
        'utf8'
      );
      const disposeMethod = source.slice(source.indexOf('public dispose'));
      expect(disposeMethod).toContain('traverse');
      expect(disposeMethod).toContain('geometry.dispose()');
    });
  });
});

// ============================================================
// TrackBuilder tests
// ============================================================
describe('TrackBuilder', () => {
  describe('AI start positions should account for rotation', () => {
    test('source code should rotate offsets by start.rotation', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'lib', 'game', 'TrackBuilder.ts'),
        'utf8'
      );
      const method = source.slice(source.indexOf('getAIStartPositions'));
      expect(method).toContain('Math.cos(start.rotation)');
      expect(method).toContain('Math.sin(start.rotation)');
    });
  });

  describe('start/finish line should account for rotation', () => {
    test('source code should apply start rotation to finish line', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'lib', 'game', 'TrackBuilder.ts'),
        'utf8'
      );
      const method = source.slice(source.indexOf('createStartFinishLine'));
      expect(method).toContain('start.rotation');
    });
  });
});

// ============================================================
// GameCanvas tests
// ============================================================
describe('GameCanvas', () => {
  describe('game should not re-initialize on pause', () => {
    test('source code should use refs for isPaused and raceResults in keyboard handler', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'components', 'game', 'GameCanvas.tsx'),
        'utf8'
      );
      expect(source).toContain('isPausedRef');
      expect(source).toContain('raceResultsRef');
      // The game init effect should NOT include isPaused in deps
      // The keyboard effect should be separate
    });
  });

  describe('handlePlayAgain should reset loading state', () => {
    test('source code should set isLoading true and reset progress', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'components', 'game', 'GameCanvas.tsx'),
        'utf8'
      );
      const playAgain = source.slice(
        source.indexOf('handlePlayAgain'),
        source.indexOf('handlePlayAgain') + 500
      );
      expect(playAgain).toContain('setIsLoading(true)');
      expect(playAgain).toContain('setLoadingProgress(0)');
    });
  });
});

// ============================================================
// Home page hex color test
// ============================================================
describe('Home page', () => {
  test('should not contain invalid hex color #7080900', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'app', 'page.tsx'),
      'utf8'
    );
    expect(source).not.toContain('#7080900');
    expect(source).toContain('#708090');
  });
});

// ============================================================
// VehicleVisual wheel radius test
// ============================================================
describe('VehicleVisual', () => {
  test('wheel radius should match physics config (0.4)', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'lib', 'game', 'VehicleVisual.ts'),
      'utf8'
    );
    expect(source).toContain('wheelRadius = 0.4');
    expect(source).not.toContain('wheelRadius = 0.35');
  });
});

// ============================================================
// API route tests
// ============================================================
describe('API Routes', () => {
  describe('tracks/[id] should filter by is_public', () => {
    test('source code should include is_public filter', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'app', 'api', 'tracks', '[id]', 'route.ts'),
        'utf8'
      );
      expect(source).toContain("eq('is_public', true)");
    });
  });

  describe('leaderboard rank calculation should handle findIndex -1', () => {
    test('source code should check findIndex result before adding 1', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'app', 'api', 'tracks', '[id]', 'leaderboard', 'route.ts'),
        'utf8'
      );
      expect(source).toContain('foundIndex >= 0');
      expect(source).not.toMatch(/\.findIndex\(.*\)\s*\+\s*1/);
    });
  });
});

// ============================================================
// MainMenu tests
// ============================================================
describe('MainMenu', () => {
  test('onSettings should use optional chaining to prevent crash when undefined', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'ui', 'MainMenu.tsx'),
      'utf8'
    );
    expect(source).toContain('onSettings?.()');
    expect(source).not.toMatch(/onClick=\{onSettings\}/);
  });
});

// ============================================================
// HUD minimap car rotation fix
// ============================================================
describe('HUD', () => {
  describe('minimap car indicator rotation should include 180° offset', () => {
    // Bug: The SVG car arrow shape points upward (-Y in SVG = -Z in game world)
    // by default, but when carRotation=0 the car faces +Z direction.
    // Without the +180 offset, the arrow points backwards on the minimap.

    test('source code should add 180 to car rotation in minimap transform', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'components', 'game', 'HUD.tsx'),
        'utf8'
      );
      // Should contain the +180 offset in the rotate transform
      expect(source).toContain('/ Math.PI + 180');
      // Should NOT have the old rotation without offset
      expect(source).not.toContain('(carRotation) * 180 / Math.PI}');
    });
  });
});

// ============================================================
// Nullish coalescing fixes for Supabase/leaderboard integration
// ============================================================
describe('Supabase integration - nullish coalescing fixes', () => {
  describe('tracks POST API should use ?? for numeric fields', () => {
    // Bug: `body.track_length_m || null` and `body.turn_count || null` treat 0 as falsy,
    // causing valid 0 values to be stored as null in the database.

    test('tracks API POST should use ?? instead of || for track_length_m and turn_count', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'app', 'api', 'tracks', 'route.ts'),
        'utf8'
      );
      expect(source).toContain('track_length_m: body.track_length_m ?? null');
      expect(source).toContain('turn_count: body.turn_count ?? null');
      expect(source).toContain('difficulty: body.difficulty ?? null');
      // Should NOT use || for these fields
      expect(source).not.toContain('body.track_length_m || null');
      expect(source).not.toContain('body.turn_count || null');
    });
  });

  describe('play count increment should use ?? for play_count', () => {
    // Bug: `play_count || 0` treats a play_count of 0 as falsy, keeping it at 0
    // instead of incrementing to 1.

    test('play endpoint should use ?? instead of || for play_count', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'app', 'api', 'tracks', '[id]', 'play', 'route.ts'),
        'utf8'
      );
      expect(source).toContain('play_count ?? 0');
      expect(source).not.toContain('play_count || 0');
    });
  });

  describe('global leaderboard should use ?? for track_length_m', () => {
    // Bug: `entry.tracks?.track_length_m || null` treats 0 as falsy.

    test('global leaderboard API should use ?? instead of || for track_length_m', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'app', 'api', 'leaderboard', 'global', 'route.ts'),
        'utf8'
      );
      expect(source).toContain('track_length_m ?? null');
      expect(source).not.toContain('track_length_m || null');
    });
  });

  describe('TrackCard should use ?? for turn_count display', () => {
    // Bug: `track.turn_count || '?'` shows '?' for tracks with 0 turns.

    test('TrackCard should use ?? instead of || for turn_count', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'components', 'tracks', 'TrackCard.tsx'),
        'utf8'
      );
      expect(source).toContain("turn_count ?? '?'");
      expect(source).not.toContain("turn_count || '?'");
    });
  });

  describe('Track detail page should use ?? for turn_count display', () => {
    // Bug: `track.turn_count || '?'` shows '?' for tracks with 0 turns.

    test('track detail page should use ?? instead of || for turn_count', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'app', 'tracks', '[id]', 'page.tsx'),
        'utf8'
      );
      expect(source).toContain("turn_count ?? '?'");
      expect(source).not.toContain("turn_count || '?'");
    });
  });

  describe('RaceComplete normalization should use ?? for field mapping', () => {
    // Bug: `entry.player_name || entry.playerName` fails when player_name is empty string.
    // `entry.time_ms || entry.timeMs` would fail for time_ms of 0.

    test('RaceComplete should use ?? for leaderboard field normalization', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'components', 'game', 'RaceComplete.tsx'),
        'utf8'
      );
      expect(source).toContain('entry.player_name ?? entry.playerName');
      expect(source).toContain('entry.time_ms ?? entry.timeMs');
      expect(source).toContain('entry.created_at ?? entry.createdAt');
      // Should NOT use || for normalization
      expect(source).not.toContain('entry.player_name || entry.playerName');
      expect(source).not.toContain('entry.time_ms || entry.timeMs');
    });
  });
});

// ============================================================
// Game.ts dispose should remove physics body
// ============================================================
describe('Game dispose', () => {
  describe('player car body should be removed from physics world', () => {
    // Bug: Game.dispose() cleaned up AI racer bodies and GPU resources,
    // but never removed the player's carBody from the CANNON.js physics world.

    test('source code should remove carBody from world in dispose()', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require('path').join(__dirname, '..', 'lib', 'game', 'Game.ts'),
        'utf8'
      );
      const disposeMethod = source.slice(source.indexOf('public dispose'));
      expect(disposeMethod).toContain('this.world.removeBody(this.carBody)');
    });
  });
});
