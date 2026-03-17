const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    const dbPath = path.join(__dirname, '../../data/stock.db');
    const fs = require('fs');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        console.error('Database open error:', err);
      }
    });
    this.init();
  }

  init() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS holdings (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        type TEXT DEFAULT 'buy',
        buy_price REAL,
        sell_price REAL,
        quantity INTEGER NOT NULL,
        buy_date DATE,
        sell_date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (code) REFERENCES holdings(code) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        action TEXT NOT NULL,
        action_desc TEXT NOT NULL,
        reason TEXT NOT NULL,
        current_price REAL,
        avg_cost REAL,
        change_percent REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS doubling_recommendations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        current_price REAL,
        target_price REAL,
        buy_range TEXT,
        upside TEXT,
        probability TEXT,
        logic TEXT,
        source TEXT DEFAULT 'ai',
        model_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS analysis_stocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        current_price REAL,
        target_price REAL,
        buy_range TEXT,
        logic TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS elite_2026_scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_stocks INTEGER DEFAULT 0,
        passed_count INTEGER DEFAULT 0,
        part1_count INTEGER DEFAULT 0,
        part2_count INTEGER DEFAULT 0,
        none_count INTEGER DEFAULT 0
      )
    `);

    // 回测记录表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS backtest_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        backtest_date DATE NOT NULL,
        code TEXT NOT NULL,
        name TEXT,
        score INTEGER DEFAULT 0,
        buy_price REAL NOT NULL,
        sell_price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        buy_cost REAL NOT NULL,
        sell_amount REAL NOT NULL,
        profit REAL NOT NULL,
        profit_percent REAL NOT NULL,
        backtest_type TEXT DEFAULT '预测',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS elite_2026_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        current_price REAL,
        change REAL,
        change_percent REAL,
        rise_speed REAL,
        turnover REAL,
        high_price REAL,
        low_price REAL,
        open_price REAL,
        close_price REAL,
        volume REAL,
        volume_ratio REAL,
        circulate_value REAL,
        sector TEXT,
        passed INTEGER DEFAULT 0,
        part1_passed INTEGER DEFAULT 0,
        part2_passed INTEGER DEFAULT 0,
        signals_json TEXT,
        data_time TEXT,
        data_source TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (scan_id) REFERENCES elite_2026_scans(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS alert_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        condition TEXT NOT NULL,
        threshold REAL,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS rule_trigger_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        trigger_price REAL,
        buy_price REAL,
        hold_quantity INTEGER,
        change_percent REAL,
        rule_name TEXT,
        rule_condition TEXT,
        action TEXT,
        action_desc TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS price_after_trigger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger_id INTEGER NOT NULL,
        record_date DATE NOT NULL,
        high_price REAL,
        low_price REAL,
        close_price REAL,
        change_percent REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (trigger_id) REFERENCES rule_trigger_log(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS sell_decision_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        trigger_reason TEXT NOT NULL,
        adjustment_basis TEXT,
        actual_action TEXT NOT NULL,
        sell_price REAL,
        sell_quantity REAL,
        profit_percent REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS sell_timing_reminder (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        target_price REAL,
        estimated_time TEXT,
        reminder_type TEXT,
        status INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async addHolding(code, name) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO holdings (code, name, updated_at) 
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(code) DO UPDATE SET 
         name = excluded.name, updated_at = CURRENT_TIMESTAMP`,
        [code, name],
        function(err) {
          if (err) reject(err);
          else resolve({ code, name });
        }
      );
    });
  }

  async addTrade(code, buyPrice, quantity, buyDate) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO trades (code, type, buy_price, quantity, buy_date) 
         VALUES (?, 'buy', ?, ?, ?)`,
        [code, buyPrice, quantity, buyDate],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, code, buyPrice, quantity, buyDate, type: 'buy' });
        }
      );
    });
  }

  async addSellTrade(code, sellPrice, quantity, sellDate) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO trades (code, type, sell_price, quantity, sell_date) 
         VALUES (?, 'sell', ?, ?, ?)`,
        [code, sellPrice, quantity, sellDate],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, code, sellPrice, quantity, sellDate, type: 'sell' });
        }
      );
    });
  }

  async getHoldings() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT h.*, 
          GROUP_CONCAT(t.id || ':' || t.type || ':' || COALESCE(t.buy_price, 'null') || ':' || COALESCE(t.sell_price, 'null') || ':' || t.quantity || ':' || COALESCE(t.buy_date, 'null') || ':' || COALESCE(t.sell_date, 'null'), ';') as trades
         FROM holdings h
         LEFT JOIN trades t ON h.code = t.code
         GROUP BY h.code
         ORDER BY h.updated_at DESC`,
        [],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            const holdings = rows.map(row => ({
              code: row.code,
              name: row.name,
              addedAt: row.created_at,
              updatedAt: row.updated_at,
              trades: row.trades ? row.trades.split(';').map(t => {
                const [id, type, buyPrice, sellPrice, quantity, buyDate, sellDate] = t.split(':');
                const trade = { 
                  id: parseInt(id), 
                  type: type,
                  quantity: parseInt(quantity)
                };
                if (type === 'buy') {
                  trade.buyPrice = buyPrice !== 'null' ? parseFloat(buyPrice) : null;
                  trade.buyDate = buyDate !== 'null' ? buyDate : null;
                } else {
                  trade.sellPrice = sellPrice !== 'null' ? parseFloat(sellPrice) : null;
                  trade.sellDate = sellDate !== 'null' ? sellDate : null;
                }
                return trade;
              }) : []
            }));
            resolve(holdings);
          }
        }
      );
    });
  }

  async deleteHolding(code) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM holdings WHERE code = ?', [code], function(err) {
        if (err) reject(err);
        else resolve({ deleted: this.changes > 0 });
      });
    });
  }

  async deleteTrade(tradeId) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM trades WHERE id = ?', [tradeId], function(err) {
        if (err) reject(err);
        else resolve({ deleted: this.changes > 0 });
      });
    });
  }

  async addAlert(alert) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO alerts (code, action, action_desc, reason, current_price, avg_cost, change_percent) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [alert.code, alert.action, alert.actionDesc, alert.reason, alert.currentPrice, alert.avgCost, alert.changePercent],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }

  async getRecentAlerts(limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT a.*, h.name as stock_name 
         FROM alerts a
         LEFT JOIN holdings h ON a.code = h.code
         ORDER BY a.created_at DESC
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async hasRecentAlert(code, action) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT COUNT(*) as count FROM alerts 
         WHERE code = ? AND action = ? 
         AND datetime(created_at) > datetime('now', '-1 hour')`,
        [code, action],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count > 0);
        }
      );
    });
  }

  async addDoublingRecommendation(stock) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO doubling_recommendations 
         (code, name, current_price, target_price, buy_range, upside, probability, logic, source, model_id, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(code) DO UPDATE SET 
         name = excluded.name,
         current_price = excluded.current_price,
         target_price = excluded.target_price,
         buy_range = excluded.buy_range,
         upside = excluded.upside,
         probability = excluded.probability,
         logic = excluded.logic,
         source = excluded.source,
         model_id = excluded.model_id,
         updated_at = CURRENT_TIMESTAMP`,
        [stock.code, stock.name, stock.current, stock.target, stock.buy, stock.upside, stock.prob, stock.logic, stock.source || 'ai', stock.modelId],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, code: stock.code });
        }
      );
    });
  }

  async getDoublingRecommendations() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM doubling_recommendations ORDER BY created_at DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async deleteDoublingRecommendation(code) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM doubling_recommendations WHERE code = ?', [code], function(err) {
        if (err) reject(err);
        else resolve({ deleted: this.changes > 0 });
      });
    });
  }

  async clearDoublingRecommendations() {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM doubling_recommendations', function(err) {
        if (err) reject(err);
        else resolve({ deleted: this.changes });
      });
    });
  }

  async addAnalysisStock(stock) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO analysis_stocks 
         (code, name, current_price, target_price, buy_range, logic) 
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET 
         name = excluded.name,
         current_price = excluded.current_price,
         target_price = excluded.target_price,
         buy_range = excluded.buy_range,
         logic = excluded.logic`,
        [stock.code, stock.name, stock.currentPrice, stock.targetPrice, stock.buy, stock.logic],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, code: stock.code });
        }
      );
    });
  }

  async getAnalysisStocks() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM analysis_stocks ORDER BY created_at DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async deleteAnalysisStock(code) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM analysis_stocks WHERE code = ?', [code], function(err) {
        if (err) reject(err);
        else resolve({ deleted: this.changes > 0 });
      });
    });
  }

  async saveScanResults(scanId, results) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO elite_2026_results (
          scan_id, code, name, current_price, change, change_percent,
          rise_speed, turnover, high_price, low_price, open_price, close_price,
          volume, volume_ratio, circulate_value, sector,
          passed, part1_passed, part2_passed, signals_json, data_time, data_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const r of results) {
        stmt.run([
          scanId, r.code, r.name, r.currentPrice, r.change || 0, r.changePercent || 0,
          r.riseSpeed || 0, r.turnover || 0, r.highPrice || 0, r.lowPrice || 0, r.openPrice || 0, r.closePrice || 0,
          r.volume || 0, r.volumeRatio || 0, r.circValue || 0, r.sector || '',
          r.passed ? 1 : 0, r.part1Passed ? 1 : 0, r.part2Passed ? 1 : 0, 
          JSON.stringify(r.signals || {}), r.dataTime || '', r.dataSource || ''
        ]);
      }
      stmt.finalize((err) => {
        if (err) reject(err);
        else resolve({ saved: results.length });
      });
    });
  }

  async getLatestScanResults() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT r.* FROM elite_2026_results r
        WHERE r.scan_id = (SELECT scan_id FROM elite_2026_results ORDER BY scan_id DESC LIMIT 1)
        ORDER BY r.passed DESC, r.part1_passed DESC, r.part2_passed DESC
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async getScanHistory(limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM elite_2026_scans ORDER BY id DESC LIMIT ?`, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async getScanResults(scanId) {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM elite_2026_results WHERE scan_id = ? ORDER BY passed DESC, part1_passed DESC, part2_passed DESC`, [scanId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async createScanRecord(scanStartTime) {
    return new Promise((resolve, reject) => {
      this.db.run(`INSERT INTO elite_2026_scans (scan_time, total_stocks) VALUES (?, 0)`, [scanStartTime], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      });
    });
  }

  // 保存回测记录
  async saveBacktestRecords(backtestDate, stocks, backtestType = '预测') {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO backtest_records (backtest_date, code, name, score, buy_price, sell_price, quantity, buy_cost, sell_amount, profit, profit_percent, backtest_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const s of stocks) {
        stmt.run([
          backtestDate, s.code, s.name, s.score || 0, s.buyPrice, s.sellPrice, s.quantity, s.buyCost, s.sellAmount, s.profit, s.profitPercent, s.backtestType || backtestType
        ]);
      }
      stmt.finalize((err) => {
        if (err) reject(err);
        else resolve({ saved: stocks.length });
      });
    });
  }

  // 获取回测历史记录
  async getBacktestHistory(limit = 50, date = null) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM backtest_records';
      const params = [];
      if (date) {
        sql += ' WHERE backtest_date = ?';
        params.push(date);
      }
      sql += ' ORDER BY created_at DESC, backtest_date DESC LIMIT ?';
      params.push(limit);
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // 按回测日期分组统计
  async getBacktestSummary() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT backtest_date, COUNT(*) as stock_count, SUM(buy_cost) as total_cost, SUM(profit) as total_profit, SUM(profit_percent * buy_cost) / SUM(buy_cost) as avg_profit_percent
        FROM backtest_records 
        GROUP BY backtest_date 
        ORDER BY backtest_date DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async deleteBacktestByDate(date) {
    return new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM backtest_records WHERE backtest_date = ?`, [date], function(err) {
        if (err) reject(err);
        else resolve({ deleted: this.changes });
      });
    });
  }

  async getBacktestSummaryByDateRange(startDate = null, endDate = null) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT backtest_date, COUNT(*) as stock_count, SUM(buy_cost) as total_cost, SUM(sell_amount) as total_sell, SUM(profit) as total_profit FROM backtest_records';
      const params = [];
      if (startDate && endDate) {
        sql += ' WHERE backtest_date >= ? AND backtest_date <= ?';
        params.push(startDate, endDate);
      } else if (startDate) {
        sql += ' WHERE backtest_date >= ?';
        params.push(startDate);
      } else if (endDate) {
        sql += ' WHERE backtest_date <= ?';
        params.push(endDate);
      }
      sql += ' GROUP BY backtest_date ORDER BY backtest_date DESC';
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async updateBacktestScore(id, score) {
    return new Promise((resolve, reject) => {
      this.db.run(`UPDATE backtest_records SET score = ? WHERE id = ?`, [score, id], function(err) {
        if (err) reject(err);
        else resolve({ updated: this.changes });
      });
    });
  }

  async createScan() {
    return new Promise((resolve, reject) => {
      this.db.run(`INSERT INTO elite_2026_scans (total_stocks) VALUES (0)`, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      });
    });
  }

  async saveAlertRule(name, category, condition, threshold, enabled = 1) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO alert_rules (name, category, condition, threshold, enabled) VALUES (?, ?, ?, ?, ?)`,
        [name, category, condition, threshold, enabled],
        function(err) { if (err) reject(err); else resolve({ id: this.lastID }); }
      );
    });
  }

  async getAlertRules() {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM alert_rules ORDER BY category, id`, [], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });
  }

  async updateAlertRule(id, enabled) {
    return new Promise((resolve, reject) => {
      this.db.run(`UPDATE alert_rules SET enabled = ? WHERE id = ?`, [enabled, id], function(err) {
        if (err) reject(err); else resolve({ id, enabled });
      });
    });
  }

  async deleteAlertRule(id) {
    return new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM alert_rules WHERE id = ?`, [id], function(err) {
        if (err) reject(err); else resolve({ id });
      });
    });
  }

  async logRuleTrigger(code, name, triggerPrice, buyPrice, holdQuantity, changePercent, ruleName, ruleCondition, action, actionDesc) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO rule_trigger_log (code, name, trigger_price, buy_price, hold_quantity, change_percent, rule_name, rule_condition, action, action_desc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [code, name, triggerPrice, buyPrice, holdQuantity, changePercent, ruleName, ruleCondition, action, actionDesc],
        function(err) { if (err) reject(err); else resolve({ id: this.lastID }); }
      );
    });
  }

  async getRuleTriggerLog(limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM rule_trigger_log ORDER BY created_at DESC LIMIT ?`, [limit], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });
  }

  async addPriceAfterTrigger(triggerId, recordDate, highPrice, lowPrice, closePrice, changePercent) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO price_after_trigger (trigger_id, record_date, high_price, low_price, close_price, change_percent) VALUES (?, ?, ?, ?, ?, ?)`,
        [triggerId, recordDate, highPrice, lowPrice, closePrice, changePercent],
        function(err) { if (err) reject(err); else resolve({ id: this.lastID }); }
      );
    });
  }

  async getPriceAfterTrigger(triggerId) {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM price_after_trigger WHERE trigger_id = ? ORDER BY record_date`, [triggerId], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });
  }

  async deleteRuleTriggerLog(id) {
    return new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM rule_trigger_log WHERE id = ?`, [id], function(err) {
        if (err) reject(err); else resolve({ id });
      });
    });
  }

  async addSellDecisionLog(code, name, triggerReason, adjustmentBasis, actualAction, sellPrice, sellQuantity, profitPercent) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO sell_decision_log (code, name, trigger_reason, adjustment_basis, actual_action, sell_price, sell_quantity, profit_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [code, name, triggerReason, adjustmentBasis, actualAction, sellPrice, sellQuantity, profitPercent],
        function(err) { if (err) reject(err); else resolve({ id: this.lastID }); }
      );
    });
  }

  async getSellDecisionLog(limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM sell_decision_log ORDER BY created_at DESC LIMIT ?`, [limit], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });
  }

  async addSellTimingReminder(code, name, targetPrice, estimatedTime, reminderType) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO sell_timing_reminder (code, name, target_price, estimated_time, reminder_type, status) VALUES (?, ?, ?, ?, ?, 0)`,
        [code, name, targetPrice, estimatedTime, reminderType],
        function(err) { if (err) reject(err); else resolve({ id: this.lastID }); }
      );
    });
  }

  async getSellTimingReminders() {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM sell_timing_reminder WHERE status = 0 ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });
  }

  async updateSellTimingReminderStatus(id, status) {
    return new Promise((resolve, reject) => {
      this.db.run(`UPDATE sell_timing_reminder SET status = ? WHERE id = ?`, [status, id], function(err) {
        if (err) reject(err); else resolve({ id, status });
      });
    });
  }

  async deleteSellTimingReminder(id) {
    return new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM sell_timing_reminder WHERE id = ?`, [id], function(err) {
        if (err) reject(err); else resolve({ id });
      });
    });
  }

  async getHoldingsSectorAnalysis(holdingsCodes) {
    if (!holdingsCodes || holdingsCodes.length === 0) return { sectors: [], totalValue: 0 };
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT code, name FROM holdings WHERE code IN (${holdingsCodes.map(() => '?').join(',')})`, holdingsCodes, (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = Database;
