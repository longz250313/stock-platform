/**
 * 飞书通知模块
 * 用于发送股票提醒到飞书
 */
const crypto = require('crypto');

class FeishuNotifier {
  constructor() {
    // 从环境变量获取飞书配置
    this.webhook = process.env.FEISHU_WEBHOOK;
    this.secret = process.env.FEISHU_SECRET;
    this.enabled = !!this.webhook;
    // 记录上次发送的提醒，用于避免重复
    this.lastAlert = null;
    this.lastAlertTime = 0;
  }

  /**
   * 检查是否需要发送提醒（避免重复）
   */
  shouldSend(code, action, currentPrice) {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    // 如果1小时内已发送过相同的提醒，则不发送
    if (this.lastAlert && 
        this.lastAlert.code === code && 
        this.lastAlert.action === action &&
        (now - this.lastAlertTime) < oneHour) {
      console.log(`[Feishu] 跳过重复提醒: ${code} ${action}`);
      return false;
    }
    return true;
  }

  /**
   * 记录发送的提醒
   */
  recordAlert(code, action, currentPrice) {
    this.lastAlert = { code, action, currentPrice };
    this.lastAlertTime = Date.now();
  }

  /**
   * 生成签名 - 正确方式：timestamp + "\n" + secret
   */
  generateSign(timestamp) {
    if (!this.secret) return null;
    const crypto = require('crypto');
    const stringToSign = timestamp + '\n' + this.secret;
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(stringToSign);
    const sign = hmac.digest('base64');
    return sign.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  /**
   * 发送股票提醒
   */
  async sendAlert({ stock, code, action, reason, currentPrice, avgCost, changePercent }, db = null) {
    if (!this.enabled) {
      console.log('[Feishu] Webhook not configured, skipping notification');
      return;
    }

    // 检查内存中是否重复（1小时内）
    if (!this.shouldSend(code, action, currentPrice)) {
      return;
    }

    // 检查数据库中是否最近已发送相同提醒（1小时内）
    if (db) {
      const hasRecent = await db.hasRecentAlert(code, action);
      if (hasRecent) {
        console.log(`[Feishu] 跳过数据库重复提醒: ${code} ${action}`);
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
        config: {
          wide_screen_mode: true
        },
        header: {
          title: {
            tag: 'plain_text',
            content: `${actionEmoji} ${code} ${stock} - ${today}`
          },
          template: this.getActionColor(action)
        },
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**股票代码:** ${code}\n**股票名称:** ${stock}\n**日期:** ${today}\n**当前价格:** ¥${currentPrice.toFixed(2)}\n**平均成本:** ¥${avgCost.toFixed(2)}\n**盈亏:** ${profitEmoji} ${profit}%`
            }
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**建议操作:** ${action}\n**原因:** ${reason}`
            }
          },
          {
            tag: 'hr'
          },
          {
            tag: 'note',
            elements: [
              {
                tag: 'plain_text',
                content: `提醒时间: ${new Date().toLocaleString()}`
              }
            ]
          }
        ]
      }
    };

    try {
      const axios = require('axios');
      const timestamp = Math.floor(Date.now() / 1000);
      const sign = this.generateSign(timestamp);
      
      // 如果有签名，添加到URL参数
      let webhookUrl = this.webhook;
      if (sign) {
        webhookUrl += (webhookUrl.includes('?') ? '&' : '?') + `timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
      }
      
      await axios.post(webhookUrl, message, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });
      console.log(`[Feishu] Alert sent for ${stock}`);
      this.recordAlert(code, action, currentPrice);
    } catch (error) {
      console.error('[Feishu] Failed to send alert:', error.message);
    }
  }

  /**
   * 获取操作对应的表情
   */
  getActionEmoji(action) {
    if (action.includes('清仓')) return '🔴';
    if (action.includes('减仓')) return '🟡';
    if (action.includes('加仓')) return '🟢';
    if (action.includes('持有')) return '🔵';
    return '⚪';
  }

  /**
   * 获取操作对应的颜色
   */
  getActionColor(action) {
    if (action.includes('清仓')) return 'red';
    if (action.includes('减仓')) return 'orange';
    if (action.includes('加仓')) return 'green';
    if (action.includes('持有')) return 'blue';
    return 'grey';
  }

  /**
   * 发送测试消息
   */
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
}

module.exports = FeishuNotifier;
