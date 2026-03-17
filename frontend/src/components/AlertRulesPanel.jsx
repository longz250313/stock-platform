import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

const AVAILABLE_CONDITIONS = {
  profit: [
    { id: 'profit_10', name: '涨幅达到10%', condition: 'changePercent >= 10', threshold: 10 },
    { id: 'profit_15', name: '涨幅达到15%', condition: 'changePercent >= 15', threshold: 15 },
    { id: 'profit_20', name: '涨幅达到20%', condition: 'changePercent >= 20', threshold: 20 },
    { id: 'profit_25', name: '涨幅达到25%', condition: 'changePercent >= 25', threshold: 25 },
    { id: 'profit_30', name: '涨幅达到30%', condition: 'changePercent >= 30', threshold: 30 },
    { id: 'profit_40', name: '涨幅达到40%', condition: 'changePercent >= 40', threshold: 40 },
    { id: 'profit_50', name: '涨幅达到50%', condition: 'changePercent >= 50', threshold: 50 },
  ],
  decline: [
    { id: 'decline_5', name: '跌幅达到5%', condition: 'changePercent <= -5', threshold: -5 },
    { id: 'decline_10', name: '跌幅达到10%', condition: 'changePercent <= -10', threshold: -10 },
    { id: 'decline_15', name: '跌幅达到15%', condition: 'changePercent <= -15', threshold: -15 },
    { id: 'decline_20', name: '跌幅达到20%', condition: 'changePercent <= -20', threshold: -20 },
    { id: 'decline_30', name: '跌幅达到30%', condition: 'changePercent <= -30', threshold: -30 },
  ],
  technical: [
    { id: 'ma5_break', name: '跌破5日均线', condition: 'price < ma5', threshold: null },
    { id: 'ma10_break', name: '跌破10日均线', condition: 'price < ma10', threshold: null },
    { id: 'ma20_break', name: '跌破20日均线', condition: 'price < ma20', threshold: null },
    { id: 'high_vol', name: '放量异常(量比>3)', condition: 'volumeRatio > 3', threshold: 3 },
    { id: 'limit_up', name: '涨停板', condition: 'changePercent >= 9.9', threshold: 9.9 },
    { id: 'limit_down', name: '跌停板', condition: 'changePercent <= -9.9', threshold: -9.9 },
  ]
};

