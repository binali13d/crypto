import React, { useRef } from 'react';
import type { AppSettings, SoundOption } from '../types';
import Card from './Card';
import { useLocalization } from '../App';

interface SettingsProps {
  appSettings: AppSettings;
  setAppSettings: (settings: AppSettings) => void;
  soundOptions: SoundOption[];
}

const Settings: React.FC<SettingsProps> = ({ appSettings, setAppSettings, soundOptions }) => {
  const { t } = useLocalization();
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleToggle = () => {
    setAppSettings({ ...appSettings, isSoundEnabled: !appSettings.isSoundEnabled });
  };

  const handleSoundChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedUrl = e.target.value;
    const selectedSound = soundOptions.find(opt => opt.url === selectedUrl);
    if (selectedSound) {
      setAppSettings({ ...appSettings, selectedSound });

      // Play a preview of the sound
      if (audioRef.current) {
        audioRef.current.src = selectedSound.url;
        audioRef.current.play().catch(err => console.error("Audio preview failed:", err));
      }
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 h-full overflow-y-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('settings.title')}</h1>
      
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">{t('settings.audibleAlerts')}</h2>
        
        <div className="space-y-4">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <label htmlFor="sound-toggle" className="text-gray-700 dark:text-gray-300">
              {t('settings.enableAlerts')}
            </label>
            <button
              id="sound-toggle"
              onClick={handleToggle}
              className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${appSettings.isSoundEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span
                className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${
                  appSettings.isSoundEnabled ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-1 rtl:-translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Sound Selection Dropdown */}
          <div className="flex items-center justify-between">
            <label htmlFor="sound-select" className="text-gray-700 dark:text-gray-300">
              {t('settings.alertSound')}
            </label>
            <select
              id="sound-select"
              value={appSettings.selectedSound.url}
              onChange={handleSoundChange}
              className="w-48 bg-gray-100 dark:bg-[#1e2230] border border-gray-300 dark:border-white/20 rounded-lg p-2 text-gray-900 dark:text-white"
            >
              {soundOptions.map(opt => (
                <option key={opt.url} value={opt.url}>
                  {t(`settings.sounds.${opt.name}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <audio ref={audioRef} style={{ display: 'none' }} />
      </Card>
    </div>
  );
};

export default Settings;