/**
 * 智能分析服务
 * 基于 daily_stock_analysis 的核心功能简化实现
 */

class SmartAnalyzer {
  /**
   * 分析股票技术面
   * @param {Object} stockData - 股票实时数据
   * @param {number} avgCost - 平均成本价
   */
  static analyzeTechnical(stockData, avgCost) {
    const current = stockData.current;
    const open = stockData.open;
    const high = stockData.high;
    const low = stockData.low;
    const close = stockData.close; // 昨收
    
    // 计算涨跌幅
    const changePercent = ((current - close) / close * 100).toFixed(2);
    const costChangePercent = avgCost ? ((current - avgCost) / avgCost * 100).toFixed(2) : null;
    
    // 计算振幅
    const amplitude = ((high - low) / close * 100).toFixed(2);
    
    // 判断趋势强度
    let trendStrength = 'weak';
    const upFromOpen = ((current - open) / open * 100);
    if (upFromOpen > 2) trendStrength = 'strong';
    else if (upFromOpen > 0) trendStrength = 'moderate';
    
    // 判断位置（相对于今日高低点）
    const positionInRange = ((current - low) / (high - low) * 100).toFixed(1);
    
    return {
      changePercent: parseFloat(changePercent),
      costChangePercent: costChangePercent ? parseFloat(costChangePercent) : null,
      amplitude: parseFloat(amplitude),
      trendStrength,
      positionInRange: parseFloat(positionInRange),
      isUp: current >= open,
      isAboveCost: avgCost ? current > avgCost : null
    };
  }
  
  /**
   * 生成智能分析结论
   * @param {Object} stockData - 股票数据
   * @param {Object} technical - 技术面分析结果
   * @param {Object} holding - 持仓信息（可选）
   */
  static generateInsight(stockData, technical, holding = null) {
    const insights = [];
    const signals = [];
    
    // 基于涨跌幅的判断
    if (technical.changePercent > 5) {
      insights.push('股价强势上涨，市场情绪积极');
      signals.push({ type: 'bullish', text: '强势上涨' });
    } else if (technical.changePercent > 2) {
      insights.push('股价稳步上涨，趋势良好');
      signals.push({ type: 'bullish', text: '稳步上涨' });
    } else if (technical.changePercent < -5) {
      insights.push('股价大幅下跌，需谨慎观察');
      signals.push({ type: 'bearish', text: '大幅下跌' });
    } else if (technical.changePercent < -2) {
      insights.push('股价回调，关注支撑位');
      signals.push({ type: 'bearish', text: '回调' });
    } else {
      insights.push('股价波动较小，震荡整理中');
      signals.push({ type: 'neutral', text: '震荡' });
    }
    
    // 基于振幅的判断
    if (technical.amplitude > 5) {
      insights.push('日内振幅较大，交投活跃');
      signals.push({ type: 'active', text: '高波动' });
    }
    
    // 基于持仓成本的判断
    if (holding && technical.costChangePercent !== null) {
      if (technical.costChangePercent > 20) {
        insights.push(`盈利 ${technical.costChangePercent.toFixed(1)}%，可考虑部分止盈`);
        signals.push({ type: 'profit', text: '盈利丰厚' });
      } else if (technical.costChangePercent > 10) {
        insights.push(`盈利 ${technical.costChangePercent.toFixed(1)}%，趋势良好`);
        signals.push({ type: 'profit', text: '盈利中' });
      } else if (technical.costChangePercent < -15) {
        insights.push(`亏损 ${Math.abs(technical.costChangePercent).toFixed(1)}%，关注止损位`);
        signals.push({ type: 'loss', text: '需关注' });
      } else if (technical.costChangePercent < -5) {
        insights.push(`小幅亏损，可继续持有观察`);
        signals.push({ type: 'loss', text: '小幅亏损' });
      }
    }
    
    // 生成操作建议
    let suggestion = 'HOLD';
    let suggestionText = '持有观望';
    
    if (holding) {
      if (technical.costChangePercent > 30) {
        suggestion = 'SELL_PARTIAL';
        suggestionText = '建议减仓止盈';
      } else if (technical.costChangePercent < -20) {
        suggestion = 'STOP_LOSS';
        suggestionText = '建议止损';
      } else if (technical.changePercent > 5 && technical.trendStrength === 'strong') {
        suggestion = 'HOLD';
        suggestionText = '强势持有';
      }
    } else {
      // 无持仓时的建议
      if (technical.changePercent > 5) {
        suggestion = 'WAIT';
        suggestionText = '涨幅较大，不宜追高';
      } else if (technical.changePercent < -3 && technical.trendStrength !== 'weak') {
        suggestion = 'WATCH';
        suggestionText = '可关注低吸机会';
      }
    }
    
    return {
      summary: insights.join('；'),
      signals,
      suggestion,
      suggestionText,
      score: this.calculateScore(technical, holding)
    };
  }
  
