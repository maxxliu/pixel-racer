'use client';

interface PauseMenuProps {
  onResume: () => void;
  onRestart: () => void;
  onExit: () => void;
}

export default function PauseMenu({ onResume, onRestart, onExit }: PauseMenuProps) {
  return (
    <div className="fixed inset-0 bg-pixel-black/90 flex items-center justify-center z-50">
      {/* Scanlines */}
      <div className="absolute inset-0 scanlines" />

      {/* CRT vignette */}
      <div className="absolute inset-0 crt-vignette" />

      {/* Content */}
      <div className="relative z-10 pixel-panel min-w-[320px]">
        <h2 className="font-pixel text-2xl text-pixel-yellow pixel-text-shadow text-center mb-8 animate-blink">
          PAUSED
        </h2>

        <div className="flex flex-col gap-4">
          <button
            onClick={onResume}
            className="pixel-btn pixel-btn-primary w-full text-center"
          >
            RESUME
          </button>

          <button
            onClick={onRestart}
            className="pixel-btn pixel-btn-secondary w-full text-center"
          >
            RESTART
          </button>

          <button
            onClick={onExit}
            className="pixel-btn w-full text-center"
            style={{ background: 'var(--pixel-purple)' }}
          >
            EXIT
          </button>
        </div>

        <div className="mt-8 text-center font-pixel text-[10px] text-pixel-gray">
          PRESS ESC TO RESUME
        </div>
      </div>
    </div>
  );
}
