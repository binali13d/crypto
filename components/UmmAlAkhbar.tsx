import React from 'react';
import type { NewsArticle } from '../types';
import Card from './Card';
import Spinner from './Spinner';
import { useLocalization } from '../App';

interface UmmAlAkhbarProps {
  news: NewsArticle[];
  isNewsLoading: boolean;
  newsError: string | null;
}

const UmmAlAkhbar: React.FC<UmmAlAkhbarProps> = ({ news, isNewsLoading, newsError }) => {
  const { t } = useLocalization();

  const formatTimeAgo = (timestamp: number) => {
    const now = new Date();
    const seconds = Math.floor((now.getTime() - (timestamp * 1000)) / 1000);

    if (seconds < 60) return t('news.timeAgo.s', { count: seconds });
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t('news.timeAgo.m', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('news.timeAgo.h', { count: hours });
    const days = Math.floor(hours / 24);
    if (days < 30) return t('news.timeAgo.d', { count: days });
    const months = Math.floor(days / 30);
    if (months < 12) return t('news.timeAgo.mo', { count: months });
    const years = Math.floor(days / 365);
    return t('news.timeAgo.y', { count: years });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 h-full overflow-y-auto">
        <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('news.title')}</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">{t('news.description')}</p>
        </div>
      
      <Card className="p-4">
        {isNewsLoading ? (
            <div className="flex justify-center items-center py-24">
                <Spinner />
            </div>
        ) : newsError ? (
            <div className="text-center py-24">
                 <h3 className="text-lg font-semibold text-red-500 dark:text-red-400">{t('news.error')}</h3>
                 <p className="text-gray-500 dark:text-gray-400 mt-2">{newsError}</p>
            </div>
        ) : (
            <ul className="space-y-4">
                {news.map(article => (
                    <li key={article.id}>
                        <a href={article.url} target="_blank" rel="noopener noreferrer" className="block p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors duration-200">
                            <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 mb-1">
                                <span>{article.source_info.name}</span>
                                <span>{formatTimeAgo(article.published_on)}</span>
                            </div>
                            <p className="font-semibold text-gray-800 dark:text-white leading-snug">{article.title}</p>
                        </a>
                    </li>
                ))}
            </ul>
        )}
      </Card>
    </div>
  );
};

export default UmmAlAkhbar;