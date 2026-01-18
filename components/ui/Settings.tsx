'use client';

import { useState, useEffect } from 'react';

interface GameSettings {
  graphics: {
    quality: 'low' | 'medium' | 'high' | 'ultra';
    shadows: boolean;
    antialias: boolean;
    vsync: boolean;
    fov: number;
  };
  audio: {
    masterVolume: number;
    musicVolume: number;
    sfxVolume: number;
    engineVolume: number;
  };
  controls: {
    sensitivity: number;
    invertY: boolean;
    vibration: boolean;
  };
  gameplay: {
    units: 'metric' | 'imperial';
    showMinimap: boolean;
    showSpeedometer: boolean;
    cameraShake: boolean;
  };
}

const defaultSettings: GameSettings = {
  graphics: {
    quality: 'high',
    shadows: true,
    antialias: true,
    vsync: true,
    fov: 60,
  },
  audio: {
    masterVolume: 80,
    musicVolume: 70,
    sfxVolume: 80,
    engineVolume: 90,
  },
  controls: {
    sensitivity: 50,
    invertY: false,
    vibration: true,
  },
  gameplay: {
    units: 'metric',
    showMinimap: true,
    showSpeedometer: true,
    cameraShake: true,
  },
};

interface SettingsProps {
  onClose: () => void;
}

export default function Settings({ onClose }: SettingsProps) {
  const [settings, setSettings] = useState<GameSettings>(defaultSettings);
  const [activeTab, setActiveTab] = useState<'graphics' | 'audio' | 'controls' | 'gameplay'>('graphics');

  useEffect(() => {
    // Load settings from localStorage
    const saved = localStorage.getItem('gameSettings');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load settings');
      }
    }
  }, []);

  const saveSettings = () => {
    localStorage.setItem('gameSettings', JSON.stringify(settings));
    onClose();
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
  };

  const updateSetting = <K extends keyof GameSettings>(
    category: K,
    key: keyof GameSettings[K],
    value: any
  ) => {
    setSettings((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value,
      },
    }));
  };

  const tabs = ['graphics', 'audio', 'controls', 'gameplay'] as const;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#1a1a2e] rounded-2xl shadow-2xl border border-white/10 w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <h2 className="text-2xl font-bold text-white">Settings</h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[400px]">
          {activeTab === 'graphics' && (
            <div className="space-y-6">
              <SettingSelect
                label="Quality Preset"
                value={settings.graphics.quality}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                  { value: 'ultra', label: 'Ultra' },
                ]}
                onChange={(v) => updateSetting('graphics', 'quality', v)}
              />
              <SettingToggle
                label="Shadows"
                value={settings.graphics.shadows}
                onChange={(v) => updateSetting('graphics', 'shadows', v)}
              />
              <SettingToggle
                label="Anti-Aliasing"
                value={settings.graphics.antialias}
                onChange={(v) => updateSetting('graphics', 'antialias', v)}
              />
              <SettingToggle
                label="V-Sync"
                value={settings.graphics.vsync}
                onChange={(v) => updateSetting('graphics', 'vsync', v)}
              />
              <SettingSlider
                label="Field of View"
                value={settings.graphics.fov}
                min={50}
                max={110}
                onChange={(v) => updateSetting('graphics', 'fov', v)}
              />
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-6">
              <SettingSlider
                label="Master Volume"
                value={settings.audio.masterVolume}
                min={0}
                max={100}
                onChange={(v) => updateSetting('audio', 'masterVolume', v)}
              />
              <SettingSlider
                label="Music Volume"
                value={settings.audio.musicVolume}
                min={0}
                max={100}
                onChange={(v) => updateSetting('audio', 'musicVolume', v)}
              />
              <SettingSlider
                label="SFX Volume"
                value={settings.audio.sfxVolume}
                min={0}
                max={100}
                onChange={(v) => updateSetting('audio', 'sfxVolume', v)}
              />
              <SettingSlider
                label="Engine Volume"
                value={settings.audio.engineVolume}
                min={0}
                max={100}
                onChange={(v) => updateSetting('audio', 'engineVolume', v)}
              />
            </div>
          )}

          {activeTab === 'controls' && (
            <div className="space-y-6">
              <SettingSlider
                label="Steering Sensitivity"
                value={settings.controls.sensitivity}
                min={10}
                max={100}
                onChange={(v) => updateSetting('controls', 'sensitivity', v)}
              />
              <SettingToggle
                label="Invert Y Axis"
                value={settings.controls.invertY}
                onChange={(v) => updateSetting('controls', 'invertY', v)}
              />
              <SettingToggle
                label="Controller Vibration"
                value={settings.controls.vibration}
                onChange={(v) => updateSetting('controls', 'vibration', v)}
              />
            </div>
          )}

          {activeTab === 'gameplay' && (
            <div className="space-y-6">
              <SettingSelect
                label="Units"
                value={settings.gameplay.units}
                options={[
                  { value: 'metric', label: 'Metric (km/h)' },
                  { value: 'imperial', label: 'Imperial (mph)' },
                ]}
                onChange={(v) => updateSetting('gameplay', 'units', v)}
              />
              <SettingToggle
                label="Show Minimap"
                value={settings.gameplay.showMinimap}
                onChange={(v) => updateSetting('gameplay', 'showMinimap', v)}
              />
              <SettingToggle
                label="Show Speedometer"
                value={settings.gameplay.showSpeedometer}
                onChange={(v) => updateSetting('gameplay', 'showSpeedometer', v)}
              />
              <SettingToggle
                label="Camera Shake"
                value={settings.gameplay.cameraShake}
                onChange={(v) => updateSetting('gameplay', 'cameraShake', v)}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 flex justify-between">
          <button onClick={resetSettings} className="btn btn-secondary">
            Reset to Default
          </button>
          <div className="flex gap-4">
            <button onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button onClick={saveSettings} className="btn btn-primary">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Setting components
function SettingToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`w-12 h-6 rounded-full transition-colors ${
          value ? 'bg-primary' : 'bg-gray-600'
        }`}
      >
        <div
          className={`w-5 h-5 rounded-full bg-white transition-transform ${
            value ? 'translate-x-6' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

function SettingSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between mb-2">
        <span className="text-white">{label}</span>
        <span className="text-gray-400">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}

function SettingSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-dark">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
