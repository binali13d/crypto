import React, { useState, useEffect, useRef } from 'react';
import type { Coin } from '../types';
import Card from './Card';
// @ts-ignore
import { LineChart, Line, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Spinner from './Spinner';
import { SettingsIcon } from './icons';
import { useLocalization } from '../App';

interface DashboardProps {
  coins: Coin[];
  isLoading: boolean;
  error: string | null;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    const { t } = useLocalization();
    if (active && payload && payload.length) {
      return (
        <div className="p-2 bg-gray-700/80 dark:bg-gray-800/80 text-white rounded-md text-sm backdrop-blur-sm">
          <p>{t('dashboard.tooltipPrice', { price: payload[0].value.toFixed(2) })}</p>
        </div>
      );
    }
    return null;
  };

const Dashboard: React.FC<DashboardProps> = ({ coins, isLoading, error }) => {
    const { t } = useLocalization();
    const [gainersCount, setGainersCount] = useState<number>(() => parseInt(localStorage.getItem('gainersCount') || '5', 10));
    const [losersCount, setLosersCount] = useState<number>(() => parseInt(localStorage.getItem('losersCount') || '5', 10));
    const [minGainPercentage, setMinGainPercentage] = useState<number>(() => parseFloat(localStorage.getItem('minGainPercentage') || '0'));
    const [minLossPercentage, setMinLossPercentage] = useState<number>(() => parseFloat(localStorage.getItem('minLossPercentage') || '0'));

    const [isGainersSettingsOpen, setIsGainersSettingsOpen] = useState(false);
    const [isLosersSettingsOpen, setIsLosersSettingsOpen] = useState(false);
    
    const gainersSettingsRef = useRef<HTMLDivElement>(null);
    const losersSettingsRef = useRef<HTMLDivElement>(null);
    
    const [priceFlashes, setPriceFlashes] = useState<Record<string, 'up' | 'down'>>({});
    const prevCoinsRef = useRef<Coin[]>([]);
    
    useEffect(() => { localStorage.setItem('gainersCount', gainersCount.toString()); }, [gainersCount]);
    useEffect(() => { localStorage.setItem('losersCount', losersCount.toString()); }, [losersCount]);
    useEffect(() => { localStorage.setItem('minGainPercentage', minGainPercentage.toString()); }, [minGainPercentage]);
    useEffect(() => { localStorage.setItem('minLossPercentage', minLossPercentage.toString()); }, [minLossPercentage]);

    useEffect(() => {
        if (prevCoinsRef.current.length > 0) {
            const newFlashes: Record<string, 'up' | 'down'> = {};
            const prevCoinsMap = new Map(prevCoinsRef.current.map(c => [c.id, c.current_price]));

            coins.forEach(coin => {
                const prevPrice = prevCoinsMap.get(coin.id);
                if (prevPrice !== undefined && coin.current_price !== prevPrice) {
                    newFlashes[coin.id] = coin.current_price > prevPrice ? 'up' : 'down';
                }
            });

            if (Object.keys(newFlashes).length > 0) {
                setPriceFlashes(newFlashes);
                const timer = setTimeout(() => {
                    setPriceFlashes({});
                }, 1500); // Must match animation duration
                return () => clearTimeout(timer);
            }
        }
        prevCoinsRef.current = coins;
    }, [coins]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (gainersSettingsRef.current && !gainersSettingsRef.current.contains(event.target as Node)) {
                setIsGainersSettingsOpen(false);
            }
            if (losersSettingsRef.current && !losersSettingsRef.current.contains(event.target as Node)) {
                setIsLosersSettingsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

  if (isLoading) {
    return (
        <div className="h-full flex justify-center items-center">
            <Spinner />
        </div>
    );
  }

  if (error) {
    return (
        <div className="h-full flex justify-center items-center p-6 text-center">
            <div>
                <h2 className="text-xl text-red-500 dark:text-red-400 font-semibold">{t('common.error')}</h2>
                <p className="text-gray-500 dark:text-gray-400 mt-2">{error}</p>
            </div>
        </div>
    );
  }

  const topGainers = [...coins]
    .filter(c => c.price_change_percentage_24h !== null && c.price_change_percentage_24h >= minGainPercentage)
    .sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0))
    .slice(0, gainersCount);

  const topLosers = [...coins]
    .filter(c => c.price_change_percentage_24h !== null && c.price_change_percentage_24h <= -minLossPercentage)
    .sort((a, b) => (a.price_change_percentage_24h || 0) - (b.price_change_percentage_24h || 0))
    .slice(0, losersCount);

  const SettingsPanel = ({ title, count, setCount, percentage, setPercentage, setOpen, settingsRef }: any) => (
    <div ref={settingsRef} className="absolute top-12 end-0 z-20">
        <Card className="w-64 p-4 shadow-2xl">
            <h3 className="font-semibold text-gray-800 dark:text-white mb-3">{t('dashboard.customize', { title })}</h3>
            <div className="space-y-3 text-sm">
                <div>
                    <label className="block text-gray-600 dark:text-gray-300 mb-1">{t('dashboard.numToShow')}</label>
                    <select
                        value={count}
                        onChange={e => setCount(parseInt(e.target.value, 10))}
                        className="w-full bg-gray-100 dark:bg-[#1e2230] border border-gray-300 dark:border-white/20 rounded-md p-1.5 text-gray-900 dark:text-white"
                    >
                        <option value="3">{t('dashboard.top3')}</option>
                        <option value="5">{t('dashboard.top5')}</option>
                        <option value="10">{t('dashboard.top10')}</option>
                    </select>
                </div>
                 <div>
                    <label className="block text-gray-600 dark:text-gray-300 mb-1">{t('dashboard.minPercentChange')}</label>
                    <div className="relative">
                        <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={percentage}
                            onChange={e => setPercentage(parseFloat(e.target.value) || 0)}
                            className="w-full bg-gray-100 dark:bg-[#1e2230] border border-gray-300 dark:border-white/20 rounded-md p-1.5 text-gray-900 dark:text-white"
                        />
                        <span className="absolute end-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">%</span>
                    </div>
                </div>
            </div>
            <button onClick={() => setOpen(false)} className="w-full text-center mt-4 text-xs text-blue-500 dark:text-blue-400 hover:underline">{t('common.close')}</button>
        </Card>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 h-full overflow-y-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('dashboard.title')}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-4 relative">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">{t('dashboard.topGainers')}</h2>
              <button onClick={() => setIsGainersSettingsOpen(o => !o)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label={t('dashboard.customize', { title: t('dashboard.gainers') })}>
                  <SettingsIcon />
              </button>
            </div>
            {isGainersSettingsOpen && <SettingsPanel title={t('dashboard.gainers')} count={gainersCount} setCount={setGainersCount} percentage={minGainPercentage} setPercentage={setMinGainPercentage} setOpen={setIsGainersSettingsOpen} settingsRef={gainersSettingsRef} />}
            {topGainers.length > 0 ? (
                <ul className="space-y-3">
                    {topGainers.map(coin => (
                    <li key={coin.id} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 rtl:space-x-reverse overflow-hidden">
                        <img src={coin.image} alt={coin.name} className="h-8 w-8 flex-shrink-0" />
                        <div>
                            <p className="font-semibold text-gray-900 dark:text-white">{coin.symbol.toUpperCase()}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{coin.name}</p>
                        </div>
                        </div>
                        <div className="text-right rtl:text-left flex-shrink-0 ps-2">
                        <p className="font-mono text-sm text-gray-900 dark:text-white">${coin.current_price.toLocaleString()}</p>
                        <p className="font-semibold text-sm text-green-500 dark:text-green-400">
                            ▲ {coin.price_change_percentage_24h?.toFixed(2)}%
                        </p>
                        </div>
                    </li>
                    ))}
                </ul>
            ) : (
                <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                    <p>{t('dashboard.noMatchCriteria', { type: t('dashboard.gainers').toLowerCase() })}</p>
                </div>
            )}
        </Card>

        <Card className="p-4 relative">
           <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">{t('dashboard.topLosers')}</h2>
              <button onClick={() => setIsLosersSettingsOpen(o => !o)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label={t('dashboard.customize', { title: t('dashboard.losers') })}>
                  <SettingsIcon />
              </button>
            </div>
            {isLosersSettingsOpen && <SettingsPanel title={t('dashboard.losers')} count={losersCount} setCount={setLosersCount} percentage={minLossPercentage} setPercentage={setMinLossPercentage} setOpen={setIsLosersSettingsOpen} settingsRef={losersSettingsRef} />}
            {topLosers.length > 0 ? (
              <ul className="space-y-3">
                {topLosers.map(coin => (
                  <li key={coin.id} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 rtl:space-x-reverse overflow-hidden">
                      <img src={coin.image} alt={coin.name} className="h-8 w-8 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{coin.symbol.toUpperCase()}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{coin.name}</p>
                      </div>
                    </div>
                    <div className="text-right rtl:text-left flex-shrink-0 ps-2">
                      <p className="font-mono text-sm text-gray-900 dark:text-white">${coin.current_price.toLocaleString()}</p>
                      <p className="font-semibold text-sm text-red-500 dark:text-red-400">
                        ▼ {coin.price_change_percentage_24h?.toFixed(2)}%
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
                 <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                    <p>{t('dashboard.noMatchCriteria', { type: t('dashboard.losers').toLowerCase() })}</p>
                </div>
            )}
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-left rtl:text-right">
            <thead className="bg-gray-50 dark:bg-white/5 text-xs text-gray-500 dark:text-gray-400 uppercase">
                <tr>
                <th className="py-3 px-6">{t('dashboard.table.rank')}</th>
                <th className="py-3 px-6">{t('dashboard.table.coin')}</th>
                <th className="py-3 px-6">{t('dashboard.table.price')}</th>
                <th className="py-3 px-6">{t('dashboard.table.change24h')}</th>
                <th className="py-3 px-6 text-center">{t('dashboard.table.last7d')}</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-white/10">
                {coins.map((coin, index) => {
                const priceChange = coin.price_change_percentage_24h;
                const isPositive = priceChange !== null && priceChange >= 0;
                const chartData = coin.sparkline_in_7d.price.map(p => ({price: p}));

                return (
                    <tr key={coin.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors duration-200">
                    <td className="py-4 px-6 text-gray-500 dark:text-gray-400">{index + 1}</td>
                    <td className="py-4 px-6">
                        <div className="flex items-center space-x-3 rtl:space-x-reverse">
                        <img src={coin.image} alt={coin.name} className="h-8 w-8" />
                        <div>
                            <p className="font-bold text-gray-900 dark:text-white">{coin.name}</p>
                            <p className="text-gray-500 dark:text-gray-400 text-sm uppercase">{coin.symbol}</p>
                        </div>
                        </div>
                    </td>
                    <td className={`py-4 px-6 font-mono text-gray-900 dark:text-white ${priceFlashes[coin.id] === 'up' ? 'price-flash-up' : priceFlashes[coin.id] === 'down' ? 'price-flash-down' : ''}`}>
                        ${coin.current_price.toLocaleString()}
                    </td>
                    <td className={`py-4 px-6 font-semibold ${priceChange === null ? 'text-gray-500 dark:text-gray-400' : isPositive ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                        {priceChange !== null ? (isPositive ? '▲' : '▼') : ''} {priceChange !== null ? priceChange.toFixed(2) + '%' : t('common.na')}
                    </td>
                    <td className="py-4 px-6">
                        <div className="h-12 w-32 mx-auto">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                                    <YAxis domain={['dataMin', 'dataMax']} hide={true} />
                                    <Tooltip content={<CustomTooltip />} cursor={false}/>
                                    <Line 
                                        type="monotone" 
                                        dataKey="price" 
                                        stroke={isPositive ? "#22c55e" : "#ef4444"} 
                                        strokeWidth={2} 
                                        dot={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </td>
                    </tr>
                );
                })}
            </tbody>
            </table>
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;