const fs = require('fs');
const { URL } = require('url');

function readLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, lines: [] };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  return { exists: true, lines };
}

function validateSubscribe(filePath) {
  const { exists, lines } = readLines(filePath);
  const result = {
    path: filePath,
    errors: [],
    warnings: [],
    stats: { total: 0, valid: 0 }
  };

  if (!exists) {
    result.errors.push('订阅文件不存在');
    return result;
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      return;
    }

    result.stats.total += 1;

    if (!line.includes('://')) {
      result.errors.push(`第 ${index + 1} 行缺少协议前缀: ${line}`);
      return;
    }

    try {
      new URL(
        line
          .replace(/^mitv:\/\//i, 'http://example.com/')
          .replace(/^rtmp:\/\//i, 'http://example.com/')
      );
      result.stats.valid += 1;
    } catch (error) {
      // 对于一些不被 URL 支持的协议，已经在上方替换处理
      result.warnings.push(`第 ${index + 1} 行 URL 未通过标准解析: ${line}`);
      result.stats.valid += 1;
    }
  });

  if (result.stats.total === 0) {
    result.warnings.push('未找到任何有效的订阅地址');
  }

  return result;
}

function validateAlias(filePath) {
  const { exists, lines } = readLines(filePath);
  const result = {
    path: filePath,
    errors: [],
    warnings: [],
    stats: { total: 0, valid: 0 }
  };

  if (!exists) {
    result.warnings.push('别名文件不存在，跳过校验');
    return result;
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      return;
    }

    result.stats.total += 1;
    const parts = line.split(',').map(part => part.trim()).filter(Boolean);

    if (parts.length < 2) {
      result.errors.push(`第 ${index + 1} 行至少需要一个别名: ${line}`);
      return;
    }

    result.stats.valid += 1;
  });

  return result;
}

function validateTemplate(filePath) {
  const { exists, lines } = readLines(filePath);
  const result = {
    path: filePath,
    errors: [],
    warnings: [],
    stats: { categories: 0, channels: 0 }
  };

  if (!exists) {
    result.warnings.push('模版文件不存在，聚合将使用默认排序');
    return result;
  }

  let currentCategory = null;
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }

    if (line.startsWith('#')) {
      result.warnings.push(`第 ${index + 1} 行以 # 开头，模板中会被忽略`);
      return;
    }

    if (line.includes(',#genre#')) {
      currentCategory = line.replace(',#genre#', '').trim();
      if (!currentCategory) {
        result.errors.push(`第 ${index + 1} 行分类名称不能为空`);
      } else {
        result.stats.categories += 1;
      }
      return;
    }

    if (!currentCategory) {
      result.errors.push(`第 ${index + 1} 行频道没有所属分类: ${line}`);
      return;
    }

    result.stats.channels += 1;
  });

  if (result.stats.categories === 0) {
    result.warnings.push('未定义任何分类，模版将不会生效');
  }

  return result;
}

function validateEpg(filePath) {
  const { exists, lines } = readLines(filePath);
  const result = {
    path: filePath,
    errors: [],
    warnings: [],
    stats: { total: 0 }
  };

  if (!exists) {
    result.warnings.push('EPG 文件不存在，播放器将无法显示节目单');
    return result;
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      return;
    }

    result.stats.total += 1;

    if (!line.includes('://')) {
      result.errors.push(`第 ${index + 1} 行不是有效的 URL: ${line}`);
    }
  });

  return result;
}

function validateLogo(filePath) {
  const { exists, lines } = readLines(filePath);
  const result = {
    path: filePath,
    errors: [],
    warnings: [],
    stats: { total: 0, valid: 0 }
  };

  if (!exists) {
    result.warnings.push('Logo 文件不存在，聚合结果将缺少自定义 logo');
    return result;
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      return;
    }

    result.stats.total += 1;
    const parts = line.split(',');

    if (parts.length < 2) {
      result.errors.push(`第 ${index + 1} 行缺少 logo 地址: ${line}`);
      return;
    }

    result.stats.valid += 1;
  });

  return result;
}

function aggregateValidation(results) {
  const summary = {
    checkedAt: new Date().toISOString(),
    hasErrors: false,
    errors: [],
    warnings: [],
    files: results
  };

  Object.values(results).forEach(fileResult => {
    if (fileResult.errors.length > 0) {
      summary.hasErrors = true;
      summary.errors.push(...fileResult.errors.map(error => `${fileResult.path}: ${error}`));
    }
    if (fileResult.warnings.length > 0) {
      summary.warnings.push(...fileResult.warnings.map(warning => `${fileResult.path}: ${warning}`));
    }
  });

  return summary;
}

function validateSourceConfigs(configFiles) {
  const results = {
    subscribe: validateSubscribe(configFiles.subscribe),
    alias: validateAlias(configFiles.alias),
    template: validateTemplate(configFiles.template),
    epg: validateEpg(configFiles.epg),
    logo: validateLogo(configFiles.logo)
  };

  return aggregateValidation(results);
}

module.exports = {
  validateSourceConfigs
};
