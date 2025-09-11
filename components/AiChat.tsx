import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, PortfolioHolding } from '../types';
import { MessageSender } from '../types';
import { getAiResponse } from '../services/geminiService';
import { SendIcon } from './icons';
import Spinner from './Spinner';
import Card from './Card';
import { useLocalization } from '../App';

interface AiChatProps {
    portfolio: PortfolioHolding[];
}

const AiChat: React.FC<AiChatProps> = ({ portfolio }) => {
    const { t } = useLocalization();
    const [messages, setMessages] = useState<ChatMessage[]>([
        { sender: MessageSender.AI, text: t('aiChat.initialMessage') }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (input.trim() === '' || isLoading) return;
        
        const userMessage: ChatMessage = { sender: MessageSender.USER, text: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        // Convert ChatMessage[] to the history format expected by geminiService
        const chatHistory = messages.map(msg => ({
            role: msg.sender === MessageSender.USER ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));

        try {
            const aiText = await getAiResponse(input, portfolio, chatHistory);
            let textToShow = aiText;
            if (aiText.includes("API key is not configured")) {
                textToShow = t('aiChat.unavailable');
            }
            const aiMessage: ChatMessage = { sender: MessageSender.AI, text: textToShow };
            setMessages(prev => [...prev, aiMessage]);
        } catch (error) {
            const errorMessage: ChatMessage = { sender: MessageSender.AI, text: t('aiChat.error') };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col p-4 md:p-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">{t('aiChat.title')}</h1>
            <Card className="flex-1 flex flex-col p-4 overflow-hidden">
                <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex ${msg.sender === MessageSender.USER ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-lg p-3 rounded-2xl ${msg.sender === MessageSender.USER ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-200 dark:bg-[#383F58] text-gray-800 dark:text-gray-200 rounded-bl-none'}`}>
                                <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</p>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                             <div className="max-w-lg p-3 rounded-2xl bg-gray-200 dark:bg-[#383F58] text-gray-800 dark:text-gray-200 rounded-bl-none">
                                <Spinner />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <div className="mt-4 flex items-center space-x-2 rtl:space-x-reverse border-t border-gray-200 dark:border-white/10 pt-4">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                        placeholder={t('aiChat.placeholder')}
                        className="flex-1 bg-transparent border border-gray-300 dark:border-white/20 rounded-lg p-2 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={isLoading}
                    />
                    <button onClick={handleSend} disabled={isLoading} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition">
                       <SendIcon className="w-5 h-5"/>
                    </button>
                </div>
            </Card>
        </div>
    );
};

export default AiChat;