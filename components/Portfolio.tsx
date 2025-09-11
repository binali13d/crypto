import React, { useState, useMemo, useRef, useEffect } from 'react';
// @ts-ignore
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { PortfolioHolding, Coin, PortfolioHistoryPoint } from '../types';
import Card from './Card';
import { PlusIcon, TrashIcon, EditIcon, SaveIcon } from './icons';
import Spinner from './Spinner';
import { useLocalization } from '../App';

interface AddAssetModalProps {
    isOpen: boolean;
    onClose: () => void;
    coins: Coin[];
    onAddAsset: (asset: Omit<PortfolioHolding, 'id' | 'coin'> & { coinId: string }) => void;
}

const AddAssetModal: React.FC<AddAssetModalProps> = ({ isOpen, onClose, coins, onAddAsset }) => {
    const { t } = useLocalization();
    const [selectedCoinId, setSelectedCoinId] = useState<string>(coins[0]?.id || '');
    const [quantity, setQuantity] = useState('');
    const [buyPrice, setBuyPrice] = useState('');
    const [stopLoss, setStopLoss] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const newAsset = {
            coinId: selectedCoinId,
            quantity: parseFloat(quantity),
            buyPrice: parseFloat(buyPrice),
            stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
        };
        if (newAsset.coinId && !isNaN(newAsset.quantity) && !isNaN(newAsset.buyPrice) && newAsset.quantity > 0 && newAsset.buyPrice >= 0) {
            onAddAsset(newAsset);
            // Reset form
            setSelectedCoinId(coins[0]?.id || '');
            setQuantity('');
            setBuyPrice('');
            setStopLoss('');
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50 p-4">
            <Card className="w-full max-w-md p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">{t('portfolio.modal.title')}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('portfolio.modal.coin')}</label>
                        <select
                            value={selectedCoinId}
                            onChange={(e) => setSelectedCoinId(e.target.value)}
                            className="w-full bg-gray-100 dark:bg-[#1e2230] border border-gray-300 dark:border-white/20 rounded-lg p-2 text-gray-900 dark:text-white"
                        >
                            {coins.map(c => <option key={c.id} value={c.id}>{c.name} ({c.symbol.toUpperCase()})</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('portfolio.modal.quantity')}</label>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            className="w-full bg-gray-100 dark:bg-[#1e2230] border border-gray-300 dark:border-white/20 rounded-lg p-2"
                            placeholder="e.g. 1.5"
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('portfolio.modal.buyPrice')}</label>
                         <input
                            type="number"
                            step="any"
                            min="0"
                            value={buyPrice}
                            onChange={(e) => setBuyPrice(e.target.value)}
                            className="w-full bg-gray-100 dark:bg-[#1e2230] border border-gray-300 dark:border-white/20 rounded-lg p-2"
                            placeholder="e.g. 50000"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('portfolio.modal.stopLoss')}</label>
                         <input
                            type="number"
                            step="any"
                            min="0"
                            value={stopLoss}
                            onChange={(e) => setStopLoss(e.target.value)}
                            className="w-full bg-gray-100 dark:bg-[#1e2230] border border-gray-300 dark:border-white/20 rounded-lg p-2"
                            placeholder="e.g. 45000"
                        />
                    </div>
                    <div className="mt-6 flex justify-end space-x-3 rtl:space-x-reverse">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700">{t('common.cancel')}</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{t('portfolio.addAsset')}</button>
                    </div>
                </form>
            </Card>
        </div>
    );
};

interface PortfolioProps {
  portfolio: PortfolioHolding[];
  setPortfolio: React.Dispatch<React.SetStateAction<PortfolioHolding[]>>;
  coins: Coin[];
  isLoading: boolean;
  portfolioHistory: PortfolioHistoryPoint[];
}