  /**
   * 计算综合评分 (0-100)
   */
  static calculateScore(technical, holding) {
    let score = 50; // 基础分
    
    // 涨跌分
    if (technical.changePercent > 0) {
      score += Math.min(technical.changePercent * 2, 20);
    } else {
      score += Math.max(technical.changePercent * 2, -20);
    }
    
    // 趋势强度分
    if (technical.trendStrength === 'strong') score += 10;
    else if (technical.trendStrength === 'weak') score -= 10;
    
    // 持仓盈亏分
    if (holding && technical.costChangePercent !== null) {
      if (technical.costChangePercent > 0) {
        score += Math.min(technical.costChangePercent, 15);
      } else {
        score += Math.max(technical.costChangePercent * 0.5, -15);
      }
    }
    
    // 振幅分（适度活跃加分）
    if (technical.amplitude > 2 && technical.amplitude < 8) {
      score += 5;
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  
  /**
   * 生成检查清单
   */
  static generateChecklist(stockData, technical, holding) {
    const checklist = [];
    
    // 趋势检查
    checklist.push({
      item: '当前趋势',
      status: technical.changePercent > 0 ? 'positive' : 'negative',
      detail: technical.changePercent > 0 ? '上涨' : '下跌'
    });
    
    // 成本检查
    if (holding) {
      checklist.push({
        item: '成本状态',
        status: technical.isAboveCost ? 'positive' : 'negative',
        detail: technical.isAboveCost ? '盈利中' : '亏损中'
      });
    }
    
    // 活跃度检查
    checklist.push({
      item: '成交活跃度',
      status: technical.amplitude > 2 ? 'positive' : 'neutral',
      detail: technical.amplitude > 2 ? '活跃' : '一般'
    });
    
    // 位置检查
    const positionStatus = technical.positionInRange > 60 ? 'positive' : 
                          technical.positionInRange < 40 ? 'negative' : 'neutral';
    checklist.push({
      item: '日内位置',
      status: positionStatus,
      detail: `位于今日${technical.positionInRange}%位置`
    });
    
    return checklist;
  }
  
  /**
   * 完整分析入口
   */
  static analyze(stockData, holding = null) {
    const avgCost = holding ? 
      holding.trades.reduce((sum, t) => sum + t.buyPrice * t.quantity, 0) / 
      holding.trades.reduce((sum, t) => sum + t.quantity, 0) : null;
    
    const technical = this.analyzeTechnical(stockData, avgCost);
    const insight = this.generateInsight(stockData, technical, holding);
    const checklist = this.generateChecklist(stockData, technical, holding);
    
    const current = stockData.current;
    const prevClose = stockData.close;
    const high = stockData.high;
    const low = stockData.low;
    const open = stockData.open;
    
    const support1 = (current + low) / 2;
    const support2 = low;
    const resistance1 = (current + high) / 2;
    const resistance2 = high;
    
    const buyPrice = support1;
    const stopPrice = support2 * 0.98;
    const targetPrice = resistance2;
    
    return {
      code: stockData.code,
      name: stockData.name,
      currentPrice: stockData.current,
      avgCost,
      technical,
      insight,
      checklist,
      support1: support1.toFixed(2),
      support2: support2.toFixed(2),
      resistance1: resistance1.toFixed(2),
      resistance2: resistance2.toFixed(2),
      buyPrice: buyPrice.toFixed(2),
      stopPrice: stopPrice.toFixed(2),
      targetPrice: targetPrice.toFixed(2),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = SmartAnalyzer;
