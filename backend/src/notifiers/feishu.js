/**
 * 飞书通知模块
 * 用于发送股票提醒到飞书
 */
const crypto = require('crypto');
const axios = require('axios');

class FeishuNotifier {
  constructor() {
    this.webhook = process.env.FEISHU_WEBHOOK;
    this.secret = process.env.FEISHU_SECRET;
    this.enabled = !!this.webhook;
    this.lastAlert = null;
    this.lastAlertTime = 0;
  }

  shouldSend(code, action, currentPrice) {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    if (this.lastAlert && 
        this.lastAlert.code === code && 
        this.lastAlert.action === action &&
        (now - this.lastAlertTime) < oneHour) {
      return false;
    }
    return true;
  }

  recordAlert(code, action, currentPrice) {
    this.lastAlert = { code, action, currentPrice };
    this.lastAlertTime = Date.now();
  }

  generateSign(timestamp) {
    if (!this.secret) return null;
    const stringToSign = timestamp + '\n' + this.secret;
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(stringToSign);
    const sign = hmac.digest('base64');
    return sign.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  async sendAlert({ stock, code, action, reason, currentPrice, avgCost, changePercent }, db = null) {
    if (!this.enabled) return;

    if (!this.shouldSend(code, action, currentPrice)) return;

    if (db) {
      const hasRecent = await db.hasRecentAlert(code, action);
      if (hasRecent) {
        this.recordAlert(code, action, currentPrice);
        return;
      }
    }

    const profit = ((currentPrice - avgCost) / avgCost * 100).toFixed(2);
    const profitEmoji = profit >= 0 ? '📈' : '📉';
    const actionEmoji = this.getActionEmoji(action);
    const today = new Date().toLocaleDateString('zh-CN');

    const message = {
      msg_type: 'interactive',
      card: {
        config: { wide_screen_mode: true },
        header: {
          title: { tag: 'plain_text', content: `${actionEmoji} ${code} ${stock} - ${today}` },
          template: this.getActionColor(action)
        },
        elements: [
          { tag: 'div', text: { tag: 'lark_md', content: `**股票代码:** ${code}\n**股票名称:** ${stock}\n**日期:** ${today}\n**当前价格:** ¥${currentPrice.toFixed(2)}\n**平均成本:** ¥${avgCost.toFixed(2)}\n**盈亏:** ${profitEmoji} ${profit}%` } },
          { tag: 'div', text: { tag: 'lark_md', content: `**建议操作:** ${action}\n**原因:** ${reason}` } },
          { tag: 'hr' },
          { tag: 'note', elements: [{ tag: 'plain_text', content: `提醒时间: ${new Date().toLocaleString()}` }] }
        ]
      }
    };

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const sign = this.generateSign(timestamp);
      let webhookUrl = this.webhook;
      if (sign) {
        webhookUrl += (webhookUrl.includes('?') ? '&' : '?') + `timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
      }
      await axios.post(webhookUrl, message, { headers: { 'Content-Type': 'application/json' }, timeout: 5000 });
      console.log(`[Feishu] Alert sent for ${stock}`);
      this.recordAlert(code, action, currentPrice);
    } catch (error) {
      console.error('[Feishu] Failed to send alert:', error.message);
    }
  }

  getActionEmoji(action) {
    if (action.includes('清仓')) return '🔴';
    if (action.includes('减仓')) return '🟡';
    if (action.includes('加仓')) return '🟢';
    if (action.includes('持有')) return '🔵';
    return '⚪';
  }

  getActionColor(action) {
    if (action.includes('清仓')) return 'red';
    if (action.includes('减仓')) return 'orange';
    if (action.includes('加仓')) return 'green';
    if (action.includes('持有')) return 'blue';
    return 'grey';
  }

  async sendTestMessage() {
    await this.sendAlert({
      stock: '测试股票',
      code: 'sh600000',
      action: '测试提醒',
      reason: '这是一条测试消息，验证飞书通知是否正常工作',
      currentPrice: 100.00,
      avgCost: 90.00,
      changePercent: 11.11
    });
  }

  async sendElite2026Alert({ code, name, currentPrice, changePercent, signals }) {
    if (!this.enabled) return;

    const today = new Date().toLocaleDateString('zh-CN');
    const key = `elite_2026_${code}_${today}`;
    if (this.lastAlert === key) {
      console.log(`[Feishu] Skip duplicate elite 2026 alert: ${code}`);
      return;
    }
    this.lastAlert = key;

    const changeEmoji = changePercent >= 0 ? '📈' : '📉';
    
    const message = {
      msg_type: 'interactive',
      card: {
        config: { wide_screen_mode: true },
        header: {
          title: { tag: 'plain_text', content: `🚀 精英起爆2026 - ${code} ${name}` },
          template: 'red'
        },
        elements: [
          { tag: 'div', text: { tag: 'lark_md', content: `**🚀 精英起爆信号触发！**\n\n**股票代码:** ${code}\n**股票名称:** ${name}\n**当前价格:** ¥${currentPrice?.toFixed(2)}\n**涨跌幅:** ${changeEmoji} ${changePercent?.toFixed(2) || 0}%` } },
          { tag: 'div', text: { tag: 'lark_md', content: `**🎯 信号详情**\n\n🧬 **形态过滤**\n- 基因检测: ${signals.BIG_SUN ? '✅' : '❌'}\n- 趋势强度: ${signals.RISE_20 ? '✅' : '❌'}\n- 多头排列: ${signals.BULL_ALIGN ? '✅' : '❌'}\n- 贴近5日线: ${signals.NEAR_MA5 ? '✅' : '❌'}\n- 洗盘确认: ${signals.LIMIT_2DAYS ? '✅' : '❌'}\n\n⚡ **盘中爆点**\n- 开盘区间: ${signals.OPEN_RANGE ? '✅' : '❌'}\n- 动能确认: ${signals.RISE_POWER ? '✅' : '❌'}\n- 量能优化: ${signals.VOL_POWER ? '✅' : '❌'}` } },
          { tag: 'div', text: { tag: 'lark_md', content: `**✅ 状态: 全量通过**\n\n⏰ 时间: ${new Date().toLocaleString('zh-CN')}` } }
        ]
      }
    };

    try {
      await axios.post(this.webhook, message, { headers: { 'Content-Type': 'application/json' }, timeout: 5000 });
      console.log(`[Feishu] Elite 2026 alert sent: ${code} ${name}`);
    } catch (error) {
      console.error('[Feishu] Elite 2026 alert failed:', error.message);
    }
  }

  // 批量发送精英起爆扫描结果（扫描完成时调用）
  async sendElite2026ScanResults(results) {
    if (!this.enabled) return;
    
    const passed = results.filter(r => r.passed);
    if (passed.length === 0) {
      console.log('[Feishu] No passed stocks to send');
      return;
    }

    const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const key = `elite_2026_scan_${today}`;
    if (this.lastAlert === key) {
      console.log('[Feishu] Already sent scan results today');
      return;
    }
    this.lastAlert = key;

    // 构建股票列表
    const stockList = passed.map((s, i) => {
      const changeEmoji = s.changePercent >= 0 ? '📈' : '📉';
      return `${i + 1}. **${s.name}** (${s.code}) - ¥${s.currentPrice?.toFixed(2)} ${changeEmoji} ${s.changePercent?.toFixed(2) || 0}%`;
    }).join('\n');

    const message = {
      msg_type: 'interactive',
      card: {
        config: { wide_screen_mode: true },
        header: {
          title: { tag: 'plain_text', content: `🚀 精英起爆2026扫描完成 - ${passed.length}只全量通过` },
          template: 'red'
        },
        elements: [
          { tag: 'div', text: { tag: 'lark_md', content: `**📊 扫描结果**\n\n全量通过 **${passed.length}** 只股票\n\n💡 **快速购买以下股票：**\n\n${stockList}` } },
          { tag: 'div', text: { tag: 'lark_md', content: `⏰ 扫描时间: ${new Date().toLocaleString('zh-CN')}\n📈 数据来源: 实时行情` } },
          { tag: 'hr' },
          { tag: 'note', elements: [{ tag: 'plain_text', content: '智能股票管家 - 精英起爆2026增强版' }] }
        ]
      }
    };

    try {
      await axios.post(this.webhook, message, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
      console.log(`[Feishu] Scan results sent: ${passed.length} stocks`);
    } catch (error) {
      console.error('[Feishu] Scan results failed:', error.message);
    }
  }
}

module.exports = FeishuNotifier;
