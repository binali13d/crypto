import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Portfolio from './components/Portfolio';
import AiChat from './components/AiChat';
import Alerts from './components/Alerts';
import OpportunityHunter from './components/Radar';
import UmmAlAkhbar from './components/UmmAlAkhbar';
import Settings from './components/Settings';
import { MenuIcon } from './components/icons';

import { AppView, Coin, PortfolioHolding, NewsArticle, TriggeredAlert, AdvancedAlert, AdvancedAlertCondition, PortfolioHistoryPoint, AppSettings, SoundOption } from './types';
import { calculateRSI, calculateSMA } from './utils/technicalAnalysis';

// --- LOCALIZATION SYSTEM ---

const translations = {
  en: {
    common: { price: "Price", close: "Close", cancel: "Cancel", save: "Save", edit: "Edit", delete: "Delete", error: "An Error Occurred", notSet: "Not set", na: "N/A" },
    sidebar: { title: "Crypto Smart-Vest", dashboard: "Dashboard", portfolio: "Portfolio", opportunityHunter: "Opportunity Hunter", ummAlAkhbar: "Umm Al-Akhbar", aiAssistant: "AI Assistant", alerts: "Alerts", settings: "Settings", light: "Light", dark: "Dark", language: "Language", toggle: "Toggle Sidebar" },
    dashboard: { title: "Market Overview", topGainers: "Top Gainers (24h)", topLosers: "Top Losers (24h)", customize: "Customize {{title}}", gainers: "Gainers", losers: "Losers", numToShow: "Number to show", top3: "Top 3", top5: "Top 5", top10: "Top 10", minPercentChange: "Min % change", noMatchCriteria: "No {{type}} match your criteria.", table: { rank: "#", coin: "Coin", price: "Price", change24h: "24h Change", last7d: "Last 7 Days" }, tooltipPrice: "Price: ${{price}}" },
    portfolio: { title: "My Portfolio", addAsset: "Add Asset", performance: "Portfolio Performance", totalValue: "Total Value", change24h: "24h Change", totalPL: "Total P/L", empty: "Your portfolio is empty", emptyDesc: "Click 'Add Asset' to start tracking your holdings.", noHistory: "Not enough historical data to display chart.", noHistoryDesc: "Your portfolio's value will be tracked over time and displayed here.", table: { asset: "Asset", price: "Price", holdings: "Holdings", stopLoss: "Stop-Loss", pl: "P/L" }, modal: { title: "Add New Asset", coin: "Coin", quantity: "Quantity", buyPrice: "Average Buy Price", stopLoss: "Stop-Loss Price (Optional)" } },
    aiChat: { title: "AI Investment Assistant", initialMessage: "Hello! I'm Smart-Vest AI. How can I help you analyze the market or your portfolio today?", placeholder: "Ask about your portfolio or the market...", unavailable: "The AI assistant is currently unavailable because the API key is not configured.", error: "Sorry, I'm having trouble connecting right now." },
    alerts: { title: "Alerts Center", triggeredLog: "Triggered Log", activeAlerts: "Active Alerts", clearLog: "Clear Log", noTriggered: "No Triggered Alerts", noTriggeredDesc: "Your triggered stop-loss and technical alerts will appear here.", createNew: "Create New Alert", noActive: "No Active Alerts", noActiveDesc: "Click 'Create New Alert' to set up technical alerts.", modal: { title: "Create Advanced Alert", alertType: "Alert Type", coin: "Coin", rsi: "RSI crosses value", maCross: "Moving Average Crossover", listing: "New Exchange Listing (Simulated)", rsiDesc: "Alert when RSI (14) crosses", above: "above", below: "below", maCrossDesc: "Alert on SMA {{short}}/{{long}} crossover.", listingDesc: "Listing on {{exchange}} (Simulated)", exchange: "Exchange", simulatedNote: "Note: This is a simulated alert for demonstration and will not trigger automatically." } },
    radar: { title: "Breakout Signal Radar", description: "The system automatically scans multiple timeframes for swing point breakouts, calculates their volume strength, and generates a complete 6-target trading plan using Fibonacci extensions.", noSignals: "No active breakout signals found.", noSignalsDesc: "The radar is actively scanning the market. Check back soon for new opportunities.", strength: "Breakout Strength", entry: "Entry", stopLoss: "Stop Loss", targets: "Targets", copyPlan: "Copy Plan", copied: "Copied!", timeframe: "Timeframe", direction: "Type", long: "Long", short: "Short", signalTime: "Capture Time", status: "Status", statusNew: "New", statusLive: "Entry Condition Met ✔️", livePrice: "Live Price", copyTemplate: { title: "**{{direction}} Signal** 🚀", coin: "**Coin:**", timeframe: "**Timeframe:**", captureTime: "**Capture Time:**", capturePrice: "**Price at Capture:**", strength: "**Breakout Strength:**", entry: "**Entry:**", targets: "**Targets:**", stopLoss: "**Stop Loss:**" } },
    news: { title: "Umm Al-Akhbar", description: "Your central hub for the latest breaking news in the crypto market.", error: "Could not load news", timeAgo: { s: "{{count}}s ago", m: "{{count}}m ago", h: "{{count}}h ago", d: "{{count}}d ago", mo: "{{count}}mo ago", y: "{{count}}y ago" } },
    settings: { title: "Settings", audibleAlerts: "Audible Alerts", enableAlerts: "Enable sound notifications for strong signals", alertSound: "Alert Sound", sounds: { droplet: "Droplet", bell: "Bell", notification: "Notification" } },
    chartingModal: { entry: "Entry", stopLoss: "Stop-Loss", target: "TP {{level}}" }
  },
  ar: {
    common: { price: "السعر", close: "إغلاق", cancel: "إلغاء", save: "حفظ", edit: "تعديل", delete: "حذف", error: "حدث خطأ", notSet: "لم يتم التعيين", na: "غير متاح" },
    sidebar: { title: "منصة المستثمر الذكي", dashboard: "لوحة المعلومات", portfolio: "المحفظة", opportunityHunter: "صائد الفرص", ummAlAkhbar: "أم الأخبار", aiAssistant: "المساعد الذكي", alerts: "التنبيهات", settings: "الإعدادات", light: "فاتح", dark: "داكن", language: "اللغة", toggle: "تبديل الشريط الجانبي" },
    dashboard: { title: "نظرة عامة على السوق", topGainers: "الأكثر ربحًا (24 ساعة)", topLosers: "الأكثر خسارة (24 ساعة)", customize: "تخصيص {{title}}", gainers: "الرابحون", losers: "الخاسرون", numToShow: "العدد المطلوب عرضه", top3: "أفضل 3", top5: "أفضل 5", top10: "أفضل 10", minPercentChange: "أدنى نسبة تغيير", noMatchCriteria: "لا يوجد {{type}} تطابق معاييرك.", table: { rank: "#", coin: "العملة", price: "السعر", change24h: "التغيير (24 ساعة)", last7d: "آخر 7 أيام" }, tooltipPrice: "السعر: ${{price}}" },
    portfolio: { title: "محفظتي", addAsset: "إضافة أصل", performance: "أداء المحفظة", totalValue: "القيمة الإجمالية", change24h: "التغيير (24 ساعة)", totalPL: "إجمالي الربح/الخسارة", empty: "محفظتك فارغة", emptyDesc: "انقر فوق 'إضافة أصل' لبدء تتبع ممتلكاتك.", noHistory: "لا توجد بيانات تاريخية كافية لعرض الرسم البياني.", noHistoryDesc: "سيتم تتبع قيمة محفظتك بمرور الوقت وعرضها هنا.", table: { asset: "الأصل", price: "السعر", holdings: "الممتلكات", stopLoss: "إيقاف الخسارة", pl: "الربح/الخسارة" }, modal: { title: "إضافة أصل جديد", coin: "العملة", quantity: "الكمية", buyPrice: "متوسط سعر الشراء", stopLoss: "سعر إيقاف الخسارة (اختياري)" } },
    aiChat: { title: "مساعد الاستثمار الذكي", initialMessage: "أهلاً بك! أنا المساعد الذكي. كيف يمكنني مساعدتك في تحليل السوق أو محفظتك اليوم؟", placeholder: "اسأل عن محفظتك أو السوق...", unavailable: "المساعد الذكي غير متوفر حاليًا لعدم تكوين مفتاح API.", error: "عذرًا، أواجه مشكلة في الاتصال الآن." },
    alerts: { title: "مركز التنبيهات", triggeredLog: "سجل التنبيهات", activeAlerts: "التنبيهات النشطة", clearLog: "مسح السجل", noTriggered: "لا توجد تنبيهات مفعلة", noTriggeredDesc: "ستظهر هنا تنبيهات إيقاف الخسارة والتنبيهات الفنية المفعلة.", createNew: "إنشاء تنبيه جديد", noActive: "لا توجد تنبيهات نشطة", noActiveDesc: "انقر فوق 'إنشاء تنبيه جديد' لإعداد تنبيهات فنية.", modal: { title: "إنشاء تنبيه متقدم", alertType: "نوع التنبيه", coin: "العملة", rsi: "مؤشر القوة النسبية يتجاوز قيمة", maCross: "تقاطع المتوسطات المتحركة", listing: "إدراج جديد في منصة (محاكاة)", rsiDesc: "تنبيه عندما يتجاوز مؤشر القوة النسبية (14)", above: "فوق", below: "تحت", maCrossDesc: "تنبيه عند تقاطع المتوسط المتحرك البسيط {{short}}/{{long}}.", listingDesc: "إدراج في {{exchange}} (محاكاة)", exchange: "المنصة", simulatedNote: "ملاحظة: هذا تنبيه محاكاة لأغراض العرض التوضيحي ولن يتم تفعيله تلقائيًا." } },
    radar: { title: "رادار إشارات التداول", description: "يقوم النظام تلقائيًا بمسح أطر زمنية متعددة بحثًا عن اختراقات لنقاط الارتكاز (Swing Points)، ويحسب قوة حجم التداول، ويولد خطة تداول كاملة من 6 أهداف باستخدام امتدادات فيبوناتشي.", noSignals: "لم يتم العثور على إشارات اختراق نشطة.", noSignalsDesc: "الرادار يقوم بمسح السوق باستمرار. تحقق مرة أخرى قريبًا بحثًا عن فرص جديدة.", strength: "قوة الكسر", entry: "الدخول", stopLoss: "وقف الخسارة", targets: "الأهداف", copyPlan: "نسخ الخطة", copied: "تم النسخ!", timeframe: "الإطار الزمني", direction: "النوع", long: "شراء", short: "بيع", signalTime: "وقت الالتقاط", status: "الحالة", statusNew: "جديدة", statusLive: "شرط الدخول متحقق ✔️", livePrice: "السعر الحالي", copyTemplate: { title: "**إشارة {{direction}}** 🚀", coin: "**العملة:**", timeframe: "**الإطار الزمني:**", captureTime: "**وقت الالتقاط:**", capturePrice: "**السعر عند الالتقاط:**", strength: "**قوة الكسر:**", entry: "**الدخول:**", targets: "**الأهداف:**", stopLoss: "**وقف الخسارة:**" } },
    news: { title: "أم الأخبار", description: "مركزك للأخبار العاجلة في سوق العملات المشفرة.", error: "لا يمكن تحميل الأخبار", timeAgo: { s: "قبل {{count}} ثانية", m: "قبل {{count}} دقيقة", h: "قبل {{count}} ساعة", d: "قبل {{count}} يوم", mo: "قبل {{count}} شهر", y: "قبل {{count}} سنة" } },
    settings: { title: "الإعدادات", audibleAlerts: "التنبيهات الصوتية", enableAlerts: "تفعيل الإشعارات الصوتية للإشارات القوية", alertSound: "صوت التنبيه", sounds: { droplet: "Droplet", bell: "Bell", notification: "Notification" } },
    chartingModal: { entry: "الدخول", stopLoss: "وقف الخسارة", target: "الهدف {{level}}" }
  }
};

