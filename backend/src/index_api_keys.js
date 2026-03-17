// API key配置管理
const API_KEYS = {
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
  KIMI_API_KEY: process.env.KIMI_API_KEY || '',
  DOUBAO_API_KEY: process.env.DOUBAO_API_KEY || '',
  CHATGPT_API_KEY: process.env.CHATGPT_API_KEY || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || ''
};

// 获取API key列表（隐藏部分字符）
function getMaskedKeys() {
  const masked = {};
  for (const [key, value] of Object.entries(API_KEYS)) {
    if (value) {
      masked[key] = value.slice(0, 8) + '****' + value.slice(-4);
    } else {
      masked[key] = '';
    }
  }
  return masked;
}

// 更新API key
function setApiKey(keyName, value) {
  if (API_KEYS.hasOwnProperty(keyName)) {
    API_KEYS[keyName] = value;
    return true;
  }
  return false;
}

// 获取原始API key（供AI chat使用）
function getApiKey(keyName) {
  return API_KEYS[keyName] || process.env[keyName] || '';
}

module.exports = { getMaskedKeys, setApiKey, getApiKey, API_KEYS };
