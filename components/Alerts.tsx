import React, { useState } from 'react';
import type { TriggeredAlert, AdvancedAlert, Coin, RsiAlert, MaCrossAlert, ListingAlert } from '../types';
import { AdvancedAlertCondition } from '../types';
import Card from './Card';
import { TrashIcon, PlusIcon } from './icons';
import { useLocalization } from '../App';

interface AlertsProps {
  alertLog: TriggeredAlert[];
  setAlertLog: React.Dispatch<React.SetStateAction<TriggeredAlert[]>>;
  advancedAlerts: AdvancedAlert[];
  setAdvancedAlerts: React.Dispatch<React.SetStateAction<AdvancedAlert[]>>;
  coins: Coin[];
}

const CreateAlertModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  coins: Coin[];
  onAddAlert: (alert: AdvancedAlert) => void;
}> = ({ isOpen, onClose, coins, onAddAlert }) => {
  const { t } = useLocalization();
  const [alertType, setAlertType] = useState<'rsi' | 'ma_cross' | 'listing'>('rsi');
  const [selectedCoinId, setSelectedCoinId] = useState<string>(coins[0]?.id || '');
  
  // RSI state
  const [rsiCondition, setRsiCondition] = useState<AdvancedAlertCondition>(AdvancedAlertCondition.ABOVE);
  const [rsiValue, setRsiValue] = useState('70');
  
  // MA Cross state
  const [shortPeriod, setShortPeriod] = useState('10');
  const [longPeriod, setLongPeriod] = useState('30');
  
  // Listing state
  const [exchange, setExchange] = useState<'Binance' | 'Coinbase' | 'Kraken'>('Binance');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let newAlert: AdvancedAlert | null = null;
    const base = { id: `adv-${Date.now()}`, coinId: selectedCoinId };

    if (alertType === 'rsi') {
      newAlert = { ...base, type: 'rsi', condition: rsiCondition, value: parseFloat(rsiValue), period: 14 } as RsiAlert;
    } else if (alertType === 'ma_cross') {
      newAlert = { ...base, type: 'ma_cross', shortPeriod: parseInt(shortPeriod), longPeriod: parseInt(longPeriod) } as MaCrossAlert;
    } else if (alertType === 'listing') {
      newAlert = { ...base, type: 'listing', exchange } as ListingAlert;
    }

    if (newAlert) {
      onAddAlert(newAlert);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50 p-4">
      <Card className="w-full max-w-lg p-6">
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">{t('alerts.modal.title')}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('alerts.modal.alertType')}</label>
            <select value={alertType} onChange={e => setAlertType(e.target.value as any)} className="w-full bg-gray-100 dark:bg-[#1e2230] border border-gray-300 dark:border-white/20 rounded-lg p-2 text-gray-900 dark:text-white">
              <option value="rsi">{t('alerts.modal.rsi')}</option>
              <option value="ma_cross">{t('alerts.modal.maCross')}</option>
              <option value="listing">{t('alerts.modal.listing')}</option>
            </select>
          </div>
           <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('alerts.modal.coin')}</label>
            <select value={selectedCoinId} onChange={e => setSelectedCoinId(e.target.value)} className="w-full bg-gray-100 dark:bg-[#1e2230] border border-gray-300 dark:border-white/20 rounded-lg p-2 text-gray-900 dark:text-white">
              {coins.map(c => <option key={c.id} value={c.id}>{c.name} ({c.symbol.toUpperCase()})</option>)}
            </select>
          </div>

          {alertType === 'rsi' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-gray-700 dark:text-gray-300">{t('alerts.modal.rsiDesc')}</span>
              <select value={rsiCondition} onChange={e => setRsiCondition(e.target.value as any)} className="bg-gray-100 dark:bg-[#1e2230] border-gray-300 dark:border-white/20 rounded-lg p-2">
                <option value={AdvancedAlertCondition.ABOVE}>{t('alerts.modal.above')}</option>
                <option value={AdvancedAlertCondition.BELOW}>{t('alerts.modal.below')}</option>
              </select>
              <input type="number" value={rsiValue} onChange={e => setRsiValue(e.target.value)} className="w-24 bg-gray-100 dark:bg-[#1e2230] border-gray-300 dark:border-white/20 rounded-lg p-2" placeholder="e.g. 70" />
            </div>
          )}
          {alertType === 'ma_cross' && (
            <div className="flex flex-wrap items-center gap-2">
               <span>{t('alerts.modal.maCrossDesc', { short: '', long: '' }).split('{{short}}')[0]}</span>
               <input type="number" value={shortPeriod} onChange={e => setShortPeriod(e.target.value)} className="w-20 bg-gray-100 dark:bg-[#1e2230] border-gray-300 dark:border-white/20 rounded-lg p-2" />
               <span className="text-gray-700 dark:text-gray-300">/</span>
               <input type="number" value={longPeriod} onChange={e => setLongPeriod(e.target.value)} className="w-20 bg-gray-100 dark:bg-[#1e2230] border-gray-300 dark:border-white/20 rounded-lg p-2" />
               <span>{t('alerts.modal.maCrossDesc', { short: '', long: '' }).split('{{long}}')[1]}</span>
            </div>
          )}
          {alertType === 'listing' && (
             <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('alerts.modal.exchange')}</label>
                <select value={exchange} onChange={e => setExchange(e.target.value as any)} className="w-full bg-gray-100 dark:bg-[#1e2230] border-gray-300 dark:border-white/20 rounded-lg p-2">
                  <option>Binance</option>
                  <option>Coinbase</option>
                  <option>Kraken</option>
                </select>
                <p className="text-xs text-yellow-500 mt-2">{t('alerts.modal.simulatedNote')}</p>
            </div>
          )}

          <div className="mt-6 flex justify-end space-x-3 rtl:space-x-reverse">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700">{t('common.cancel')}</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{t('alerts.createNew')}</button>
          </div>
        </form>
      </Card>
    </div>
  );
};