type Language = 'en' | 'ar';

interface LocalizationContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, options?: { [key: string]: string | number }) => string;
}

const LanguageContext = createContext<LocalizationContextType | null>(null);

export const useLocalization = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLocalization must be used within a LanguageProvider');
  }
  return context;
};

const getNestedTranslation = (language: Language, key: string): string | undefined => {
    const langDict = translations[language] as any;
    return key.split('.').reduce((obj, k) => (obj ? obj[k] : undefined), langDict);
};


const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => (localStorage.getItem('language') as Language) || 'en');

  useEffect(() => {
    localStorage.setItem('language', language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };
  
  const t = (key: string, options?: { [key: string]: string | number }): string => {
    let translation = getNestedTranslation(language, key);
    if (!translation) {
      // Fallback to English if translation is missing
      translation = getNestedTranslation('en', key) || key;
    }
    
    if (options) {
      Object.keys(options).forEach(k => {
        translation = translation!.replace(`{{${k}}}`, String(options[k]));
      });
    }

    return translation;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};


// --- APP COMPONENT ---

const soundOptions: SoundOption[] = [
    { name: 'droplet', url: 'https://cdn.pixabay.com/audio/2022/03/13/audio_231219d032.mp3' },
    { name: 'bell', url: 'https://cdn.pixabay.com/audio/2022/04/07/audio_87c0628e83.mp3' },
    { name: 'notification', url: 'https://cdn.pixabay.com/audio/2022/02/21/audio_d537f26532.mp3' },
];

const App: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        return 'dark';
    }
    return 'light';
  });
  const [currentView, setView] = useState<AppView>(AppView.Dashboard);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  
  const [coins, setCoins] = useState<Coin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [news, setNews] = useState<NewsArticle[]>([]);
  const [isNewsLoading, setIsNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState<string | null>(null);

  const [portfolio, setPortfolio] = useState<PortfolioHolding[]>(() => {
    try {
        const savedPortfolio = localStorage.getItem('portfolio');
        return savedPortfolio ? JSON.parse(savedPortfolio) : [];
    } catch (e) {
        return [];
    }
  });

  const [alertLog, setAlertLog] = useState<TriggeredAlert[]>(() => {
    try {
        const savedLog = localStorage.getItem('alertLog');
        return savedLog ? JSON.parse(savedLog) : [];
    } catch (e) {
        return [];
    }
  });
  const [advancedAlerts, setAdvancedAlerts] = useState<AdvancedAlert[]>(() => {
    try {
        const savedAlerts = localStorage.getItem('advancedAlerts');
        return savedAlerts ? JSON.parse(savedAlerts) : [];
    } catch (e) {
        return [];
    }
  });

  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistoryPoint[]>(() => {
    try {
        const savedHistory = localStorage.getItem('portfolioHistory');
        return savedHistory ? JSON.parse(savedHistory) : [];
    } catch (e) {
        return [];
    }
  });
  
  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    try {
      const savedSettings = localStorage.getItem('appSettings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        // Ensure the selected sound object is valid
        const soundExists = soundOptions.some(opt => opt.url === parsed.selectedSound.url);
        if (soundExists) {
          return parsed;
        }
      }
    } catch (e) {
      // Fallback to default if parsing fails or data is invalid
    }
    return { isSoundEnabled: true, selectedSound: soundOptions[0] };
  });


  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);
  
  useEffect(() => { localStorage.setItem('portfolio', JSON.stringify(portfolio)); }, [portfolio]);
  useEffect(() => { localStorage.setItem('alertLog', JSON.stringify(alertLog)); }, [alertLog]);
  useEffect(() => { localStorage.setItem('advancedAlerts', JSON.stringify(advancedAlerts)); }, [advancedAlerts]);
  useEffect(() => { localStorage.setItem('portfolioHistory', JSON.stringify(portfolioHistory)); }, [portfolioHistory]);
  useEffect(() => { localStorage.setItem('appSettings', JSON.stringify(appSettings)); }, [appSettings]);


  const fetchCoinData = useCallback(async () => {
    // Keep setIsLoading true only on the first load, not subsequent refreshes
    if (coins.length === 0) {
        setIsLoading(true);
    }
    setError(null);
    try {
      const pagesToFetch = [1, 2, 3];
      const perPage = 200;

      const promises = pagesToFetch.map(page =>
        fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=true&price_change_percentage=24h`)
          .then(res => {
            if (!res.ok) {
              throw new Error(`Failed to fetch coin data (page ${page}): ${res.statusText}`);
            }
            return res.json() as Promise<Coin[]>;
          })
      );

      const results = await Promise.all(promises);
      const allCoins: Coin[] = results.flat();

      setCoins(allCoins);
      // Update portfolio with fresh coin data
      setPortfolio(prev => prev.map(holding => {
          const updatedCoin = allCoins.find(c => c.id === holding.coin.id);
          return updatedCoin ? { ...holding, coin: updatedCoin } : holding;
      }));
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred while fetching market data.');
    } finally {
      setIsLoading(false);
    }
  }, [coins.length]);

  const fetchNewsData = useCallback(async () => {
    setIsNewsLoading(true);
    setNewsError(null);
    try {
        const response = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN');
        if (!response.ok) {
            throw new Error(`Failed to fetch news: ${response.statusText}`);
        }
        const data = await response.json();
        if (data.Type !== 100) {
            throw new Error(data.Message || 'Failed to fetch news data.');
        }
        setNews(data.Data);
    } catch (err: any) {
        setNewsError(err.message || 'An unknown error occurred while fetching news.');
    } finally {
        setIsNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoinData();
    fetchNewsData();
    const interval = setInterval(() => {
        fetchCoinData();
    }, 60000); // Refresh every 60 seconds
    return () => clearInterval(interval);
  }, [fetchCoinData, fetchNewsData]);

  // Track Portfolio History
  useEffect(() => {
    if (isLoading) return; // Wait for initial data load

    const totalValue = portfolio.reduce((acc, h) => acc + (h.coin.current_price * h.quantity), 0);
    if (totalValue <= 0) return;

    setPortfolioHistory(prevHistory => {
        const lastEntry = prevHistory.length > 0 ? prevHistory[prevHistory.length - 1] : null;
        const ONE_HOUR = 60 * 60 * 1000;

        // If no entries yet, or last entry is older than an hour, add a new one.
        if (!lastEntry || Date.now() - lastEntry.timestamp > ONE_HOUR) {
            return [...prevHistory, { timestamp: Date.now(), value: totalValue }];
        }
        
        // Otherwise, do not modify the history. The live chart will handle the current value.
        return prevHistory;
    });
  }, [portfolio, isLoading]);


  // Alert Checking Logic (simulated)
  useEffect(() => {
      const checkAlerts = () => {
          if (!coins.length) return;
          let triggered = false;

          // Check stop-loss alerts from portfolio
          portfolio.forEach(holding => {
              if (holding.stopLoss && holding.coin.current_price <= holding.stopLoss) {
                  const alreadyTriggered = alertLog.find(a => a.id === `sl-${holding.id}` && (Date.now() - a.triggeredAt < 3600000)); // Don't re-trigger within an hour
                  if (!alreadyTriggered) {
                      setAlertLog(prev => [{
                          id: `sl-${holding.id}`,
                          coinId: holding.coin.id,
                          coinName: holding.coin.name,
                          coinSymbol: holding.coin.symbol,
                          coinImage: holding.coin.image,
                          description: `Stop-loss triggered! Price dropped to $${holding.coin.current_price.toLocaleString()}, below your set price of $${holding.stopLoss.toLocaleString()}.`,
                          triggeredAt: Date.now(),
                      }, ...prev]);
                      triggered = true;
                  }
              }
          });

          // Check advanced alerts
          advancedAlerts.forEach(alert => {
              const coin = coins.find(c => c.id === alert.coinId);
              if (!coin) return;

              let description = '';

              if (alert.type === 'rsi') {
                  const rsi = calculateRSI(coin.sparkline_in_7d.price, alert.period);
                  if (rsi !== null) {
                      if (alert.condition === AdvancedAlertCondition.ABOVE && rsi > alert.value) {
                          description = `RSI (${alert.period}) crossed above ${alert.value}, currently at ${rsi.toFixed(2)}.`;
                      } else if (alert.condition === AdvancedAlertCondition.BELOW && rsi < alert.value) {
                           description = `RSI (${alert.period}) crossed below ${alert.value}, currently at ${rsi.toFixed(2)}.`;
                      }
                  }
              } else if (alert.type === 'ma_cross') {
                  const prices = coin.sparkline_in_7d.price;
                  if (prices.length > alert.longPeriod) {
                      const shortMA = calculateSMA(prices, alert.shortPeriod);
                      const longMA = calculateSMA(prices, alert.longPeriod);
                      const lastShort = shortMA[shortMA.length-1];
                      const prevShort = shortMA[shortMA.length-2];
                      const lastLong = longMA[longMA.length-1];
                      const prevLong = longMA[longMA.length-2];

                      if (prevShort && prevLong && lastShort > lastLong && prevShort <= prevLong) {
                          description = `Golden Cross detected: SMA(${alert.shortPeriod}) crossed above SMA(${alert.longPeriod}).`;
                      } else if (prevShort && prevLong && lastShort < lastLong && prevShort >= prevLong) {
                          description = `Death Cross detected: SMA(${alert.shortPeriod}) crossed below SMA(${alert.longPeriod}).`;
                      }
                  }
              }

              if (description) {
                   const alreadyTriggered = alertLog.find(a => a.id === `adv-${alert.id}` && (Date.now() - a.triggeredAt < 3600000));
                   if (!alreadyTriggered) {
                        setAlertLog(prev => [{
                          id: `adv-${alert.id}`,
                          coinId: coin.id,
                          coinName: coin.name,
                          coinSymbol: coin.symbol,
                          coinImage: coin.image,
                          description,
                          triggeredAt: Date.now(),
                        }, ...prev]);
                        triggered = true;
                   }
              }
          });
          
          if(triggered) {
            // Optional: Show a notification
          }
      };

      const interval = setInterval(checkAlerts, 15000); // Check every 15 seconds
      return () => clearInterval(interval);
  }, [coins, portfolio, advancedAlerts, alertLog]);


  const renderView = () => {
    switch (currentView) {
      case AppView.Dashboard:
        return <Dashboard coins={coins} isLoading={isLoading} error={error} />;
      case AppView.Portfolio:
        return <Portfolio portfolio={portfolio} setPortfolio={setPortfolio} coins={coins} isLoading={isLoading} portfolioHistory={portfolioHistory} />;
      case AppView.AiChat:
        return <AiChat portfolio={portfolio} />;
      case AppView.Alerts:
        return <Alerts alertLog={alertLog} setAlertLog={setAlertLog} advancedAlerts={advancedAlerts} setAdvancedAlerts={setAdvancedAlerts} coins={coins} />;
      case AppView.OpportunityHunter:
          return <OpportunityHunter coins={coins} appSettings={appSettings} />;
       case AppView.UmmAlAkhbar:
          return <UmmAlAkhbar news={news} isNewsLoading={isNewsLoading} newsError={newsError} />;
      case AppView.Settings:
          return <Settings appSettings={appSettings} setAppSettings={setAppSettings} soundOptions={soundOptions} />;
      default:
        return <Dashboard coins={coins} isLoading={isLoading} error={error} />;
    }
  };
  
  const Header = () => {
    const { t } = useLocalization();
    return (
        <header className="flex-shrink-0 bg-white dark:bg-[#2C2C2E] border-b border-gray-200 dark:border-white/10 flex items-center p-2">
            <button
                onClick={() => setIsSidebarVisible(!isSidebarVisible)}
                className="p-2 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                aria-label={t('sidebar.toggle')}
            >
                <MenuIcon />
            </button>
        </header>
    );
  };

  return (
    <LanguageProvider>
        <div className="flex h-screen bg-gray-100 dark:bg-[#1e2230] text-gray-900 dark:text-gray-100 font-sans">
        <Sidebar 
            currentView={currentView} 
            setView={setView} 
            theme={theme} 
            setTheme={setTheme}
            isVisible={isSidebarVisible}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto">
                {renderView()}
            </main>
        </div>
        </div>
    </LanguageProvider>
  );
};

export default App;