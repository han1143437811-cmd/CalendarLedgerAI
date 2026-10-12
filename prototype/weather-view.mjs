import {weatherPaths} from './weather-icons.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel = date => /^\d{4}-\d{2}-\d{2}$/.test(date ?? '')
  ? Number(date.slice(5, 7)) + '月' + Number(date.slice(8)) + '日' : '';
const degrees = value => typeof value === 'number' && Number.isFinite(value) ? Math.round(value) + '°' : '—';
const temperature = day => typeof day?.min === 'number' && typeof day?.max === 'number'
  ? degrees(day.min) + ' / ' + degrees(day.max) : '温度暂无数据';
export function weatherIcon(name, size = 24) {
  return `<svg class="weather-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(weatherPaths[name] ?? []).map(([color, path]) => `<path class="weather-${color}" d="${path}"/>`).join('')}</svg>`;
}
export function weatherSummary(data = {}) {
  if (!data.city) return '<div class="weather-placeholder">选择一个城市，让天气住进你的日历。</div>';
  const today = data.days?.find(day => day.date === data.today);
  const stamp = data.updatedAt > 0 ? new Intl.DateTimeFormat('zh-CN', {
    month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false
  }).format(new Date(data.updatedAt)) : '';
  const status = data.refreshing ? '正在更新天气…'
    : data.expired && data.updatedAt > 0 ? '预报缓存已过期，重新打开应用时更新'
    : data.updatedAt > 0 ? '最近更新 ' + stamp + (data.stale ? ' · 缓存较早' : '') : '尚未获取预报';
  const strip = (data.days ?? []).slice(0, 7).map(day => {
    const label = day.date === data.today ? '今日' : day.date?.slice(5).replace('-', '/');
    return `<div class="weather-forecast-day" aria-label="${escape(dateLabel(day.date) + '，' + day.description + '，' + temperature(day))}"><small>${escape(label)}</small>${weatherIcon(day.icon, 22)}<span>${escape(day.description)}</span><b>${degrees(day.max)}</b><small>${degrees(day.min)}</small></div>`;
  }).join('');
  return `<div class="weather-summary">
    <div class="weather-current">${today ? weatherIcon(today.icon, 42) : weatherIcon('cloud', 42)}
      <div class="grow"><b>${escape(data.city.name)}</b><span>${today ? escape(today.description) : '等待天气预报'}</span></div>
      <strong>${today ? escape(temperature(today)) : '—'}</strong></div>
    <p class="weather-update" role="status">${escape(status)}</p>
    ${data.lastError ? `<p class="weather-error" role="alert">${escape(data.lastError)}</p>` : ''}
    ${strip ? `<div class="weather-forecast">${strip}</div><p class="weather-range">已缓存预报至 ${escape(dateLabel(data.forecastEnd))} · 只显示有预报的日期</p>` : ''}
  </div>`;
}
let activeView;
globalThis.addEventListener?.('calendar-weather-changed', () => activeView?.refresh());

/** This screen reads the native cache; it never polls or contacts a weather API itself. */
export function openWeatherSettings({openModal, nativeRequest, isAndroid}) {
  openModal('桌面天气', '日期旁的一点天气，出门前看一眼。', `
    <div class="weather-settings">
      <div id="weather-status" aria-live="polite"><div class="weather-placeholder">${isAndroid ? '正在读取天气…' : '桌面天气可在手机 APK 中设置。'}</div></div>
      <p class="weather-policy">仅在打开应用时更新；小组件读取缓存，不在后台联网。</p>
      ${isAndroid ? `<form id="weather-search-form" class="weather-search">
        <label for="weather-city-input">天气城市</label>
        <div><input id="weather-city-input" name="city" type="search" placeholder="搜索城市，例如：北京" minlength="2" maxlength="60" autocomplete="off" required><button type="submit" class="btn soft">搜索</button></div>
      </form><div id="weather-search-results" class="weather-search-results"></div><p id="weather-search-error" class="weather-error" role="alert"></p>
      <button type="button" class="text-button" data-weather-clear hidden>关闭天气显示</button>` : ''}
      <p class="weather-source">天气：<a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> · <a href="https://open-meteo.com/en/licence" target="_blank" rel="noopener">CC BY 4.0</a><br>城市：<a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a>。仅发送所选城市信息。<br>预报以图标展示，温度取整。</p>
      <footer class="form-actions"><button type="button" class="btn primary" data-action="close-modal">完成</button></footer>
    </div>`);
  const panel = document.querySelector('.weather-settings');
  document.activeElement?.blur();
  if (!isAndroid) return;
  let results = [], sequence = 0, searching = false;
  const request = async (route, body = {}) => {
    const response = await nativeRequest(route, body);
    if (response.status !== 200) throw new Error(response.data?.error ?? '天气请求未完成，请稍后重试。');
    return response.data;
  };
  const show = data => {
    if (!panel.isConnected) return;
    panel.querySelector('#weather-status').innerHTML = weatherSummary(data);
    panel.querySelector('[data-weather-clear]').hidden = !data.city;
  };
  const refresh = async () => {
    if (!panel.isConnected) return;
    const current = ++sequence;
    try { const data = await request('/api/weather'); if (current === sequence) show(data); }
    catch { if (current === sequence && panel.isConnected) panel.querySelector('#weather-status').textContent = '天气缓存暂时无法读取，请重新打开应用。'; }
  };
  activeView = {refresh};
  refresh();
  const form = panel.querySelector('form'), error = panel.querySelector('#weather-search-error');
  form.addEventListener('submit', async event => {
    event.preventDefault(); event.stopPropagation();
    if (searching) return;
    searching = true; form.querySelector('button').disabled = true; error.textContent = '';
    panel.querySelector('#weather-search-results').textContent = '正在搜索城市…';
    try {
      const data = await request('/api/weather-search', {name: form.elements.city.value.trim()});
      if (!panel.isConnected) return;
      results = data.results ?? [];
      panel.querySelector('#weather-search-results').innerHTML = results.length
        ? results.map((city, index) => `<button type="button" class="weather-city-option" data-weather-index="${index}"><span><b>${escape(city.name)}</b><small>${escape([city.admin1, city.country].filter(Boolean).join(' · '))}</small></span><span>选择</span></button>`).join('')
        : '<p class="settings-note">没有找到城市，请试试拼音、英文或邻近城市名称。</p>';
    } catch (reason) {
      if (panel.isConnected) { panel.querySelector('#weather-search-results').textContent = ''; error.textContent = reason.message; }
    } finally { searching = false; if (panel.isConnected) form.querySelector('button').disabled = false; }
  });
  panel.addEventListener('click', async event => {
    const button = event.target.closest('[data-weather-index],[data-weather-clear]');
    if (!button || searching) return;
    event.preventDefault();
    const city = button.hasAttribute('data-weather-clear') ? null : results[Number(button.dataset.weatherIndex)];
    if (city === undefined) return;
    searching = true; button.disabled = true; error.textContent = '';
    try {
      const data = await request('/api/weather-city', {city});
      if (!panel.isConnected) return;
      show(data); panel.querySelector('#weather-search-results').textContent = '';
      form.elements.city.value = city?.name ?? '';
    } catch (reason) { if (panel.isConnected) error.textContent = reason.message; }
    finally { searching = false; if (panel.isConnected) button.disabled = false; }
  });
}
