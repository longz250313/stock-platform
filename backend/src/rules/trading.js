/**
 * 多策略交易规则引擎
 * 支持多种交易策略选择
 */
class TradingRules {
  /**
   * 获取支持的策略列表
   */
  static getStrategies() {
    return [
      {
        id: 'original',
        name: '均线支撑策略',
        desc: '基于均线支撑/压力的原有策略'
      },
      {
        id: 'elite_2026',
        name: '精英起爆2026增强版',
        desc: '形态过滤+盘中实时爆点策略'
      }
    ];
  }

  /**
   * 分析股票并生成操作建议
   * @param {Object} stock - 股票数据
   * @param {number} buyPrice - 买入成本价
   * @param {Object} ma - 均线数据 {ma5, ma10, ma20}
   * @param {string} strategyId - 策略ID，默认original
   */
  static analyze(stock, buyPrice, ma, strategyId = 'original') {
    // 根据策略执行不同的分析
    switch (strategyId) {
      case 'elite_2026':
        return this.analyzeElite2026(stock, buyPrice, ma);
      default:
        return this.analyzeOriginal(stock, buyPrice, ma);
    }
  }

  /**
   * 原有策略分析
   */
  static analyzeOriginal(stock, buyPrice, ma) {
    const currentPrice = stock.current;
    const changePercent = ((currentPrice - buyPrice) / buyPrice) * 100;
    
    const result = {
      code: stock.code,
      name: stock.name,
      currentPrice,
      buyPrice,
      changePercent: parseFloat(changePercent.toFixed(2)),
      action: 'HOLD',
      actionDesc: '持仓不动',
      reason: '',
      intensity: 0,
      strategy: 'original'
    };

    if (changePercent < 0) {
      return this.handleDecline(result, changePercent, ma, currentPrice);
    }

    if (changePercent > 0) {
      return this.handleRise(result, changePercent);
    }

    return result;
  }

