import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY || '';

// Mock news if no API key or detailed generation fails
const MOCK_NEWS = [
  "Elon tweets about 'Doge-Computers'. Prices fluctuate.",
  "Global chip shortage eases. Mining efficiency up.",
  "New regulations on energy consumption announced.",
  "A whale just moved 10,000 BTC. Market is nervous.",
  "Ad-Revenue algorithms updated. Yields increasing."
];

export const generateMarketNews = async (currentRate: number): Promise<{ headline: string; modifier: number }> => {
  if (!API_KEY) {
    const randomMock = MOCK_NEWS[Math.floor(Math.random() * MOCK_NEWS.length)];
    return { headline: randomMock, modifier: 1.0 + (Math.random() * 0.2 - 0.1) };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const model = 'gemini-2.5-flash';
    
    const prompt = `
      You are a crypto market analyst engine for a game called 'CryptoMiner'.
      Generate a short, single-sentence news headline about the fictional 'GameCoin' market.
      Also provide a 'modifier' number between 0.8 and 1.5 representing the market multiplier effect.
      
      Return strictly a JSON object: { "headline": "string", "modifier": number }
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response");
    
    const data = JSON.parse(text);
    return { 
      headline: data.headline || "Market stable.",
      modifier: typeof data.modifier === 'number' ? data.modifier : 1.0
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return { headline: "Connection to Market Server lost. Using local cache.", modifier: 1.0 };
  }
};