import React, { useState, useEffect } from 'react';
import './TradeRuleMonitor.css';

/**
 * 交易规则实时监控组件
 * 监控持仓是否触发交易规则，并显示提醒
 */
function TradeRuleMonitor({ holdings, onAlert }) {
  const [triggeredRules, setTriggeredRules] = useState([]);
  const [lastCheck, setLastCheck] = useState(null);
  const [checkMessage, setCheckMessage] = useState(null);

  // 交易规则定义
  const TRADING_RULES = {
    // 下跌应对规则
    decline: [
      { threshold: -30, action: 'CLEAR', actionText: '清仓', color: '#e53e3e', message: '跌幅超过30%，无条件清仓止损' },
      { threshold: -25, action: 'WATCH', actionText: '观察', color: '#ed8936', message: '跌幅25%，关注20日线支撑' },
      { threshold: -20, action: 'WATCH', actionText: '观察', color: '#ed8936', message: '跌幅20%，关注10日线支撑' },
      { threshold: -15, action: 'WATCH', actionText: '观察', color: '#ed8936', message: '跌幅15%，关注5日线支撑' },
      { threshold: -10, action: 'HOLD', actionText: '持有', color: '#4299e1', message: '跌幅5-10%，继续持有' }
    ],
    // 上涨止盈规则
    rise: [
      { threshold: 50, action: 'CLEAR', actionText: '清仓', color: '#e53e3e', message: '涨幅50%，全部清仓止盈' },
      { threshold: 40, action: 'SELL', actionText: '减仓', color: '#ed8936', message: '涨幅40%，再减30%仓位' },
      { threshold: 30, action: 'SELL', actionText: '减仓', color: '#ed8936', message: '涨幅30%，减仓50%锁定利润' },
      { threshold: 25, action: 'WATCH', actionText: '预警', color: '#ed8936', message: '涨幅25-30%，接近减仓线，密切关注' },
      { threshold: 20, action: 'HOLD', actionText: '持有', color: '#48bb78', message: '涨幅10-20%，继续持有' }
    ]
  };

  // 检查持仓是否触发交易规则
  const checkTradingRules = async () => {
    setCheckMessage({ type: 'checking', text: '正在检查交易规则...' });
    
    const newAlerts = [];
    
    holdings.forEach(holding => {
      if (!holding.currentData) return;
      
      const currentPrice = holding.currentData.current || 0;
      // 优先使用分析数据中的买入价格
      const avgCost = (holding.analysis && holding.analysis.buyPrice) || holding.avgCost || 0;
      
      if (avgCost <= 0) return;
      
      const changePercent = ((currentPrice - avgCost) / avgCost) * 100;
      
      // 检查下跌规则
      if (changePercent < 0) {
        for (const rule of TRADING_RULES.decline) {
          if (changePercent <= rule.threshold) {
            newAlerts.push({
              id: `${holding.code}-decline-${Date.now()}`,
              type: 'decline',
              stockName: holding.name,
              stockCode: holding.code,
              currentPrice,
              avgCost,
              changePercent,
              action: rule.action,
              actionText: rule.actionText,
              color: rule.color,
              message: rule.message,
              priority: rule.action === 'CLEAR' ? 'high' : 'medium',
              timestamp: new Date()
            });
            break; // 只触发最严重的规则
          }
        }
      }
      
      // 检查上涨规则
      if (changePercent > 0) {
        for (const rule of TRADING_RULES.rise) {
          if (changePercent >= rule.threshold) {
            newAlerts.push({
              id: `${holding.code}-rise-${Date.now()}`,
              type: 'rise',
              stockName: holding.name,
              stockCode: holding.code,
              currentPrice,
              avgCost,
              changePercent,
              action: rule.action,
              actionText: rule.actionText,
              color: rule.color,
              message: rule.message,
              priority: rule.action === 'CLEAR' ? 'high' : 'medium',
              timestamp: new Date()
            });
            break; // 只触发最严重的规则
          }
        }
      }
    });
    
    // 找出新触发的规则（之前没有的）
    const newTriggeredRules = newAlerts.filter(newAlert => 
      !triggeredRules.some(existing => 
        existing.stockCode === newAlert.stockCode && 
        existing.action === newAlert.action
      )
    );
    
    // 如果有新触发的规则，通知父组件
    if (newTriggeredRules.length > 0) {
      onAlert?.(newTriggeredRules);
    }
    
    setTriggeredRules(newAlerts);
    setLastCheck(new Date());
    
    // 显示检查结果反馈
    if (newAlerts.length === 0) {
      setCheckMessage({ type: 'success', text: '✓ 检查完成，未触发任何交易规则' });
    } else {
      setCheckMessage({ type: 'warning', text: `⚠️ 检查完成，发现 ${newAlerts.length} 条预警` });
    }
    
    // 3秒后清除消息
    setTimeout(() => {
      setCheckMessage(null);
    }, 3000);
  };

  // 实时监控
  useEffect(() => {
    checkTradingRules();
    
    // 每30秒检查一次
    const interval = setInterval(() => {
      checkTradingRules();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [holdings]);

  // 立即检查一次
  useEffect(() => {
    checkTradingRules();
  }, [holdings]);

  if (triggeredRules.length === 0) {
    return (
      <div className="monitor-panel safe">
        <div className="monitor-header">
          <span className="status-icon">✓</span>
          <span className="status-text">交易规则监控正常</span>
          <button className="btn-refresh" onClick={checkTradingRules} title="手动触发规则检查">🔄</button>
        </div>
        {checkMessage && (
          <div className={`check-message ${checkMessage.type}`}>
            {checkMessage.text}
          </div>
        )}
        <div className="monitor-body">
          <p>所有持仓未触发交易规则</p>
          {lastCheck && (
            <span className="check-time">上次检查: {lastCheck.toLocaleTimeString()}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="monitor-panel alert">
      <div className="monitor-header">
        <span className="status-icon">⚠️</span>
        <span className="status-text">交易规则预警</span>
        <span className="alert-count">{triggeredRules.length} 条</span>
      </div>
      {checkMessage && (
        <div className={`check-message ${checkMessage.type}`}>
          {checkMessage.text}
        </div>
      )}
      <div className="monitor-body">
        {triggeredRules.map((rule, index) => (
          <div 
            key={rule.id} 
            className={`alert-item ${rule.priority}`}
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="alert-header">
              <span className="stock-name">{rule.stockName}</span>
              <span 
                className="action-badge"
                style={{ backgroundColor: `${rule.color}20`, color: rule.color, borderColor: rule.color }}
              >
                {rule.actionText}
              </span>
            </div>
            <div className="alert-details">
              <div className="price-info">
                <span>成本: ¥{rule.avgCost.toFixed(2)}</span>
                <span>→</span>
                <span>现价: ¥{rule.currentPrice.toFixed(2)}</span>
              </div>
              <div className={`change-percent ${rule.changePercent >= 0 ? 'up' : 'down'}`}>
                {rule.changePercent >= 0 ? '+' : ''}{rule.changePercent.toFixed(2)}%
              </div>
            </div>
            <div className="alert-message">{rule.message}</div>
            <div className="alert-time">{rule.timestamp.toLocaleTimeString()}</div>
          </div>
        ))}
      </div>
      {lastCheck && (
        <div className="monitor-footer">
          <span className="check-time">实时监控中 · 上次更新: {lastCheck.toLocaleTimeString()}</span>
          <button className="btn-refresh" onClick={checkTradingRules}>立即检查</button>
        </div>
      )}
    </div>
  );
}

export default TradeRuleMonitor;