  /**
   * 精英起爆2026增强版策略
   * 基于形态过滤+盘中实时爆点
   */
  static analyzeElite2026(stock, buyPrice, ma) {
    const currentPrice = stock.current;
    const changePercent = ((currentPrice - buyPrice) / buyPrice) * 100;
    const openPrice = stock.open || currentPrice;
    const yesterdayClose = stock.preClose || openPrice * 0.99;
    
    const result = {
      code: stock.code,
      name: stock.name,
      currentPrice,
      buyPrice,
      changePercent: parseFloat(changePercent.toFixed(2)),
      action: 'HOLD',
      actionDesc: '持仓不动',
      reason: '',
      intensity: 0,
      strategy: 'elite_2026',
      signals: {}
    };

    // 计算各指标
    const signals = this.calculateEliteSignals(stock, currentPrice, openPrice, yesterdayClose, ma);
    result.signals = signals;

    // === 第一部分：形态过滤 (基因与蓄势) ===
    const shapePassed = signals.BIG_SUN && signals.RISE_20 && signals.BULL_ALIGN && signals.NEAR_MA5 && signals.LIMIT_2DAYS;
    
    // === 第二部分：盘中实时爆点 (动态触发) ===
    const intradayPassed = signals.OPEN_RANGE && signals.RISE_POWER && signals.VOL_POWER;
    
    // 满足全部条件 = 爆点信号
    const isExplosion = shapePassed && intradayPassed;

    // === 交易规则 ===
    
    // 1. 下跌情况处理
    if (changePercent < 0) {
      const absChange = Math.abs(changePercent);
      
      if (absChange <= 5) {
        result.action = 'HOLD';
        result.actionDesc = '小幅下跌持仓';
        result.reason = `下跌${absChange.toFixed(1)}%，符合精英策略，小波动不操作`;
        return result;
      }
      
      if (absChange <= 10) {
        if (ma && ma.ma5 && currentPrice >= ma.ma5 * 0.98) {
          result.action = 'BUY';
          result.actionDesc = '加仓10%';
          result.intensity = 10;
          result.reason = '下跌10%但接近5日均线，可能企稳，考虑加仓';
        } else {
          result.action = 'SELL';
          result.actionDesc = '减仓10%';
          result.intensity = 10;
          result.reason = '下跌10%且跌破5日均线支撑，减仓观望';
        }
        return result;
      }
      
      if (absChange <= 20) {
        if (ma && ma.ma10 && currentPrice >= ma.ma10) {
          result.action = 'BUY';
          result.actionDesc = '加仓20%';
          result.intensity = 20;
          result.reason = '下跌20%，10日均线有支撑，加仓';
        } else {
          result.action = 'SELL';
          result.actionDesc = '减仓20%';
          result.intensity = 20;
          result.reason = '下跌20%，跌破10日均线，减仓';
        }
        return result;
      }
      
      // 下跌30%+ 清仓
      if (absChange >= 30) {
        result.action = 'CLEAR';
        result.actionDesc = '止损清仓';
        result.intensity = 100;
        result.reason = '下跌30%+，触发止损条件，坚决清仓';
        return result;
      }
    }

    // 2. 上涨情况处理
    if (changePercent > 0) {
      // 爆点信号触发 - 强势上涨
      if (isExplosion) {
        result.action = 'HOLD';
        result.actionDesc = '持有待涨';
        result.reason = `触发精英起爆信号！形态过滤通过，盘中动能强劲，继续持有`;
        return result;
      }

      // 上涨 10% - 继续持有
      if (changePercent <= 10) {
        result.action = 'HOLD';
        result.actionDesc = '安心持有';
        result.reason = `上涨${changePercent.toFixed(1)}%，让利润奔跑`;
        return result;
      }

      // 上涨 20% - 减仓30%
      if (changePercent <= 20) {
        result.action = 'SELL';
        result.actionDesc = '减仓30%';
        result.intensity = 30;
        result.reason = `上涨${changePercent.toFixed(1)}%，减仓30%锁定部分利润`;
        return result;
      }

      // 上涨 30% - 再减仓30% (累计60%)
      if (changePercent <= 30) {
        result.action = 'SELL';
        result.actionDesc = '再减仓30%';
        result.intensity = 30;
        result.reason = `上涨${changePercent.toFixed(1)}%，累计减仓60%，继续守住收益`;
        return result;
      }

      // 上涨 50% - 全额清仓
      if (changePercent >= 50) {
        result.action = 'CLEAR';
        result.actionDesc = '清仓离场';
        result.intensity = 100;
        result.reason = `上涨${changePercent.toFixed(1)}%，已达50%目标位，清仓离场`;
        return result;
      }
    }

    result.reason = '继续观察';
    return result;
  }

  /**
   * 计算精英起爆策略的各项指标
   */
  static calculateEliteSignals(stock, currentPrice, openPrice, yesterdayClose, ma) {
    // 模拟历史数据计算（实际需要历史K线数据）
    // 这里基于当前数据做简化计算
    
    // 1. 基因检测：20日内有过涨幅>8%的大阳线
    // 简化：假设如果近期有大幅上涨
    const hasBigSun = stock.changePercent20d !== undefined && stock.changePercent20d > 8;
    
    // 2. 趋势强度：前20日涨幅>20%
    const rise20 = stock.changePercent20d !== undefined && stock.changePercent20d > 20;
    
    // 3. 形态修正：均线多头
    const bullAlign = ma && ma.ma5 > ma.ma10 && ma.ma10 > ma.ma20;
    
    // 4. 距离5日线不远
    const nearMa5 = ma && ma.ma5 && Math.abs(currentPrice - ma.ma5) / ma.ma5 < 0.035;
    
    // 5. 洗盘确认：近2日涨幅<=2%
    const limit2Days = stock.changePercent1d !== undefined && stock.changePercent1d <= 2;
    
    // 6. 开盘区间：-0.5% 到 2.5%
    const openRangePct = ((openPrice / yesterdayClose) - 1) * 100;
    const openRange = openRangePct >= -0.5 && openRangePct <= 2.5;
    
    // 7. 动能确认：现价相对开盘价拉升>=2%
    const risePower = ((currentPrice / openPrice) - 1) * 100 >= 2;
    
    // 8. 动态量能：简化处理（需要历史量能数据）
    const volPower = true; // 简化：默认通过

    return {
      BIG_SUN: hasBigSun,
      RISE_20: rise20,
      BULL_ALIGN: bullAlign,
      NEAR_MA5: nearMa5,
      LIMIT_2DAYS: limit2Days,
      OPEN_RANGE: openRange,
      RISE_POWER: risePower,
      VOL_POWER: volPower
    };
  }

