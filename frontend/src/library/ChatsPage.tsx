import { useEffect, useState } from 'react';
import type { Navigate } from '../Root';

type Chat = { id:string; title:string; createdAt:string };
export function ChatsPage({navigate}:{navigate:Navigate}) {
  const [chats,setChats]=useState<Chat[]>([]);
  const [error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();fetch('/api/ai/conversations',{signal:controller.signal}).then(response=>{if(!response.ok)throw new Error('Could not load chats');return response.json()}).then(data=>setChats(data.conversations||[])).catch((cause:Error)=>{if(!controller.signal.aborted)setError(cause.message)});return()=>controller.abort()},[]);
  return <main className="catalog-page chats-page"><div className="catalog-intro"><div><h1>Chats</h1><p>Each game and analysis board keeps its own coach conversation.</p></div><button className="primary-button" onClick={()=>navigate('/analysis')}>New board analysis</button></div>
    {error?<div className="catalog-empty">{error}</div>:!chats.length?<div className="catalog-empty">No chats yet. Open a game or start a board analysis to begin.</div>:<div className="chat-list">{chats.map(chat=>{const match=/^game:(\d+)/.exec(chat.id);const prep=/^prep:(.+)/.exec(chat.id);const href=prep?'/prepare/':match?`/games/${match[1]}`:'/analysis';return <button key={chat.id} onClick={()=>{try{if(prep)sessionStorage.setItem('chessscope.openPreparation',prep[1]);else sessionStorage.setItem('chessscope.openChat',chat.id)}catch{}navigate(href)}}><span className="chat-list-icon">◌</span><span><strong>{chat.title}</strong><small>{new Date(chat.createdAt).toLocaleString()}</small></span><span>↗</span></button>})}</div>}
  </main>;
}
