import React from 'react';
import { useNavigate } from 'react-router-dom';
import './CloudMap.css';

function CloudMap() {
  const navigate = useNavigate();

  return (
    <div className="cloudmap-wrapper">
      <div className="cloudmap-header">
        <button className="cloudmap-back-btn" onClick={() => navigate('/')}>
          ← 返回首页
        </button>
        <span className="cloudmap-title">📊 大盘云图</span>
        <div style={{ width: '100px' }}></div>
      </div>
      <div className="cloudmap-content">
        <iframe
          src="https://52etf.site/"
          title="大盘云图"
          allowFullScreen
        />
      </div>
    </div>
  );
}

export default CloudMap;
