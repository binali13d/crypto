import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Coin, BreakoutSignal, AppSettings } from '../types';
import { analyzeBreakouts } from '../utils/technicalAnalysis';
import Card from './Card';
import Spinner from './Spinner';
import { useLocalization } from '../App';

interface OpportunityHunterProps {
  coins: Coin[];
  appSettings: AppSettings;
}

const formatPrice = (price: number): string => {
    if (!price || isNaN(price)) return '0.00';
    if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    return price.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 });
};

const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};


const SignalCard: React.FC<{ signal: BreakoutSignal, isLive: boolean, livePrice: number }> = ({ signal, isLive, livePrice }) => {
    const { t } = useLocalization();
    const [copyStatus, setCopyStatus] = useState(t('radar.copyPlan'));

    const handleCopy = useCallback(() => {
        const signalType = t(`radar.${signal.direction.toLowerCase()}`);
        const targetsText = signal.targets.map((target, index) => `${index + 1}. ${formatPrice(target)}`).join('\n   ');
        const signalTime = formatTime(signal.time);
        const priceAtCapture = formatPrice(signal.entryPrice);

        const textToCopy = [
            t('radar.copyTemplate.title', { direction: signalType }),
            '',
            `${t('radar.copyTemplate.coin')} ${signal.coin.symbol.toUpperCase()}/USDT`,
            `${t('radar.copyTemplate.timeframe')} ${signal.timeframe}`,
            `${t('radar.copyTemplate.captureTime')} ${signalTime}`,
            `${t('radar.copyTemplate.capturePrice')} ${priceAtCapture}`,
            `${t('radar.copyTemplate.strength')} ${signal.strength.toFixed(1)}x`,
            '',
            `${t('radar.copyTemplate.entry')} ${priceAtCapture}`,
            '',
            `${t('radar.copyTemplate.targets')}`,
            `   ${targetsText}`,
            '',
            `${t('radar.copyTemplate.stopLoss')} ${formatPrice(signal.stopLoss)}`
        ].join('\n');
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopyStatus(t('radar.copied'));
            setTimeout(() => setCopyStatus(t('radar.copyPlan')), 2000);
        });
    }, [signal, t]);

    const isLong = signal.direction === 'Long';
    const directionColor = isLong ? 'border-green-500' : 'border-red-500';
    const directionTextColor = isLong ? 'text-green-500' : 'text-red-500';
    const livePriceColor = livePrice > signal.entryPrice ? 'text-green-500' : livePrice < signal.entryPrice ? 'text-red-500' : 'text-gray-700 dark:text-gray-300';


    return (
        <Card className={`p-4 flex flex-col space-y-3 border-l-4 ${directionColor} dark:border-l-4`}>
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                    <img src={signal.coin.image} alt={signal.coin.name} className="h-10 w-10"/>
                    <div>
                        <p className="font-bold text-lg text-gray-900 dark:text-white">{signal.coin.symbol.toUpperCase()}/USDT</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{signal.coin.name}</p>
                    </div>
                </div>
                <div className="text-right rtl:text-left space-y-1">
                    <div className={`px-2 py-0.5 rounded text-xs font-bold ${isLong ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                       {t(`radar.${signal.direction.toLowerCase()}`)}
                    </div>
                    <div className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-gray-300">
                       {signal.timeframe}
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center bg-gray-100 dark:bg-white/5 rounded-lg px-3 py-2">
                    <span className="text-gray-500 dark:text-gray-400 font-semibold">{t('radar.strength')}</span>
                    <span className={`font-bold text-lg ${directionTextColor}`}>{signal.strength.toFixed(1)}x</span>
                </div>

                <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 dark:text-gray-400">{t('radar.signalTime')}</span>
                    <span className="font-mono text-gray-700 dark:text-gray-300">{formatTime(signal.time)}</span>
                </div>

                <div className={`flex justify-between items-center rounded-lg p-2 transition-colors ${isLive ? 'bg-green-500/10' : ''}`}>
                    <span className="text-gray-500 dark:text-gray-400">{t('radar.status')}</span>
                    <span className={`font-semibold ${isLive ? 'text-green-500 animate-pulse' : 'text-gray-700 dark:text-gray-300'}`}>
                        {isLive ? t('radar.statusLive') : t('radar.statusNew')}
                    </span>
                </div>

                <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">{t('radar.entry')}</span>
                    <span className="font-mono font-semibold text-gray-900 dark:text-white">{formatPrice(signal.entryPrice)}</span>
                </div>

                <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">{t('radar.livePrice')}</span>
                    <span className={`font-mono font-semibold transition-colors ${livePriceColor}`}>
                        {formatPrice(livePrice)}
                    </span>
                </div>

                <div className="flex justify-between items-center">
                    <span className="text-red-600 dark:text-red-400">{t('radar.stopLoss')}</span>
                    <span className="font-mono font-semibold text-red-600 dark:text-red-400">{formatPrice(signal.stopLoss)}</span>
                </div>
                
                <div className="border-t border-gray-200 dark:border-white/10 pt-2 space-y-1">
                    <p className="text-gray-500 dark:text-gray-400 font-semibold mb-1">{t('radar.targets')}:</p>
                    {signal.targets.map((target, index) => (
                         <div key={index} className="flex justify-between items-center">
                            <span className="text-xs text-gray-500 dark:text-gray-400">T{index + 1}</span>
                            <span className="font-mono font-semibold text-green-600 dark:text-green-400">{formatPrice(target)}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
             <button
                onClick={handleCopy}
                className="w-full text-center py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition"
            >
                {copyStatus}
            </button>
        </Card>
    );
};


const OpportunityHunter: React.FC<OpportunityHunterProps> = ({ coins, appSettings }) => {
    const { t } = useLocalization();
    const [allSignals, setAllSignals] = useState<BreakoutSignal[]>([]);
    const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(['5m', '15m', '30m', '1h', '2h', '4h']);
    const [isLoading, setIsLoading] = useState(true);
    const [seenSignalKeys, setSeenSignalKeys] = useState<Set<string>>(new Set());
    const audioRef = useRef<HTMLAudioElement | null>(null);
    
    useEffect(() => {
        audioRef.current = new Audio();
    }, []);
    
    useEffect(() => {
        if (!coins || coins.length === 0) {
            setIsLoading(false);
            setAllSignals([]);
            return;
        }

        let isCancelled = false;
        setIsLoading(true);

        const processCoinsAsync = async () => {
            const signals: BreakoutSignal[] = [];
            const chunkSize = 50; // Process 50 coins at a time

            for (let i = 0; i < coins.length; i += chunkSize) {
                if (isCancelled) return;
                
                const chunk = coins.slice(i, i + chunkSize);
                const chunkSignals = chunk.flatMap(coin => analyzeBreakouts(coin));
                signals.push(...chunkSignals);

                // Yield to the main thread to prevent UI freezing
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            
            if (!isCancelled) {
                signals.sort((a, b) => b.time - a.time);
                setAllSignals(signals);
                setIsLoading(false);
            }
        };

        processCoinsAsync();

        return () => {
            isCancelled = true;
        };
    }, [coins]);

    useEffect(() => {
        if (!appSettings.isSoundEnabled || allSignals.length === 0 || !audioRef.current) return;

        const newSignals = allSignals.filter(s => {
            const key = `${s.coin.id}-${s.timeframe}-${s.direction}-${s.time}`;
            return !seenSignalKeys.has(key);
        });

        if (newSignals.length > 0) {
            const strongSignalExists = newSignals.some(s => s.strength > 2.0); // Strictly greater than 2.0
            
            if (strongSignalExists) {
                audioRef.current.src = appSettings.selectedSound.url;
                audioRef.current.play().catch(e => console.error("Audio play failed:", e));
            }

            setSeenSignalKeys(prev => {
                const newKeys = new Set(prev);
                newSignals.forEach(s => {
                    const key = `${s.coin.id}-${s.timeframe}-${s.direction}-${s.time}`;
                    newKeys.add(key);
                });
                return newKeys;
            });
        }
    }, [allSignals, appSettings, seenSignalKeys]);


    const handleTimeframeToggle = (tf: string) => {
        setSelectedTimeframes(prev => 
            prev.includes(tf) ? prev.filter(t => t !== tf) : [...prev, tf]
        );
    };

    const filteredSignals = allSignals.filter(s => selectedTimeframes.includes(s.timeframe));
    const timeframes = ['5m', '15m', '30m', '1h', '2h', '4h'];

    return (
        <div className="p-4 md:p-6 space-y-6 h-full overflow-y-auto">
            <div className="space-y-2">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('radar.title')}</h1>
                <p className="text-gray-500 dark:text-gray-400 max-w-3xl">
                    {t('radar.description')}
                </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
                {timeframes.map(tf => (
                    <button
                        key={tf}
                        onClick={() => handleTimeframeToggle(tf)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                            selectedTimeframes.includes(tf) 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20'
                        }`}
                    >
                        {tf.toUpperCase()}
                    </button>
                ))}
            </div>
      
            <div>
                {isLoading ? (
                    <div className="w-full text-center py-20"><Spinner/></div>
                ) : filteredSignals.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                        {filteredSignals.map(signal => {
                             const liveCoin = coins.find(c => c.id === signal.coin.id);
                             const livePrice = liveCoin ? liveCoin.current_price : signal.entryPrice;
                             const isLive = liveCoin ? Math.abs((liveCoin.current_price - signal.entryPrice) / signal.entryPrice) <= 0.002 : false;
                            return <SignalCard key={`${signal.coin.id}-${signal.timeframe}-${signal.direction}-${signal.time}`} signal={signal} isLive={isLive} livePrice={livePrice} />
                        })}
                    </div>
                ) : (
                    <Card>
                        <div className="text-center py-24 text-gray-500 dark:text-gray-400">
                            <h2 className="text-xl font-semibold">{t('radar.noSignals')}</h2>
                            <p className="mt-2">{t('radar.noSignalsDesc')}</p>
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
};

export default OpportunityHunter;