const Alerts: React.FC<AlertsProps> = ({ alertLog, setAlertLog, advancedAlerts, setAdvancedAlerts, coins }) => {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<'log' | 'active'>('log');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleClearLog = () => setAlertLog([]);
  const handleAddAlert = (alert: AdvancedAlert) => setAdvancedAlerts(prev => [...prev, alert]);
  const handleDeleteAlert = (id: string) => setAdvancedAlerts(prev => prev.filter(a => a.id !== id));
  
  const getCoinName = (coinId: string) => coins.find(c => c.id === coinId)?.name || coinId;

  return (
    <div className="p-4 md:p-6 space-y-6 h-full flex flex-col">
      <div className="flex-shrink-0">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('alerts.title')}</h1>
        <div className="mt-4 border-b border-gray-200 dark:border-white/10">
          <nav className="-mb-px flex space-x-6 rtl:space-x-reverse" aria-label="Tabs">
            <button onClick={() => setActiveTab('log')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'log' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
              {t('alerts.triggeredLog')} <span className="ms-1.5 rounded-full bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs">{alertLog.length}</span>
            </button>
            <button onClick={() => setActiveTab('active')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'active' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
              {t('alerts.activeAlerts')} <span className="ms-1.5 rounded-full bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs">{advancedAlerts.length}</span>
            </button>
          </nav>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'log' && (
          <div>
             {alertLog.length > 0 && (
                <div className="flex justify-end mb-4">
                    <button onClick={handleClearLog} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg flex items-center space-x-2 rtl:space-x-reverse text-sm transition">
                        <TrashIcon className="w-4 h-4" />
                        <span>{t('alerts.clearLog')}</span>
                    </button>
                </div>
            )}
            <Card className="p-0">
                {alertLog.length === 0 ? (
                <div className="text-center py-24 text-gray-500 dark:text-gray-400">
                    <h2 className="text-xl font-semibold">{t('alerts.noTriggered')}</h2>
                    <p className="mt-2">{t('alerts.noTriggeredDesc')}</p>
                </div>
                ) : (
                <ul className="divide-y divide-gray-200 dark:divide-white/10">
                    {alertLog.map(alert => (
                    <li key={alert.id} className="p-4 flex items-center space-x-4 rtl:space-x-reverse hover:bg-gray-50 dark:hover:bg-white/5">
                        <img src={alert.coinImage} alt={alert.coinName} className="h-10 w-10 rounded-full flex-shrink-0" />
                        <div className="flex-grow">
                            <p className="font-bold text-gray-800 dark:text-white">
                                {alert.coinName} ({alert.coinSymbol.toUpperCase()})
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{alert.description}</p>
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                            {new Date(alert.triggeredAt).toLocaleString()}
                        </div>
                    </li>
                    ))}
                </ul>
                )}
            </Card>
          </div>
        )}
        {activeTab === 'active' && (
           <div>
            <div className="flex justify-end mb-4">
                <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg flex items-center space-x-2 rtl:space-x-reverse text-sm transition">
                    <PlusIcon className="w-4 h-4"/>
                    <span>{t('alerts.createNew')}</span>
                </button>
            </div>
            <Card className="p-0">
                 {advancedAlerts.length === 0 ? (
                <div className="text-center py-24 text-gray-500 dark:text-gray-400">
                    <h2 className="text-xl font-semibold">{t('alerts.noActive')}</h2>
                    <p className="mt-2">{t('alerts.noActiveDesc')}</p>
                </div>
                ) : (
                  <ul className="divide-y divide-gray-200 dark:divide-white/10">
                    {advancedAlerts.map(alert => {
                        let description = '';
                        if (alert.type === 'rsi') description = t('alerts.modal.rsiDesc') + ' ' + t(`alerts.modal.${alert.condition}`) + ' ' + alert.value;
                        if (alert.type === 'ma_cross') description = t('alerts.modal.maCrossDesc', {short: alert.shortPeriod.toString(), long: alert.longPeriod.toString()});
                        if (alert.type === 'listing') description = t('alerts.modal.listingDesc', {exchange: alert.exchange});

                        return (
                            <li key={alert.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-white/5">
                               <div>
                                  <p className="font-semibold text-gray-800 dark:text-white">{getCoinName(alert.coinId)}</p>
                                  <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
                               </div>
                               <button onClick={() => handleDeleteAlert(alert.id)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-2 rounded-full transition" aria-label={t('common.delete')}>
                                  <TrashIcon className="w-5 h-5"/>
                               </button>
                            </li>
                        )
                    })}
                  </ul>
                )}
            </Card>
            <CreateAlertModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} coins={coins} onAddAlert={handleAddAlert} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Alerts;