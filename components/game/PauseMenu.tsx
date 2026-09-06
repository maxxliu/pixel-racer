'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { SettingsModal } from '@/components/ui/SettingsModal';

interface PauseMenuProps {
  onResume: () => void;
  onRestart: () => void;
  onExit: () => void;
  isMobile?: boolean;
  restartLabel?: string;
}

export default function PauseMenu({ onResume, onRestart, onExit, isMobile = false, restartLabel = 'Restart race' }: PauseMenuProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <>
      <Modal open={!settingsOpen} onClose={onResume} title="Paused" dim="light" width="max-w-sm">
        <div className="flex flex-col gap-3">
          <Button variant="primary" size="lg" onClick={onResume} autoFocus>Resume</Button>
          <Button onClick={onRestart}>{restartLabel}</Button>
          <Button onClick={() => setSettingsOpen(true)}>Settings</Button>
          <Button variant="danger" onClick={onExit}>Quit to menu</Button>
        </div>
        {!isMobile && (
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted">
            <div><Kbd>W</Kbd> <Kbd>S</Kbd> throttle / brake</div>
            <div><Kbd>A</Kbd> <Kbd>D</Kbd> steer</div>
            <div><Kbd>Space</Kbd> drift</div>
            <div><Kbd>Shift</Kbd> hard brake</div>
            <div><Kbd>C</Kbd> camera</div>
            <div><Kbd>R</Kbd> respawn</div>
            <div><Kbd>M</Kbd> mute</div>
            <div><Kbd>Esc</Kbd> resume</div>
          </div>
        )}
      </Modal>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} inGame />
    </>
  );
}
