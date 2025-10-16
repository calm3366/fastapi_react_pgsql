// frontend/src/BondsPage.jsx
import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';

Modal.setAppElement('#root'); // для доступности

export default function BondsPage({...props}) {
  const { query, setQuery, results, bonds, onSearch, onAdd, onDeleteSelected, onRefreshAll, lastUpdateTime, onCreateTrade, addLog, loadSummary } = props;
  const [selectedIds, setSelectedIds] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeBond, setActiveBond] = useState(null);
  const [refreshing, setRefreshing] = useState(false); // прогресс-бар
  const [progress, setProgress] = useState(0); // прогресс-бар
  const [bondsWithWeights, setBondsWithWeights] = useState([]);

  const [formData, setFormData] = useState({
    buy_date: '',
    buy_price: '',
    buy_qty: '',
    buy_nkd: '',
    sell_date: '',
    sell_price: '',
    sell_qty: '',
    sell_nkd: ''
  });
  
  useEffect(() => {
    // Загружаем веса
    fetch("/bonds/weights")
      .then(res => res.json())
      .then(data => setBondsWithWeights(data));

    const interval = setInterval(() => {
      onRefreshAll();
      if (loadSummary) loadSummary();
      fetch("/bonds/weights")
        .then(res => res.json())
        .then(data => setBondsWithWeights(data));
    }, 60000);

    return () => clearInterval(interval);
  }, [onRefreshAll, loadSummary]);
  
  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === bonds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(bonds.map(b => b.id));
    }
  };

  const handleDelete = () => {
    if (selectedIds.length > 0) {
      onDeleteSelected(selectedIds);
      setSelectedIds([]);
      if (loadSummary) loadSummary(); // 🔹 пересчёт сводки
    }
  };

  const formatDate = (dt) => {
    if (!dt) return '-';
    return new Date(dt).toLocaleString('ru-RU');
  };
  
  const handleRowClick = (event, bond) => {
    const target = event.target;
    // Если клик по самому чекбоксу или по ячейке, содержащей чекбокс — не открываем модалку
    if (
      (target.tagName.toLowerCase() === 'input' && target.type === 'checkbox') ||
      (target.tagName.toLowerCase() === 'td' && target.querySelector('input[type="checkbox"]'))
    ) {
      return;
    }
    setActiveBond(bond);
    setModalOpen(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const [toast, setToast] = useState({ message: '', type: '' });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: '' }), 5000);
  };

  const handleSubmit = async () => {
    if (!activeBond) return;

    const payload = {
      bond_id: activeBond.id,
      bond_name: activeBond.name,
      ...Object.fromEntries(
        Object.entries(formData).map(([key, value]) => [
          key,
          value === '' ? null : value
        ])
      )
    };

    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());

      // Закрываем модалку и сбрасываем форму
      setModalOpen(false);
      setFormData({
        buy_date: '',
        buy_price: '',
        buy_qty: '',
        buy_nkd: '',
        sell_date: '',
        sell_price: '',
        sell_qty: '',
        sell_nkd: ''
      });

      showToast('Сделка успешно сохранена', 'success');
      // 🔹 пересчёт сводки
      if (loadSummary) loadSummary();
      if (props.loadPositions) await props.loadPositions();
      if (props.loadCoupons) await props.loadCoupons();
      
      // 🔹 Сообщаем всем, что сделки обновились
      window.dispatchEvent(new Event('trades-updated'));
      addLog(`Добавлена сделка по ${activeBond.name}`);

    } catch (err) {
      console.error('Ошибка при сохранении сделки', err);
      showToast('Ошибка при сохранении сделки', 'error');
    }
  };

  const handleRefreshClick = async () => {
    setRefreshing(true);
    setProgress(0);

    // имитация прогресса (анимация)
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev; // ждём реального ответа
        return prev + 10;
      });
    }, 300);

    try {
      await onRefreshAll();
      if (loadSummary) await loadSummary();
      setProgress(100);
    } catch (err) {
      console.error("Ошибка обновления", err);
    } finally {
      clearInterval(interval);
      setTimeout(() => {
        setRefreshing(false);
        setProgress(0);
      }, 500); // небольшая пауза, чтобы показать 100%
    }
  };

  const renderArrows = (bond) => {
    const compare = (current, base) => {
      let change = null;
      if (current != null && base != null) {
        change = ((current - base) / base) * 100;
      }

      const color =
        change == null ? "gray" : change > 0 ? "green" : change < 0 ? "red" : "gray";
      const icon =
        change == null ? "" : change > 0 ? "↑" : change < 0 ? "↓" : "";
      const text =
        change == null ? "➖" : `${change.toFixed(2)}%`;

      return (
        <span
          style={{
            minWidth: 40,                // фиксированная ширина
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",    // центрируем содержимое
          }}
        >
          <span style={{ color, fontSize: "0.9em" }}>{icon}</span>
          <span style={{ fontSize: "0.75em", color, marginLeft: change == null ? 0 : 2 }}>
            {text}
          </span>
        </span>
      );
    };

    return (
      <div style={{ display: "flex", gap: 8 }}>
        {compare(bond.last_price, bond.day_open)}   {/* Д */}
        {compare(bond.last_price, bond.week_open)}  {/* Н */}
        {compare(bond.last_price, bond.month_open)} {/* М */}
        {compare(bond.last_price, bond.year_open)}  {/* Г */}
      </div>
    );
  };

  const CATEGORY_COLORS = {
    corpFix: "#8884d8",   // фиолетовый
    corpFloat: "#82ca9d", // зелёный
    ofz: "#ffc658",       // жёлтый
    fx: "#ff8042",        // оранжевый
  };

  function getCategory(bond) {
    if (bond.currency && bond.currency !== "SUR") return "fx";
    if (bond.name?.toUpperCase().includes("ОФЗ")) return "ofz";
    if (bond.coupon_type?.toUpperCase().includes("ФИКС")) return "corpFix";
    if (bond.coupon_type?.toUpperCase().includes("ФЛОАТ")) return "corpFloat";
    return null
  }

  const mergedBonds = bonds.map(b => {
    const w = bondsWithWeights.find(x => x.id === b.id);
    return { ...b, weight: w ? w.weight : null };
  });

  return (
    <div style={{ padding: 2, fontFamily: 'sans-serif' }}>
      <h1>Монитор облигаций</h1>

      {/* Поиск */}
      <div style={{ margin: '16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSearch();
              }
            }}
            placeholder="Поиск по названию"
            style={{ width: 300, marginRight: 8 }}
          />
          <button onClick={onSearch}>Поиск</button>
        </div>

        {/* Кнопка Индекса RGBI */}
        <button
          onClick={() => props.onToggleRGBI(true)}
          style={{
            background: '#444',
            color: 'white',
            padding: '6px 12px',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          Индекс RGBI
        </button>
      </div>


      {/* Результаты поиска */}
      {results.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2>Результаты поиска</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {results.map(b => (
              <li key={b.secid} style={{ marginBottom: 4 }}>
                {b.secid} — {b.name} ({b.coupon ?? '-'}%)
                <button onClick={() => onAdd(b.secid)} style={{ marginLeft: 8 }}>
                  Добавить
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <hr/>
      {/* Заголовок + кнопки */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2>Сохранённые облигации</h2>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <button
            onClick={handleRefreshClick}
            disabled={refreshing}
            style={{
              background: refreshing ? '#888' : 'green',
              color: 'white',
              padding: '4px 8px',
              border: 'none',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              position: 'relative',
              overflow: 'hidden',
              width: 120
            }}
          >
            {refreshing ? "Обновление..." : "Обновить"}
          </button>
          {refreshing && (
            <div style={{
              marginTop: 4,
              width: '100%',
              height: 6,
              background: '#ddd',
              borderRadius: 3,
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${progress}%`,
                height: '100%',
                background: 'limegreen',
                transition: 'width 0.3s ease'
              }} />
            </div>
          )}
          <small style={{ marginTop: 4, color: '#666' }}>
            Последнее обновление: {formatDate(lastUpdateTime)}
          </small>
          <button
            onClick={handleDelete}
            disabled={selectedIds.length === 0}
            style={{
              background: selectedIds.length > 0 ? 'red' : '#ccc',
              color: 'white',
              padding: '4px 8px',
              border: 'none',
              cursor: selectedIds.length > 0 ? 'pointer' : 'default'
            }}
          >
            Удалить выбранные
          </button>
        </div>
      </div>


      {/* Таблица */}
      <table
        className="bonds-table"
        border="1"
        cellPadding="6"
        style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}
      >
        <thead>
          <tr style={{ background: '#eee' }}>
            <th>
              <input
                type="checkbox"
                checked={selectedIds.length === bonds.length && bonds.length > 0}
                onChange={toggleSelectAll}
              />
            </th>
            <th>Рейтинг</th>
            <th>Краткое название</th>
            <th>Купон</th>
            <th>YTM</th>
            <th className="price-col">Последняя цена</th>
            <th className="dwmy-col">Д/Н/М/Г</th>
            <th>Валюта</th>
            <th>Вес</th>
            <th>Дата погашения</th>
            <th>Аморт.</th>
            <th>Дата оферты</th>
          </tr>
        </thead>
        <tbody>
          
          {mergedBonds
            .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
            .map(b => {
              const category = getCategory(b);
              const baseColor = category ? CATEGORY_COLORS[category] : "transparent";

              return (
                <tr
                  key={b.id}
                  onClick={(e) => handleRowClick(e, b)}
                  className={category ? `row ${category}` : "row"}
                  style={{ cursor: "pointer", transition: "background-color 0.2s ease" }}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(b.id)}
                      onChange={(e) => { e.stopPropagation(); toggleSelect(b.id); }}
                    />
                  </td>
                  <td className="rating">
                    {b.name?.toUpperCase().includes("ОФЗ")
                      ? "AAA"
                      : (b.rating && b.rating !== "Нет рейтинга" ? b.rating : "-")}
                  </td>
                  <td style={{ fontWeight: "bold" }}>{b.name}</td>
                  <td>{b.coupon_display ?? (b.coupon != null ? `${b.coupon}%` : "-")}</td>
                  <td>{b.ytm != null ? `${b.ytm.toFixed(2)}%` : "-"}</td>
                  <td>
                    <div>{b.last_price != null ? b.last_price.toFixed(2) : "-"}</div>
                    {b.last_buy_price != null && b.last_price != null && (
                      <div
                        style={{
                          fontSize: "0.75em",
                          color:
                            b.last_price < b.last_buy_price
                              ? "red"
                              : b.last_price > b.last_buy_price
                              ? "green"
                              : "gray"
                        }}
                      >
                        {(((b.last_price - b.last_buy_price) / b.last_buy_price) * 100).toFixed(2)}%
                      </div>
                    )}
                  </td>
                  <td>{renderArrows(b)}</td>
                  <td>{b.currency_symbol ?? "-"}</td>
                  <td>{b.weight !== null && b.weight !== undefined ? Number(b.weight).toFixed(2) + "%" : "-"}</td>
                  <td>{b.maturity_date ?? "-"}</td>
                  <td>{b.amortization_display ?? "-"}</td>
                  <td>{b.offer_date ?? "-"}</td>
                </tr>
              );
            })
          }
        </tbody>
      </table>
      {/* Модальное окно */}
      <Modal
        isOpen={modalOpen}
        onRequestClose={() => setModalOpen(false)}
        contentLabel="Сделка"
        style={{
          content: { maxWidth: '500px', margin: 'auto' }
        }}
      >
        <h2>{activeBond?.name}</h2>

        <h3>Покупка</h3>
        <input type="date" name="buy_date" value={formData.buy_date} onChange={handleChange} />
        <input type="number" step="0.01" name="buy_price" placeholder="Цена" value={formData.buy_price} onChange={handleChange} />
        <input type="number" name="buy_qty" placeholder="Количество" value={formData.buy_qty} onChange={handleChange} />
        <input type="number" step="0.01" name="buy_nkd" placeholder="НКД" value={formData.buy_nkd} onChange={handleChange} />

        <h3>Продажа</h3>
        <input type="date" name="sell_date" value={formData.sell_date} onChange={handleChange} />
        <input type="number" step="0.01" name="sell_price" placeholder="Цена" value={formData.sell_price} onChange={handleChange} />
        <input type="number" name="sell_qty" placeholder="Количество" value={formData.sell_qty} onChange={handleChange} />
        <input type="number" step="0.01" name="sell_nkd" placeholder="НКД" value={formData.sell_nkd} onChange={handleChange} />

        <div style={{ marginTop: 16 }}>
          <button onClick={handleSubmit}>OK</button>
          <button onClick={() => setModalOpen(false)} style={{ marginLeft: 8 }}>Отмена</button>
        </div>
      </Modal>
      {/* Тост с анимацией */}
      {toast.message && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            background: toast.type === 'success' ? 'green' : 'red',
            color: 'white',
            padding: '10px 16px',
            borderRadius: 4,
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            zIndex: 9999,
            animation: 'fadeInOut 3s ease forwards'
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

