// frontend/src/components/BondsPage.jsx
import React, { useState } from 'react';

export default function BondsPage({
  query, setQuery, results, bonds, onSearch, onAdd, onDeleteSelected, onRefreshAll, lastUpdateTime
}) {
  const [selectedIds, setSelectedIds] = useState([]);

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
    }
  };

  const formatDate = (dt) => {
    if (!dt) return '-';
    return new Date(dt).toLocaleString('ru-RU');
  };
  

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Монитор облигаций</h1>

      {/* Поиск */}
      <div style={{ margin: '16px 0' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Поиск по названию"
          style={{ width: 300, marginRight: 8 }}
        />
        <button onClick={onSearch}>Поиск</button>
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
            onClick={onRefreshAll}
            style={{
              background: 'green',
              color: 'white',
              padding: '4px 8px',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Обновить
          </button>
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
            <th>Валюта</th>
            <th>Дата погашения</th>
            <th>Аморт.</th>
            <th>Дата оферты</th>
          </tr>
        </thead>
        <tbody>
          {bonds.map(b => (
            <tr key={b.id}>
              <td>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(b.id)}
                  onChange={() => toggleSelect(b.id)}
                />
              </td>
              <td className="rating" style={{ whiteSpace: 'pre-line' }}>{b.rating && b.rating !== 'Нет рейтинга' ? b.rating : '-'}</td>
              <td>{b.name}</td>
              <td>{b.coupon_display ?? (b.coupon != null ? `${b.coupon}%` : '-')}</td>
              <td>{b.ytm != null ? `${b.ytm.toFixed(2)}%` : '-'}</td>
              <td className="price-col">{b.last_price != null ? b.last_price.toFixed(2) : '-'}</td>
              <td>{b.currency_symbol ?? '-'}</td>
              <td>{b.maturity_date ?? '-'}</td>
              <td>{b.amortization_display ?? '-'}</td>
              <td>{b.offer_date ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

