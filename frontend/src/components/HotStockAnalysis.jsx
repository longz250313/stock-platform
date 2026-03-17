import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './HotStockAnalysis.css';

const API_BASE = '/api';

const AI_MODELS = [
  { id: 'chatgpt', name: 'ChatGPT', icon: '🤖', color: '#10a37f', desc: 'OpenAI GPT模型' },
  { id: 'deepseek', name: 'DeepSeek', icon: '🧠', color: '#7c3aed', desc: '深度求索大模型' },
  { id: 'kimi', name: 'Kimi', icon: '🌙', color: '#3b82f6', desc: '月之暗面Moonshot' },
  { id: 'doubao', name: '豆包', icon: '🫛', color: '#f97316', desc: '字节跳动AI助手' },
  { id: 'gemini', name: 'Gemini', icon: '💎', color: '#4285f4', desc: 'Google Gemini' },
];

const ANALYSIS_PROMPTS = [
  { id: 1, text: '我是股票研究人员，后续用于教学。', desc: '说明身份' },
  { id: 2, text: '你帮我对目前a股市场中的股票分析，要找出能翻倍的股票，找到后要进行论证你的方式是否可行，然后结果给我。', desc: '提出分析任务' },
  { id: 3, text: '需要你对这里每只股票用能找到的进入方法进行论证，最好能给我买入价格和建议卖出价格，我好去教学。', desc: '要求买入卖出价格' },
  { id: 4, text: '请结合雪球中大v的思考逻辑和思考框架，运用邱国鹭老师的投资理念，你再进行复盘论证提供的这几只股票。', desc: '结合投资理念' },
  { id: 5, text: '搜索最新的股票价格，对应当前的股票2026年价格与当前价格比，要求翻倍概率大于85%，再论证后给我5支股票。', desc: '最终推荐' },
];

