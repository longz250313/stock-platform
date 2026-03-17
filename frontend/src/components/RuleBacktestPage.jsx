import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

export default function RuleBacktestPage() {
  const [triggerLogs, setTriggerLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    fetchTriggerLogs();
  }, []);

  const fetchTriggerLogs = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/rule-trigger-log?limit=100`);
      if (res.data.success) {
        setTriggerLogs(res.data.data || []);
      }
    } catch (error) {
      console.error('获取触发记录失败:', error);
    }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('确定删除这条记录？')) return;
    try {
      await axios.delete(`${API_BASE}/rule-trigger-log/${id}`);
      fetchTriggerLogs();
      if (selectedLog?.id === id) {
        setSelectedLog(null);
      }
    } catch (error) {
      console.error('删除记录失败:', error);
    }
  };

  const getActionColor = (action) => {
    switch (action) {
      case 'SELL': return '#e53e3e';
      case 'CLEAR': return '#c53030';
      case 'BUY': return '#38a169';
      default: return '#718096';
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return d.toLocaleString('zh-CN');
  };

  return (
    <div className="rule-backtest-page">
      <div className="page-header">
        <h1>规则回溯分析</h1>
        <p className="subtitle">回顾历史卖出决策，验证策略有效性，优化交易规则</p>
      </div>

      <div className="backtest-content">
        <div className="logs-section">
          <div className="section-header">
            <h3>历史触发记录</h3>
            <button onClick={fetchTriggerLogs} disabled={loading}>
              {loading ? '加载中...' : '刷新'}
            </button>
          </div>

          {triggerLogs.length === 0 ? (
            <div className="empty-state">
              <p>暂无触发记录</p>
              <p className="hint">当持仓触发卖出规则时，会自动记录到此处</p>
            </div>
          ) : (
            <div className="logs-list">
              {triggerLogs.map(log => (
                <div
                  key={log.id}
                  className={`log-card ${selectedLog?.id === log.id ? 'selected' : ''}`}
                  onClick={() => setSelectedLog(log)}
                >
                  <div className="log-header">
                    <span className="stock-name">{log.name}</span>
                    <span className="stock-code">{log.code}</span>
                    <span
                      className="action-badge"
                      style={{ background: getActionColor(log.action) }}
                    >
                      {log.action_desc || log.action}
                    </span>
                  </div>
                  <div className="log-details">
                    <div className="detail-row">
                      <span className="label">触发价格:</span>
                      <span className="value">¥{log.trigger_price?.toFixed(2)}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">买入价格:</span>
                      <span className="value">¥{log.buy_price?.toFixed(2)}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">盈亏:</span>
                      <span className={`value ${log.change_percent >= 0 ? 'up' : 'down'}`}>
                        {log.change_percent?.toFixed(2)}%
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="label">触发时间:</span>
                      <span className="value">{formatDate(log.created_at)}</span>
                    </div>
                  </div>
                  <div className="log-rule">
                    <span className="rule-name">{log.rule_name}</span>
                    <span className="rule-condition">{log.rule_condition}</span>
                  </div>
                  <button
                    className="btn-delete-small"
                    onClick={(e) => { e.stopPropagation(); handleDelete(log.id); }}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedLog && (
          <div className="detail-section">
            <h3>回溯分析: {selectedLog.name}</h3>
            
            <div className="decision-summary">
              <h4>决策摘要</h4>
              <div className="summary-grid">
                <div className="summary-item">
                  <span className="label">触发价格</span>
                  <span className="value">¥{selectedLog.trigger_price?.toFixed(2)}</span>
                </div>
                <div className="summary-item">
                  <span className="label">买入价格</span>
                  <span className="value">¥{selectedLog.buy_price?.toFixed(2)}</span>
                </div>
                <div className="summary-item">
                  <span className="label">持仓数量</span>
                  <span className="value">{selectedLog.hold_quantity}股</span>
                </div>
                <div className="summary-item">
                  <span className="label">盈亏比例</span>
                  <span className={`value ${selectedLog.change_percent >= 0 ? 'up' : 'down'}`}>
                    {selectedLog.change_percent?.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="rule-analysis">
              <h4>触发规则</h4>
              <p>规则名称: {selectedLog.rule_name}</p>
              <p>规则条件: {selectedLog.rule_condition}</p>
              <p>执行操作: {selectedLog.action_desc}</p>
            </div>

            <div className="feedback-section">
              <h4>决策评估</h4>
              <div className="feedback-buttons">
                <button className="feedback-btn good">
                  ✓ 卖出正确
                </button>
                <button className="feedback-btn bad">
                  ✗ 卖出过早
                </button>
                <button className="feedback-btn neutral">
                  ? 待观察
                </button>
              </div>
            </div>

            <div className="notes-section">
              <h4>备注</h4>
              <textarea placeholder="记录这次卖出的心得和改进建议..."></textarea>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
