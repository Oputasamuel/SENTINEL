import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import { boundedJson, json } from '@/lib/cloud-api';

function authorized(request:Request){const token=env.SENTINEL_WORKER_TOKEN;return typeof token==='string'&&token.length>=32&&request.headers.get('authorization')===`Bearer ${token}`}

export async function POST(request:Request){
  if(!authorized(request)) return json({error:'Unauthorized'},401);
  let body:Record<string,unknown>; try{body=await boundedJson(request,60_000)}catch{return json({error:'Invalid ACP job'},400)}
  const jobId=typeof body.jobId==='string'?body.jobId.slice(0,200):'';
  const repository=typeof body.repository==='string'?body.repository.trim():'';
  const branch=typeof body.branch==='string'?body.branch.trim():'';
  const contracts=Array.isArray(body.contracts)?body.contracts:[];
  if(!jobId||!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/i.test(repository)||!branch||!contracts.length||contracts.length>8||contracts.some(p=>typeof p!=='string'||!p.endsWith('.sol')||p.includes('..'))) return json({error:'Invalid ACP requirement'},400);
  const db=getDb(); await db.prepare(`CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,created_at TEXT NOT NULL,repository TEXT NOT NULL,branch TEXT NOT NULL,contracts TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued')`).run();
  const id=`acp-${await crypto.subtle.digest('SHA-256',new TextEncoder().encode(jobId)).then(b=>Array.from(new Uint8Array(b)).slice(0,16).map(x=>x.toString(16).padStart(2,'0')).join(''))}`;
  await db.prepare(`INSERT INTO workspaces (id,user_id,created_at,repository,branch,contracts,status) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
    .bind(id,`acp:${jobId}`,new Date().toISOString(),repository.replace(/\/$/,''),branch,JSON.stringify([...new Set(contracts)]),'queued').run();
  return json({id,status:'queued'},202);
}

export async function GET(request:Request){
  if(!authorized(request)) return json({error:'Unauthorized'},401);
  const url=new URL(request.url), id=url.searchParams.get('id')||'';
  const db=getDb(); const workspace=await db.prepare("SELECT id,status,repository FROM workspaces WHERE id=? AND user_id LIKE 'acp:%'").bind(id).first<any>();
  if(!workspace)return json({error:'ACP job not found'},404);
  const table=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspace_findings'").first();
  const findings=table?(await db.prepare('SELECT id,title,contract,severity,description,status FROM workspace_findings WHERE workspace_id=?').bind(id).all()).results:[];
  return json({...workspace,findings,disclosure:'SYBIL provider and evaluator are both operated by SENTINEL.'});
}