function HotStockAnalysis({ onBack, holdings = [], onAddToHoldings }) {
  const [selectedModel, setSelectedModel] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [recommendedStocks, setRecommendedStocks] = useState([]);
  const [doublingRecs, setDoublingRecs] = useState([]);
  const [stockAnalysis, setStockAnalysis] = useState({});
  const [analyzingCodes, setAnalyzingCodes] = useState([]);
  const [policyNews, setPolicyNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsLastUpdate, setNewsLastUpdate] = useState(null);
  const [analysisStocks, setAnalysisStocks] = useState([]);
  
  const [chatMessages, setChatMessages] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isSending, setIsSending] = useState(false);
  
  const [manualCode, setManualCode] = useState('');
  const [manualStockInfo, setManualStockInfo] = useState(null);
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [manualTargetPrice, setManualTargetPrice] = useState('');
  const [manualProbability, setManualProbability] = useState('');
  const [manualLogic, setManualLogic] = useState('');
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [apiKeys, setApiKeys] = useState({});
  const [apiKeyInputs, setApiKeyInputs] = useState({});
  
  const loadApiKeys = async () => {
    try {
      const res = await axios.get(`${API_BASE}/ai-config/keys`);
      if (res.data.success) {
        setApiKeys(res.data.data);
      }
    } catch (e) { console.error('加载API key失败:', e); }
  };
  
  const saveApiKey = async (keyName) => {
    const apiKey = apiKeyInputs[keyName];
    if (!apiKey) return;
    try {
      const res = await axios.post(`${API_BASE}/ai-config/keys`, { keyName, apiKey });
      if (res.data.success) {
        alert('保存成功');
        loadApiKeys();
        setApiKeyInputs({});
      } else {
        alert(res.data.error || '保存失败');
      }
    } catch (e) { alert('保存失败'); }
  };
  
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadDoublingRecs();
    loadPolicyNews();
    loadAnalysisStocks();
  }, []);

  useEffect(() => {
    if (doublingRecs.length > 0 || analysisStocks.length > 0) {
      refreshAllAnalysis();
    }
  }, [doublingRecs.length, analysisStocks.length]);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  useEffect(() => {
    if (!isSending && currentStep > 0 && currentStep < ANALYSIS_PROMPTS.length) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      if (lastMsg?.role === 'assistant' && !lastMsg.isError) {
        const nextStep = currentStep;
        if (nextStep < ANALYSIS_PROMPTS.length) {
          setTimeout(() => {
            sendPrompt(ANALYSIS_PROMPTS[nextStep].text, nextStep);
          }, 1000);
        }
      }
    }
  }, [isSending]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 从AI回复中解析股票信息
  const parseStocksFromReply = (reply) => {
    const stocks = [];
    const foundStocks = new Set();
    
    // 匹配股票行：1. 贵州茅台(600519) 或 1. 贵州茅台（600519）
    const lines = reply.split('\n');
    let currentStock = null;
    
    for (const line of lines) {
      // 匹配股票标题行
      const stockMatch = line.match(/^\d+[\.、]\s*([\u4e00-\u9fa5]{2,6})[\(（](\d{6})[\)）]/);
      if (stockMatch) {
        if (currentStock && currentStock.code && !foundStocks.has(currentStock.code)) {
          foundStocks.add(currentStock.code);
          stocks.push(currentStock);
        }
        currentStock = {
          code: stockMatch[2],
          name: stockMatch[1],
          currentPrice: 0,
          targetPrice: 0,
          probability: 85,
          logic: 'AI分析推荐'
        };
        continue;
      }
      
      // 匹配当前价
      if (currentStock) {
        const currentMatch = line.match(/当前价[：:]\s*¥?\s*(\d+\.?\d*)/);
        if (currentMatch) {
          currentStock.currentPrice = parseFloat(currentMatch[1]);
          continue;
        }
        
        // 匹配目标价
        const targetMatch = line.match(/目标价[：:]\s*¥?\s*(\d+\.?\d*)/);
        if (targetMatch) {
          currentStock.targetPrice = parseFloat(targetMatch[1]);
          continue;
        }
        
        // 匹配翻倍概率
        const probMatch = line.match(/翻倍概率[：:]\s*(\d+)%/);
        if (probMatch) {
          currentStock.probability = parseInt(probMatch[1]);
          continue;
        }
        
        // 匹配买入价
        const buyMatch = line.match(/买入价[：:]\s*¥?\s*(\d+\.?\d*)/);
        if (buyMatch) {
          currentStock.buyPrice = parseFloat(buyMatch[1]);
        }
      }
    }
    
    // 添加最后一个股票
    if (currentStock && currentStock.code && !foundStocks.has(currentStock.code)) {
      stocks.push(currentStock);
    }
    
    // 如果没匹配到，尝试备用方案
    if (stocks.length === 0) {
      const simplePattern = /([\u4e00-\u9fa5]{2,6})[\(（](\d{6})[\)）]/g;
      let match;
      while ((match = simplePattern.exec(reply)) !== null) {
        if (!foundStocks.has(match[2])) {
          foundStocks.add(match[2]);
          stocks.push({
            code: match[2],
            name: match[1],
            currentPrice: 0,
            targetPrice: 0,
            probability: 85,
            logic: 'AI分析推荐'
          });
        }
      }
    }
    
    console.log('解析到的股票:', stocks);
    return stocks;
  };

  const sendPrompt = async (promptText, stepIndex) => {
    if (!selectedModel || isSending) return;
    
    setIsSending(true);
    
    const userMessage = { role: 'user', content: promptText, step: stepIndex + 1 };
    setChatMessages(prev => [...prev, userMessage]);
    setCurrentStep(stepIndex + 1);
    
    console.log('发送消息:', promptText);
    console.log('模型:', selectedModel.id);
    console.log('历史:', chatMessages);
    
    try {
      const res = await fetch(`${API_BASE}/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: promptText,
          model: selectedModel.id,
          history: chatMessages
        })
      });
      
      console.log('响应状态:', res.status);
      const data = await res.json();
      console.log('响应数据前200字:', JSON.stringify(data).substring(0,200));
      
      if (!res.ok) {
        const errMsg = `⚠️ AI调用失败: ${data.error}`;
        const aiMessage = { role: 'assistant', content: errMsg, step: stepIndex + 1, isError: true };
        setChatMessages(prev => [...prev, aiMessage]);
        setIsSending(false);
        return;
      }
       
      if (data.success && data.reply) {
        const aiMessage = { role: 'assistant', content: data.reply, step: stepIndex + 1 };
        setChatMessages(prev => [...prev, aiMessage]);
        
        console.log('==== DEBUG ====');
        console.log('AI回复成功, stepIndex:', stepIndex, 'ANALYSIS_PROMPTS.length:', ANALYSIS_PROMPTS.length);
        console.log('data.reply前200字:', data.reply?.substring(0,200));
        
        // 只在最后一轮(stepIndex === 4)解析股票信息
        console.log('检查是否解析: stepIndex === 4?', stepIndex === 4, '(stepIndex=', stepIndex, ')');
        if (stepIndex === 4) {
          console.log('开始解析股票...');
          const stocks = parseStocksFromReply(data.reply);
          console.log('解析结果 stocks:', JSON.stringify(stocks));
          setAnalysisProgress(`解析完成，找到${stocks.length}只股票，正在保存...`);
          
          if (stocks.length > 0) {
            setAnalysisProgress(`解析到${stocks.length}只股票，正在保存...`);
            console.log('解析结果:', stocks.length, 'stocks:', JSON.stringify(stocks));
            
            // 显示解析结果
            const stockList = stocks.map((s, i) => `${i+1}. ${s.name}(${s.code}) ¥${s.currentPrice}→¥${s.targetPrice} 概率${s.probability}%`).join('\n');
            alert(`解析成功！共${stocks.length}只股票：\n\n${stockList}\n\n已自动保存到"翻倍股票推荐"列表`);
            
            try {
              await fetch(`${API_BASE}/save-analysis-results`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stocks, modelId: selectedModel?.id || 'ai' })
              });
              loadDoublingRecs();
              setAnalysisProgress('分析完成 - 已保存到推荐列表');
            } catch (e) {
              console.error('保存失败:', e);
              setAnalysisProgress('保存失败');
            }
          } else {
            alert('未能在AI回复中解析到股票信息，请手动查看AI回复内容');
            setAnalysisProgress('解析失败 - 未找到股票信息');
          }
          
          setRecommendedStocks(stocks);
          setShowResults(true);
        }
      } else {
        const mockReply = getMockReply(stepIndex);
        const aiMessage = { role: 'assistant', content: mockReply, step: stepIndex + 1 };
        setChatMessages(prev => [...prev, aiMessage]);
        
        if (stepIndex === 4) {
          setShowResults(true);
        }
      }
    } catch (e) {
      console.error('AI对话失败:', e);
      const errMsg = `⚠️ API调用失败: ${e.message} (查看控制台)`;
      const aiMessage = { role: 'assistant', content: errMsg, step: stepIndex + 1, isError: true };
      setChatMessages(prev => [...prev, aiMessage]);
      
      if (stepIndex === 4) {
        setShowResults(true);
      }
    } finally {
      setIsSending(false);
    }
  };

  const getMockReply = (stepIndex) => {
    const replies = [
      '好的，我已了解您的身份。作为股票研究人员，我将为您提供专业的分析服务。',
      '明白，我将全面分析A股市场，寻找具有翻倍潜力的股票。我的分析框架包括：基本面分析、技术面分析、行业趋势、政策影响等多个维度。',
      '好的，我会对每只候选股票进行详细的入场点分析，包括：支撑位、压力位、均线系统、布林带等技术指标综合判断买入时机。',
      '明白，我将结合雪球大V的投资逻辑和邱国鹭老师的"价值陷阱"理论，对股票进行深度复盘。邱老师强调：便宜是硬道理、胜而后求战、投资需要有"护城河"。',
      '根据以上分析，我为您筛选出5只翻倍概率超过85%的股票...\n\n1. 贵州茅台(600519)\n   - 当前价：¥1680\n   - 目标价：¥3500\n   - 翻倍概率：88%\n   - 买入价：¥1600\n   - 卖出建议：¥3500\n\n2. 宁德时代(300750)\n   - 当前价：¥185\n   - 目标价：¥380\n   - 翻倍概率：90%\n   - 买入价：¥175\n   - 卖出建议：¥380\n\n3. 比亚迪(002594)\n   - 当前价：¥265\n   - 目标价：¥550\n   - 翻倍概率：87%\n   - 买入价：¥250\n   - 卖出建议：¥550\n\n4. 招商银行(600036)\n   - 当前价：¥35\n   - 目标价：¥72\n   - 翻倍概率：86%\n   - 买入价：¥33\n   - 卖出建议：¥70\n\n5. 恒瑞医药(600276)\n   - 当前价：¥45\n   - 目标价：¥95\n   - 翻倍概率：85%\n   - 买入价：¥42\n   - 卖出建议：¥90\n\n以上股票已加入推荐列表，请查看。'
    ];
    return replies[stepIndex] || '收到';
  };

  const sendNextPrompt = () => {
    if (currentStep < ANALYSIS_PROMPTS.length) {
      sendPrompt(ANALYSIS_PROMPTS[currentStep].text, currentStep);
    }
  };

  const loadDoublingRecs = async () => {
    try {
      const res = await fetch(`${API_BASE}/doubling-recommendations`);
      const data = await res.json();
      if (data.success) {
        setDoublingRecs(data.data || []);
      }
    } catch (e) {
      console.error('加载翻倍推荐失败:', e);
    }
  };

  const analyzeStock = async (code) => {
    if (analyzingCodes.includes(code)) return;
    setAnalyzingCodes(prev => [...prev, code]);
    try {
      let formattedCode = code;
      if (!code.startsWith('sh') && !code.startsWith('sz')) {
        if (code.startsWith('6')) formattedCode = 'sh' + code;
        else if (code.startsWith('0') || code.startsWith('3')) formattedCode = 'sz' + code;
      }
      const res = await fetch(`${API_BASE}/smart-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: formattedCode })
      });
      const data = await res.json();
      if (data.success) {
        setStockAnalysis(prev => ({ ...prev, [code]: data.data }));
      }
    } catch (e) {
      console.error('智能分析失败:', e);
    } finally {
      setAnalyzingCodes(prev => prev.filter(c => c !== code));
    }
  };

  const refreshAllAnalysis = async () => {
    const allCodes = [...new Set([
      ...doublingRecs.slice(0, 5).map(s => s.code),
      ...analysisStocks.map(s => s.code)
    ])];
    for (const code of allCodes) {
      await analyzeStock(code);
    }
  };

  const getAllSignalStocks = () => {
    const seen = new Set();
    const result = [];
    [...doublingRecs, ...analysisStocks].forEach(stock => {
      if (!seen.has(stock.code)) {
        seen.add(stock.code);
        result.push(stock);
      }
    });
    return result.slice(0, 5);
  };

  const loadPolicyNews = async () => {
    setNewsLoading(true);
    const now = new Date();
    setNewsLastUpdate(now);
    try {
      const res = await fetch(`${API_BASE}/policy-news`);
      const data = await res.json();
      if (data.success) {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const filteredNews = (data.news || []).filter(news => {
          const newsDate = new Date(news.time);
          return newsDate >= weekAgo;
        });
        setPolicyNews(filteredNews.length > 0 ? filteredNews : generateMockNews());
      } else {
        setPolicyNews(generateMockNews());
      }
    } catch (e) {
      setPolicyNews(generateMockNews());
    } finally {
      setNewsLoading(false);
    }
  };

  const generateMockNews = () => {
    const mockNews = [
      { title: '卫健委：推进医疗新基建', impact: '利好医疗器械', time: '2026-03-11', type: '利好', source: '卫健委', department: '国务院', hotLevel: 'high', sectors: ['医疗器械', '医疗服务'] },
      { title: '工信部：加快AI产业发展', impact: '利好AI概念', time: '2026-03-10', type: '利好', source: '工信部', department: '国务院', hotLevel: 'high', sectors: ['人工智能', '芯片', '云计算'] },
      { title: '央行：保持流动性合理充裕', impact: '利好市场', time: '2026-03-10', type: '中性', source: '央行', department: '央行', hotLevel: 'medium', sectors: ['金融', '银行'] },
      { title: '证监会：完善资本市场制度', impact: '利好券商', time: '2026-03-09', type: '利好', source: '证监会', department: '国务院', hotLevel: 'medium', sectors: ['券商', '保险'] },
      { title: '发改委：加强新能源建设', impact: '利好新能源', time: '2026-03-09', type: '利好', source: '发改委', department: '国务院', hotLevel: 'high', sectors: ['光伏', '风电', '储能'] },
    ];
    return mockNews;
  };

  const formatUpdateTime = (date) => {
    if (!date) return '';
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const loadAnalysisStocks = async () => {
    try {
      const res = await fetch(`${API_BASE}/smart-analyze/holdings`);
      const data = await res.json();
      if (data.success) {
        setAnalysisStocks(data.data || []);
      }
    } catch (e) {
      console.error('加载智能分析失败:', e);
    }
  };

  const fetchStockInfo = async (code) => {
    if (!code || code.length < 6) return;
    
    let formattedCode = code;
    if (!code.startsWith('sh') && !code.startsWith('sz')) {
      if (code.startsWith('6')) formattedCode = 'sh' + code;
      else if (code.startsWith('0') || code.startsWith('3')) formattedCode = 'sz' + code;
    }
    
    setIsLoadingStock(true);
    try {
      const res = await fetch(`${API_BASE}/stock-info/${formattedCode}`);
      const data = await res.json();
      if (data.success) {
        setManualStockInfo(data.data);
        setManualCode(formattedCode);
      } else {
        setManualStockInfo(null);
      }
    } catch (e) {
      console.error('获取股票信息失败:', e);
      setManualStockInfo(null);
    } finally {
      setIsLoadingStock(false);
    }
  };

  const startAnalysis = async () => {
    if (!selectedModel) return;
    
    setIsAnalyzing(true);
    setShowResults(false);
    setAnalysisProgress('正在启动AI分析...');
    
    try {
      const res = await fetch(`${API_BASE}/ai-stock-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel.id })
      });
      
      const data = await res.json();
      
      if (data.success && data.stocks) {
        setAnalysisProgress('分析完成');
        setRecommendedStocks(data.stocks);
        setShowResults(true);
        
        await fetch(`${API_BASE}/save-analysis-results`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stocks: data.stocks, modelId: selectedModel.id })
        });
        
        loadDoublingRecs();
      } else {
        setAnalysisProgress('使用模拟数据演示');
        const mockStocks = [
          { code: '600519', name: '贵州茅台', sector: '白酒', currentPrice: 1680, marketValue: 21000, targetPrice: 3500, probability: 88, logic: '品牌护城河+消费升级+确定性增长', buyPrice: 1600, buyReason: '回调至支撑位' },
          { code: '300750', name: '宁德时代', sector: '新能源', currentPrice: 185, marketValue: 8500, targetPrice: 380, probability: 90, logic: '动力电池龙头+全球竞争力+技术迭代', buyPrice: 175, buyReason: '接近5日均线' },
          { code: '002594', name: '比亚迪', sector: '汽车', currentPrice: 265, marketValue: 7700, targetPrice: 550, probability: 87, logic: '新能源汽车领导者+垂直整合优势', buyPrice: 250, buyReason: '突破整理平台' },
        ];
        setRecommendedStocks(mockStocks);
        setShowResults(true);
        
        await fetch(`${API_BASE}/save-analysis-results`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stocks: mockStocks, modelId: selectedModel.id })
        });
        
        loadDoublingRecs();
      }
    } catch (e) {
      setAnalysisProgress('使用模拟数据演示');
      const mockStocks = [
        { code: '600519', name: '贵州茅台', sector: '白酒', currentPrice: 1680, marketValue: 21000, targetPrice: 3500, probability: 88, logic: '品牌护城河+消费升级+确定性增长', buyPrice: 1600, buyReason: '回调至支撑位' },
        { code: '300750', name: '宁德时代', sector: '新能源', currentPrice: 185, marketValue: 8500, targetPrice: 380, probability: 90, logic: '动力电池龙头', buyPrice: 175, buyReason: '接近5日均线' },
      ];
      setRecommendedStocks(mockStocks);
      setShowResults(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addManualStock = async () => {
    if (!manualCode || !manualStockInfo) {
      alert('请先输入股票代码');
      return;
    }
    
    const targetPrice = manualTargetPrice || (manualStockInfo.currentPrice * 2).toFixed(2);
    const probability = manualProbability || '85';
    const logic = manualLogic || '手动添加';
    
    const newStock = {
      code: manualCode,
      name: manualStockInfo.name,
      currentPrice: manualStockInfo.currentPrice,
      marketValue: manualStockInfo.marketValue,
      targetPrice: parseFloat(targetPrice),
      probability: parseInt(probability),
      logic: logic,
      buyPrice: (manualStockInfo.currentPrice * 0.95).toFixed(2),
      buyReason: '手动添加'
    };
    
    try {
      await fetch(`${API_BASE}/save-analysis-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stocks: [newStock], modelId: 'manual' })
      });
      
      loadDoublingRecs();
      setManualCode('');
      setManualStockInfo(null);
      setManualTargetPrice('');
      setManualProbability('');
      setManualLogic('');
      alert('添加成功');
    } catch (e) {
      alert('添加失败: ' + e.message);
    }
  };

  const deleteStock = async (code) => {
    try {
      await fetch(`${API_BASE}/doubling-recommendations/${code}`, { method: 'DELETE' });
      loadDoublingRecs();
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  };

  const addToAnalysis = async (stock) => {
    try {
      await fetch(`${API_BASE}/analysis-stocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: stock.code,
          name: stock.name,
          source: 'doubling_rec'
        })
      });
      loadAnalysisStocks();
      alert(`已添加 ${stock.name} 到智能分析`);
    } catch (e) {
      alert('添加失败: ' + e.message);
    }
  };

  const removeFromAnalysis = async (code) => {
    try {
      await fetch(`${API_BASE}/analysis-stocks/${code}`, {
        method: 'DELETE'
      });
      loadAnalysisStocks();
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  };

  const [webhookInput, setWebhookInput] = useState('');
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [pendingStock, setPendingStock] = useState(null);

  const sendBuyNotification = async (stock) => {
    try {
      const res = await fetch(`${API_BASE}/feishu/config`);
      const data = await res.json();
      if (!data.success || !data.data?.webhook) {
        setPendingStock(stock);
        setShowWebhookModal(true);
        return;
      }
    } catch (e) {
      console.error('检查Webhook失败:', e);
    }
    const quantity = Math.floor(100000 / (stock.buyPrice || stock.currentPrice));
    alert(`📢 买入推荐通知\n\n股票：${stock.name}(${stock.code})\n当前价：¥${stock.currentPrice}\n建议买入价：¥${stock.buyPrice || (stock.currentPrice * 0.95).toFixed(2)}\n推荐数量：${quantity}股\n翻倍目标：¥${stock.targetPrice}\n翻倍概率：${stock.probability}%`);
  };

  const saveWebhookAndNotify = async () => {
    if (!webhookInput.trim()) {
      alert('请输入Webhook地址');
      return;
    }
    try {
      await fetch(`${API_BASE}/feishu/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook: webhookInput.trim() })
      });
      setShowWebhookModal(false);
      if (pendingStock) {
        sendBuyNotification(pendingStock);
      }
    } catch (e) {
      alert('保存失败');
    }
  };

  if (showWebhookModal) {
    return (
      <div className="modal-overlay" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}>
        <div style={{background:'#1f2937',padding:24,borderRadius:12,width:400}}>
          <h3 style={{color:'#fff',marginBottom:16}}>📢 配置飞书Webhook</h3>
          <p style={{color:'#9ca3af',fontSize:13,marginBottom:16}}>配置Webhook后，买入通知将自动推送到飞书</p>
          <input
            type="text"
            value={webhookInput}
            onChange={(e) => setWebhookInput(e.target.value)}
            placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
            style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid #374151',background:'#111827',color:'#fff',marginBottom:16}}
          />
          <div style={{display:'flex',gap:12}}>
            <button onClick={() => setShowWebhookModal(false)} style={{flex:1,padding:10,borderRadius:8,border:'none',background:'#374151',color:'#fff',cursor:'pointer'}}>取消</button>
            <button onClick={saveWebhookAndNotify} style={{flex:1,padding:10,borderRadius:8,border:'none',background:'linear-gradient(135deg,#667eea,#764ba2)',color:'#fff',cursor:'pointer'}}>保存并通知</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dash-header">
        <button className="dash-back" onClick={onBack}>← 返回</button>
        <h1>🔥 买股策略</h1>
        <span className="dash-subtitle">AI智能选股分析系统</span>
      </header>

      <main className="strategy-layout">
        {/* 左侧：AI对话 + 政策新闻 */}
        <div className="left-panel">
          <div className="panel-box ai-panel">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <h3>🤖 AI对话选股</h3>
              <button onClick={() => { loadApiKeys(); setShowApiConfig(true); }} style={{padding:'4px 12px',fontSize:12,background:'#374151',color:'#fff',border:'none',borderRadius:4,cursor:'pointer'}}>⚙️ 配置</button>
            </div>
            {!selectedModel ? (
              <div className="model-select">
                <p className="model-hint">选择AI模型开始分析</p>
                <div className="model-grid">
                  {AI_MODELS.map(model => (
                    <button
                      key={model.id}
                      className="model-btn"
                      style={{ borderColor: model.color }}
                      onClick={() => setSelectedModel(model)}
                    >
                      <span className="model-icon" style={{ background: model.color }}>{model.icon}</span>
                      <span className="model-name">{model.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="chat-section">
                <div className="chat-header">
                  <span className="model-badge" style={{ background: selectedModel.color }}>
                    {selectedModel.icon} {selectedModel.name}
                  </span>
                  <button className="reset-btn" onClick={() => {
                    setSelectedModel(null);
                    setChatMessages([]);
                    setCurrentStep(0);
                    setAnalysisProgress('');
                  }}>重置</button>
                </div>
                
                <div className="prompt-steps">
                  {ANALYSIS_PROMPTS.map((prompt, idx) => (
                    <div 
                      key={prompt.id} 
                      className={`prompt-step ${idx < currentStep ? 'completed' : idx === currentStep ? 'active' : ''} ${idx < currentStep && chatMessages.find(m => m.step === idx + 1 && m.role === 'assistant') ? 'done' : ''}`}
                    >
                      <span className="step-num">{idx + 1}</span>
                      <span className="step-desc">{prompt.desc}</span>
                      {idx < currentStep && chatMessages.find(m => m.step === idx + 1 && m.role === 'assistant') && <span className="step-check">✓</span>}
                    </div>
                  ))}
                </div>
                
                {analysisProgress && (
                  <div style={{padding:'10px 12px',background:'linear-gradient(135deg,rgba(59,130,246,0.3),rgba(139,92,246,0.3))',borderRadius:8,marginBottom:10,fontSize:13,color:'#a5b4fc',textAlign:'center',border:'1px solid rgba(59,130,246,0.4)'}}>
                    {analysisProgress}
                  </div>
                )}
                
                <div className="chat-messages">
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`chat-msg ${msg.role} ${msg.isError ? 'isError' : ''}`}>
                      <div className="msg-role">{msg.role === 'user' ? '我' : selectedModel.name}</div>
                      <div className="msg-content">{msg.content}</div>
                    </div>
                  ))}
                  {isSending && <div className="chat-loading">AI思考中...</div>}
                  <div ref={messagesEndRef}></div>
                </div>
                
                <div className="chat-actions">
                  {currentStep < ANALYSIS_PROMPTS.length ? (
                    <button 
                      className="next-step-btn"
                      style={{ background: selectedModel.color }}
                      onClick={sendNextPrompt}
                      disabled={isSending}
                    >
                      {currentStep === 0 ? '🚀 开始对话分析' : `发送第${currentStep + 1}步`}
                    </button>
                  ) : (
                    <button 
                      className="view-result-btn"
                      style={{ background: selectedModel.color }}
                      onClick={() => setShowResults(true)}
                    >
                      📊 查看推荐结果
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="panel-box news-panel">
            <div className="panel-header">
              <h3>📰 政策新闻</h3>
              <div className="panel-actions">
                <button onClick={loadPolicyNews}>🔄</button>
                <a href="https://www.worldmonitor.app/" target="_blank" rel="noopener" className="world-btn">
                  🌐 全球热点
                </a>
              </div>
            </div>
            {newsLastUpdate && (
              <div className="news-update-time">
                <span className="update-label">最近更新:</span>
                <span className="update-time">{formatUpdateTime(newsLastUpdate)}</span>
                <span className="update-date">{newsLastUpdate.toLocaleDateString('zh-CN')}</span>
              </div>
            )}
            <div className="news-list news-list-enhanced">
              {newsLoading ? (
                <div className="loading">加载中...</div>
              ) : policyNews.length === 0 ? (
                <div className="empty-news">暂无近一周政策新闻</div>
              ) : policyNews.map((news, idx) => (
                <div key={idx} className={`news-item ${news.hotLevel || 'medium'}`}>
                  <div className="news-main">
                    <div className="news-header-row">
                      <span className="news-date">{news.time}</span>
                      {news.hotLevel === 'high' && <span className="news-urgency high">🔥 重要</span>}
                      <span className={`news-type ${news.type === '利好' ? 'positive' : news.type === '利空' ? 'negative' : 'neutral'}`}>{news.type}</span>
                      {news.department && <span className="news-dept">{news.department}</span>}
                    </div>
                    <div className="news-title">
                      {news.url ? (
                        <a href={news.url} target="_blank" rel="noopener noreferrer" className="news-link">{news.title}</a>
                      ) : news.title}
                    </div>
                    <div className="news-impact">
                      <span className="impact-label">影响:</span>
                      <span className="impact-text">{news.impact}</span>
                      {news.sectors && (
                        <div className="sector-tags">
                          {news.sectors.map((sector, i) => (
                            <span key={i} className="sector-tag">{sector}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 中间：推荐股票列表 + 买卖点 */}
        <div className="middle-panel">
          <div className="panel-box rec-panel">
            <div className="panel-header">
              <h3>📈 翻倍股票推荐 <span className="header-ai-tag">2026年AI模型推理预测</span></h3>
              <span className="stock-count">{doublingRecs.length}只</span>
            </div>
            
            <div className="add-stock-form">
              <div className="form-row">
                <input
                  type="text"
                  placeholder="输入6位股票代码"
                  value={manualCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setManualCode(val);
                    if (val.length === 6) fetchStockInfo(val);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && manualCode.length === 6 && fetchStockInfo(manualCode)}
                  className="code-input"
                />
                {manualStockInfo && (
                  <span className="stock-preview-name">{manualStockInfo.name} ¥{manualStockInfo.currentPrice}</span>
                )}
                <button className="add-btn" onClick={addManualStock} disabled={!manualStockInfo}>
                  添加
                </button>
              </div>
              {manualStockInfo && (
                <div className="stock-preview">
                  <span className="stock-name">{manualStockInfo.name}</span>
                  <span className="stock-price">¥{manualStockInfo.currentPrice}</span>
                  <input
                    type="number"
                    placeholder="目标价"
                    value={manualTargetPrice}
                    onChange={(e) => setManualTargetPrice(e.target.value)}
                    className="target-input"
                  />
                  <input
                    type="number"
                    placeholder="概率%"
                    value={manualProbability}
                    onChange={(e) => setManualProbability(e.target.value)}
                    className="prob-input"
                  />
                </div>
              )}
              {isLoadingStock && <div className="loading-small">获取中...</div>}
            </div>
            
            <div className="stock-table">
              <table>
                <thead>
                  <tr>
                    <th>股票名称</th>
                    <th>股票代码</th>
                    <th>现价(元)</th>
                    <th>市值(亿)</th>
                    <th>目标价(元)</th>
                    <th>概率</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {doublingRecs.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="empty-cell">
                        {isAnalyzing ? 'AI分析中...' : '暂无推荐'}
                      </td>
                    </tr>
                  ) : (
                    doublingRecs.map((stock, idx) => (
                      <tr key={idx}>
                        <td className="stock-name-col">{stock.name}</td>
                        <td className="stock-code-col">{stock.code}</td>
                        <td className="price">¥{stock.current_price?.toFixed(2) || '--'}</td>
                        <td>{stock.current_price && stock.volume ? (stock.current_price * stock.volume / 100000000).toFixed(0) : '--'}</td>
                        <td className="target">¥{stock.target_price?.toFixed(2) || '--'}</td>
                        <td><span className="probability">{stock.probability}%</span></td>
                        <td>
                          <button className="add-analysis-btn" onClick={() => addToAnalysis(stock)} title="添加到智能分析">
                            <span className="btn-icon">+</span>
                            <span className="btn-text">添加</span>
                          </button>
                          <button className="delete-btn" onClick={() => deleteStock(stock.code)} title="删除">
                          <span className="btn-icon">×</span>
                          <span className="btn-text">删除</span>
                        </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel-box signal-panel">
            <div className="panel-header">
              <h3>💰 推荐买卖点</h3>
              <button className="refresh-btn" onClick={refreshAllAnalysis} disabled={analyzingCodes.length > 0}>
                {analyzingCodes.length > 0 ? '⏳ 分析中...' : '🔄 刷新分析'}
              </button>
            </div>
            <div className="signal-disclaimer">⚠️ 本模块仅供参考，不涉及任何投资建议</div>
            <div className="signal-list">
              {getAllSignalStocks().map((stock, idx) => {
                const currentPrice = stock.current_price || stock.currentPrice || stock.price || 0;
                const targetPrice = stock.target_price || stock.targetPrice || 0;
                const probability = parseInt(stock.probability || stock.upside) || 70;
                const recommendedTarget = currentPrice * (1 + probability / 200);
                const analysis = stockAnalysis[stock.code];
                const buyPrice = analysis?.buyPrice || (currentPrice > 0 ? (currentPrice * 0.95).toFixed(2) : '-');
                const stopPrice = analysis?.stopPrice || (currentPrice > 0 ? (currentPrice * 0.90).toFixed(2) : '-');
                const finalTarget = analysis?.targetPrice || (targetPrice > 0 ? targetPrice.toString() : (currentPrice > 0 ? recommendedTarget.toFixed(2) : '-'));
                if (currentPrice === 0) return null;
                return (
                <div key={idx} className="signal-item">
                  <div className="signal-stock">
                    <span className="stock-name">{stock.name}</span>
                    <span className="stock-code">{stock.code}</span>
                  </div>
                  <div className="signal-prices">
                    <div className="price-item">
                      <span className="label">当前价</span>
                      <span className="value">¥{currentPrice?.toFixed(2)}</span>
                    </div>
                    <div className="price-item">
                      <span className="label">买入价</span>
                      <span className="value buy">¥{buyPrice}</span>
                    </div>
                    <div className="price-item">
                      <span className="label">目标价</span>
                      <span className="value target">¥{finalTarget}</span>
                    </div>
                    <div className="price-item">
                      <span className="label">止损价</span>
                      <span className="value stop">¥{stopPrice}</span>
                    </div>
                  </div>
                  <div className="signal-reason">
                    {analysis?.insight?.suggestionText 
                      ? `${analysis.insight.summary} | 建议: ${analysis.insight.suggestionText}`
                      : stock.logic || `智能分析建议：支撑位¥${buyPrice}，压力位¥${finalTarget}`}
                  </div>
                  <button className="notify-btn" onClick={() => sendBuyNotification(stock)}>
                    🔔 买入通知
                  </button>
                </div>
              )})}
            </div>
          </div>
        </div>

        {/* 右侧：智能分析 */}
        <div className="right-panel">
          <div className="panel-box analysis-panel">
            <div className="panel-header">
              <h3>🧠 智能分析</h3>
              <button onClick={loadAnalysisStocks}>🔄</button>
            </div>
            <div className="analysis-list">
              {analysisStocks.length === 0 ? (
                <div className="empty-cell">暂无分析数据<br/>从推荐列表添加股票</div>
              ) : (
                analysisStocks.map((stock, idx) => (
                  <div key={idx} className="analysis-card">
                    <div className="card-header">
                      <div className="stock-basic">
                        <span className="stock-name">{stock.name}</span>
                        <span className="stock-code">{stock.code}</span>
                      </div>
                      <div className={`score ${stock.insight?.score >= 60 ? 'high' : stock.insight?.score >= 40 ? 'medium' : 'low'}`}>
                        {stock.insight?.score || '--'}
                      </div>
                    </div>
                    <div className="card-price">
                      <span>¥{stock.currentPrice?.toFixed(2)}</span>
                      <span className={stock.technical?.changePercent >= 0 ? 'up' : 'down'}>
                        {stock.technical?.changePercent >= 0 ? '+' : ''}{stock.technical?.changePercent?.toFixed(2)}%
                      </span>
                    </div>
                    <div className="card-summary">
                      {stock.insight?.summary?.substring(0, 80)}...
                    </div>
                    <div className="card-checklist">
                      {stock.checklist?.map((item, i) => (
                        <div key={i} className={`check-item ${item.status}`}>
                          <span>{item.item}</span>
                          <span>{item.detail}</span>
                        </div>
                      ))}
                    </div>
                    <div className="card-suggestion">
                      建议: <span>{stock.insight?.suggestionText || '观望'}</span>
                    </div>
                    <div className="card-actions">
                      <button className="remove-analysis-btn" onClick={() => removeFromAnalysis(stock.code)}>
                        删除
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
      
      {showApiConfig && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={() => setShowApiConfig(false)}>
          <div style={{background:'#1f2937',padding:24,borderRadius:12,width:500,maxHeight:'80vh',overflow:'auto'}} onClick={e => e.stopPropagation()}>
            <h3 style={{margin:'0 0 16px 0',color:'#fff'}}>🤖 API Key 配置</h3>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {[
                { key: 'DEEPSEEK_API_KEY', name: 'DeepSeek', icon: '🧠' },
                { key: 'KIMI_API_KEY', name: 'Kimi', icon: '🌙' },
                { key: 'DOUBAO_API_KEY', name: '豆包', icon: '🫛' },
                { key: 'CHATGPT_API_KEY', name: 'ChatGPT', icon: '🤖' },
                { key: 'GEMINI_API_KEY', name: 'Gemini', icon: '💎' }
              ].map(item => (
                <div key={item.key} style={{display:'flex',flexDirection:'column',gap:4}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{color:'#94a3b8',fontSize:12}}>{item.icon} {item.name}</div>
                    {item.key === 'DEEPSEEK_API_KEY' && <a href="https://platform.deepseek.com/usage" target="_blank" rel="noopener" style={{fontSize:10,color:'#60a5fa',textDecoration:'none'}}>申请→</a>}
                    {item.key === 'KIMI_API_KEY' && <a href="https://platform.moonshot.cn/console" target="_blank" rel="noopener" style={{fontSize:10,color:'#60a5fa',textDecoration:'none'}}>申请→</a>}
                    {item.key === 'DOUBAO_API_KEY' && <a href="https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey" target="_blank" rel="noopener" style={{fontSize:10,color:'#60a5fa',textDecoration:'none'}}>申请→</a>}
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <input 
                      type="password" 
                      placeholder="请输入API Key"
                      value={apiKeyInputs[item.key] || ''}
                      onChange={e => setApiKeyInputs({...apiKeyInputs, [item.key]: e.target.value})}
                      style={{flex:1,padding:8,border:'1px solid #374151',borderRadius:6,background:'#111827',color:'#fff',fontSize:13}}
                    />
                    <button onClick={() => saveApiKey(item.key)} style={{padding:'8px 16px',background:'#3b82f6',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12}}>保存</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowApiConfig(false)} style={{marginTop:16,width:'100%',padding:10,background:'#374151',color:'#fff',border:'none',borderRadius:6,cursor:'pointer'}}>关闭</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default HotStockAnalysis;
