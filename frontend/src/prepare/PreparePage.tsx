import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Navigate } from '../Root';
import { getJson, type Tournament } from '../library/api';
import './prepare.css';

type Message = { role: 'coach' | 'you'; text: string; player?: { id: number; name: string; games: number; federation: string | null } };
type Study = { id: string; title: string; project: string; messages: Message[]; updated: number };
type Player = { fide_id: number; name: string; federation: string | null; games: number; flag: string };
const starter: Study = { id: 'current', title: 'Подготовка к турниру', project: 'Vienna Open', updated: Date.now(), messages: [{ role: 'coach', text: 'Привет! Разберём турнир, найдём соперников и подготовим план. Начни с названия турнира или имени игрока — я покажу, что есть в библиотеке партий.' }] };
const loadStudies = (): Study[] => { try { const saved = localStorage.getItem('chessscope.prepare.studies'); return saved ? JSON.parse(saved) as Study[] : [starter]; } catch { return [starter]; } };

export function PreparePage({ navigate }: { navigate: Navigate }) {
  const [studies, setStudies] = useState(loadStudies);
  const [active, setActive] = useState(studies[0]?.id || 'current');
  const [input, setInput] = useState('');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [busy, setBusy] = useState(false);
  const [project, setProject] = useState('Vienna Open');
  const bottom = useRef<HTMLDivElement>(null);
  const study = studies.find((item) => item.id === active) ?? studies[0] ?? starter;

  useEffect(() => { try { localStorage.setItem('chessscope.prepare.studies', JSON.stringify(studies)); } catch { /* local history is optional */ } }, [studies]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [study?.messages.length]);
  const patchStudy = (change: (item: Study) => Study) => setStudies((old) => old.map((item) => item.id === active ? change(item) : item));
  const newStudy = () => { const item = { ...starter, id: crypto.randomUUID(), title: 'Новая подготовка', project, updated: Date.now(), messages: [starter.messages[0]] }; setStudies((old) => [item, ...old]); setActive(item.id); };

  const send = async (event?: FormEvent, quick?: string) => {
    event?.preventDefault(); const text = (quick ?? input).trim(); if (!text || busy) return;
    setInput(''); setBusy(true); patchStudy((item) => ({ ...item, title: item.messages.length <= 1 ? text.slice(0, 34) : item.title, project, updated: Date.now(), messages: [...item.messages, { role: 'you', text }] }));
    try {
      const [events, found] = await Promise.all([
        getJson<Tournament[]>(`/api/tournaments?q=${encodeURIComponent(text)}&limit=5`),
        getJson<Player[]>(`/api/players?q=${encodeURIComponent(text)}`),
      ]);
      setTournaments(events); setPlayers(found);
      const match = found[0];
      const reply = match ? `Нашёл ${match.name} в библиотеке: ${match.games} партий, федерация ${match.federation ?? 'не указана'}. Можно открыть профиль игрока и перейти к партиям. Следующий шаг — разобрать дебюты за белых и чёрных, частые продолжения и выборку последних игр. Сейчас это подготовленный сценарий: автоматический шахматный отчёт подключим к стратегии отдельно.`
        : events.length ? `Нашёл турниры в библиотеке. Выбери подходящий — затем посмотрим участников и доступные партии. Для профиля игрока введи его имя или FIDE ID. Пока это поиск по сохранённым данным; выводы о стиле и дебютах появятся после подключения аналитического отчёта.`
        : 'В текущей библиотеке точного совпадения нет. Попробуй полное имя игрока, FIDE ID или название турнира. Я не буду делать выводы о репертуаре без партий и источников.';
      patchStudy((item) => ({ ...item, updated: Date.now(), messages: [...item.messages, { role: 'coach', text: reply, ...(match ? { player: { id: match.fide_id, name: match.name, games: match.games, federation: match.federation } } : {}) }] }));
    } catch (error) {
      patchStudy((item) => ({ ...item, messages: [...item.messages, { role: 'coach', text: `Не удалось загрузить библиотеку: ${error instanceof Error ? error.message : 'ошибка соединения'}. Проверь, что локальный сервер запущен.` }] }));
    } finally { setBusy(false); }
  };

  const playerReport = (player: Player) => {
    patchStudy((item) => ({ ...item, messages: [...item.messages, { role: 'you', text: `Подготовить профиль: ${player.name}` }, { role: 'coach', text: `Профиль ${player.name} · ${player.games} партий в библиотеке. Отчёт соберёт дебюты за оба цвета, частые ответы, результаты по вариантам, характерные миттельшпили и ссылки на примеры партий. Кнопка запуска стратегии появится здесь после подключения аналитического контура.`, player: { id: player.fide_id, name: player.name, games: player.games, federation: player.federation } }] }));
  };

  return <main className="prepare-workspace">
    <aside className="prepare-sidebar">
      <div className="prepare-sidebar-top"><div className="prepare-side-brand"><span>♞</span> ChessScope <small>PREP</small></div><button className="prepare-icon-btn" onClick={newStudy} aria-label="Новый чат">＋</button></div>
      <button className="prepare-new" onClick={newStudy}><span>＋</span> Новая подготовка <kbd>⌘ K</kbd></button>
      <label className="prepare-project-label">ПРОЕКТ</label><select className="prepare-project-select" value={project} onChange={(e) => setProject(e.target.value)}><option>Vienna Open</option><option>Командный чемпионат</option><option>Личные тренировки</option></select>
      <div className="prepare-sidebar-label">ВАШИ ПРОЕКТЫ</div>{['Vienna Open', 'Командный чемпионат', 'Личные тренировки'].map((name, i) => <button key={name} className={`prepare-project-row ${project === name ? 'selected' : ''}`} onClick={() => setProject(name)}><span className={`project-dot dot-${i}`} />{name}<span className="project-count">{i === 0 ? '4' : i === 1 ? '2' : '1'}</span></button>)}
      <div className="prepare-history-head"><span>ПОСЛЕДНИЕ ЧАТЫ</span><button onClick={() => setStudies((old) => [...old].sort((a, b) => b.updated - a.updated))}>•••</button></div>
      <div className="prepare-history">{studies.map((item) => <button key={item.id} onClick={() => setActive(item.id)} className={`prepare-history-item ${active === item.id ? 'active' : ''}`}><span className="history-chat-icon">◌</span><span>{item.title}</span></button>)}</div>
      <div className="prepare-sidebar-foot"><span className="prepare-user-avatar">RK</span><span>Мой профиль<small>Игрок · 2148 Elo</small></span><button aria-label="Настройки">···</button></div>
    </aside>

    <section className="prepare-main">
      <header className="prepare-topbar"><div><span className="prepare-project-crumb">{project}</span><span className="crumb-sep">/</span><span>{study.title}</span></div><button className="prepare-share" onClick={() => navigator.clipboard?.writeText(window.location.href)}>Поделиться ↗</button></header>
      <div className="prepare-thread">
        <div className="prepare-thread-heading"><div className="prepare-eyebrow"><span className="live-dot"/> PERSONAL CHESS COACH</div><h1>Готовься к следующей<br /><em>партии.</em></h1><p>Турнир, соперник, план на доске — всё в одном месте.</p></div>
        <div className="prepare-messages">{study.messages.map((message, i) => <article key={`${i}-${message.text}`} className={`prepare-message ${message.role}`}>
          {message.role === 'coach' && <span className="coach-mark">♞</span>}<div className="message-body"><div className="message-author">{message.role === 'coach' ? 'ChessScope Coach' : 'Вы'}{message.role === 'coach' && <span>· аналитик</span>}</div><p>{message.text}</p>
          {message.player && <div className="player-result"><div className="player-result-top"><span className="result-avatar">{message.player.name.split(' ').map((n) => n[0]).slice(0,2).join('')}</span><div><strong>{message.player.name}</strong><small>{message.player.federation || 'Federation unavailable'} · FIDE {message.player.id}</small></div><span className="result-games">{message.player.games} партий</span></div><div className="report-outline"><span>ПРОФИЛЬ СОПЕРНИКА</span><div>Дебютный репертуар <i>готовится</i></div><div>Результаты и тенденции <i>готовится</i></div><div>Выборочные партии и источники <i>готовится</i></div></div><button className="report-button" onClick={() => navigate(`/players/${message.player!.id}`)}>Открыть профиль игрока <span>↗</span></button></div>}
          </div></article>)}{busy && <div className="prepare-thinking"><span className="coach-mark">♞</span><span>Сверяю библиотеку партий <i>···</i></span></div>}<div ref={bottom}/></div>
        {(tournaments.length > 0 || players.length > 0) && <div className="prepare-search-results">{tournaments.length > 0 && <section><h3>ТУРНИРЫ В БИБЛИОТЕКЕ</h3>{tournaments.slice(0,4).map((item) => <button key={item.id} onClick={() => navigate(`/tournaments/${item.id}`)}><span>♜</span><strong>{item.name}</strong><small>{item.games} партий</small><b>↗</b></button>)}</section>}{players.length > 0 && <section><h3>ИГРОКИ</h3>{players.slice(0,4).map((item) => <div className="prepare-player-hit" key={item.fide_id}><span>{item.flag || '♟'}</span><strong>{item.name}</strong><small>{item.games} партий</small><button onClick={() => playerReport(item)}>Анализ игрока</button></div>)}</section>}</div>}
        <div className="prepare-composer-wrap"><div className="prepare-suggestions"><button onClick={() => send(undefined, 'Vienna Open')}>♜ <span>Разобрать турнир</span></button><button onClick={() => setInput('Найди партии и дебютный репертуар игрока: ')}>♙ <span>Найти игрока</span></button><button onClick={() => setInput('Составь план подготовки к партии против ')}>⌁ <span>План на партию</span></button></div><form className="prepare-composer" onSubmit={(event) => send(event)}><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Спроси о турнире или сопернике…" aria-label="Сообщение тренеру"/><button disabled={!input.trim() || busy} aria-label="Отправить сообщение">↑</button><div className="composer-footer"><span><span className="composer-spark">✳</span> Coach · данные из библиотеки</span><span>↵ отправить</span></div></form><div className="prepare-disclaimer">Профили и выводы строятся по доступным партиям. Источники и объём выборки будут показаны в отчёте.</div></div>
      </div>
    </section>

    <aside className="prepare-inspector"><div className="inspector-head"><span>ПОДГОТОВКА</span><button aria-label="Параметры">⚙</button></div><section className="opponent-card"><div className="card-kicker">ТЕКУЩИЙ ПРОЕКТ</div><h2>{project}</h2><div className="event-status"><span/> Исследование турнира</div><button onClick={() => send(undefined, project)}>Открыть обзор <span>→</span></button></section><section className="prep-checklist"><div className="inspector-section-title">ПЛАН ПОДГОТОВКИ <span>0 / 4</span></div>{[['⌕','Найти турнир'],['♙','Выбрать соперника'],['⌘','Изучить репертуар'],['♟','Подготовить варианты']].map(([icon,label],i)=><div className="check-row" key={label}><span className={`check-icon ${i===0?'check-done':''}`}>{icon}</span><span>{label}</span><small>{i===0?'сейчас':'позже'}</small></div>)}</section><section className="report-card"><div className="report-card-icon">♙</div><div><strong>Профиль игрока</strong><p>Дебюты, статистика и партии соперника в одном отчёте.</p></div><span className="report-card-lock">↗</span></section><div className="inspector-note"><span>✳</span><p>Каждый вывод будет связан с конкретными партиями из библиотеки.</p></div></aside>
  </main>;
}