const Portfolio: React.FC<PortfolioProps> = ({ portfolio, setPortfolio, coins, isLoading, portfolioHistory }) => {
    const { t } = useLocalization();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
    
    // State for inline stop-loss editing
    const [editingStopLossId, setEditingStopLossId] = useState<string | null>(null);
    const [tempStopLoss, setTempStopLoss] = useState<string>('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editingStopLossId && inputRef.current) {
            inputRef.current.focus();
        }
    }, [editingStopLossId]);

    const handleAddAsset = (asset: Omit<PortfolioHolding, 'id' | 'coin'> & { coinId: string }) => {
        const coin = coins.find(c => c.id === asset.coinId);
        if (!coin) return;

        setPortfolio(prev => {
            const existing = prev.find(h => h.id === asset.coinId);
            if (existing) {
                const totalQuantity = existing.quantity + asset.quantity;
                const totalCost = (existing.buyPrice * existing.quantity) + (asset.buyPrice * asset.quantity);
                const newBuyPrice = totalCost / totalQuantity;
                return prev.map(h => h.id === asset.coinId ? { ...h, quantity: totalQuantity, buyPrice: newBuyPrice } : h);
            } else {
                return [...prev, { id: coin.id, coin, quantity: asset.quantity, buyPrice: asset.buyPrice, stopLoss: asset.stopLoss }];
            }
        });
    };

    const handleDeleteAsset = (id: string) => {
        setPortfolio(prev => prev.filter(h => h.id !== id));
    };

    const handleEditClick = (holding: PortfolioHolding) => {
        setEditingStopLossId(holding.id);
        setTempStopLoss(holding.stopLoss?.toString() ?? '');
    };

    const handleSaveStopLoss = (holdingId: string) => {
        setPortfolio(prev =>
            prev.map(h => {
                if (h.id === holdingId) {
                    const newStopLoss = parseFloat(tempStopLoss);
                    return { ...h, stopLoss: isNaN(newStopLoss) || newStopLoss <= 0 ? undefined : newStopLoss };
                }
                return h;
            })
        );
        setEditingStopLossId(null);
    };

    const { totalValue, totalPnl, totalPnlPercentage } = useMemo(() => {
        const totalValue = portfolio.reduce((acc, h) => acc + (h.coin.current_price * h.quantity), 0);
        const totalInitialValue = portfolio.reduce((acc, h) => acc + (h.buyPrice * h.quantity), 0);
        const totalPnl = totalValue - totalInitialValue;
        const totalPnlPercentage = totalInitialValue > 0 ? (totalPnl / totalInitialValue) * 100 : 0;
        return { totalValue, totalPnl, totalPnlPercentage };
    }, [portfolio]);

    const pnlColor = totalPnl >= 0 ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400';
    const pnlSign = totalPnl >= 0 ? '+' : '';

    const chartData = useMemo(() => {
        const now = Date.now();
        let startTime = 0;
        switch (timeRange) {
            case '7d':
                startTime = now - 7 * 24 * 60 * 60 * 1000;
                break;
            case '30d':
                startTime = now - 30 * 24 * 60 * 60 * 1000;
                break;
            case '90d':
                startTime = now - 90 * 24 * 60 * 60 * 1000;
                break;
            default:
                startTime = 0;
                break;
        }
        const filtered = portfolioHistory.filter(p => p.timestamp >= startTime);
        // Append a live data point representing the current portfolio value.
        // This ensures the chart line always extends to the present moment.
        return [...filtered, { timestamp: now, value: totalValue }];
    }, [portfolioHistory, timeRange, totalValue]);

    const formatXAxis = (tickItem: number) => new Date(tickItem).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const formatYAxis = (tickItem: number) => `$${tickItem.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="p-2 bg-gray-700/80 dark:bg-gray-800/80 text-white rounded-md text-sm backdrop-blur-sm shadow-lg">
                    <p className="font-semibold">{new Date(label).toLocaleString()}</p>
                    <p className="text-blue-300">{`Value: ${formatYAxis(payload[0].value)}`}</p>
                </div>
            );
        }
        return null;
    };

  return (
    <div className="p-4 md:p-6 space-y-6 h-full overflow-y-auto">
        <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('portfolio.title')}</h1>
            <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center space-x-2 rtl:space-x-reverse transition">
                <PlusIcon className="w-5 h-5" />
                <span>{t('portfolio.addAsset')}</span>
            </button>
        </div>

        <Card className="p-4 md:p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2 sm:mb-0">{t('portfolio.performance')}</h2>
                <div className="flex space-x-1 rtl:space-x-reverse bg-gray-200 dark:bg-gray-700/50 p-1 rounded-lg">
                    {(['7d', '30d', '90d', 'all'] as const).map(range => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${timeRange === range ? 'bg-white dark:bg-blue-600 text-blue-600 dark:text-white shadow' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300/50 dark:hover:bg-gray-600/50'}`}
                        >
                            {range.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>
            {chartData.length > 1 ? (
                <div className="h-72 -ml-4 rtl:ml-0 rtl:-mr-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                            <XAxis dataKey="timestamp" tickFormatter={formatXAxis} tick={{ fontSize: 12, fill: 'currentColor' }} axisLine={false} tickLine={false} />
                            <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12, fill: 'currentColor' }} axisLine={false} tickLine={false} domain={['dataMin - dataMin*0.05', 'auto']} />
                            <Tooltip content={<CustomTooltip />} />
                            <Line type="monotone" dataKey="value" name="Value" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="h-72 flex items-center justify-center text-center text-gray-500 dark:text-gray-400">
                    <div>
                        <h3 className="font-semibold">{t('portfolio.noHistory')}</h3>
                        <p className="text-sm mt-1">{t('portfolio.noHistoryDesc')}</p>
                    </div>
                </div>
            )}
        </Card>

        <Card className="p-4">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('portfolio.totalValue')}</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('portfolio.change24h')}</p>
                    <p className="text-2xl font-bold text-gray-500 dark:text-gray-400">--</p> 
                </div>
                <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('portfolio.totalPL')}</p>
                    <p className={`text-2xl font-bold ${pnlColor}`}>{pnlSign}${Math.abs(totalPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({pnlSign}{totalPnlPercentage.toFixed(2)}%)</p>
                </div>
            </div>
        </Card>
        
        <Card className="p-0 overflow-hidden">
             {isLoading && portfolio.length === 0 ? <div className="p-10 text-center"><Spinner /></div> :
             portfolio.length === 0 ? (
                <div className="text-center py-24 text-gray-500 dark:text-gray-400">
                    <h2 className="text-xl font-semibold">{t('portfolio.empty')}</h2>
                    <p className="mt-2">{t('portfolio.emptyDesc')}</p>
                </div>
             ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left rtl:text-right">
                        <thead className="bg-gray-50 dark:bg-white/5 text-xs text-gray-500 dark:text-gray-400 uppercase">
                            <tr>
                                <th className="py-3 px-6">{t('portfolio.table.asset')}</th>
                                <th className="py-3 px-6">{t('portfolio.table.price')}</th>
                                <th className="py-3 px-6">{t('portfolio.table.holdings')}</th>
                                <th className="py-3 px-6">{t('portfolio.table.stopLoss')}</th>
                                <th className="py-3 px-6">{t('portfolio.table.pl')}</th>
                                <th className="py-3 px-6"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-white/10">
                            {portfolio.map(holding => {
                                const currentValue = holding.quantity * holding.coin.current_price;
                                const initialValue = holding.quantity * holding.buyPrice;
                                const pnl = currentValue - initialValue;
                                const pnlPercentage = initialValue > 0 ? (pnl / initialValue) * 100 : 0;
                                const isProfit = pnl >= 0;

                                return (
                                <tr key={holding.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors duration-200">
                                    <td className="py-4 px-6">
                                        <div className="flex items-center space-x-3 rtl:space-x-reverse">
                                            <img src={holding.coin.image} alt={holding.coin.name} className="h-8 w-8" />
                                            <div>
                                                <p className="font-bold text-gray-900 dark:text-white">{holding.coin.name}</p>
                                                <p className="text-gray-500 dark:text-gray-400 text-sm uppercase">{holding.coin.symbol}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4 px-6 font-mono text-gray-900 dark:text-white">${holding.coin.current_price.toLocaleString()}</td>
                                    <td className="py-4 px-6">
                                        <p className="font-mono font-semibold text-gray-900 dark:text-white">${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">{holding.quantity} {holding.coin.symbol.toUpperCase()}</p>
                                    </td>
                                    <td className="py-4 px-6">
                                        <div className="flex items-center space-x-2 rtl:space-x-reverse">
                                        {editingStopLossId === holding.id ? (
                                            <div className="relative">
                                                <span className="absolute left-2 rtl:left-auto rtl:right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">$</span>
                                                <input
                                                    ref={inputRef}
                                                    type="number"
                                                    value={tempStopLoss}
                                                    onChange={(e) => setTempStopLoss(e.target.value)}
                                                    onBlur={() => handleSaveStopLoss(holding.id)}
                                                    className="w-28 bg-gray-100 dark:bg-[#1e2230] border border-gray-300 dark:border-white/20 rounded-md p-1 ps-5 rtl:ps-2 rtl:pe-5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                        ) : (
                                            <span className="font-mono text-sm w-28">
                                                {holding.stopLoss ? `$${holding.stopLoss.toLocaleString()}` : <span className="text-gray-400 dark:text-gray-500">{t('common.notSet')}</span>}
                                            </span>
                                        )}
                                        {editingStopLossId === holding.id ? (
                                             <button onClick={() => handleSaveStopLoss(holding.id)} className="text-green-500 hover:text-green-600 p-1 rounded-full"><SaveIcon/></button>
                                        ) : (
                                             <button onClick={() => handleEditClick(holding)} className="text-gray-400 hover:text-blue-500 p-1 rounded-full"><EditIcon/></button>
                                        )}
                                        </div>
                                    </td>
                                    <td className={`py-4 px-6 font-semibold ${isProfit ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                        <p>{isProfit ? '+' : '-'}${Math.abs(pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        <p className="text-xs">{isProfit ? '▲' : '▼'} {Math.abs(pnlPercentage).toFixed(2)}%</p>
                                    </td>
                                    <td className="py-4 px-6">
                                        <button onClick={() => handleDeleteAsset(holding.id)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-2 rounded-full transition">
                                            <TrashIcon className="w-5 h-5"/>
                                        </button>
                                    </td>
                                </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
        
        <AddAssetModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} coins={coins} onAddAsset={handleAddAsset} />
    </div>
  );
};

export default Portfolio;