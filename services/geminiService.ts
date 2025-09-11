import { GoogleGenAI } from "@google/genai";
import type { PortfolioHolding } from '../types';

const API_KEY = process.env.API_KEY;

let ai: GoogleGenAI | null = null;
try {
  // Initialize only if the API key is present and valid.
  if (API_KEY) {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  } else {
    // This case is for when the env var is not present at all.
    console.warn("API_KEY environment variable not set. AI features will be disabled.");
  }
} catch (error) {
  // This case handles invalid keys (e.g., empty string or malformed).
  console.error("Failed to initialize GoogleGenAI, likely due to an invalid API_KEY:", error);
  ai = null; // Ensure ai is null on failure so the app doesn't crash.
}


export const getAiResponse = async (
    message: string, 
    portfolio: PortfolioHolding[],
    chatHistory: { role: string; parts: { text: string }[] }[]
): Promise<string> => {
  // Check for the initialized 'ai' instance. This will be null if the API key was missing or invalid.
  if (!ai) {
    return "The AI assistant is currently unavailable because the API key is not configured.";
  }

  try {
    const model = 'gemini-2.5-flash';
    
    let portfolioSummary = "The user has no holdings.";
    let portfolioContext = "";

    if (portfolio.length > 0) {
        const totalCurrentValue = portfolio.reduce((acc, holding) => acc + (holding.coin.current_price * holding.quantity), 0);
        const totalInitialValue = portfolio.reduce((acc, holding) => acc + (holding.buyPrice * holding.quantity), 0);
        const totalPnl = totalCurrentValue - totalInitialValue;
        const totalPnlPercentage = totalInitialValue > 0 ? (totalPnl / totalInitialValue) * 100 : 0;
        const totalPnlSign = totalPnl >= 0 ? '+' : '';

        const portfolioDetails = portfolio.map(p => {
            const currentValue = p.quantity * p.coin.current_price;
            const initialValue = p.quantity * p.buyPrice;
            const portfolioPercentage = totalCurrentValue > 0 ? (currentValue / totalCurrentValue) * 100 : 0;
            const pnl = currentValue - initialValue;
            const pnlPercentage = initialValue > 0 ? (pnl / initialValue) * 100 : 0;
            const pnlSign = pnl >= 0 ? '+' : '';

            return `- ${p.quantity} ${p.coin.symbol.toUpperCase()}: Value $${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${portfolioPercentage.toFixed(2)}% of portfolio). P/L: ${pnlSign}$${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pnlSign}${pnlPercentage.toFixed(2)}%)`;
        }).join('\n');
        
        portfolioContext = `
Current Portfolio Context:
- Total Value: $${totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Overall P/L: ${totalPnlSign}$${Math.abs(totalPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${totalPnlSign}${totalPnlPercentage.toFixed(2)}%)
`;
        portfolioSummary = `Here is the user's current portfolio breakdown:\n${portfolioDetails}`;
    }

    const systemInstruction = `You are "Smart-Vest AI", an expert crypto investment assistant integrated into the 'Crypto Smart-Vest' platform. Your goal is to provide insightful, data-driven, and concise analysis. You MUST NOT give financial advice, but you can analyze data and provide helpful information and potential strategies.
${portfolioContext}
${portfolioSummary}

Your Task:
1.  **Analyze Portfolio Health:** Briefly comment on the overall performance (e.g., the overall P/L percentage).
2.  **Assess Allocation & Diversification:** Look at the distribution of assets. Is the portfolio concentrated in a few assets?
3.  **Provide Actionable Insights & Suggestions (as informational examples, NOT financial advice):**
    -   If the portfolio lacks diversification, suggest exploring specific crypto sectors. For example: "Your portfolio seems focused on Layer 1s. You might consider researching assets in other sectors like DeFi, Gaming/Metaverse, or Oracles to potentially spread risk."
    -   Identify high-risk positions (e.g., a single volatile asset making up a large percentage of the portfolio) and suggest considering risk management strategies. For instance: "Your position in [COIN] has performed well and now represents a significant part of your portfolio. One common strategy in this situation is to consider taking some profits to rebalance and reduce concentration risk."
    -   Based on the user's prompt, provide analysis that connects their question to their specific holdings.

Answer in a helpful and informative tone. Keep your responses structured and easy to read.`;

    const fullContents = [
        ...chatHistory,
        { role: 'user', parts: [{ text: message }] }
    ];

    const response = await ai.models.generateContent({
        model: model,
        contents: fullContents,
        config: {
            systemInstruction: systemInstruction,
        },
    });

    return response.text;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "Sorry, I encountered an error while processing your request. Please try again later.";
  }
};