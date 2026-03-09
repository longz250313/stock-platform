require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const StockAPI = require('./api/stock');
const KLineAPI = require('./api/kline');
const TradingRules = require('./rules/trading');
const AlertSystem = require('./alerts');
const FeishuNotifier = require('./notifiers/feishu');
const Database = require('./db');
const SmartAnalyzer = require('./analyzer/smart');

const app = express();
const stockAPI = new StockAPI(process.env.STOCK_API_PROVIDER || 'sina');
const klineAPI = new KLineAPI();
const alertSystem = new AlertSystem();
const feishu = new FeishuNotifier();
const db = new Database();

app.use(cors());
app.use(express.json());

/**
 * 计算持仓汇总信息
 */
function calculateHoldingSummary(holding) {
  const trades = holding.trades || [];
  // 只计算买入交易
  const buyTrades = trades.filter(t => t.type === 'buy');
  const sellTrades = trades.filter(t => t.type === 'sell');
  
  const totalBuyCost = buyTrades.reduce((sum, t) => sum + (t.buyPrice || 0) * t.quantity, 0);
  const totalBuyQty = buyTrades.reduce((sum, t) => sum + t.quantity, 0);
  const totalSellQty = sellTrades.reduce((sum, t) => sum + t.quantity, 0);
  
  // 当前持仓数量
  const currentQty = totalBuyQty - totalSellQty;
  
  // 平均成本 = 总买入成本 / 总买入数量
  const avgCost = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : 0;
  
  // 当前持仓成本 = 平均成本 × 当前持仓数量
  const currentCost = avgCost * currentQty;
  
  return { totalCost: currentCost, totalQty: currentQty, avgCost };
}

/**
 * 运行交易规则检查
 */
async function runTradingRules(holding, stockData) {
  const summary = calculateHoldingSummary(holding);
  
  // 模拟均线数据
  const ma = {
    ma5: stockData.current * 0.98,
    ma10: stockData.current * 0.95,
    ma20: stockData.current * 0.92
  };
  
  const analysis = TradingRules.analyze(stockData, summary.avgCost, ma);
  
  // 如果有交易信号，记录预警并发送通知
  if (analysis.action !== 'HOLD') {
    const alert = {
      code: holding.code,
      stock: stockData.name || holding.name,  // 使用实时数据中的股票名称
      action: analysis.action,
      actionDesc: analysis.actionDesc,
      reason: analysis.reason,
      currentPrice: stockData.current,
      avgCost: summary.avgCost,
      changePercent: analysis.changePercent
    };
    
    // 记录到数据库
    await db.addAlert(alert);
    
    // 发送飞书通知（传入db用于检查重复）
    await feishu.sendAlert({
      stock: holding.name,
      ...alert
    }, db);
  }
  
  return analysis;
}

/**
 * 获取股票实时数据
 */
