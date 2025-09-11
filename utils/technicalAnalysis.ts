import type { OHLCV, Coin, BreakoutSignal } from '../types';

/**
 * Calculates the Simple Moving Average (SMA) for a given period.
 */
export const calculateSMA = (data: number[], period: number): number[] => {
  if (data.length < period) return Array(data.length).fill(null);
  
  const sma: (number | null)[] = Array(period - 1).fill(null);
  let sum = 0;
  
  for (let i = 0; i < period - 1; i++) {
    sum += data[i];
  }

  for (let i = period - 1; i < data.length; i++) {
    sum += data[i];
    sma.push(sum / period);
    sum -= data[i - period + 1];
  }
  
  return sma as number[];
};


/**
 * Calculates the Relative Strength Index (RSI) for a given period.
 */
export const calculateRSI = (data: number[], period: number = 14): number | null => {
    if (data.length <= period) return null;

    let gains = 0;
    let losses = 0;

    // Calculate initial average gain and loss
    for (let i = 1; i <= period; i++) {
        const change = data[i] - data[i-1];
        if (change > 0) {
            gains += change;
        } else {
            losses -= change; // losses are positive values
        }
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Smooth the rest
    for (let i = period + 1; i < data.length; i++) {
        const change = data[i] - data[i - 1];
        if (change > 0) {
            avgGain = (avgGain * (period - 1) + change) / period;
            avgLoss = (avgLoss * (period - 1)) / period;
        } else {
            avgGain = (avgGain * (period - 1)) / period;
            avgLoss = (avgLoss * (period - 1) - change) / period;
        }
    }

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
};

// FIX: Add calculateMACD function and its helper calculateEMA to resolve an import error in ChartingModal.tsx.
/**
 * Calculates the Exponential Moving Average (EMA).
 * This is a helper function and is not exported.
 */
const calculateEMA = (data: number[], period: number): (number | null)[] => {
  const emaValues: (number | null)[] = Array(data.length).fill(null);
  if (data.length < period) {
    return emaValues;
  }

  const k = 2 / (period + 1);
  
  // First value is a simple moving average
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  emaValues[period - 1] = sum / period;
  
  // Subsequent values
  for (let i = period; i < data.length; i++) {
    const prevEma = emaValues[i - 1];
    if (prevEma !== null) {
      emaValues[i] = (data[i] * k) + (prevEma * (1 - k));
    }
  }
  
  return emaValues;
};


/**
 * Calculates the Moving Average Convergence Divergence (MACD).
 */
export const calculateMACD = (data: number[], shortPeriod: number = 12, longPeriod: number = 26, signalPeriod: number = 9): { macd: number | null, signal: number | null, histogram: number | null }[] => {
    if (data.length < longPeriod) {
        return Array(data.length).fill({ macd: null, signal: null, histogram: null });
    }

    const emaShort = calculateEMA(data, shortPeriod);
    const emaLong = calculateEMA(data, longPeriod);
    
    const macdLine: (number | null)[] = emaLong.map((longVal, i) => {
        const shortVal = emaShort[i];
        if (longVal !== null && shortVal !== null) {
            return shortVal - longVal;
        }
        return null;
    });

    // The data for the signal line must not have nulls.
    const validMacdValues = macdLine.filter((v): v is number => v !== null);
    const signalLineEma = calculateEMA(validMacdValues, signalPeriod);
    
    // Align signal line with the original macdLine.
    const firstMacdIndex = macdLine.findIndex(v => v !== null);
    
    const signalLine: (number | null)[] = Array(macdLine.length).fill(null);
    if(firstMacdIndex !== -1) {
        signalLineEma.forEach((val, i) => {
            const targetIndex = firstMacdIndex + i;
            if(targetIndex < signalLine.length) {
                signalLine[targetIndex] = val;
            }
        });
    }

    return macdLine.map((macdVal, i) => {
        const signalVal = signalLine[i];
        const histogramVal = (macdVal !== null && signalVal !== null) ? macdVal - signalVal : null;
        return {
            macd: macdVal,
            signal: signalVal,
            histogram: histogramVal,
        };
    });
};

// Helper to find swing points (peaks and troughs)
const findSwingPoints = (data: OHLCV[], lookback: number) => {
    const highs: { index: number, price: number }[] = [];
    const lows: { index: number, price: number }[] = [];
    for (let i = lookback; i < data.length - lookback; i++) {
        const window = data.slice(i - lookback, i + lookback + 1);
        const currentHigh = data[i].high;
        const currentLow = data[i].low;

        if (window.every(c => currentHigh >= c.high)) {
            // Ensure it's a new peak, not part of the same flat top
            if (!highs.length || highs[highs.length - 1].price !== currentHigh) {
                highs.push({ index: i, price: currentHigh });
            }
        }

        if (window.every(c => currentLow <= c.low)) {
            // Ensure it's a new trough
            if (!lows.length || lows[lows.length - 1].price !== currentLow) {
                lows.push({ index: i, price: currentLow });
            }
        }
    }
    return { highs, lows };
};

// Generates simulated 5-minute OHLCV data from hourly prices.
const generate5minOHLCV = (hourlyPrices: number[], totalVolume: number): OHLCV[] => {
    if (hourlyPrices.length < 2) return [];

    const fiveMinData: OHLCV[] = [];
    const now = Date.now();
    const totalDurationMillis = (hourlyPrices.length - 1) * 60 * 60 * 1000;
    
    let totalVolatility = 0;
    const hourlyVols: number[] = [];
    for (let i = 1; i < hourlyPrices.length; i++) {
        const volatility = Math.abs(hourlyPrices[i] - hourlyPrices[i - 1]);
        hourlyVols.push(volatility);
        totalVolatility += volatility;
    }
    const volumeFactor = totalVolume / (totalVolatility || 1);

    for (let i = 0; i < hourlyPrices.length - 1; i++) {
        const startPrice = hourlyPrices[i];
        const endPrice = hourlyPrices[i + 1];
        const hourlyVolume = (hourlyVols[i] || 0) * volumeFactor;

        for (let j = 0; j < 12; j++) { // 12 * 5 minutes = 1 hour
            const fiveMinIndex = i * 12 + j;
            const open = startPrice + (endPrice - startPrice) * (j / 12);
            const close = startPrice + (endPrice - startPrice) * ((j + 1) / 12);
            
            const high = Math.max(open, close) * (1 + (Math.random() * 0.005));
            const low = Math.min(open, close) * (1 - (Math.random() * 0.005));
            const volume = (hourlyVolume / 12) * (0.5 + Math.random());
            
            const timestamp = now - totalDurationMillis + (fiveMinIndex * 5 * 60 * 1000);
            
            fiveMinData.push({ timestamp, open, high, low, close, volume });
        }
    }
    return fiveMinData;
};

// Aggregates fine-grained OHLCV data into a larger timeframe.
const aggregateOHLCV = (baseData: OHLCV[], factor: number): OHLCV[] => {
    if (factor === 1) return baseData;
    const aggregated: OHLCV[] = [];
    for (let i = 0; i < baseData.length; i += factor) {
        const chunk = baseData.slice(i, i + factor);
        if (chunk.length === 0) continue;
        aggregated.push({
            timestamp: chunk[0].timestamp,
            open: chunk[0].open,
            high: Math.max(...chunk.map(c => c.high)),
            low: Math.min(...chunk.map(c => c.low)),
            close: chunk[chunk.length - 1].close,
            volume: chunk.reduce((sum, c) => sum + c.volume, 0),
        });
    }
    return aggregated;
};

const findBreakoutSignalForTimeframe = (ohlcv: OHLCV[], coin: Coin, timeframe: string): BreakoutSignal | null => {
    if (ohlcv.length < 50) return null; // Need enough data

    const lookback = 5; // For swing point detection
    const { highs, lows } = findSwingPoints(ohlcv.slice(0, -2), lookback); // Analyze historical data, excluding last 2 candles

    if (highs.length < 2 || lows.length < 2) return null; // Need at least two of each for a range

    const lastHigh = highs[highs.length - 1];
    const lastLow = lows[lows.length - 1];
    const breakoutCandle = ohlcv[ohlcv.length - 1];

    // Volume strength check
    const volumes = ohlcv.map(c => c.volume);
    const volumeSma20 = calculateSMA(volumes, 20).filter(v => v !== null).pop() || 1;
    const strength = breakoutCandle.volume / volumeSma20;

    if (strength < 1.5) return null; // Minimum strength threshold

    const fibLevels = [0.618, 1.000, 1.272, 1.618, 2.000, 2.618];
    let signal: Partial<BreakoutSignal> = { coin, timeframe, strength, time: breakoutCandle.timestamp };

    // Bullish Breakout Check
    if (breakoutCandle.close > lastHigh.price) {
        const precedingLow = lows.filter(l => l.index < lastHigh.index).pop();
        if (!precedingLow) return null;
        
        signal.direction = 'Long';
        signal.entryPrice = breakoutCandle.close;
        signal.stopLoss = precedingLow.price;
        
        const range = lastHigh.price - precedingLow.price;
        if (range <= 0 || signal.stopLoss >= signal.entryPrice) return null;
        signal.targets = fibLevels.map(level => lastHigh.price + range * level);
    } 
    // Bearish Breakout Check
    else if (breakoutCandle.close < lastLow.price) {
        const precedingHigh = highs.filter(h => h.index < lastLow.index).pop();
        if (!precedingHigh) return null;
        
        signal.direction = 'Short';
        signal.entryPrice = breakoutCandle.close;
        signal.stopLoss = precedingHigh.price;
        
        const range = precedingHigh.price - lastLow.price;
        if (range <= 0 || signal.stopLoss <= signal.entryPrice) return null;
        signal.targets = fibLevels.map(level => lastLow.price - range * level);
    } else {
        return null;
    }

    if (signal.direction && signal.entryPrice && signal.stopLoss && signal.targets?.length === 6) {
        return signal as BreakoutSignal;
    }
    return null;
};

export const analyzeBreakouts = (coin: Coin): BreakoutSignal[] => {
    const hourlyPrices = coin.sparkline_in_7d?.price;
    if (!hourlyPrices || hourlyPrices.length < 100) {
        return [];
    }
    
    const timeframes = [
        { name: '5m', factor: 1 },
        { name: '15m', factor: 3 },
        { name: '30m', factor: 6 },
        { name: '1h', factor: 12 },
        { name: '2h', factor: 24 },
        { name: '4h', factor: 48 },
    ];
    
    const fiveMinData = generate5minOHLCV(hourlyPrices, coin.total_volume);
    if (fiveMinData.length === 0) return [];
    
    const signals: BreakoutSignal[] = [];

    for (const tf of timeframes) {
        const ohlcv = aggregateOHLCV(fiveMinData, tf.factor);
        const signal = findBreakoutSignalForTimeframe(ohlcv, coin, tf.name);
        if (signal) {
            signals.push(signal);
        }
    }

    return signals;
};