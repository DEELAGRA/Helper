// ==UserScript==
// @name         Avito Helper — Версия 2.3 (с сегодня/вчера и точками в месяцах)
// @namespace    local.agent
// @version      2.3
// @description  Обработка: "сегодня, 15:08" → ДД.ММ.ГГГГ; месяцы с точкой (нояб.); поддержка бонусов.
// @author       Агент
// @match        https://www.avito.ru/profile/candidates
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  let panel = null;
  let listContainer = null;
  let isUpdating = false;
  let userIsInteracting = false;
  let lastKnownCount = 0;

  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  // === Парсер даты ===
  function parseRelativeDate(text) {
    if (!text) return null;

    // Очистка от неразрывных пробелов и лишних символов
    let cleanText = text.trim().replace(/\u00A0|\u2009/g, ' ');

    const now = new Date();
    const msk = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
    const year = msk.getFullYear();
    const month = msk.getMonth();
    const day = msk.getDate();

    // Формат: ДД.ММ.ГГГГ
    function formatDate(d) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    }

    // Обрабатываем "сегодня, ..." и "вчера, ..."
    if (cleanText.startsWith('сегодня')) {
      return formatDate(msk);
    }
    if (cleanText.startsWith('вчера')) {
      const y = new Date(msk);
      y.setDate(day - 1);
      return formatDate(y);
    }

    // Словарь месяцев с точкой (как в интерфейсе Avito)
    const months = {
      'янв.': 0,
      'февр.': 1,
      'мар.': 2,
      'апр.': 3,
      'мая.': 4,
      'июн.': 5,
      'июл.': 6,
      'авг.': 7,
      'сент.': 8,
      'окт.': 9,
      'нояб.': 10,
      'дек.': 11
    };

    const match = cleanText.match(/(\d{1,2})\s+(.+)/);
    if (match) {
      const d = parseInt(match[1], 10);
      const mStr = match[2].trim();
      const m = months[mStr];
      if (m !== undefined) {
        let date = new Date(year, m, d);
        if (date > msk) {
          date = new Date(year - 1, m, d);
        }
        return formatDate(date);
      }
    }

    return null; // не удалось распознать
  }

  function createPanel() {
    panel = document.createElement('div');
    panel.id = 'avito-candidates-helper';
    panel.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      z-index: 2147483647;
      width: 340px;
      max-height: 90vh;
      background: ${isDark ? 'rgba(30, 30, 34, 0.85)' : 'rgba(255, 255, 255, 0.85)'};
      border-radius: 18px;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      box-shadow: ${isDark
        ? '0 8px 24px rgba(0, 0, 0, 0.4)'
        : '0 8px 24px rgba(0, 0, 0, 0.12)'};
      border: 1px solid ${isDark ? 'rgba(60, 60, 68, 0.6)' : 'rgba(230, 230, 235, 0.8)'};
      color: ${isDark ? '#f5f5f7' : '#1d1d1f'};
    `;

    const header = document.createElement('div');
    header.textContent = '📨 Некорректные действия';
    header.style.cssText = `
      font-size: 17px;
      font-weight: 600;
      padding: 8px 0;
      text-align: center;
      cursor: move;
      user-select: none;
    `;

    listContainer = document.createElement('div');
    listContainer.id = 'avito-candidates-list';
    listContainer.style.cssText = `
      max-height: 360px;
      overflow-y: auto;
      padding: 6px 0;
      margin: 10px 0;
      scrollbar-width: thin;
      scrollbar-color: ${isDark ? '#666 #333' : '#ccc #eee'};
    `;

    const style = document.createElement('style');
    style.textContent = `
      #avito-candidates-list::-webkit-scrollbar {
        width: 8px;
      }
      #avito-candidates-list::-webkit-scrollbar-track {
        background: transparent;
      }
      #avito-candidates-list::-webkit-scrollbar-thumb {
        background: ${isDark ? 'rgba(100, 100, 110, 0.6)' : 'rgba(180, 180, 190, 0.6)'};
        border-radius: 4px;
      }
    `;
    document.head.appendChild(style);

    const btnGroup = document.createElement('div');
    btnGroup.style.display = 'flex';
    btnGroup.style.gap = '8px';
    btnGroup.style.marginTop = '10px';

    const resultBtn = document.createElement('button');
    resultBtn.textContent = '📋 Сформировать';
    resultBtn.style.cssText = `
      flex: 1;
      padding: 10px;
      font-size: 14px;
      font-weight: 500;
      border: none;
      border-radius: 12px;
      background: ${isDark ? 'rgba(40, 120, 240, 0.8)' : 'rgba(0, 122, 255, 0.85)'};
      color: white;
      cursor: pointer;
    `;
    resultBtn.onclick = () => {
      const checked = listContainer.querySelectorAll('input[type="checkbox"]:checked');
      if (checked.length === 0) return alert('Выберите хотя бы одно действие.');
      let total = 0;
      const ids = [];
      const details = [];
      checked.forEach(cb => {
        const id = cb.dataset.adId;
        const cost = parseInt(cb.dataset.cost) || 0;
        const name = cb.dataset.name || '—';
        const date = cb.dataset.date || '—';
        total += cost;
        ids.push(id);
        details.push(`${id}, ${name}, ${date}`);
      });
      const message = `_ссылка_на_обращение_\n«зачислил на ЦД ${total} бонусов»\nID, имя, дата: ${details.join('; ')}`;
      prompt('Скопируйте результат:', message);
    };

    const resetBtn = document.createElement('button');
    resetBtn.textContent = '↺ Сброс';
    resetBtn.style.cssText = `
      flex: 1;
      padding: 10px;
      font-size: 14px;
      font-weight: 500;
      border: none;
      border-radius: 12px;
      background: ${isDark ? 'rgba(60, 60, 70, 0.9)' : 'rgba(240, 240, 245, 0.9)'};
      color: ${isDark ? '#e0e0e0' : '#333'};
      cursor: pointer;
    `;
    resetBtn.onclick = () => {
      listContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    };

    btnGroup.append(resultBtn, resetBtn);
    panel.append(header, listContainer, btnGroup);
    document.body.appendChild(panel);

    // Перетаскивание панели
    let isDragging = false, offsetX, offsetY;
    header.onmousedown = (e) => {
      isDragging = true;
      offsetX = e.clientX - panel.getBoundingClientRect().left;
      offsetY = e.clientY - panel.getBoundingClientRect().top;
      e.preventDefault();
    };
    document.onmousemove = (e) => {
      if (isDragging) {
        panel.style.left = (e.clientX - offsetX) + 'px';
        panel.style.top = (e.clientY - offsetY) + 'px';
        panel.style.right = 'auto';
      }
    };
    document.onmouseup = () => isDragging = false;
    header.onselectstart = () => false;
  }

  function updateList() {
    if (isUpdating || userIsInteracting || !listContainer) return;

    const nameElements = Array.from(document.querySelectorAll('h3.styles-module-root-kOQmn'));
    const linkElements = Array.from(document.querySelectorAll('a[data-marker="job-application/link/to-resume"]'));
    const currentCount = linkElements.length;

    if (currentCount === 0 && lastKnownCount === 0) return;
    if (currentCount === lastKnownCount) return;

    isUpdating = true;
    lastKnownCount = currentCount;

    const scrollTop = listContainer.scrollTop;
    listContainer.innerHTML = '';

    linkElements.forEach((item, index) => {
      const href = item.getAttribute('href') || '';
      const idMatch = href.match(/\/(\d{10})$/);
      const adId = idMatch ? idMatch[1] : null;
      if (!adId) return;

      // === Стоимость: основная + бонус ===
      let totalCost = 0;
      const costElements = item.querySelectorAll('span.styles-value-vuUFH');
      costElements.forEach(el => {
        let text = el.textContent || '';
        text = text.replace(/\u2009|\s/g, '').replace(',', '.');
        const match = text.match(/[\d.]+/);
        if (match) {
          const num = parseFloat(match[0]);
          if (!isNaN(num)) totalCost += Math.round(num);
        }
      });

      // === Имя ===
      const name = index < nameElements.length ? nameElements[index].textContent.trim() : 'Неизвестно';

      // === Дата ===
      let dateStr = '—';
      const detailsEl = item.querySelector('span.styles-details-NhaVT');
      if (detailsEl) {
        const parts = detailsEl.textContent.split('·').map(s => s.trim());
        // Пример: ['', 'сегодня, 15:08', '56 ₽'] → дата в parts[1]
        if (parts.length >= 2) {
          const rawDate = parts[1];
          const formattedDate = parseRelativeDate(rawDate);
          dateStr = formattedDate || rawDate;
        }
      }

      // === Отображение ===
      const row = document.createElement('div');
      row.style.padding = '8px 0';
      row.style.borderBottom = `1px solid ${isDark ? 'rgba(80,80,90,0.3)' : 'rgba(220,220,230,0.5)'}`;
      row.style.fontSize = '14px';

      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.cursor = 'pointer';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.adId = adId;
      checkbox.dataset.cost = totalCost;
      checkbox.dataset.name = name;
      checkbox.dataset.date = dateStr;
      checkbox.style.marginRight = '10px';
      checkbox.style.transform = 'scale(1.1)';
      checkbox.style.accentColor = isDark ? '#2878f0' : '#007aff';

      const text = document.createElement('div');
      text.innerHTML = `
        <div style="font-weight: 600; font-size: 14px;">${adId}</div>
        <div style="font-size: 12px; opacity: 0.85; margin-top: 2px;">${totalCost} ₽ • ${name}</div>
        <div style="font-size: 11px; opacity: 0.7; margin-top: 2px;">🗓️ ${dateStr}</div>
      `;
      text.style.flex = '1';

      label.append(checkbox, text);
      row.appendChild(label);
      listContainer.appendChild(row);
    });

    setTimeout(() => {
      listContainer.scrollTop = scrollTop;
      isUpdating = false;
    }, 0);
  }

  // === ЗАПУСК ===
  createPanel();
  listContainer?.addEventListener('mousedown', () => userIsInteracting = true);
  listContainer?.addEventListener('mouseup', () => userIsInteracting = false);
  listContainer?.addEventListener('click', () => userIsInteracting = false);

  setTimeout(updateList, 1200);

  let updateScheduled = false;
  const observer = new MutationObserver(() => {
    if (!updateScheduled && !userIsInteracting && !isUpdating) {
      updateScheduled = true;
      setTimeout(() => {
        updateList();
        updateScheduled = false;
      }, 600);
    }
  });

  const main = document.querySelector('[data-marker="main"]') || document.body;
  observer.observe(main, { childList: true, subtree: true });
})();