app.get('/api/stock/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const data = await stockAPI.getRealtimeQuote(code);
    if (data) {
      res.json({ success: true, data });
    } else {
      res.status(404).json({ success: false, error: 'Stock not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 批量获取股票数据
 */
app.post('/api/stocks/batch', async (req, res) => {
  try {
    const { codes } = req.body;
    const data = await stockAPI.getBatchQuotes(codes);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 添加持仓（支持多次买入）
 * 提交后立即运行交易规则
 */
app.post('/api/holdings', async (req, res) => {
  try {
    const { code, name, trades } = req.body;
    
    // 保存到数据库
    await db.addHolding(code, name);
    
    for (const trade of trades) {
      await db.addTrade(code, trade.buyPrice, trade.quantity, trade.buyDate);
    }
    
    // 获取最新持仓数据
    const holdings = await db.getHoldings();
    const holding = holdings.find(h => h.code === code);
    
    // 获取实时股价
    const stockData = await stockAPI.getRealtimeQuote(code);
    
    // 立即运行交易规则检查
    let analysis = null;
    if (holding && stockData) {
      analysis = await runTradingRules(holding, stockData);
    }
    
    res.json({ 
      success: true, 
      message: 'Holding added',
      analysis: analysis
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 为已有持仓添加交易记录（买入/卖出）
 * 提交后立即运行交易规则
 */
app.post('/api/holdings/:code/trades', async (req, res) => {
  try {
    const { code } = req.params;
    const { buyPrice, sellPrice, quantity, buyDate, sellDate, type } = req.body;
    
    // 判断是买入还是卖出
    if (type === 'sell' && sellPrice) {
      // 卖出操作
      await db.addSellTrade(code, sellPrice, quantity, sellDate);
    } else {
      // 买入操作
      await db.addTrade(code, buyPrice, quantity, buyDate);
    }
    
    // 获取最新持仓数据
    const holdings = await db.getHoldings();
    const holding = holdings.find(h => h.code === code);
    
    // 获取实时股价
    const stockData = await stockAPI.getRealtimeQuote(code);
    
    // 立即运行交易规则检查
    let analysis = null;
    if (holding && stockData) {
      analysis = await runTradingRules(holding, stockData);
    }
    
    res.json({ 
      success: true, 
      message: type === 'sell' ? 'Sell trade added' : 'Trade added',
      analysis: analysis
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除持仓
 */
app.delete('/api/holdings/:code', async (req, res) => {
  try {
    const { code } = req.params;
    await db.deleteHolding(code);
    res.json({ success: true, message: 'Holding deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除单条交易记录
 */
app.delete('/api/trades/:tradeId', async (req, res) => {
  try {
    const { tradeId } = req.params;
    await db.deleteTrade(parseInt(tradeId));
    res.json({ success: true, message: 'Trade deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取持仓列表及分析
 */
app.get('/api/holdings', async (req, res) => {
  try {
    // 从数据库获取持仓
    const holdings = await db.getHoldings();
    const codes = holdings.map(h => h.code);
    
    // 获取实时数据
    const stockData = await stockAPI.getBatchQuotes(codes);
    
    // 分析每只持仓股票
    const analysis = await Promise.all(
      holdings.map(async holding => {
        const stock = stockData.find(s => s.code === holding.code);
        if (!stock) return null;
        
        // 运行交易规则
        const result = await runTradingRules(holding, stock);
        
        return {
          ...holding,
          currentData: stock,
          analysis: result
        };
      })
    );
    
    res.json({ success: true, data: analysis.filter(Boolean) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取预警历史
 */
app.get('/api/alerts', async (req, res) => {
  try {
    const alerts = await db.getRecentAlerts();
    res.json({ success: true, data: alerts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 分析单只股票
 */
app.post('/api/analyze', async (req, res) => {
  try {
    const { code, buyPrice } = req.body;
    const stock = await stockAPI.getRealtimeQuote(code);

    if (!stock) {
      return res.status(404).json({ success: false, error: 'Stock not found' });
    }

    // 模拟均线数据
    const ma = {
      ma5: stock.current * 0.98,
      ma10: stock.current * 0.95,
      ma20: stock.current * 0.92
    };

    const analysis = TradingRules.analyze(stock, buyPrice, ma);

    res.json({
      success: true,
      data: { stock, analysis }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 智能分析 - 对标 daily_stock_analysis 的决策仪表盘
 */
app.post('/api/smart-analyze', async (req, res) => {
  try {
    const { code } = req.body;

    // 获取股票实时数据
    const stockData = await stockAPI.getRealtimeQuote(code);
    if (!stockData) {
      return res.status(404).json({ success: false, error: 'Stock not found' });
    }

    // 检查是否有持仓
    const holdings = await db.getHoldings();
    const holding = holdings.find(h => h.code === code);

    // 运行智能分析
    const analysis = SmartAnalyzer.analyze(stockData, holding);

    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 批量智能分析所有持仓
 */
app.get('/api/smart-analyze/holdings', async (req, res) => {
  try {
    // 获取所有持仓
    const holdings = await db.getHoldings();

    if (holdings.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // 获取实时数据
    const codes = holdings.map(h => h.code);
    const stockDataList = await stockAPI.getBatchQuotes(codes);

    // 分析每只股票
    const results = holdings.map(holding => {
      const stockData = stockDataList.find(s => s.code === holding.code);
      if (!stockData) return null;

      return SmartAnalyzer.analyze(stockData, holding);
    }).filter(Boolean);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ========== 翻倍推荐股票相关API ==========
 */

/**
 * 保存翻倍推荐股票列表（AI分析结果）
 */
app.post('/api/doubling-recommendations', async (req, res) => {
  try {
    const { stocks, modelId } = req.body;
    
    if (!stocks || !Array.isArray(stocks)) {
      return res.status(400).json({ success: false, error: 'Invalid stocks data' });
    }

    // 先清空旧的推荐
    await db.clearDoublingRecommendations();

    // 保存新的推荐
    const results = [];
    for (const stock of stocks) {
      const result = await db.addDoublingRecommendation({
        ...stock,
        modelId: modelId || 'unknown'
      });
      results.push(result);
    }

    res.json({
      success: true,
      data: { saved: results.length }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取翻倍推荐股票列表
 */
app.get('/api/doubling-recommendations', async (req, res) => {
  try {
    const recommendations = await db.getDoublingRecommendations();
    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除单条翻倍推荐
 */
app.delete('/api/doubling-recommendations/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const result = await db.deleteDoublingRecommendation(code);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ========== 意向分析股票相关API ==========
 */

/**
 * 添加意向分析股票
 */
app.post('/api/analysis-stocks', async (req, res) => {
  try {
    const stock = req.body;
    
    if (!stock.code || !stock.name) {
      return res.status(400).json({ success: false, error: 'Code and name are required' });
    }

    const result = await db.addAnalysisStock(stock);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取意向分析股票列表
 */
app.get('/api/analysis-stocks', async (req, res) => {
  try {
    const stocks = await db.getAnalysisStocks();
    res.json({
      success: true,
      data: stocks
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除意向分析股票
 */
app.delete('/api/analysis-stocks/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const result = await db.deleteAnalysisStock(code);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取股票K线数据
 * @param type: intraday(分时), 5day(五日), daily(日K)
 */
app.get('/api/kline/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { type = 'intraday' } = req.query;

    let result;
    switch (type) {
      case 'intraday':
        result = await klineAPI.getIntradayData(code);
        break;
      case '5day':
        result = await klineAPI.get5DayData(code);
        break;
      case 'daily':
        result = await klineAPI.getDailyKLine(code, 60);
        break;
      default:
        return res.status(400).json({ success: false, error: 'Invalid type' });
    }

    // 处理不同的返回格式
    let items, prevClose;
    if (type === 'intraday' && result.items) {
      items = result.items;
      prevClose = result.prevClose;
    } else {
      items = result;
      prevClose = 0;
    }

    res.json({
      success: true,
      data: {
        code,
        type,
        items: items,
        prevClose: prevClose
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 启动服务器
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Stock Platform API running on port ${PORT}`);
  console.log(`Using data provider: ${process.env.STOCK_API_PROVIDER || 'sina'}`);
  console.log(`Database: SQLite (persistent storage)`);
});

// DeepSeek AI API 代理
app.post('/api/ai/deepseek', async (req, res) => {
  try {
    const { messages, apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'Missing API key' });
    }

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('DeepSeek proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Kimi AI API 代理
app.post('/api/ai/kimi', async (req, res) => {
  try {
    const { messages, apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'Missing API key' });
    }

    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        messages: messages,
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Kimi proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 豆包 AI API 代理
app.post('/api/ai/doubao', async (req, res) => {
  try {
    const { messages, apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'Missing API key' });
    }

    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'doubao-pro-32k',
        messages: messages,
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Doubao proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 定时检查持仓规则（每小时执行一次）
cron.schedule('0 * * * *', async () => {
  console.log('[定时任务] 检查持仓规则...');
  try {
    const holdings = await db.getHoldings();
    if (holdings.length === 0) return;
    
    const codes = holdings.map(h => h.code);
    const stockData = await stockAPI.getBatchQuotes(codes);
    
    for (const holding of holdings) {
      const stock = stockData.find(s => s.code === holding.code);
      if (!stock) continue;
      await runTradingRules(holding, stock);
    }
    console.log('[定时任务] 检查完成');
  } catch (error) {
    console.error('[定时任务] 检查失败:', error.message);
  }
});

// 大盘云图代理（去除广告和不需要的内容）
app.get('/api/cloudmap-proxy', async (req, res) => {
  try {
    const https = require('https');
    const http = require('http');
    
    const targetUrl = 'https://52etf.site/';
    
    const getPage = () => {
      return new Promise((resolve, reject) => {
        const client = targetUrl.startsWith('https') ? https : http;
        client.get(targetUrl, (resp) => {
          let data = '';
          resp.on('data', (chunk) => data += chunk);
          resp.on('end', () => resolve(data));
        }).on('error', reject);
      });
    };
    
    let html = await getPage();
    
    // 替换相对路径为绝对路径
    html = html.replace(/href="\//g, 'href="https://52etf.site/');
    html = html.replace(/src="\//g, 'src="https://52etf.site/');
    html = html.replace(/href='/g, "href='https://52etf.site/");
    html = html.replace(/src='/g, "src='https://52etf.site/");
    
    // 去除不需要的内容
    const removePatterns = [
      /<div class="header"[\s\S]*?<\/div>/gi,
      /<div class="footer"[\s\S]*?<\/div>/gi,
      /<div class="scgl_s1"[\s\S]*?<\/div>/gi,
      /<div class="navBox"[\s\S]*?<\/div>/gi,
      /<div class="stock_inf"[\s\S]*?<\/div>/gi,
      /<div class="jrj-where"[\s\S]*?<\/div>/gi,
      /<div class="pinglunIfr"[\s\S]*?<\/div>/gi,
      /<div class="zn_tip"[\s\S]*?<\/div>/gi,
      /<div class="zn_tip_min"[\s\S]*?<\/div>/gi,
      /<div class="ad"[\s\S]*?<\/div>/gi,
      /<a[^>]*>收藏网址[^\n<>]+<\/a>/gi,
      /52ETF\.site/gi,
      /52etf\.site/gi,
      /52ETF/gi,
      /dapanyuntu/gi,
      /防丢网址：[^\n<>]+/gi,
      /站长知识星球[^\n<>]+/gi,
      /低佣开户[^\n<>]+/gi,
      /万0\.85免五开户[^\n<>]+/gi,
    ];
    
    removePatterns.forEach(pattern => {
      html = html.replace(pattern, '');
    });
    
    // 清理空标签和多余空白
    html = html.replace(/\s+/g, ' ');
    html = html.replace(/>\s+</g, '><');
    
    res.setHeader('Content-Type', 'text/html;charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('CloudMap proxy error:', error);
    res.status(500).send('Proxy error');
  }
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\nClosing database connection...');
  db.close();
  process.exit(0);
});

module.exports = app;
