import React, { useState, useRef, useEffect } from 'react';
import type { AppView } from '../types';
import { AppView as Views } from '../types';
import { DashboardIcon, PortfolioIcon, AiChatIcon, AlertIcon, HunterIcon, NewsIcon, GlobeIcon, SettingsIcon } from './icons';
import { useLocalization } from '../App';

type Theme = 'light' | 'dark';

interface SidebarProps {
  currentView: AppView;
  setView: (view: AppView) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isVisible: boolean;
}

const NavItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}> = ({ icon, label, isActive, onClick }) => {
  const { language } = useLocalization();
  return (
  <button
    onClick={onClick}
    className={`flex items-center w-full p-3 rounded-lg transition-colors duration-200 ${ language === 'ar' ? 'space-x-reverse space-x-3' : 'space-x-3' } ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'hover:bg-gray-500/20 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300'
    }`}
  >
    {icon}
    <span className="font-semibold">{label}</span>
  </button>
  )
};

const ThemeToggle: React.FC<{ theme: Theme; setTheme: (theme: Theme) => void }> = ({ theme, setTheme }) => {
  const { t } = useLocalization();
  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };
  
  return (
    <div className="flex items-center justify-center">
      <span className={`mx-3 text-sm font-medium ${theme === 'light' ? 'text-blue-600' : 'text-gray-400'}`}>{t('sidebar.light')}</span>
      <button
        onClick={toggleTheme}
        className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${theme === 'dark' ? 'bg-blue-600' : 'bg-gray-300'}`}
      >
        <span
          className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${
            theme === 'dark' ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-1 rtl:-translate-x-1'
          }`}
        />
      </button>
      <span className={`mx-3 text-sm font-medium ${theme === 'dark' ? 'text-blue-400' : 'text-gray-400'}`}>{t('sidebar.dark')}</span>
    </div>
  );
};

const LanguageSwitcher: React.FC = () => {
    const { language, setLanguage, t } = useLocalization();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleLanguageChange = (lang: 'en' | 'ar') => {
        setLanguage(lang);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-center p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-500/20 dark:hover:bg-white/10"
            >
                <GlobeIcon />
            </button>
            {isOpen && (
                <div className="absolute bottom-full mb-2 w-32 left-1/2 -translate-x-1/2 bg-white dark:bg-[#383F58] border border-gray-200 dark:border-white/10 rounded-lg shadow-lg">
                    <button onClick={() => handleLanguageChange('en')} className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/5 ${language === 'en' ? 'font-bold text-blue-500' : 'text-gray-700 dark:text-gray-300'}`}>
                        English
                    </button>
                    <button onClick={() => handleLanguageChange('ar')} className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/5 ${language === 'ar' ? 'font-bold text-blue-500' : 'text-gray-700 dark:text-gray-300'}`}>
                        العربية
                    </button>
                </div>
            )}
        </div>
    );
};


const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, theme, setTheme, isVisible }) => {
  const { t } = useLocalization();

  return (
    <div className={`
        flex-shrink-0 bg-gray-200 dark:bg-[#383F58]/20 backdrop-blur-lg border-r border-gray-300 dark:border-white/10 
        flex flex-col
        transition-all duration-300 ease-in-out
        ${isVisible ? 'w-64 p-4' : 'w-0 p-0'} overflow-hidden
    `}>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white text-center whitespace-nowrap">
            <span className="text-blue-500 dark:text-blue-400">{t('sidebar.title').split(' ')[0]}</span> {t('sidebar.title').split(' ').slice(1).join(' ')}
        </h1>
      </div>
      <nav className="flex-1 space-y-2">
        <NavItem
          icon={<DashboardIcon />}
          label={t('sidebar.dashboard')}
          isActive={currentView === Views.Dashboard}
          onClick={() => setView(Views.Dashboard)}
        />
        <NavItem
          icon={<PortfolioIcon />}
          label={t('sidebar.portfolio')}
          isActive={currentView === Views.Portfolio}
          onClick={() => setView(Views.Portfolio)}
        />
        <NavItem
          icon={<HunterIcon />}
          label={t('sidebar.opportunityHunter')}
          isActive={currentView === Views.OpportunityHunter}
          onClick={() => setView(Views.OpportunityHunter)}
        />
         <NavItem
          icon={<NewsIcon />}
          label={t('sidebar.ummAlAkhbar')}
          isActive={currentView === Views.UmmAlAkhbar}
          onClick={() => setView(Views.UmmAlAkhbar)}
        />
        <NavItem
          icon={<AiChatIcon />}
          label={t('sidebar.aiAssistant')}
          isActive={currentView === Views.AiChat}
          onClick={() => setView(Views.AiChat)}
        />
        <NavItem
          icon={<AlertIcon />}
          label={t('sidebar.alerts')}
          isActive={currentView === Views.Alerts}
          onClick={() => setView(Views.Alerts)}
        />
         <NavItem
          icon={<SettingsIcon />}
          label={t('sidebar.settings')}
          isActive={currentView === Views.Settings}
          onClick={() => setView(Views.Settings)}
        />
      </nav>
      <div className="mt-auto space-y-4">
        <LanguageSwitcher />
        <ThemeToggle theme={theme} setTheme={setTheme} />
        <div className="text-center text-xs text-gray-500 dark:text-gray-500 whitespace-nowrap">
          <p>v1.0.0</p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;