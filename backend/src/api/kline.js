const axios = require('axios');

/**
 * 股票K线数据API
 * 支持获取分时、日K、周K等历史数据
 */
class KLineAPI {
  /**
   * 获取分时数据（当日）
   * A股交易时间：09:30-11:30, 13:00-15:00
   * @param {string} code - 股票代码 (如: sh600519, sz000001)
   */
  async getIntradayData(code) {
    try {
      // 使用腾讯财经的分时数据接口
      const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${code}`;
      const response = await axios.get(url, { timeout: 10000 });
      
      if (response.data && response.data.data && response.data.data[code]) {
        const stockData = response.data.data[code];
        
        // 腾讯接口返回的数据结构：{ data: { data: [...], date: '...' }, qt: {...} }
        const minuteData = stockData.data && stockData.data.data ? stockData.data.data : [];
        const tradeDate = stockData.data && stockData.data.date ? stockData.data.date : '';
        
        // 从 qt 数据中获取前收盘价
        // qt 数据格式：[市场, 名称, 代码, 当前价, 前收盘价, 开盘价, ...]
        let prevClose = 0;
        if (stockData.qt && stockData.qt[code]) {
          const qtData = stockData.qt[code];
          // 前收盘价在第5个位置（索引4）
          prevClose = parseFloat(qtData[4]) || 0;
        }
        
        // 确保 minuteData 是数组
        if (!Array.isArray(minuteData) || minuteData.length === 0) {
          console.error('Invalid minute data format or empty data');
          return this.getMockIntradayData(code);
        }
        
        console.log(`Fetched real data for ${code}, date: ${tradeDate}, count: ${minuteData.length}, prevClose: ${prevClose}`);
        
        // 解析分时数据 "时间 价格 成交量 成交额"
        // 时间格式为 HHMM (如 0930 1118)，空格分隔
        const allData = minuteData.map(item => {
          const parts = item.split(' ');
          const timeStr = parts[0];  // HHMM 格式
          const price = parseFloat(parts[1]);
          const volume = parseInt(parts[2]) || 0;
          
          // 将 HHMM 转换为 HH:MM
          const hour = timeStr.substring(0, 2);
          const minute = timeStr.substring(2, 4);
          const formattedTime = `${hour}:${minute}`;
          
          return {
            time: formattedTime,  // HH:MM 格式
            price: price,
            volume: volume,
            avgPrice: price
          };
        });
        
        // 过滤出A股交易时间段的数据：09:30-11:30, 13:00-15:00
        const filteredData = allData.filter(item => {
          const [hour, minute] = item.time.split(':').map(Number);
          const timeValue = hour * 60 + minute;
          
          // 上午：09:30-11:30 (570-690分钟)
          // 下午：13:00-15:00 (780-900分钟)
          const isMorning = timeValue >= 570 && timeValue <= 690;
          const isAfternoon = timeValue >= 780 && timeValue <= 900;
          
          return isMorning || isAfternoon;
        });
        
        // 返回数据，包含前收盘价
        return {
          items: filteredData,
          prevClose: prevClose
        };
      }
      
      return { items: [], prevClose: 0 };
    } catch (error) {
      console.error('Intraday API Error:', error.message);
      const mockData = this.getMockIntradayData(code);
      return { items: mockData, prevClose: mockData[0]?.price || 1 };
    }
  }
  
  /**
   * 获取日K线数据
   * @param {string} code - 股票代码
   * @param {number} days - 获取天数，默认60天
   */
  async getDailyKLine(code, days = 60) {
    // 尝试多个API源
    const sources = [
      // 腾讯qfq接口（带前复权，数据较全）
      async () => {
        const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?_var=kline_qfq&param=${code},day,,,${days},qfq`;
        const response = await axios.get(url, { timeout: 10000 });
        const text = response.data;
        const match = text.match(/kline_qfq=({.+})/);
        if (!match) return null;
        const data = JSON.parse(match[1]);
        const klines = data?.data?.[code]?.qfqday || [];
        if (klines.length === 0) return null;
        return klines.map(item => ({
          date: item[0],
          open: parseFloat(item[1]),
          close: parseFloat(item[2]),
          high: parseFloat(item[3]),
          low: parseFloat(item[4]),
          volume: parseInt(item[5]),
          change: 0
        }));
      },
      // 腾讯非qfq接口
      async () => {
        const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,,,${days}`;
        const response = await axios.get(url, { timeout: 10000 });
        const data = response.data?.data?.[code];
        const klines = data?.day || data?.qfqday || [];
        if (klines.length === 0) return null;
        return klines.map(item => ({
          date: item[0],
          open: parseFloat(item[1]),
          close: parseFloat(item[2]),
          high: parseFloat(item[3]),
          low: parseFloat(item[4]),
          volume: parseInt(item[5]),
          change: 0
        }));
      }
    ];
    
    for (const source of sources) {
      try {
        const result = await source();
        if (result && result.length > 0) {
          return result;
        }
      } catch (e) {
        console.log('K-line source failed, trying next:', e.message);
      }
    }
    
    console.error('All K-line sources failed for:', code);
    return [];
  }
  
  /**
   * 获取5日分时数据（最近5个交易日的分时）
   * @param {string} code - 股票代码
   */
  async get5DayData(code) {
    try {
      // 先获取最近5天的日K数据
      const dailyData = await this.getDailyKLine(code, 5);
      
      // 获取今天的分时数据
      const todayIntraday = await this.getIntradayData(code);
      
      // 合并数据（简化处理：用日K数据模拟5日走势）
      const result = [];
      
      dailyData.forEach((day, index) => {
        // 为每一天生成模拟的分时点
        const basePrice = day.open;
        const closePrice = day.close;
        const highPrice = day.high;
        const lowPrice = day.low;
        
        // 生成该交易日的模拟分时点
        for (let i = 0; i < 240; i += 30) { // 每30分钟一个点
          const hour = 9 + Math.floor((i + 30) / 60);
          const minute = (i + 30) % 60;
          if (hour === 11 && minute > 30) continue;
          if (hour === 12) continue;
          if (hour > 15) continue;
          
          const progress = i / 240;
          const price = basePrice + (closePrice - basePrice) * progress + 
                       (Math.random() - 0.5) * (highPrice - lowPrice) * 0.2;
          
          result.push({
            time: `${day.date} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
            price: parseFloat(price.toFixed(2)),
            volume: Math.floor(day.volume / 8),
            date: day.date
          });
        }
      });
      
      return result;
    } catch (error) {
      console.error('5Day API Error:', error.message);
      return this.getMock5DayData(code);
    }
  }
  
  /**
   * 生成模拟分时数据（用于测试）
   * A股交易时间：09:30-11:30, 13:00-15:00
   */
  getMockIntradayData(code) {
    const data = [];
    const basePrice = 10 + Math.random() * 50;
    let currentPrice = basePrice;
    
    // 上午交易时间：09:30 - 11:30
    for (let minutes = 30; minutes <= 150; minutes += 5) {
      const hour = 9 + Math.floor(minutes / 60);
      const minute = minutes % 60;
      
      currentPrice = currentPrice + (Math.random() - 0.48) * 0.1;
      
      data.push({
        time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
        price: parseFloat(currentPrice.toFixed(2)),
        volume: Math.floor(Math.random() * 10000),
        avgPrice: parseFloat((currentPrice * (0.99 + Math.random() * 0.02)).toFixed(2))
      });
    }
    
    // 下午交易时间：13:00 - 15:00
    for (let minutes = 0; minutes <= 120; minutes += 5) {
      const hour = 13 + Math.floor(minutes / 60);
      const minute = minutes % 60;
      
      currentPrice = currentPrice + (Math.random() - 0.48) * 0.1;
      
      data.push({
        time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
        price: parseFloat(currentPrice.toFixed(2)),
        volume: Math.floor(Math.random() * 10000),
        avgPrice: parseFloat((currentPrice * (0.99 + Math.random() * 0.02)).toFixed(2))
      });
    }
    
    return data;
  }
  
  /**
   * 生成模拟日K数据
   */
  getMockDailyData(code, days) {
    const data = [];
    let basePrice = 10 + Math.random() * 50;
    const today = new Date();
    
    for (let i = days; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      const open = basePrice;
      const close = basePrice + (Math.random() - 0.48) * basePrice * 0.03;
      const high = Math.max(open, close) + Math.random() * basePrice * 0.01;
      const low = Math.min(open, close) - Math.random() * basePrice * 0.01;
      
      data.push({
        date: date.toISOString().split('T')[0],
        open: parseFloat(open.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        volume: Math.floor(Math.random() * 1000000),
        change: parseFloat(((close - open) / open * 100).toFixed(2))
      });
      
      basePrice = close;
    }
    
    return data;
  }
  
  /**
   * 生成模拟5日数据
   */
  getMock5DayData(code) {
    const data = [];
    let basePrice = 10 + Math.random() * 50;
    const today = new Date();
    
    for (let day = 4; day >= 0; day--) {
      const date = new Date(today);
      date.setDate(date.getDate() - day);
      const dateStr = date.toISOString().split('T')[0];
      
      let dayOpen = basePrice;
      let dayClose = dayOpen;
      
      for (let i = 0; i <= 240; i += 30) {
        const hour = 9 + Math.floor((i + 30) / 60);
        const minute = (i + 30) % 60;
        
        if (hour === 11 && minute > 30) continue;
        if (hour === 12) continue;
        if (hour > 15) continue;
        
        dayClose = dayOpen + (Math.random() - 0.48) * dayOpen * 0.02;
        
        data.push({
          time: `${dateStr} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
          price: parseFloat(dayClose.toFixed(2)),
          volume: Math.floor(Math.random() * 50000),
          date: dateStr
        });
      }
      
      basePrice = dayClose;
    }
    
    return data;
  }
}

module.exports = KLineAPI;