  /**
   * 处理下跌情况（原策略）
   */
  static handleDecline(result, changePercent, ma, currentPrice) {
    const absChange = Math.abs(changePercent);
    
    if (absChange <= 10) {
      result.action = 'HOLD';
      result.actionDesc = '坚定持仓';
      result.reason = `股价下跌${absChange.toFixed(1)}%，拒绝小波动恐慌，不做任何调整`;
      return result;
    }
    
    if (absChange <= 15) {
      if (ma && ma.ma5 && currentPrice >= ma.ma5) {
        result.action = 'BUY';
        result.actionDesc = '加仓10%';
        result.intensity = 10;
        result.reason = '股价下跌15%，5日均线有支撑，加仓10%';
      } else {
        result.action = 'SELL';
        result.actionDesc = '减仓10%';
        result.intensity = 10;
        result.reason = '股价下跌15%，5日均线无支撑，减仓10%';
      }
      return result;
    }
    
    if (absChange <= 20) {
      if (ma && ma.ma10 && currentPrice >= ma.ma10) {
        result.action = 'BUY';
        result.actionDesc = '加仓20%';
        result.intensity = 20;
        result.reason = '股价下跌20%，10日均线有支撑，加仓20%';
      } else {
        result.action = 'SELL';
        result.actionDesc = '减仓20%';
        result.intensity = 20;
        result.reason = '股价下跌20%，10日均线无支撑，减仓20%';
      }
      return result;
    }
    
    if (absChange <= 25) {
      if (ma && ma.ma20 && currentPrice >= ma.ma20) {
        result.action = 'BUY';
        result.actionDesc = '加仓30%';
        result.intensity = 30;
        result.reason = '股价下跌25%，20日均线有支撑，加仓30%';
      } else {
        result.action = 'SELL';
        result.actionDesc = '减仓30%';
        result.intensity = 30;
        result.reason = '股价下跌25%，20日均线无支撑，减仓30%';
      }
      return result;
    }
    
    if (absChange >= 30 && ma && ma.ma20 && currentPrice < ma.ma20) {
      result.action = 'CLEAR';
      result.actionDesc = '无条件清仓';
      result.intensity = 100;
      result.reason = '股价下跌30%+且跌破20日均线，果断止损，杜绝深套';
      return result;
    }
    
    result.reason = `股价下跌${absChange.toFixed(1)}%，继续观察`;
    return result;
  }

  /**
   * 处理上涨情况（原策略）
   */
  static handleRise(result, changePercent) {
    if (changePercent < 20) {
      result.action = 'HOLD';
      result.actionDesc = '安心持有';
      result.reason = `股价上涨${changePercent.toFixed(1)}%，让利润继续奔跑`;
      return result;
    }
    
    if (changePercent < 30) {
      result.action = 'HOLD';
      result.actionDesc = '安心持有';
      result.reason = `股价上涨${changePercent.toFixed(1)}%，让利润继续奔跑`;
      return result;
    }
    
    if (changePercent < 40) {
      result.action = 'SELL';
      result.actionDesc = '减仓50%';
      result.intensity = 50;
      result.reason = '股价上涨30%，减仓50%，先锁定一半利润，落袋为安';
      return result;
    }
    
    if (changePercent < 50) {
      result.action = 'SELL';
      result.actionDesc = '再减仓30%';
      result.intensity = 30;
      result.reason = '股价上涨40%，在已有减仓基础上再减仓30%，累计减仓80%，进一步守住收益';
      return result;
    }
    
    if (changePercent >= 50) {
      result.action = 'CLEAR';
      result.actionDesc = '全额清仓';
      result.intensity = 100;
      result.reason = '股价上涨50%，全额清仓离场，不恋战、不贪婪，规避高位回调风险';
      return result;
    }
    
    return result;
  }
}

module.exports = TradingRules;
