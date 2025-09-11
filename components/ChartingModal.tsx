import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
// @ts-ignore
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, Customized, ReferenceArea, Cell } from 'recharts';
import type { Coin, OHLCV, TradePlan } from '../types';
import { calculateRSI, calculateMACD } from '../utils/technicalAnalysis';
import Spinner from './Spinner';
import { XIcon, TrendlineIcon, VolumeProfileIcon } from './icons';
import { useLocalization } from '../App';

interface ChartingModalProps {
    coin: Coin;
    onClose: () => void;
    tradePlan?: TradePlan;
}

type Timeframe = '1h' | '4h' | '1d' | '1w';

interface ChartDataPoint extends OHLCV {
    rsi?: number | null;
    macd?: number | null;
    signal?: number | null;
    histogram?: number | null;
}

interface Trendline {
    id: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}


const ChartingModal: React.FC<ChartingModalProps> = ({ coin, onClose, tradePlan }) => {
    const { t } = useLocalization();
    const [timeframe, setTimeframe] = useState<Timeframe>('4h');
    const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDrawing, setIsDrawing] = useState(false);
    const [trendlines, setTrendlines] = useState<Trendline[]>([]);
    const [tempLineStart, setTempLineStart] = useState<{x: number, y: number} | null>(null);
    const [isVolumeProfileVisible, setIsVolumeProfileVisible] = useState(false);

    const chartRef = useRef<any>(null);
    const drawingOverlayRef = useRef<HTMLDivElement>(null);


    const generateChartData = useCallback((prices: number[], tf: Timeframe) => {
        // 1. Simulate hourly OHLCV from sparkline
        let hourlyData: Omit<OHLCV, 'timestamp'>[] = [];
        for (let i = 1; i < prices.length; i++) {
            const open = prices[i-1];
            const close = prices[i];
            const high = Math.max(open, close) * (1 + (Math.random() * 0.01));
            const low = Math.min(open, close) * (1 - (Math.random() * 0.01));
            const volume = Math.random() * (coin.total_volume / prices.length);
            hourlyData.push({ open, high, low, close, volume });
        }
        
        // 2. Aggregate based on timeframe
        const now = Date.now();
        const getTimestamp = (index: number) => now - (hourlyData.length - index) * 60 * 60 * 1000;

        let aggregationFactor = 1;
        if (tf === '4h') aggregationFactor = 4;
        if (tf === '1d') aggregationFactor = 24;
        if (tf === '1w') aggregationFactor = 168;

        const aggregated: OHLCV[] = [];
        for (let i = 0; i < hourlyData.length; i += aggregationFactor) {
            const chunk = hourlyData.slice(i, i + aggregationFactor);
            if(chunk.length === 0) continue;

            aggregated.push({
                timestamp: getTimestamp(i),
                open: chunk[0].open,
                high: Math.max(...chunk.map(c => c.high)),
                low: Math.min(...chunk.map(c => c.low)),
                close: chunk[chunk.length-1].close,
                volume: chunk.reduce((sum, c) => sum + c.volume, 0)
            });
        }
        
        // 3. Calculate indicators
        const closePrices = aggregated.map(d => d.close);
        const macdValues = calculateMACD(closePrices);

        const finalData = aggregated.map((d, i) => {
            const macdData = macdValues[i] || { macd: null, signal: null, histogram: null };
            return {
            ...d,
            rsi: i > 13 ? calculateRSI(closePrices.slice(0, i+1), 14) : null,
            macd: macdData.macd,
            signal: macdData.signal,
            histogram: macdData.histogram,
           }
        });

        return finalData;

    }, [coin.total_volume]);
    
    useEffect(() => {
        setIsLoading(true);
        if (coin.sparkline_in_7d?.price) {
            const data = generateChartData(coin.sparkline_in_7d.price, timeframe);
            setChartData(data);
        }
        setIsLoading(false);
    }, [coin, timeframe, generateChartData]);

    const handleDrawingClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDrawing || !chartRef.current || !drawingOverlayRef.current) return;
        
        const chart = chartRef.current;
        const overlay = drawingOverlayRef.current;
        const chartRect = overlay.getBoundingClientRect();
        
        const x = e.clientX - chartRect.left;
        const y = e.clientY - chartRect.top;
        
        const dataX = chart.state.xAxisMap[0].scale.invert(x);
        const dataY = chart.state.yAxisMap[0].scale.invert(y);
        
        if (!tempLineStart) {
            setTempLineStart({ x: dataX, y: dataY });
        } else {
            setTrendlines(prev => [...prev, { id: Date.now(), x1: tempLineStart.x, y1: tempLineStart.y, x2: dataX, y2: dataY }]);
            setTempLineStart(null);
            setIsDrawing(false);
        }
    }

    const { dataMin, dataMax } = useMemo(() => {
        if (!chartData || chartData.length === 0) return { dataMin: 0, dataMax: 0 };
        const lows = chartData.map(d => d.low);
        const highs = chartData.map(d => d.high);
        
        let min = Math.min(...lows);
        let max = Math.max(...highs);

        if (tradePlan) {
            min = Math.min(min, tradePlan.stopLoss, tradePlan.entry);
            max = Math.max(max, tradePlan.entry, ...tradePlan.targets.map(t => t.price));
        }

        return {
            dataMin: min * 0.98,
            dataMax: max * 1.02,
        };
    }, [chartData, tradePlan]);
    
    const volumeProfileData = useMemo(() => {
        if (!isVolumeProfileVisible || chartData.length === 0 || dataMax <= dataMin) return null;

        const BINS = 75;
        const binSize = (dataMax - dataMin) / BINS;
        if (binSize <= 0) return null;

        const bins = Array.from({ length: BINS }, (_, i) => ({
            price: dataMin + i * binSize,
            upVolume: 0,
            downVolume: 0,
        }));

        for (const d of chartData) {
            const startBinIndex = Math.max(0, Math.floor((d.low - dataMin) / binSize));
            const endBinIndex = Math.min(BINS - 1, Math.ceil((d.high - dataMin) / binSize));
            
            const binsAffected = (endBinIndex - startBinIndex) + 1;
            if (binsAffected <= 0) continue;
            
            const volumePerBin = d.volume / binsAffected;
            const isUp = d.close >= d.open;

            for (let i = startBinIndex; i <= endBinIndex; i++) {
                if (isUp) {
                    bins[i].upVolume += volumePerBin;
                } else {
                    bins[i].downVolume += volumePerBin;
                }
            }
        }
        
        const maxTotalVolumeInBin = Math.max(...bins.map(b => b.upVolume + b.downVolume));

        return { bins, maxTotalVolumeInBin, binSize };
    }, [chartData, isVolumeProfileVisible, dataMin, dataMax]);

    const formatXAxis = (tickItem: number) => {
        const date = new Date(tickItem);
        if (timeframe === '1h' || timeframe === '4h') return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    const CustomTooltipContent = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="p-2 bg-gray-700/80 dark:bg-gray-800/80 text-white rounded-md text-sm backdrop-blur-sm shadow-lg border border-white/20">
                    <p className="font-semibold">{new Date(label).toLocaleString()}</p>
                    <p>Open: <span className="font-mono">${data.open.toFixed(4)}</span></p>
                    <p>High: <span className="font-mono">${data.high.toFixed(4)}</span></p>
                    <p>Low: <span className="font-mono">${data.low.toFixed(4)}</span></p>
                    <p>Close: <span className="font-mono">${data.close.toFixed(4)}</span></p>
                    <p>Volume: <span className="font-mono">{Math.round(data.volume / 1_000_000)}M</span></p>
                    <p>RSI: <span className="font-mono">{data.rsi?.toFixed(2)}</span></p>
                </div>
            );
        }
        return null;
    };


    return (
        <div className="fixed inset-0 bg-gray-100 dark:bg-[#1e2230] z-50 flex flex-col p-4">
            {/* Header */}
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                    <img src={coin.image} alt={coin.name} className="h-8 w-8" />
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{coin.name} ({coin.symbol.toUpperCase()})</h2>
                </div>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-white/10">
                    <XIcon />
                </button>
            </div>
            
            {/* Toolbar */}
            <div className="flex items-center space-x-2 rtl:space-x-reverse mb-2 flex-shrink-0">
                {(['1h', '4h', '1d', '1w'] as Timeframe[]).map(tf => (
                    <button 
                        key={tf} 
                        onClick={() => setTimeframe(tf)} 
                        className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${timeframe === tf ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20'}`}
                    >
                        {tf.toUpperCase()}
                    </button>
                ))}
                <div className="border-l border-gray-300 dark:border-white/20 h-6 mx-2"></div>
                <button
                    onClick={() => setIsDrawing(!isDrawing)}
                    className={`p-2 rounded-md transition-colors ${isDrawing ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20'}`}
                    title="Draw Trendline"
                >
                    <TrendlineIcon />
                </button>
                <button
                    onClick={() => setIsVolumeProfileVisible(v => !v)}
                    className={`p-2 rounded-md transition-colors ${isVolumeProfileVisible ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20'}`}
                    title="Toggle Volume Profile"
                >
                    <VolumeProfileIcon />
                </button>
                 {isDrawing && <span className="text-sm text-blue-500 animate-pulse">{tempLineStart ? "Click to set end point" : "Click to set start point"}</span>}
            </div>

            {/* Charts */}
            <div className="flex-1 min-h-0">
            {isLoading ? <div className="h-full flex justify-center items-center"><Spinner /></div> : (
                <ResponsiveContainer width="100%" height="100%">
                    <div className="w-full h-full relative">
                        {isDrawing && <div ref={drawingOverlayRef} onClick={handleDrawingClick} className="absolute inset-0 z-20 cursor-crosshair" />}
                        <ComposedChart data={chartData} syncId="cryptoChart" ref={chartRef}>
                            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                            <XAxis dataKey="timestamp" tickFormatter={formatXAxis} hide scale="band" />
                            <YAxis domain={[dataMin, dataMax]} orientation="left" tickFormatter={(v) => `$${Number(v).toFixed(4)}`} tick={{ fontSize: 12, fill: 'currentColor' }} />
                            <Tooltip content={<CustomTooltipContent />} />
                            
                            {trendlines.map(line => (
                                <ReferenceLine key={line.id} segment={[{ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }]} stroke="#fde047" strokeWidth={2} />
                            ))}

                             {tradePlan && (
                                <>
                                    <ReferenceArea y1={tradePlan.entry} y2={tradePlan.entry * (tradePlan.direction === 'Long' ? 1.005 : 0.995)} fill={tradePlan.direction === 'Long' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'} stroke={tradePlan.direction === 'Long' ? '#22c55e' : '#ef4444'} strokeOpacity={0.5} strokeDasharray="3 3" />
                                    <ReferenceLine y={tradePlan.entry} label={{ value: t('chartingModal.entry'), position: 'insideTopLeft', fill: '#ffffff', stroke: '#000000', strokeWidth: 2, dy: -5 }} stroke={tradePlan.direction === 'Long' ? '#22c55e' : '#ef4444'} strokeWidth={1.5} />
                                    <ReferenceLine y={tradePlan.stopLoss} label={{ value: t('chartingModal.stopLoss'), position: 'insideTopLeft', fill: '#ffffff', stroke: '#000000', strokeWidth: 2, dy: -5 }} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4"/>
                                    {/* FIX: Renamed map variable from 't' to 'target' to avoid shadowing the 't' localization function. */}
                                    {tradePlan.targets.map(target => (
                                        <ReferenceLine key={`tp-${target.level}`} y={target.price} label={{ value: t('chartingModal.target', { level: target.level }), position: 'insideTopRight', fill: '#ffffff', stroke: '#000000', strokeWidth: 2, dy: -5 }} stroke="#3b82f6" strokeWidth={1} strokeDasharray="5 5"/>
                                    ))}
                                </>
                            )}

                            {volumeProfileData && (
                                <Customized component={({ yAxisMap, width }) => {
                                    const yAxis = yAxisMap[0];
                                    if (!yAxis || !width) return null;

                                    const { scale } = yAxis;
                                    const maxBarWidth = width * 0.20;

                                    return (
                                        <g>
                                            {volumeProfileData.bins.map((bin, i) => {
                                                const totalVolume = bin.upVolume + bin.downVolume;
                                                if (totalVolume === 0) return null;
                                                const totalBarWidth = (totalVolume / volumeProfileData.maxTotalVolumeInBin) * maxBarWidth;
                                                const upVolumeWidth = (bin.upVolume / totalVolume) * totalBarWidth;
                                                const yBottom = scale(bin.price);
                                                const yTop = scale(bin.price + volumeProfileData.binSize);

                                                return (
                                                    <g key={`vp_bin_${i}`} opacity={0.7}>
                                                        <rect x={width - totalBarWidth} y={yTop} width={totalBarWidth} height={yBottom - yTop} fill="rgba(239, 68, 68, 0.4)" stroke="none" />
                                                        <rect x={width - upVolumeWidth} y={yTop} width={upVolumeWidth} height={yBottom - yTop} fill="rgba(34, 197, 94, 0.4)" stroke="none" />
                                                    </g>
                                                );
                                            })}
                                        </g>
                                    );
                                }} />
                            )}
                            
                            {/* FIX: Replaced the incorrect candlestick rendering logic with a single, correct <Customized> component. 
                                This iterates over the chart's processed data points and uses the provided scales (xScale, yScale) 
                                to accurately draw each candlestick's wick (line) and body (rect) in its proper location.
                            */}
                            <Customized
                                component={({ xAxisMap, yAxisMap, data }) => {
                                    if (!data || data.length === 0) return null;
                                    const { scale: xScale } = xAxisMap[0];
                                    const { scale: yScale } = yAxisMap[0];
                                    const bandWidth = xScale.bandwidth ? xScale.bandwidth() : (xScale.range()[1] / data.length);
                                    const candleWidth = bandWidth * 0.8;

                                    return (
                                        <g>
                                            {data.map((d: any, index: number) => {
                                                const x = xScale(d.timestamp);
                                                if(x === undefined) return null;

                                                const candleX = x + (bandWidth - candleWidth) / 2;
                                                const isUp = d.close >= d.open;
                                                const fill = isUp ? '#22c55e' : '#ef4444';

                                                const lineY1 = yScale(d.high);
                                                const lineY2 = yScale(d.low);
                                                const lineX = x + bandWidth / 2;

                                                const bodyY = yScale(Math.max(d.open, d.close));
                                                const bodyHeight = Math.abs(yScale(d.open) - yScale(d.close));
                                                
                                                if (isNaN(bodyHeight)) return null;

                                                return (
                                                    <g key={`candle-${index}`}>
                                                        <line x1={lineX} y1={lineY1} x2={lineX} y2={lineY2} stroke={fill} strokeWidth={1} />
                                                        <rect x={candleX} y={bodyY} width={candleWidth} height={bodyHeight} fill={fill} />
                                                    </g>
                                                );
                                            })}
                                        </g>
                                    );
                                }}
                            />
                        </ComposedChart>
                        
                        <div style={{height: '20%'}}>
                        <ComposedChart data={chartData} syncId="cryptoChart">
                             <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                            <XAxis dataKey="timestamp" tickFormatter={formatXAxis} hide />
                            <YAxis domain={['auto', 'dataMax * 4']} orientation="left" tickFormatter={(v) => `${(v/1000000).toFixed(0)}M`} tick={{ fontSize: 12, fill: 'currentColor' }}/>
                            <Bar dataKey="volume" isAnimationActive={false}>
                                {chartData.map((d, i) => <Cell key={`cell-${i}`} fill={d.close >= d.open ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)'} />)}
                            </Bar>
                        </ComposedChart>
                        </div>
                        
                        <div style={{height: '20%'}}>
                        <ComposedChart data={chartData} syncId="cryptoChart">
                            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                            <XAxis dataKey="timestamp" tickFormatter={formatXAxis} hide />
                            <YAxis domain={[0, 100]} orientation="left" ticks={[30, 70]} tick={{ fontSize: 12, fill: 'currentColor' }}/>
                            <ReferenceLine y={70} stroke="currentColor" strokeDasharray="3 3" strokeOpacity={0.5} />
                            <ReferenceLine y={30} stroke="currentColor" strokeDasharray="3 3" strokeOpacity={0.5} />
                            <Line type="monotone" dataKey="rsi" stroke="#c084fc" strokeWidth={2} dot={false} isAnimationActive={false} />
                        </ComposedChart>
                        </div>

                        <div style={{height: '25%'}}>
                        <ComposedChart data={chartData} syncId="cryptoChart">
                            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                            <XAxis dataKey="timestamp" tickFormatter={formatXAxis} tick={{ fontSize: 12, fill: 'currentColor' }} />
                            <YAxis orientation="left" tick={{ fontSize: 12, fill: 'currentColor' }} />
                            <ReferenceLine y={0} stroke="currentColor" strokeDasharray="2 2" strokeOpacity={0.8} />
                             <Bar dataKey="histogram" isAnimationActive={false}>
                                {chartData.map((d, i) => <Cell key={`cell-hist-${i}`} fill={d.histogram && d.histogram > 0 ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)'} />)}
                            </Bar>
                            <Line type="monotone" dataKey="macd" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                            <Line type="monotone" dataKey="signal" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} />
                        </ComposedChart>
                        </div>

                    </div>
                </ResponsiveContainer>
            )}
            </div>

        </div>
    );
};

export default ChartingModal;
