const axios = require('axios');
const iconv = require('iconv-lite');

class StockAPI {
  constructor(provider = 'sina') {
    this.provider = provider;
  }

  async getRealtimeQuote(code) {
    try {
      const tencentResult = await this.getTencentQuote(code);
      if (tencentResult && tencentResult.current) {
        return tencentResult;
      }
    } catch (e) {
      console.error('Tencent quote error, fallback:', e.message);
    }
    
    return this.getSinaQuote(code);
  }

  async getSinaQuote(code) {
    try {
      const url = `https://hq.sinajs.cn/list=${code}`;
      const response = await axios.get(url, {
        headers: {
          'Referer': 'https://finance.sina.com.cn'
        },
        responseType: 'arraybuffer'
      });
      
      const dataStr = iconv.decode(response.data, 'GBK');
      const match = dataStr.match(/"([^"]+)"/);
      if (!match) return null;
      
      const fields = match[1].split(',');
      return {
        code,
        name: fields[0],
        open: parseFloat(fields[1]),
        close: parseFloat(fields[2]),
        current: parseFloat(fields[3]),
        high: parseFloat(fields[4]),
        low: parseFloat(fields[5]),
        volume: parseInt(fields[8]),
        amount: parseFloat(fields[9]),
        date: fields[30],
        time: fields[31],
        change: parseFloat((parseFloat(fields[3]) - parseFloat(fields[2])).toFixed(2)),
        changePercent: parseFloat(((parseFloat(fields[3]) - parseFloat(fields[2])) / parseFloat(fields[2]) * 100).toFixed(2))
      };
    } catch (error) {
      console.error('Sina API Error:', error.message);
      return null;
    }
  }

  async getTencentQuote(code) {
    try {
      const url = `https://qt.gtimg.cn/q=${code}`;
      const response = await axios.get(url, {
        responseType: 'arraybuffer'
      });
      
      const dataStr = iconv.decode(response.data, 'GBK');
      const match = dataStr.match(/"([^"]+)"/);
      if (!match) return null;
      
      const fields = match[1].split('~');
      return {
        code,
        name: fields[1],
        current: parseFloat(fields[3]),
        close: parseFloat(fields[4]),
        open: parseFloat(fields[5]),
        volume: parseInt(fields[6]),
        amount: parseFloat(fields[10]),
        high: parseFloat(fields[33]),
        low: parseFloat(fields[34]),
        change: parseFloat(fields[31]),
        changePercent: parseFloat(fields[32]),
        riseSpeed: parseFloat(fields[37] || 0),
        turnover: parseFloat(fields[38] || 0),
        circValue: parseFloat(fields[43] || 0) * 100000000,
        totalValue: parseFloat(fields[44] || 0) * 100000000,
        sector: fields[61] || '-',
        date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
        time: new Date().toTimeString().slice(0, 8).replace(/:/g, '')
      };
    } catch (error) {
      console.error('Tencent API Error:', error.message);
      return null;
    }
  }

  async getBatchQuotes(codes) {
    return this.getBatchTencentQuotes(codes);
  }
  
  async getBatchTencentQuotes(codes) {
    const results = [];
    const batchSize = 50;
    
    for (let i = 0; i < codes.length; i += batchSize) {
      const batchCodes = codes.slice(i, i + batchSize);
      const urlCodes = batchCodes.join(',');
      
      try {
        const response = await axios.get(`https://qt.gtimg.cn/q=${urlCodes}`, {
          responseType: 'arraybuffer'
        });
        const dataStr = iconv.decode(response.data, 'GBK');
        
        const shMatches = dataStr.match(/v_sh\d+="[^"]+"/g) || [];
        const szMatches = dataStr.match(/v_sz\d+="[^"]+"/g) || [];
        const matches = [...shMatches, ...szMatches];
        
        matches.forEach(m => {
          const match = m.match(/v_(sh\d+|sz\d+)="/);
          if (!match) return;
          const code = match[1];
          const fields = m.split('~');
          results.push({
            code,
            name: fields[1] || '',
            current: parseFloat(fields[3]) || 0,
            close: parseFloat(fields[4]) || 0,
            open: parseFloat(fields[5]) || 0,
            high: parseFloat(fields[33]) || 0,
            low: parseFloat(fields[34]) || 0,
            change: parseFloat(fields[31]) || 0,
            changePercent: parseFloat(fields[32]) || 0,
            volume: parseInt(fields[6]) || 0,
            turnover: parseFloat(fields[38] || 0),
            circValue: parseFloat(fields[43] || 0) * 100000000,
            sector: fields[61] || '',
            preClose: parseFloat(fields[4]) || 0
          });
        });
      } catch (e) {
        console.error('Tencent batch error:', e.message);
      }
    }
    
    return results;
  }

  getAllAStockCodes() {
    const codes = [];
    
    for (let i = 600000; i <= 605000; i++) {
      codes.push('sh' + i);
    }
    
    for (let i = 688000; i <= 689000; i++) {
      codes.push('sh' + i);
    }
    
    for (let i = 1; i <= 3000; i++) {
      codes.push('sz' + String(i).padStart(6, '0'));
    }
    
    for (let i = 300000; i <= 303000; i++) {
      codes.push('sz' + i);
    }
    
    return codes;
  }
}

module.exports = StockAPI;