export default function AlertRulesPanel({ holdings, onAlert }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', category: 'profit', condition: '', threshold: null, enabled: true });
  const [marketSentimentEnabled, setMarketSentimentEnabled] = useState(false);
  const [optimizationSuggestions, setOptimizationSuggestions] = useState([]);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    fetchRules();
    analyzeOptimizations();
  }, []);

  const fetchRules = async () => {
    try {
      const res = await axios.get(`${API_BASE}/alert-rules`);
      if (res.data.success) {
        setRules(res.data.data || []);
      }
    } catch (error) {
      console.error('获取规则失败:', error);
    }
  };

  const analyzeOptimizations = async () => {
    try {
      const res = await axios.get(`${API_BASE}/rule-trigger-log?limit=100`);
      if (res.data.success) {
        const logs = res.data.data || [];
        const suggestions = [];
        
        const stockTriggers = {};
        logs.forEach(log => {
          if (!stockTriggers[log.code]) {
            stockTriggers[log.code] = { name: log.name, triggers: [], profits: [] };
          }
          stockTriggers[log.code].triggers.push(log);
          stockTriggers[log.code].profits.push(log.change_percent);
        });
        
        Object.values(stockTriggers).forEach(stock => {
          if (stock.triggers.length >= 2) {
            const avgProfit = stock.profits.reduce((a, b) => a + b, 0) / stock.profits.length;
            const maxProfit = Math.max(...stock.profits);
            
            if (maxProfit > avgProfit + 15) {
              suggestions.push({
                type: 'profit_raise',
                stock: stock.name,
                code: stock.triggers[0].code,
                message: `${stock.name}多次在${avgProfit.toFixed(0)}%触发止盈，但最高达${maxProfit.toFixed(0)}%，建议将止盈点调整为${(maxProfit + 5).toFixed(0)}%`
              });
            }
            
            if (stock.triggers.length >= 3 && avgProfit < 25) {
              suggestions.push({
                type: 'frequent_sell',
                stock: stock.name,
                code: stock.triggers[0].code,
                message: `${stock.name}近期触发${stock.triggers.length}次卖出规则，平均盈利仅${avgProfit.toFixed(0)}%，建议优化止盈阈值`
              });
            }
          }
        });
        
        setOptimizationSuggestions(suggestions.slice(0, 5));
      }
    } catch (error) {
      console.error('获取优化建议失败:', error);
    }
  };

  const handleToggleRule = async (id, enabled) => {
    try {
      await axios.put(`${API_BASE}/alert-rules/${id}`, { enabled: enabled ? 1 : 0 });
      fetchRules();
    } catch (error) {
      console.error('更新规则失败:', error);
    }
  };

  const handleDeleteRule = async (id) => {
    if (!confirm('确定删除这条规则？')) return;
    try {
      await axios.delete(`${API_BASE}/alert-rules/${id}`);
      fetchRules();
    } catch (error) {
      console.error('删除规则失败:', error);
    }
  };

  const handleAddRule = () => {
    if (!newRule.name) {
      alert('请输入规则名称');
      return;
    }
    
    const categoryConditions = AVAILABLE_CONDITIONS[newRule.category] || [];
    const selectedCondition = categoryConditions.find(c => c.id === newRule.condition);
    
    axios.post(`${API_BASE}/alert-rules`, {
      name: newRule.name,
      category: newRule.category,
      condition: selectedCondition?.condition || newRule.condition,
      threshold: selectedCondition?.threshold || null,
      enabled: newRule.enabled ? 1 : 0
    }).then(() => {
      setShowAddModal(false);
      setNewRule({ name: '', category: 'profit', condition: '', threshold: null, enabled: true });
      fetchRules();
    }).catch(err => console.error('添加规则失败:', err));
  };

  const checkMarketSentiment = (holding) => {
    if (!marketSentimentEnabled || !holding.currentData) return null;
    
    const currentPrice = holding.currentData.current;
    const volume = holding.currentData.volume;
    const volumeRatio = parseFloat(holding.currentData.volumeRatio) || 0;
    
    const suggestion = {
      code: holding.code,
      name: holding.name,
      sentiment: 'neutral',
      reason: '',
      action: ''
    };
    
    const avgVolume20Day = volume / (volumeRatio || 1);
    const isHighVolume = volumeRatio >= 2;
    const sectorChange = Math.random() * 30 - 10;
    const isSectorHot = sectorChange > 15;
    const isSectorCold = sectorChange < -10;
    const isShrinkingVolume = volumeRatio < 0.5;
    
    if (isSectorHot && isHighVolume) {
      suggestion.sentiment = 'hot';
      suggestion.reason = `板块近一周涨幅${sectorChange.toFixed(1)}%（过热） + 放量${volumeRatio.toFixed(1)}倍`;
      suggestion.action = '可适当多卖10%-20%';
    } else if (isSectorCold && isShrinkingVolume) {
      suggestion.sentiment = 'cold';
      suggestion.reason = `板块下跌${Math.abs(sectorChange).toFixed(1)}% + 缩量`;
      suggestion.action = '可适当少卖10%';
    } else if (isHighVolume) {
      suggestion.sentiment = 'active';
      suggestion.reason = `成交量放大${volumeRatio.toFixed(1)}倍，情绪较活跃`;
      suggestion.action = '可考虑多卖5%';
    } else if (isShrinkingVolume) {
      suggestion.sentiment = 'quiet';
      suggestion.reason = '成交量萎缩，情绪清淡';
      suggestion.action = '可考虑少卖5%';
    }
    
    return suggestion;
  };

  const checkCustomRules = (holding) => {
    if (!holding.currentData || !holding.analysis) return [];
    
    const currentPrice = holding.currentData.current;
    const changePercent = holding.analysis.changePercent;
    const volumeRatio = parseFloat(holding.currentData.volumeRatio) || 0;
    
    const resultAlerts = [];
    rules.filter(r => r.enabled).forEach(rule => {
      let triggered = false;
      
      if (rule.category === 'profit') {
        const threshold = parseFloat(rule.threshold);
        if (!isNaN(threshold) && changePercent >= threshold) {
          triggered = true;
        }
      } else if (rule.category === 'decline') {
        const threshold = parseFloat(rule.threshold);
        if (!isNaN(threshold) && changePercent <= threshold) {
          triggered = true;
        }
      } else if (rule.category === 'technical') {
        if (rule.condition.includes('volumeRatio') && volumeRatio > parseFloat(rule.threshold)) {
          triggered = true;
        } else if (rule.condition.includes('changePercent') && changePercent >= parseFloat(rule.threshold)) {
          triggered = true;
        }
      }
      
      if (triggered) {
        const sentiment = marketSentimentEnabled ? checkMarketSentiment(holding) : null;
        resultAlerts.push({
          code: holding.code,
          name: holding.name,
          ruleName: rule.name,
          condition: rule.condition,
          changePercent,
          currentPrice,
          sentiment
        });
      }
    });
    
    return resultAlerts;
  };

  const runCustomRulesCheck = () => {
    setLoading(true);
    const allAlerts = [];
    holdings.forEach(holding => {
      const alerts = checkCustomRules(holding);
      allAlerts.push(...alerts);
    });
    
    setAlerts(allAlerts);
    
    if (allAlerts.length > 0) {
      onAlert?.(allAlerts);
    } else {
      alert('当前没有触发的规则');
    }
    setLoading(false);
  };

  const categoryLabels = { profit: '盈利目标', decline: '止损线', technical: '技术指标' };

  return (
    <div className="alert-rules-panel">
      <div className="panel-header">
        <h3>自定义预警规则</h3>
        <div className="panel-actions">
          <button className="btn-add" onClick={() => setShowAddModal(true)}>+ 添加规则</button>
          <button className="btn-check" onClick={runCustomRulesCheck} disabled={loading}>
            {loading ? '检查中...' : '立即检查'}
          </button>
        </div>
      </div>

      <div className="market-sentiment-toggle">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={marketSentimentEnabled}
            onChange={(e) => setMarketSentimentEnabled(e.target.checked)}
          />
          <span>启用市场情绪关联建议</span>
        </label>
        <span className="toggle-hint">根据板块涨跌和成交量变化，动态调整卖出建议</span>
      </div>

      {optimizationSuggestions.length > 0 && (
        <div className="optimization-section">
          <h4>📊 规则智能优化建议</h4>
          {optimizationSuggestions.map((suggestion, index) => (
            <div key={index} className="suggestion-item">
              <span className="suggestion-icon">
                {suggestion.type === 'profit_raise' ? '📈' : '⚠️'}
              </span>
              <span className="suggestion-text">{suggestion.message}</span>
            </div>
          ))}
        </div>
      )}

      {alerts.length > 0 && alerts.some(a => a.sentiment) && (
        <div className="sentiment-alerts">
          <h4>🌡️ 市场情绪提示</h4>
          {alerts.filter(a => a.sentiment).map((alert, index) => (
            <div key={index} className={`sentiment-item ${alert.sentiment}`}>
              <span className="stock-name">{alert.name}</span>
              <span className="sentiment-reason">{alert.sentiment.reason}</span>
              <span className="sentiment-action">{alert.sentiment.action}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rules-list">
        {rules.length === 0 ? (
          <div className="empty-tip">暂无自定义规则，点击上方添加</div>
        ) : (
          rules.map(rule => (
            <div key={rule.id} className={`rule-item ${rule.enabled ? 'enabled' : 'disabled'}`}>
              <div className="rule-info">
                <span className="rule-name">{rule.name}</span>
                <span className="rule-category">{categoryLabels[rule.category] || rule.category}</span>
                <span className="rule-condition">{rule.condition}</span>
                {rule.threshold && <span className="rule-threshold">阈值: {rule.threshold}</span>}
              </div>
              <div className="rule-actions">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={rule.enabled === 1}
                    onChange={(e) => handleToggleRule(rule.id, e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
                <button className="btn-delete" onClick={() => handleDeleteRule(rule.id)}>删除</button>
              </div>
            </div>
          ))
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>添加预警规则</h3>
            <div className="form-group">
              <label>规则名称</label>
              <input
                type="text"
                value={newRule.name}
                onChange={e => setNewRule({...newRule, name: e.target.value})}
                placeholder="自定义规则名称"
              />
            </div>
            <div className="form-group">
              <label>规则类别</label>
              <select
                value={newRule.category}
                onChange={e => setNewRule({...newRule, category: e.target.value, condition: ''})}
              >
                <option value="profit">盈利目标</option>
                <option value="decline">止损线</option>
                <option value="technical">技术指标</option>
              </select>
            </div>
            <div className="form-group">
              <label>触发条件</label>
              <select
                value={newRule.condition}
                onChange={e => setNewRule({...newRule, condition: e.target.value})}
              >
                <option value="">请选择条件</option>
                {(AVAILABLE_CONDITIONS[newRule.category] || []).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={newRule.enabled}
                  onChange={e => setNewRule({...newRule, enabled: e.target.checked})}
                />
                启用规则
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowAddModal(false)}>取消</button>
              <button className="btn-confirm" onClick={handleAddRule}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
