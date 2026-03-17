import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineSeries, CandlestickSeries } from 'lightweight-charts';
import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

/**
 * 股票走势图组件
 * 支持分时、五日、日K切换
 * Y轴显示涨跌幅比例，X轴显示完整交易时间
 */
function StockChart({ code, name }) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const maSeriesRef = useRef({ ma5: null, ma10: null, ma20: null, ma60: null });
  const [activeType, setActiveType] = useState('daily');
  const [loading, setLoading] = useState(false);

  // 获取K线数据
  const fetchKLineData = async (type) => {
    if (!code) return;
    
    setLoading(true);
    try {
      // 获取当前日期和最近交易日
      const today = new Date();
      const isWeekend = today.getDay() === 0 || today.getDay() === 6;
      
      let targetDate = today;
      if (isWeekend) {
        // 如果是周末，获取最近一个周五
        const daysToFriday = today.getDay() === 0 ? 2 : 1;
        targetDate = new Date(today.getTime() - daysToFriday * 24 * 60 * 60 * 1000);
      }
      
      const dateStr = targetDate.toISOString().split('T')[0];
      
      const res = await axios.get(`${API_BASE}/kline/${code}?type=${type}&date=${dateStr}`);
      if (res.data.success) {
        updateChart(res.data.data, type);
      }
    } catch (error) {
      console.error('Failed to fetch KLine data:', error);
    } finally {
      setLoading(false);
    }
  };

  // 将时间字符串转换为 Unix 时间戳（使用实际交易日日期）
  const timeToTimestamp = (timeStr, dateStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (dateStr) {
      const [year, month, day] = dateStr.split('-').map(Number);
      return Date.UTC(year, month - 1, day, hours, minutes) / 1000;
    }
    // 默认使用当日日期
    const today = new Date();
    return Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes) / 1000;
  };

  // 生成完整的交易时间段（09:30-11:30, 13:00-15:00）
  const generateFullTradingDay = () => {
    const slots = [];
    // 上午：09:30 - 11:30
    for (let h = 9; h <= 11; h++) {
      for (let m = (h === 9 ? 30 : 0); m < 60; m += 1) {
        if (h === 11 && m > 30) break;
        slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      }
    }
    // 下午：13:00 - 15:00
    for (let h = 13; h <= 15; h++) {
      for (let m = 0; m < 60; m += 1) {
        if (h === 15 && m > 0) break;
        slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      }
    }
    return slots;
  };

  // 计算移动平均线
  const calculateMA = (period, closes, items) => {
    const result = [];
    for (let i = 0; i < items.length; i++) {
      if (i < period - 1) {
        result.push({ time: new Date(items[i].date + 'T00:00:00Z').getTime() / 1000 });
      } else {
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += closes[i - j];
        }
        const avg = sum / period;
        result.push({ time: new Date(items[i].date + 'T00:00:00Z').getTime() / 1000, value: avg });
      }
    }
    return result;
  };

  // 获取最近交易日日期
  const getLastTradingDate = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    if (dayOfWeek === 0) {
      // 周日，返回上周五
      return new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
    } else if (dayOfWeek === 6) {
      // 周六，返回上周五
      return new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000);
    }
    
    // 工作日，返回今天
    return today;
  };

  // 更新图表
  const updateChart = (chartData, type) => {
    if (!chartRef.current || !seriesRef.current) return;

    const items = chartData.items || [];
    
    if (type === 'daily') {
      // 日K线数据 - 确保日期格式正确
      const candleData = items.map(item => {
        // 将 YYYY-MM-DD 转换为时间戳
        const timestamp = new Date(item.date + 'T00:00:00Z').getTime() / 1000;
        return {
          time: timestamp,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close
        };
      });
      
      seriesRef.current.setData(candleData);
      
      // 计算均线
      const closes = items.map(item => item.close);
      const ma5 = calculateMA(5, closes, items);
      const ma10 = calculateMA(10, closes, items);
      const ma20 = calculateMA(20, closes, items);
      const ma60 = calculateMA(60, closes, items);
      
      // 更新均线系列
      if (maSeriesRef.current.ma5) maSeriesRef.current.ma5.setData(ma5);
      if (maSeriesRef.current.ma10) maSeriesRef.current.ma10.setData(ma10);
      if (maSeriesRef.current.ma20) maSeriesRef.current.ma20.setData(ma20);
      if (maSeriesRef.current.ma60) maSeriesRef.current.ma60.setData(ma60);
      
      chartRef.current.applyOptions({
        rightPriceScale: {
          borderColor: 'rgba(45, 55, 72, 0.5)',
          autoScale: true,
          scaleMargins: { top: 0.1, bottom: 0.1 }
        }
      });
    } else if (type === 'intraday') {
      // 分时图：生成完整的交易时间段
      // 使用前收盘价作为基准计算涨跌幅
      const basePrice = chartData.prevClose || (items.length > 0 ? items[0].price : 1);
      
      // 获取交易日日期
      const tradingDate = chartData.tradingDate || getLastTradingDate().toISOString().split('T')[0];
      
      const fullTimeSlots = generateFullTradingDay();
      
      // 创建数据映射，方便查找
      const dataMap = new Map();
      items.forEach(item => {
        dataMap.set(item.time, item.price);
      });
      
      // 生成完整的数据（包括未来的空数据点）
      const lineData = fullTimeSlots.map(timeStr => {
        const timestamp = timeToTimestamp(timeStr, tradingDate);
        const price = dataMap.get(timeStr);
        
        if (price !== undefined) {
          // 有数据，计算涨跌幅（基于前收盘价）
          const changePercent = ((price - basePrice) / basePrice) * 100;
          return { time: timestamp, value: changePercent };
        } else {
          // 没有数据（未来时间），返回空值
          return { time: timestamp };
        }
      });
      
      seriesRef.current.setData(lineData);
      
      // 设置0.00%基准线
      if (seriesRef.current.baselineSeries) {
        const baselineData = fullTimeSlots.map(timeStr => ({
          time: timeToTimestamp(timeStr, tradingDate),
          value: 0
        }));
        seriesRef.current.baselineSeries.setData(baselineData);
      }
      
      // 设置13:00时间分隔线
      if (seriesRef.current.middayLineSeries) {
        const middayTimestamp = timeToTimestamp('13:00', tradingDate);
        // 使用固定的Y轴范围来绘制分隔线
        const middayData = [
          { time: middayTimestamp, value: -10 },
          { time: middayTimestamp, value: 10 }
        ];
        seriesRef.current.middayLineSeries.setData(middayData);
      }
      
      // 设置价格刻度格式化器
      chartRef.current.applyOptions({
        rightPriceScale: {
          borderColor: 'rgba(45, 55, 72, 0.5)',
          autoScale: true,
          scaleMargins: { top: 0.1, bottom: 0.1 },
          tickFormatter: (price) => price.toFixed(2) + '%'
        }
      });
    } else {
      // 五日数据 - 按日期分组，每天一个数据点
      const basePrice = items.length > 0 ? items[0].price : 1;
      
      // 按日期分组，取每天的收盘价
      const dailyData = new Map();
      items.forEach(item => {
        const date = item.date || item.time.split(' ')[0];
        if (!dailyData.has(date) || item.time.includes('15:00')) {
          dailyData.set(date, item.price);
        }
      });
      
      // 转换为数组并排序
      const sortedDates = Array.from(dailyData.keys()).sort();
      const lineData = sortedDates.map(date => {
        const timestamp = new Date(date + 'T00:00:00Z').getTime() / 1000;
        const price = dailyData.get(date);
        const changePercent = ((price - basePrice) / basePrice) * 100;
        return { time: timestamp, value: changePercent };
      });
      
      seriesRef.current.setData(lineData);
      
      // 设置0.00%基准线
      if (seriesRef.current.baselineSeries) {
        const baselineData = sortedDates.map(date => ({
          time: new Date(date + 'T00:00:00Z').getTime() / 1000,
          value: 0
        }));
        seriesRef.current.baselineSeries.setData(baselineData);
      }
      
      chartRef.current.applyOptions({
        rightPriceScale: {
          borderColor: 'rgba(45, 55, 72, 0.5)',
          autoScale: true,
          scaleMargins: { top: 0.1, bottom: 0.1 },
          tickFormatter: (price) => price.toFixed(2) + '%'
        }
      });
    }
    
    // 默认显示完整交易时间（9:30-15:00）
    if (type === 'intraday' && chartRef.current) {
      const tradingDate = chartData.tradingDate || getLastTradingDate().toISOString().split('T')[0];
      const fromTime = timeToTimestamp('09:30', tradingDate);
      const toTime = timeToTimestamp('15:00', tradingDate);
      chartRef.current.timeScale().setVisibleRange({ from: fromTime, to: toTime });
    } else {
      chartRef.current.timeScale().fitContent();
    }
  };

  // 初始化图表
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 初始化时加载日K数据（延迟执行确保chartRef已创建）
    setTimeout(() => {
      createSeries('daily');
      fetchKLineData('daily');
    }, 100);
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    try {
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#a0aec0',
        },
        grid: {
          vertLines: { color: 'rgba(45, 55, 72, 0.3)' },
          horzLines: { color: 'rgba(45, 55, 72, 0.3)' },
        },
        crosshair: {
          mode: 1,
          vertLine: {
            color: '#667eea',
            labelBackgroundColor: '#667eea'
          },
          horzLine: {
            color: '#667eea',
            labelBackgroundColor: '#667eea'
          }
        },
        rightPriceScale: {
          borderColor: 'rgba(45, 55, 72, 0.5)',
          autoScale: true,
          scaleMargins: { top: 0.1, bottom: 0.1 }
        },
        timeScale: {
          borderColor: 'rgba(45, 55, 72, 0.5)',
          timeVisible: true,
          secondsVisible: false,
          tickMarkFormatter: (time, tickMarkType, locale) => {
            const date = new Date(time * 1000);
            if (activeType === 'intraday') {
              // 分时图：显示 HH:MM
              const hours = date.getUTCHours().toString().padStart(2, '0');
              const minutes = date.getUTCMinutes().toString().padStart(2, '0');
              return `${hours}:${minutes}`;
            } else {
              // 五日/日K：显示 MM-DD
              const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
              const day = date.getUTCDate().toString().padStart(2, '0');
              return `${month}-${day}`;
            }
          },
          fixLeftEdge: true,
          fixRightEdge: true
        },
        handleScroll: {
          vertTouchDrag: false,
          horzTouchDrag: true,
          mouseWheel: true,
          pressedMouseMove: true
        },
        handleScale: {
          axisPressedMouseMove: { time: true, price: true },
          mouseWheel: true,
          pinch: true
        },
        width: chartContainerRef.current.clientWidth,
        height: 120
      });

      chartRef.current = chart;
      createSeries(activeType);

      const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth
          });
        }
      };

      window.addEventListener('resize', handleResize);
      fetchKLineData(activeType);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (chartRef.current) {
          chartRef.current.remove();
        }
      };
    } catch (error) {
      console.error('Chart initialization error:', error);
    }
  }, [code]);

  // 创建系列的辅助函数
  const createSeries = (type) => {
    if (!chartRef.current) return;

    try {
      let series;
      if (type === 'daily') {
        series = chartRef.current.addSeries(CandlestickSeries, {
          upColor: '#f56565',
          downColor: '#48bb78',
          borderUpColor: '#f56565',
          borderDownColor: '#48bb78',
          wickUpColor: '#f56565',
          wickDownColor: '#48bb78'
        });
        
        // 添加均线系列 (日K)
        maSeriesRef.current.ma5 = chartRef.current.addSeries(LineSeries, {
          color: '#e91e63',
          lineWidth: 1,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false
        });
        maSeriesRef.current.ma10 = chartRef.current.addSeries(LineSeries, {
          color: '#ff9800',
          lineWidth: 1,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false
        });
        maSeriesRef.current.ma20 = chartRef.current.addSeries(LineSeries, {
          color: '#9c27b0',
          lineWidth: 1,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false
        });
        maSeriesRef.current.ma60 = chartRef.current.addSeries(LineSeries, {
          color: '#00bcd4',
          lineWidth: 1,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false
        });
      } else {
        // 主走势图
        series = chartRef.current.addSeries(LineSeries, {
          color: '#667eea',
          lineWidth: 2,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
          lastValueVisible: true,
          priceLineVisible: false,
          lastValueAnimation: false,
          priceFormat: {
            type: 'custom',
            formatter: (price) => price.toFixed(2) + '%'
          }
        });
        
        // 添加0.00%基准虚线
        const baselineSeries = chartRef.current.addSeries(LineSeries, {
          color: 'rgba(160, 174, 192, 0.8)',
          lineWidth: 1.5,
          lineStyle: 2, // 虚线
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false
        });
        
        // 添加13:00时间分隔线（午休结束）- 使用更深的颜色更明显的标记
        const middayLineSeries = chartRef.current.addSeries(LineSeries, {
          color: '#a0aec0', // 使用更不透明的灰色
          lineWidth: 3, // 加粗
          lineStyle: 0, // 实线
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false
        });
        
        // 保存基准线系列引用
        series.baselineSeries = baselineSeries;
        series.middayLineSeries = middayLineSeries;
      }
      
      seriesRef.current = series;
    } catch (error) {
      console.error('Create series error:', error);
    }
  };

  // 切换类型时重新创建系列
  useEffect(() => {
    if (!chartRef.current) return;
    
    try {
      if (seriesRef.current) {
        chartRef.current.removeSeries(seriesRef.current);
        // 移除均线系列
        if (maSeriesRef.current.ma5) {
          chartRef.current.removeSeries(maSeriesRef.current.ma5);
          maSeriesRef.current.ma5 = null;
        }
        if (maSeriesRef.current.ma10) {
          chartRef.current.removeSeries(maSeriesRef.current.ma10);
          maSeriesRef.current.ma10 = null;
        }
        if (maSeriesRef.current.ma20) {
          chartRef.current.removeSeries(maSeriesRef.current.ma20);
          maSeriesRef.current.ma20 = null;
        }
        if (maSeriesRef.current.ma60) {
          chartRef.current.removeSeries(maSeriesRef.current.ma60);
          maSeriesRef.current.ma60 = null;
        }
        // 同时移除基准线和13:00分隔线
        if (seriesRef.current.baselineSeries) {
          chartRef.current.removeSeries(seriesRef.current.baselineSeries);
        }
        if (seriesRef.current.middayLineSeries) {
          chartRef.current.removeSeries(seriesRef.current.middayLineSeries);
        }
      }
      
      createSeries(activeType);
      fetchKLineData(activeType);
    } catch (error) {
      console.error('Switch type error:', error);
    }
  }, [activeType]);

  return (
    <div className="stock-chart-container">
      <div className="chart-header">
        <span className="chart-title">{name || code} 走势图</span>
        <div className="chart-type-switcher">
          <button 
            className={activeType === 'intraday' ? 'active' : ''}
            onClick={() => setActiveType('intraday')}
          >
            分时
          </button>
          <button 
            className={activeType === '5day' ? 'active' : ''}
            onClick={() => setActiveType('5day')}
          >
            五日
          </button>
          <button 
            className={activeType === 'daily' ? 'active' : ''}
            onClick={() => setActiveType('daily')}
          >
            日K
          </button>
        </div>
        {activeType === 'daily' && (
          <div className="ma-legend">
            <span className="ma-item"><span className="ma-dot" style={{background: '#e91e63'}}></span>MA5</span>
            <span className="ma-item"><span className="ma-dot" style={{background: '#ff9800'}}></span>MA10</span>
            <span className="ma-item"><span className="ma-dot" style={{background: '#9c27b0'}}></span>MA20</span>
            <span className="ma-item"><span className="ma-dot" style={{background: '#00bcd4'}}></span>MA60</span>
          </div>
        )}
      </div>
      <div className="chart-wrapper">
        {loading && <div className="chart-loading">加载中...</div>}
        <div ref={chartContainerRef} className="chart-container" />
      </div>
    </div>
  );
}

export default StockChart;
